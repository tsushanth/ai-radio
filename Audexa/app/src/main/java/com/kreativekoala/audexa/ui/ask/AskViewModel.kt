package com.kreativekoala.audexa.ui.ask

import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.analytics.Analytics
import com.kreativekoala.audexa.analytics.AnalyticsEngine
import com.kreativekoala.audexa.ask.AskConfig
import com.kreativekoala.audexa.ask.AskEpisode
import com.kreativekoala.audexa.ask.AskFailure
import com.kreativekoala.audexa.ask.AskFailureKind
import com.kreativekoala.audexa.ask.AskParsing
import com.kreativekoala.audexa.ask.AskPendingStore
import com.kreativekoala.audexa.ask.AskPollMachine
import com.kreativekoala.audexa.ask.AskRepository
import com.kreativekoala.audexa.ask.AskStatus
import com.kreativekoala.audexa.ask.PendingAsk
import com.kreativekoala.audexa.ask.PollDecision
import com.kreativekoala.audexa.ask.SubmitOutcome
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.service.AudioManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.Job
import kotlinx.coroutines.NonCancellable
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.update
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import javax.inject.Inject

sealed interface AskPhase {
    /** Editable form (also shows [AskUiState.formError]). */
    data object Form : AskPhase

    /** The POST is in flight. The button is disabled; a second tap does nothing. */
    data object Submitting : AskPhase
    data class Working(val status: AskStatus, val progress: Int) : AskPhase
    data class Done(val episode: AskEpisode) : AskPhase

    /** [canKeepWaiting]: the request may still be alive on the server (timeout, no connection), so polling can be resumed. */
    data class Failed(val failure: AskFailure, val canKeepWaiting: Boolean) : AskPhase
}

data class AskUiState(
    val loading: Boolean = true,
    /** Null once loading is over means the server does not offer the feature right now. */
    val config: AskConfig? = null,
    val text: String = "",
    val language: String = "en",
    val phase: AskPhase = AskPhase.Form,
    val formError: AskFailure? = null
)

