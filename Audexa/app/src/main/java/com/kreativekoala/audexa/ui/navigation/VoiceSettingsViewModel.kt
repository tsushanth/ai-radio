package com.kreativekoala.audexa.ui.navigation

import android.content.Context
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.*
import com.kreativekoala.audexa.data.repository.VoiceRepository
import com.kreativekoala.audexa.tts.KokoroTtsEngine
import com.kreativekoala.audexa.tts.TtsVoice
import com.kreativekoala.audexa.tts.kokoro.KokoroModelDownloader
import com.kreativekoala.audexa.tts.kokoro.KokoroPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class VoiceSettingsUiState(
    val isLoading: Boolean = false,
    val selectedProvider: TTSProvider = TTSProvider.OPENAI,
    val selectedHost1VoiceId: String? = null,
    val selectedHost2VoiceId: String? = null,
    val voices: List<Voice> = emptyList(),
    val voicePairs: List<VoicePair> = emptyList(),
    val providers: List<ProviderInfo> = emptyList(),
    val error: String? = null,
    val selectedTab: VoiceTab = VoiceTab.PAIRS,

    // On-device Kokoro voice selection (beta)
    val useKokoroEngine: Boolean = false,
    val kokoroVoices: List<TtsVoice> = emptyList(),
    val selectedKokoroVoiceId: String? = null,
    val kokoroDownloadState: KokoroModelDownloader.State = KokoroModelDownloader.State.Idle
)

enum class VoiceTab(val title: String) {
    PAIRS("Pairs"),
    INDIVIDUAL("Individual")
}

@HiltViewModel
class VoiceSettingsViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val voiceRepository: VoiceRepository,
    private val preferencesManager: PreferencesManager
) : ViewModel() {

    private val kokoroPrefs = KokoroPreferences.getInstance(appContext)
    private val kokoroEngine = KokoroTtsEngine(appContext)
    private val kokoroDownloader = KokoroModelDownloader.getInstance(appContext)

    private val _uiState = MutableStateFlow(VoiceSettingsUiState())
    val uiState: StateFlow<VoiceSettingsUiState> = _uiState.asStateFlow()

    init {
        loadSavedPreferences()
        loadVoices()
        loadKokoroState()
    }

    private fun loadKokoroState() {
        // Seed the Kokoro voice list from the engine's bundled catalog and
        // stream user pref + download state into the UI.
        _uiState.value = _uiState.value.copy(kokoroVoices = kokoroEngine.voices.value)
        viewModelScope.launch {
            kokoroPrefs.useKokoroEngine.collect { enabled ->
                _uiState.value = _uiState.value.copy(useKokoroEngine = enabled)
            }
        }
        viewModelScope.launch {
            kokoroPrefs.selectedVoiceId.collect { voiceId ->
                _uiState.value = _uiState.value.copy(selectedKokoroVoiceId = voiceId)
            }
        }
        viewModelScope.launch {
            kokoroDownloader.state.collect { state ->
                _uiState.value = _uiState.value.copy(kokoroDownloadState = state)
            }
        }
    }

    /**
     * Enable/disable the on-device Kokoro engine.
     * Turning ON also kicks off the model download if the file isn't on disk.
     */
    fun setUseKokoroEngine(enabled: Boolean) {
        kokoroPrefs.setUseKokoroEngine(enabled)
        if (enabled && !kokoroDownloader.isModelOnDisk()) {
            kokoroDownloader.startIfPossible()
        }
    }

    /** Pick a specific Kokoro voice. Passing null clears the pick (engine picks default). */
    fun selectKokoroVoice(voiceId: String?) {
        kokoroPrefs.setSelectedVoiceId(voiceId)
    }

    /**
     * Play a short sample in the given voice so the user can hear it before committing.
     * No-ops silently if the Kokoro model isn't yet on disk — UI should disable the
     * preview button when downloadState is anything but Ready.
     */
    fun previewKokoroVoice(voice: TtsVoice) {
        viewModelScope.launch {
            try {
                kokoroEngine.prepare()
                kokoroEngine.speak(
                    text = "Hi, I'm ${voice.displayName}. This is how I sound on Audexa.",
                    voiceId = voice.id,
                )
            } catch (_: Exception) {
                // Preview failure is non-critical; swallow so the picker stays responsive.
            }
        }
    }

    private fun loadSavedPreferences() {
        viewModelScope.launch {
            combine(
                preferencesManager.voiceHost1,
                preferencesManager.voiceHost2
            ) { host1, host2 ->
                Pair(host1, host2)
            }.collect { (host1, host2) ->
                _uiState.value = _uiState.value.copy(
                    selectedHost1VoiceId = host1,
                    selectedHost2VoiceId = host2
                )
            }
        }
    }

    fun loadVoices() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)

            val provider = _uiState.value.selectedProvider

            // Load voices
            voiceRepository.getVoices(provider, forceRefresh = true)
                .onSuccess { voices ->
                    _uiState.value = _uiState.value.copy(voices = voices)
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(error = e.message)
                }

            // Load voice pairs
            voiceRepository.getVoicePairs(provider)
                .onSuccess { pairs ->
                    _uiState.value = _uiState.value.copy(voicePairs = pairs)
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(error = e.message)
                }

            // Load providers
            voiceRepository.getProviders()
                .onSuccess { providers ->
                    _uiState.value = _uiState.value.copy(providers = providers)
                }

            _uiState.value = _uiState.value.copy(isLoading = false)
        }
    }

    fun setProvider(provider: TTSProvider) {
        _uiState.value = _uiState.value.copy(selectedProvider = provider)
        loadVoices()
    }

    fun setTab(tab: VoiceTab) {
        _uiState.value = _uiState.value.copy(selectedTab = tab)
    }

    fun selectVoicePair(pair: VoicePair) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(
                selectedHost1VoiceId = pair.host1.id,
                selectedHost2VoiceId = pair.host2.id
            )
            preferencesManager.setVoiceHost1(pair.host1.id)
            preferencesManager.setVoiceHost2(pair.host2.id)
        }
    }

    fun selectHost1Voice(voice: Voice) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(selectedHost1VoiceId = voice.id)
            preferencesManager.setVoiceHost1(voice.id)
        }
    }

    fun selectHost2Voice(voice: Voice) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(selectedHost2VoiceId = voice.id)
            preferencesManager.setVoiceHost2(voice.id)
        }
    }

    fun getVoicesForProvider(): List<Voice> {
        return _uiState.value.voices.filter {
            it.provider == _uiState.value.selectedProvider.value
        }
    }

    fun getVoicePairsForProvider(): List<VoicePair> {
        return _uiState.value.voicePairs.filter {
            it.provider == _uiState.value.selectedProvider.value
        }
    }
}
