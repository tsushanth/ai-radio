package com.kreativekoala.audexa.ui.kokoro

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.tts.KokoroTtsEngine
import com.kreativekoala.audexa.tts.TtsState
import com.kreativekoala.audexa.tts.TtsVoice
import com.kreativekoala.audexa.tts.kokoro.KokoroModelDownloader
import com.kreativekoala.audexa.tts.kokoro.KokoroOnDeviceService
import com.kreativekoala.audexa.tts.kokoro.KokoroPreferences
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.launchIn
import kotlinx.coroutines.flow.onEach
import kotlinx.coroutines.launch
import javax.inject.Inject

data class KokoroTestUiState(
    val downloadState: KokoroModelDownloader.State = KokoroModelDownloader.State.Idle,
    val ttsState: TtsState = TtsState.Idle,
    val voices: List<TtsVoice> = emptyList(),
    val selectedVoiceId: String = KokoroOnDeviceService.DEFAULT_VOICE_ID,
    val sampleText: String = DEFAULT_SAMPLE_TEXT,
    val allowCellular: Boolean = false,
) {
    val downloadPercent: Int
        get() = (downloadState as? KokoroModelDownloader.State.Downloading)?.percent ?: 0

    val downloadIsReady: Boolean
        get() = downloadState is KokoroModelDownloader.State.Ready

    val isSpeaking: Boolean
        get() = ttsState is TtsState.Speaking

    companion object {
        const val DEFAULT_SAMPLE_TEXT =
            "On-device Kokoro is ready. Pick a voice and tap speak to hear me synthesize this sentence right on your phone."
    }
}

/**
 * ViewModel for the Kokoro on-device TTS test screen.
 *
 * This screen exists to validate the end-to-end pipeline (model download →
 * ONNX session load → text-to-audio synth → playback) before wiring Kokoro
 * into the production deep-dive / topic flows.
 *
 * Plain [AndroidViewModel] (not Hilt-provided engine) because the engine
 * holds a [android.media.MediaPlayer]; ViewModel-scoped lifecycle is the
 * right ownership boundary.
 */
@HiltViewModel
class KokoroTestViewModel @Inject constructor(
    application: Application,
) : AndroidViewModel(application) {

    private val engine = KokoroTtsEngine(application)
    private val downloader = KokoroModelDownloader.getInstance(application)
    private val prefs = KokoroPreferences.getInstance(application)

    private val _uiState = MutableStateFlow(KokoroTestUiState(voices = engine.voices.value))
    val uiState: StateFlow<KokoroTestUiState> = _uiState.asStateFlow()

    init {
        // Observe engine + downloader + prefs and project into a single UI state.
        combine(
            downloader.state,
            engine.state,
            engine.voices,
            prefs.allowCellularModelDownload,
        ) { dl, tts, voices, allowCellular ->
            _uiState.value = _uiState.value.copy(
                downloadState = dl,
                ttsState = tts,
                voices = voices,
                allowCellular = allowCellular,
            )
        }.launchIn(viewModelScope)

        // Trigger session warm-up if model is already on disk. Otherwise the
        // user explicitly taps "Download" before "Speak".
        viewModelScope.launch {
            if (downloader.isModelOnDisk()) {
                engine.prepare()
            }
        }
    }

    fun onSelectVoice(voiceId: String) {
        _uiState.value = _uiState.value.copy(selectedVoiceId = voiceId)
    }

    fun onSampleTextChange(text: String) {
        _uiState.value = _uiState.value.copy(sampleText = text)
    }

    fun onToggleAllowCellular(enabled: Boolean) {
        prefs.setAllowCellularModelDownload(enabled)
    }

    fun onDownloadTapped() {
        downloader.startIfPossible()
        // The downloader's StateFlow drives UI from here; prepare() will fire
        // automatically once Ready arrives via the watcher below.
        viewModelScope.launch {
            downloader.state.onEach { s ->
                if (s is KokoroModelDownloader.State.Ready) {
                    engine.prepare()
                }
            }.launchIn(viewModelScope)
        }
    }

    fun onSpeakTapped() {
        val state = _uiState.value
        if (!state.downloadIsReady) return
        viewModelScope.launch {
            engine.speak(state.sampleText, voiceId = state.selectedVoiceId, speed = 1.0f)
        }
    }

    fun onStopTapped() {
        engine.stop()
    }

    override fun onCleared() {
        engine.release()
        super.onCleared()
    }
}
