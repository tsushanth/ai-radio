package com.kreativekoala.audexa.service

import android.content.ComponentName
import android.content.Context
import android.util.Log
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.Player
import androidx.media3.session.MediaController
import androidx.media3.session.SessionToken
import com.google.common.util.concurrent.ListenableFuture
import com.google.common.util.concurrent.MoreExecutors
import com.kreativekoala.audexa.data.model.Episode
import com.kreativekoala.audexa.data.model.TopicEpisode
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
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
    }

    private var controllerFuture: ListenableFuture<MediaController>? = null
    private var mediaController: MediaController? = null

    // Playback state
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

    private val playerListener = object : Player.Listener {
        override fun onIsPlayingChanged(isPlaying: Boolean) {
            _isPlaying.value = isPlaying
        }

        override fun onPlaybackStateChanged(playbackState: Int) {
            _isBuffering.value = playbackState == Player.STATE_BUFFERING

            when (playbackState) {
                Player.STATE_READY -> {
                    mediaController?.duration?.let {
                        if (it > 0) _duration.value = it
                    }
                }
                Player.STATE_ENDED -> {
                    _isPlaying.value = false
                    _currentPosition.value = 0 // Reset position when playback completes
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
        }, MoreExecutors.directExecutor())
    }

    fun play(episode: Episode) {
        val audioUrl = episode.audioUrl ?: return
        _currentShowId.value = episode.showId
        play(
            id = episode.id,
            title = episode.title,
            description = episode.description,
            audioUrl = audioUrl
        )
    }

    fun play(topicEpisode: TopicEpisode) {
        val audioUrl = topicEpisode.audioUrl ?: return
        _currentShowId.value = topicEpisode.topicId
        play(
            id = topicEpisode.id,
            title = topicEpisode.title,
            description = topicEpisode.description,
            audioUrl = audioUrl
        )
    }

    fun play(id: String, title: String, description: String, audioUrl: String) {
        Log.d(TAG, "Playing: $title ($audioUrl)")

        if (mediaController == null) {
            Log.e(TAG, "MediaController is null! Did you call initialize()?")
            return
        }

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

        mediaController?.apply {
            setMediaItem(mediaItem)
            prepare()
            play()
            Log.d(TAG, "MediaController: setMediaItem, prepare, play called")
        }
    }

    fun pause() {
        mediaController?.pause()
    }

    fun resume() {
        mediaController?.play()
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

    fun stop() {
        mediaController?.stop()
        _currentEpisodeId.value = null
        _currentEpisodeTitle.value = null
        _currentShowId.value = null
        _currentPosition.value = 0
        _duration.value = 0
    }

    fun release() {
        mediaController?.removeListener(playerListener)
        controllerFuture?.let { MediaController.releaseFuture(it) }
        controllerFuture = null
        mediaController = null
    }
}