@HiltViewModel
class AskViewModel @Inject constructor(
    private val repo: AskRepository,
    private val pendingStore: AskPendingStore,
    private val audioManager: AudioManager,
    private val preferencesManager: PreferencesManager,
    private val savedState: SavedStateHandle
) : ViewModel() {

    private val _state = MutableStateFlow(
        AskUiState(text = savedState.get<String>(KEY_TEXT).orEmpty(), language = savedState.get<String>(KEY_LANG) ?: "en")
    )
    val state: StateFlow<AskUiState> = _state.asStateFlow()

    val currentEpisodeId = audioManager.currentEpisodeId
    val isPlaying = audioManager.isPlaying
    val positionMs = audioManager.currentPosition
    val durationMs = audioManager.duration

    private var pollJob: Job? = null
    private var screenStarted = false

    init {
        viewModelScope.launch {
            val config = repo.config()
            val preferred = runCatching { preferencesManager.preferredLanguage.first() }.getOrNull()
            _state.update { s ->
                val lang = s.language.takeIf { savedState.contains(KEY_LANG) && config != null && it in config.languages }
                    ?: AskParsing.defaultLanguage(preferred, config?.languages.orEmpty())
                s.copy(loading = false, config = config, language = lang)
            }
            // A request from before a rotation, process death or leaving the screen: pick it up instead of asking again.
            val pending = if (config != null) pendingStore.get() else null
            if (pending != null && _state.value.phase == AskPhase.Form) {
                _state.update { it.copy(phase = AskPhase.Working(AskStatus.QUEUED, 5)) }
                if (screenStarted) startPolling(pending)
            }
        }
    }

    fun onTextChange(value: String) {
        val max = _state.value.config?.maxChars ?: AskParsing.DEFAULT_MAX_CHARS
        val clipped = value.take(max)
        savedState[KEY_TEXT] = clipped
        _state.update { it.copy(text = clipped, formError = null) }
    }

    fun onLanguageChange(code: String) {
        if (_state.value.config?.languages?.contains(code) != true) return
        savedState[KEY_LANG] = code
        _state.update { it.copy(language = code) }
    }

    /** The screen is visible: poll. Polling stops again when it is not, so nothing runs in the background. */
    fun onScreenStarted() {
        screenStarted = true
        val s = _state.value
        if (s.phase is AskPhase.Working && pollJob?.isActive != true) pendingStore.get()?.let { startPolling(it) }
    }

    fun onScreenStopped() {
        screenStarted = false
        pollJob?.cancel()
        pollJob = null
    }

    fun submit() {
        val s = _state.value
        val config = s.config ?: return
        if (s.phase != AskPhase.Form) return // already sending or waiting: never a second request
        if (!AskParsing.canSubmit(s.text, config.maxChars)) return
        _state.update { it.copy(phase = AskPhase.Submitting, formError = null) }
        val text = AskParsing.normalizeText(s.text)
        val language = s.language
        viewModelScope.launch {
            // Not cancellable: if the user leaves while the request is on its way, its id must still be saved so the next visit resumes it.
            val outcome = withContext(NonCancellable) {
                repo.submit(text, language, Analytics.installIdForAsk()).also {
                    if (it is SubmitOutcome.Accepted) pendingStore.put(PendingAsk(it.id, System.currentTimeMillis(), language))
                }
            }
            when (outcome) {
                is SubmitOutcome.Accepted -> {
                    _state.update { it.copy(phase = AskPhase.Working(AskStatus.QUEUED, 5)) }
                    if (screenStarted) pendingStore.get()?.let { startPolling(it) }
                }
                is SubmitOutcome.Rejected -> {
                    track(outcome.failure)
                    _state.update {
                        if (outcome.failure.kind == AskFailureKind.UNAVAILABLE) it.copy(phase = AskPhase.Form, config = null)
                        else it.copy(phase = AskPhase.Form, formError = outcome.failure)
                    }
                }
            }
        }
    }

    private fun startPolling(pending: PendingAsk) {
        pollJob?.cancel()
        pollJob = viewModelScope.launch {
            val machine = AskPollMachine(startedAtMs = pending.startedAtMs)
            while (isActive) {
                when (val d = machine.onResult(repo.fetch(pending.id), System.currentTimeMillis())) {
                    is PollDecision.Wait -> {
                        d.episode?.let { ep -> _state.update { it.copy(phase = AskPhase.Working(ep.status, ep.progress)) } }
                        delay(d.delayMs)
                    }
                    is PollDecision.Complete -> {
                        _state.update { it.copy(phase = AskPhase.Done(d.episode)) }
                        return@launch // the id stays saved for 30 minutes so coming back shows this episode
                    }
                    is PollDecision.Failed -> {
                        val keep = d.failure.kind == AskFailureKind.TIMEOUT || d.failure.kind == AskFailureKind.OFFLINE ||
                            d.failure.kind == AskFailureKind.SERVER
                        if (!keep) pendingStore.clear()
                        track(d.failure)
                        _state.update { it.copy(phase = AskPhase.Failed(d.failure, canKeepWaiting = keep)) }
                        return@launch
                    }
                }
            }
        }
    }

    /** After a timeout or a lost connection: look again at the same request (never a new one). */
    fun keepWaiting() {
        val pending = pendingStore.get()
        if (pending == null) {
            backToForm(clearText = false)
            return
        }
        pendingStore.restart(pending, System.currentTimeMillis())
        _state.update { it.copy(phase = AskPhase.Working(AskStatus.QUEUED, 5)) }
        if (screenStarted) pendingStore.get()?.let { startPolling(it) }
    }

    /** "Edit question" after a refusal (keeps the text) or "Ask another" after an episode (clears it). */
    fun backToForm(clearText: Boolean) {
        pollJob?.cancel()
        pollJob = null
        pendingStore.clear()
        if (clearText) savedState[KEY_TEXT] = ""
        _state.update { it.copy(phase = AskPhase.Form, formError = null, text = if (clearText) "" else it.text) }
    }

    fun togglePlay(episode: AskEpisode, fallbackTitle: String) {
        val url = episode.audioUrl ?: return
        if (audioManager.currentEpisodeId.value == episode.id) {
            audioManager.togglePlayPause()
        } else {
            audioManager.play(
                id = episode.id,
                title = episode.title ?: fallbackTitle,
                description = episode.description.orEmpty(),
                audioUrl = url,
                source = "deepdive", // closest of the allowed listening sources: a one-off episode about a specific subject
                language = episode.language
            )
        }
    }

    fun updatePosition() = audioManager.updatePosition()

    fun trackShare(episode: AskEpisode) {
        Analytics.track(
            "share_tap",
            mapOf("source" to "deepdive", "language" to AnalyticsEngine.cleanLang(episode.language))
        )
    }

    private fun track(failure: AskFailure) {
        // Anonymous error counts for breakage only; refusals, limits and "no coverage" are normal answers, not errors.
        failure.analyticsCode?.let { Analytics.track("error_shown", mapOf("code" to it)) }
    }

    override fun onCleared() {
        pollJob?.cancel()
        super.onCleared()
    }

    private companion object {
        const val KEY_TEXT = "ask_text"
        const val KEY_LANG = "ask_language"
    }
}
