package com.kreativekoala.audexa.service

import android.content.ComponentName
import android.content.Context
import android.os.Handler
import android.os.Looper
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.PlaybackParameters
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import com.kreativekoala.audexa.analytics.Analytics
import com.kreativekoala.audexa.analytics.AnalyticsEngine
import com.kreativekoala.audexa.analytics.ListenContext
import com.kreativekoala.audexa.data.model.Episode
import com.kreativekoala.audexa.data.model.TopicEpisode
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharedFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AudioManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "AudioManager"
        val SPEED_OPTIONS = listOf(0.5f, 0.75f, 1.0f, 1.25f, 1.5f, 2.0f)
    }

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var mediaController: MediaController? = null

    // Pending play request for when MediaController isn't ready yet
    private var pendingPlay: (() -> Unit)? = null

    // Playback state
    // Emits when a podcast episode plays to its end (not live radio): one of the app's rating "moments".
    private val _episodeCompleted = MutableSharedFlow<Unit>(extraBufferCapacity = 1)
    val episodeCompleted: SharedFlow<Unit> = _episodeCompleted.asSharedFlow()

    private val _isPlaying = MutableStateFlow(false)
    val isPlaying: StateFlow<Boolean> = _isPlaying.asStateFlow()

    private val _currentPosition = MutableStateFlow(0L)
    val currentPosition: StateFlow<Long> = _currentPosition.asStateFlow()

    private val _duration = MutableStateFlow(0L)
    val duration: StateFlow<Long> = _duration.asStateFlow()

    private val _currentEpisodeId = MutableStateFlow<String?>(null)
    val currentEpisodeId: StateFlow<String?> = _currentEpisodeId.asStateFlow()

    private val _currentEpisodeTitle = MutableStateFlow<String?>(null)
    val currentEpisodeTitle: StateFlow<String?> = _currentEpisodeTitle.asStateFlow()

    private val _currentShowId = MutableStateFlow<String?>(null)
    val currentShowId: StateFlow<String?> = _currentShowId.asStateFlow()

    private val _isBuffering = MutableStateFlow(false)
    val isBuffering: StateFlow<Boolean> = _isBuffering.asStateFlow()

    // A player error the user can see (after the silent automatic retry failed). Cleared by retry(), play(), resume() and stop().
    private val _playbackError = MutableStateFlow<PlaybackError?>(null)
    val playbackError: StateFlow<PlaybackError?> = _playbackError.asStateFlow()

    private val retryTracker = PlaybackRetryTracker()
    private var autoRetryPending = false
    private val autoRetryRunnable = Runnable {
        autoRetryPending = false
        mediaController?.let {
            Log.d(TAG, "Automatic retry after a network error")
            it.prepare()
            it.play()
        }
    }

    // Playback speed
    private val _playbackSpeed = MutableStateFlow(1.0f)
    val playbackSpeed: StateFlow<Float> = _playbackSpeed.asStateFlow()

    // Queue for auto-play next
    private val _queue = MutableStateFlow<List<QueueItem>>(emptyList())
    val queue: StateFlow<List<QueueItem>> = _queue.asStateFlow()

    // Sleep timer
    private val _sleepTimerRemaining = MutableStateFlow<Long?>(null) // millis remaining, null = off
    val sleepTimerRemaining: StateFlow<Long?> = _sleepTimerRemaining.asStateFlow()
    private val handler = Handler(Looper.getMainLooper())
    private var sleepTimerRunnable: Runnable? = null
    private var sleepTimerEndTime: Long = 0L

    // What is playing, for anonymous listening stats (see analytics/Analytics.kt). Counted only while audio really plays.
    private var listenContext: ListenContext? = null

    // Position save callback (set by ViewModel)
    var onPositionSave: ((episodeId: String, positionMs: Long) -> Unit)? = null

    private val playerListener = object : Player.Listener {
        override fun onPlayerError(error: androidx.media3.common.PlaybackException) {
            when (val decision = retryTracker.onError(error.errorCode)) {
                is RetryDecision.AutoRetry -> {
                    // A timeout or dropped connection on a weak network: try once more before telling the user.
                    Log.w(TAG, "Playback error ${error.errorCodeName}, retrying once")
                    autoRetryPending = true
                    _isBuffering.value = true
                    handler.removeCallbacks(autoRetryRunnable)
                    handler.postDelayed(autoRetryRunnable, decision.delayMs)
                }
                RetryDecision.ShowError -> {
                    com.kreativekoala.ratingkit.RatingKit.reportError() // stay quiet for a while after a playback failure
                    val source = PlaybackPolicy.errorSource(listenContext?.source)
                    val code = AnalyticsEngine.cleanCode(error.errorCodeName)
                    // Stable message per Media3 error code (e.g. ERROR_CODE_IO_BAD_HTTP_STATUS = a segment 404 / stream down); no urls, no titles.
                    com.kreativekoala.audexa.monitoring.FailureReporter.failure(
                        "Playback error", message = "Playback failed: ${error.errorCodeName}",
                        context = mapOf("code" to error.errorCodeName, "source" to source)
                    )
                    // `source` (stream | episode) separates the live radio from episode audio. Only errors the user sees are counted.
                    Analytics.track("error_shown", mapOf("code" to code, "source" to source))
                    _isBuffering.value = false
                    _playbackError.value = PlaybackError(source = source, code = code, episodeId = _currentEpisodeId.value)
                }
            }
        }

        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _isPlaying.value = isPlaying
            if (isPlaying) {
                retryTracker.reset()
                _playbackError.value = null
            }
            if (isPlaying) listenContext?.let { Analytics.listenStart(it) } else Analytics.listenStop()
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            _isBuffering.value = playbackState == Player.STATE_BUFFERING || autoRetryPending

            when (playbackState) {
                Player.STATE_READY -> {
                    retryTracker.reset()
                    mediaController?.duration?.let {
                        if (it > 0) _duration.value = it
                    }
                }
                Player.STATE_ENDED -> {
                    if (_currentEpisodeId.value?.startsWith("audexa-radio-") != true) _episodeCompleted.tryEmit(Unit)
                    _isPlaying.value = false
                    _currentPosition.value = 0
                    // Auto-play next from queue
                    if (_queue.value.isNotEmpty()) {
                        Log.d(TAG, "Playback ended, playing next from queue")
                        handler.postDelayed({ playNext() }, 500)
                    }
                }
            }
        }
    }

    fun initialize() {
        val sessionToken = SessionToken(
            context,
            ComponentName(context, AudioPlaybackService::class.java)
        )

        controllerFuture = MediaController.Builder(context, sessionToken).buildAsync()
        controllerFuture?.addListener({
            mediaController = controllerFuture?.get()
            mediaController?.addListener(playerListener)
            Log.d(TAG, "MediaController initialized")

            // Execute any pending play request that arrived before controller was ready
            pendingPlay?.invoke()
            pendingPlay = null
        }, MoreExecutors.directExecutor())
    }

    fun play(episode: Episode) {
        val audioUrl = episode.audioUrl ?: return
        _currentShowId.value = episode.showId
        play(
            id = episode.id,
            title = episode.title,
            description = episode.description,
            audioUrl = audioUrl,
            source = "brief"
        )
    }

    fun play(topicEpisode: TopicEpisode) {
        val audioUrl = topicEpisode.audioUrl ?: return
        _currentShowId.value = topicEpisode.topicId
        play(
            id = topicEpisode.id,
            title = topicEpisode.title,
            description = topicEpisode.description,
            audioUrl = audioUrl,
            source = "topic",
            topicId = topicEpisode.topicId,
            language = topicEpisode.language
        )
    }

    /** [source] is radio | topic | brief for anonymous listening stats; when omitted it is guessed from the id (radio) or brief. */
    fun play(
        id: String, title: String, description: String, audioUrl: String,
        source: String? = null, topicId: String? = null, language: String? = null
    ) {
        // Save position of previous episode before switching
        saveCurrentPosition()

        clearPlaybackError()
        Analytics.listenStop()
        val src = source ?: if (id.startsWith("audexa-radio-")) "radio" else "brief"
        listenContext = ListenContext(
            source = src,
            language = AnalyticsEngine.cleanLang(
                language ?: if (src == "radio") com.kreativekoala.audexa.util.LiveShare.languageFromStreamUrl(audioUrl) else Analytics.preferredLanguage
            ),
            topicId = if (src == "topic") topicId else null
        )

        Log.d(TAG, "Playing: $title ($audioUrl)")

        _currentEpisodeId.value = id
        _currentEpisodeTitle.value = title

        val mediaItem = MediaItem.Builder()
            .setUri(audioUrl)
            .setMediaMetadata(
                MediaMetadata.Builder()
                    .setTitle(title)
                    .setDescription(description)
                    .build()
            )
            .build()

        if (mediaController == null) {
            Log.w(TAG, "MediaController not ready yet, queuing play request")
            pendingPlay = {
                mediaController?.apply {
                    setMediaItem(mediaItem)
                    prepare()
                    playbackParameters = PlaybackParameters(_playbackSpeed.value)
                    play()
                    Log.d(TAG, "MediaController: executing queued play for $title")
                }
            }
            return
        }

        mediaController?.apply {
            setMediaItem(mediaItem)
            prepare()
            playbackParameters = PlaybackParameters(_playbackSpeed.value)
            play()
            Log.d(TAG, "MediaController: setMediaItem, prepare, play called")
        }
    }

    fun pause() {
        saveCurrentPosition()
        cancelAutoRetry()
        mediaController?.pause()
    }

    fun resume() {
        clearPlaybackError()
        mediaController?.apply {
            // After a player error the player is idle and play() alone does nothing: prepare again first.
            if (playbackState == Player.STATE_IDLE && currentMediaItem != null) prepare()
            play()
        }
    }

    /** The Retry button of the error UI: same as resume, with a fresh automatic-retry allowance. */
    fun retry() = resume()

    private fun cancelAutoRetry() {
        handler.removeCallbacks(autoRetryRunnable)
        autoRetryPending = false
        _isBuffering.value = false
    }

    private fun clearPlaybackError() {
        cancelAutoRetry()
        retryTracker.reset()
        _playbackError.value = null
    }

    fun togglePlayPause() {
        if (_isPlaying.value) {
            pause()
        } else {
            resume()
        }
    }

    fun seekTo(positionMs: Long) {
        mediaController?.seekTo(positionMs)
        _currentPosition.value = positionMs
    }

    fun skipForward(seconds: Int = 15) {
        val newPosition = (_currentPosition.value + seconds * 1000).coerceAtMost(_duration.value)
        seekTo(newPosition)
    }

    fun skipBackward(seconds: Int = 15) {
        val newPosition = (_currentPosition.value - seconds * 1000).coerceAtLeast(0)
        seekTo(newPosition)
    }

    fun updatePosition() {
        mediaController?.currentPosition?.let {
            _currentPosition.value = it
        }
    }

    // MARK: - Playback Speed

    fun setPlaybackSpeed(speed: Float) {
        _playbackSpeed.value = speed
        mediaController?.playbackParameters = PlaybackParameters(speed)
        Log.d(TAG, "Playback speed set to ${speed}x")
    }

    fun cyclePlaybackSpeed() {
        val currentIndex = SPEED_OPTIONS.indexOf(_playbackSpeed.value)
        val nextIndex = if (currentIndex < 0) 2 else (currentIndex + 1) % SPEED_OPTIONS.size
        setPlaybackSpeed(SPEED_OPTIONS[nextIndex])
    }

    // MARK: - Queue Management

    fun setQueue(items: List<QueueItem>) {
        _queue.value = items.filter { it.id != _currentEpisodeId.value }
        Log.d(TAG, "Queue set with ${_queue.value.size} items")
    }

    fun addToQueue(item: QueueItem) {
        if (item.id == _currentEpisodeId.value) return
        if (_queue.value.any { it.id == item.id }) return
        _queue.value = _queue.value + item
        Log.d(TAG, "Added to queue: ${item.title}. Queue size: ${_queue.value.size}")
    }

    fun clearQueue() {
        _queue.value = emptyList()
    }

    fun playNext() {
        val current = _queue.value.toMutableList()
        if (current.isEmpty()) {
            Log.d(TAG, "Queue empty, nothing to play next")
            return
        }
        val next = current.removeAt(0)
        _queue.value = current
        Log.d(TAG, "Playing next from queue: ${next.title}")
        play(
            id = next.id, title = next.title, description = "", audioUrl = next.audioUrl,
            source = "topic", topicId = next.topicId.ifEmpty { null }, language = listenContext?.language
        )
    }

    // MARK: - Sleep Timer

    fun startSleepTimer(minutes: Int) {
        cancelSleepTimer()
        val durationMs = minutes * 60 * 1000L
        sleepTimerEndTime = System.currentTimeMillis() + durationMs
        _sleepTimerRemaining.value = durationMs
        Log.d(TAG, "Sleep timer started: $minutes minutes")

        sleepTimerRunnable = object : Runnable {
            override fun run() {
                val remaining = sleepTimerEndTime - System.currentTimeMillis()
                if (remaining <= 0) {
                    _sleepTimerRemaining.value = null
                    pause()
                    Log.d(TAG, "Sleep timer fired — pausing playback")
                } else {
                    _sleepTimerRemaining.value = remaining
                    handler.postDelayed(this, 1000)
                }
            }
        }
        handler.postDelayed(sleepTimerRunnable!!, 1000)
    }

    fun cancelSleepTimer() {
        sleepTimerRunnable?.let { handler.removeCallbacks(it) }
        sleepTimerRunnable = null
        _sleepTimerRemaining.value = null
    }

    val isSleepTimerActive: Boolean
        get() = _sleepTimerRemaining.value != null

    // MARK: - Position Persistence

    private fun saveCurrentPosition() {
        val id = _currentEpisodeId.value ?: return
        val pos = _currentPosition.value
        if (pos > 0) {
            onPositionSave?.invoke(id, pos)
        }
    }

    fun stop() {
        saveCurrentPosition()
        Analytics.listenStop()
        listenContext = null
        clearPlaybackError()
        mediaController?.stop()
        _currentEpisodeId.value = null
        _currentEpisodeTitle.value = null
        _currentShowId.value = null
        _currentPosition.value = 0
        _duration.value = 0
    }

    fun release() {
        cancelSleepTimer()
        cancelAutoRetry()
        mediaController?.removeListener(playerListener)
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controllerFuture = null
        mediaController = null
    }
}

data class QueueItem(
    val id: String,
    val title: String,
    val audioUrl: String,
    val topicId: String = "",
    val durationSeconds: Int = 0
)
