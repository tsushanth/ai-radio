package com.kreativekoala.audexa.ui.topic

import android.content.Context
import android.content.Intent
import android.net.Uri
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import androidx.media3.common.MediaItem
import androidx.media3.common.Player
import androidx.media3.exoplayer.ExoPlayer
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.AdSegment
import com.kreativekoala.audexa.data.model.SegmentTiming
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.data.model.TopicEpisode
import com.kreativekoala.audexa.data.remote.AdClickRequest
import com.kreativekoala.audexa.data.remote.AdImpressionRequest
import com.kreativekoala.audexa.data.repository.TopicRepository
import com.kreativekoala.audexa.service.AudioManager
import com.kreativekoala.audexa.service.QueueItem
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject
import kotlin.math.abs

data class TopicDetailUiState(
    val topic: Topic? = null,
    val currentEpisode: TopicEpisode? = null,
    val episodeHistory: List<TopicEpisode> = emptyList(),
    val selectedLanguage: SupportedLanguage = SupportedLanguage.ENGLISH,
    val isLoading: Boolean = false,
    val isGenerating: Boolean = false,
    val isPlaying: Boolean = false,
    val isBookmarked: Boolean = false,
    val currentTime: Long = 0,
    val duration: Long = 0,
    val isEpisodeActiveInPlayer: Boolean = false,
    val error: String? = null,
    // Ad state
    val ads: List<AdSegment> = emptyList(),
    val isPlayingAd: Boolean = false,
    val currentAd: AdSegment? = null,
    val adTimeRemaining: Long = 0, // milliseconds
    // Playback features
    val playbackSpeed: Float = 1.0f,
    val sleepTimerRemaining: Long? = null, // millis, null = off
    val queueSize: Int = 0
)

@HiltViewModel
class TopicDetailViewModel @Inject constructor(
    private val topicRepository: TopicRepository,
    private val preferencesManager: PreferencesManager,
    private val audioManager: AudioManager,
    @ApplicationContext private val appContext: Context
) : ViewModel() {

    companion object {
        private const val TAG = "TopicDetailViewModel"
    }

    private val _uiState = MutableStateFlow(TopicDetailUiState())
    val uiState: StateFlow<TopicDetailUiState> = _uiState.asStateFlow()

    // Ad internals
    private var adPlayer: ExoPlayer? = null
    private var adInsertionPoints: List<Long> = emptyList() // milliseconds
    private var nextAdIndex: Int = 0
    private var isSubscriber: Boolean = false

    private val adPlayerListener = object : Player.Listener {
        override fun onPlaybackStateChanged(playbackState: Int) {
            if (playbackState == Player.STATE_ENDED) {
                adPlaybackDidEnd(wasSkipped = false)
            }
        }
    }

    init {
        // Observe audio state
        viewModelScope.launch {
            combine(
                audioManager.isPlaying,
                audioManager.currentPosition,
                audioManager.duration,
                audioManager.currentEpisodeId,
                _uiState.map { it.currentEpisode?.id }.distinctUntilChanged()
            ) { isPlaying, position, duration, playerEpisodeId, currentEpisodeId ->
                if (currentEpisodeId == null) {
                    return@combine arrayOf(false, 0L, 0L, false)
                }

                val isThisEpisodePlaying = isPlaying && playerEpisodeId == currentEpisodeId
                val isThisEpisodeLoaded = playerEpisodeId == currentEpisodeId

                if (isThisEpisodeLoaded) {
                    arrayOf(isThisEpisodePlaying, position, duration, true)
                } else {
                    val episodeDuration = (_uiState.value.currentEpisode?.durationSeconds ?: 0) * 1000L
                    arrayOf(false, 0L, episodeDuration, false)
                }
            }.collect { result ->
                val isPlaying = result[0] as Boolean
                val position = result[1] as Long
                val duration = result[2] as Long
                val isActiveInPlayer = result[3] as Boolean

                // Don't update main state while ad is playing
                if (_uiState.value.isPlayingAd) return@collect

                _uiState.value = _uiState.value.copy(
                    isPlaying = isPlaying,
                    currentTime = position,
                    duration = duration,
                    isEpisodeActiveInPlayer = isActiveInPlayer
                )

                // Check for ad insertion
                if (isPlaying && !_uiState.value.isPlayingAd) {
                    checkForAdInsertion(position)
                }
            }
        }

        // Load preferred language
        viewModelScope.launch {
            preferencesManager.preferredLanguage.collect { langCode ->
                _uiState.value = _uiState.value.copy(
                    selectedLanguage = SupportedLanguage.fromCode(langCode)
                )
            }
        }

        // Track subscription status (cached locally for instant access)
        viewModelScope.launch {
            preferencesManager.isSubscribed.collect { subscribed ->
                isSubscriber = subscribed
            }
        }

        // Observe playback speed
        viewModelScope.launch {
            audioManager.playbackSpeed.collect { speed ->
                _uiState.value = _uiState.value.copy(playbackSpeed = speed)
            }
        }

        // Observe sleep timer
        viewModelScope.launch {
            audioManager.sleepTimerRemaining.collect { remaining ->
                _uiState.value = _uiState.value.copy(sleepTimerRemaining = remaining)
            }
        }

        // Observe queue size
        viewModelScope.launch {
            audioManager.queue.collect { queue ->
                _uiState.value = _uiState.value.copy(queueSize = queue.size)
            }
        }

        // Restore saved playback speed
        viewModelScope.launch {
            val savedSpeed = preferencesManager.playbackSpeed.first()
            if (savedSpeed != 1.0f) {
                audioManager.setPlaybackSpeed(savedSpeed)
            }
        }

        // Set up position save callback
        audioManager.onPositionSave = { episodeId, positionMs ->
            viewModelScope.launch {
                preferencesManager.savePlaybackPosition(episodeId, positionMs)
            }
        }
    }

    fun loadTopic(topic: Topic) {
        _uiState.value = _uiState.value.copy(
            topic = topic,
            currentTime = 0,
            duration = 0,
            isPlaying = false,
            ads = emptyList(),
            isPlayingAd = false,
            currentAd = null
        )
        adInsertionPoints = emptyList()
        nextAdIndex = 0

        viewModelScope.launch {
            preferencesManager.bookmarkedTopics.collect { bookmarked ->
                _uiState.value = _uiState.value.copy(
                    isBookmarked = topic.id in bookmarked
                )
            }
        }

        viewModelScope.launch {
            val langCode = preferencesManager.preferredLanguage.first()
            val language = SupportedLanguage.fromCode(langCode)
            _uiState.value = _uiState.value.copy(
                selectedLanguage = language,
                isLoading = true,
                error = null
            )

            // Load today's episode and history in parallel so we can fall back
            // to the most recent completed episode in history when today's
            // hasn't been generated yet (avoids triggering a fresh generation
            // on tap when an existing episode is right there).
            coroutineScope {
                val episodeJob = async { loadEpisodeInternal() }
                val historyJob = async { loadEpisodeHistoryInternal() }
                episodeJob.await()
                historyJob.await()
            }

            val state = _uiState.value
            val current = state.currentEpisode
            if (current == null || current.status != "completed" || current.audioUrl == null) {
                val fallback = state.episodeHistory.firstOrNull {
                    it.status == "completed" && it.audioUrl != null
                }
                if (fallback != null) {
                    val ads = if (isSubscriber) emptyList() else state.ads
                    _uiState.value = _uiState.value.copy(
                        currentEpisode = fallback,
                        duration = (fallback.durationSeconds ?: 0) * 1000L,
                        ads = ads
                    )
                    calculateAdInsertionPoints(fallback, ads)
                    audioManager.play(fallback)
                    queueEpisodeHistory()
                    recordListeningHistory(fallback)
                }
            }

            _uiState.value = _uiState.value.copy(isLoading = false)
        }
    }

    private suspend fun loadEpisodeInternal() {
        val topic = _uiState.value.topic ?: return
        val language = _uiState.value.selectedLanguage.code

        topicRepository.getTopicEpisode(topic.id, language)
            .onSuccess { response ->
                val episode = response.data?.episode
                var ads = response.data?.ads ?: emptyList()

                if (episode != null && episode.status == "completed") {
                    // Subscribers get no ads at all
                    if (isSubscriber) {
                        ads = emptyList()
                    }

                    _uiState.value = _uiState.value.copy(
                        currentEpisode = episode,
                        duration = (episode.durationSeconds ?: 0) * 1000L,
                        ads = ads
                    )
                    calculateAdInsertionPoints(episode, ads)

                    if (episode.audioUrl != null) {
                        audioManager.play(episode)
                        queueEpisodeHistory()
                        recordListeningHistory(episode)
                    }
                } else {
                    _uiState.value = _uiState.value.copy(
                        currentEpisode = null,
                        ads = emptyList()
                    )
                }
            }
            .onFailure { e ->
                Log.e(TAG, "Failed to load episode: ${e.message}")
                _uiState.value = _uiState.value.copy(error = e.message)
            }
    }

    private suspend fun loadEpisodeHistoryInternal() {
        val topic = _uiState.value.topic ?: return
        val language = _uiState.value.selectedLanguage.code

        topicRepository.getTopicEpisodes(topic.id, language)
            .onSuccess { response ->
                _uiState.value = _uiState.value.copy(
                    episodeHistory = response.data?.episodes ?: emptyList()
                )
            }
            .onFailure { e ->
                Log.e(TAG, "Failed to load history: ${e.message}")
            }
    }

    // MARK: - Ad Insertion Points

    private fun calculateAdInsertionPoints(episode: TopicEpisode, ads: List<AdSegment>) {
        if (ads.isEmpty()) {
            adInsertionPoints = emptyList()
            nextAdIndex = 0
            return
        }

        val timings = episode.segmentTimings
        val points = mutableListOf<Long>()

        if (timings != null && timings.size >= 3) {
            val totalDuration = timings.last().endTime
            if (totalDuration <= 30.0) {
                adInsertionPoints = emptyList()
                return
            }

            if (ads.size >= 2) {
                val oneThird = totalDuration / 3.0
                val twoThirds = totalDuration * 2.0 / 3.0
                points.add((findNearestBreak(oneThird, timings) * 1000).toLong())
                points.add((findNearestBreak(twoThirds, timings) * 1000).toLong())
            } else {
                val mid = totalDuration / 2.0
                points.add((findNearestBreak(mid, timings) * 1000).toLong())
            }
        } else {
            val durationSecs = episode.durationSeconds ?: 0
            if (durationSecs > 60) {
                val total = durationSecs * 1000L
                if (ads.size >= 2) {
                    points.add(total / 3)
                    points.add(total * 2 / 3)
                } else {
                    points.add(total / 2)
                }
            }
        }

        adInsertionPoints = points
        nextAdIndex = 0

        if (points.isNotEmpty()) {
            Log.d(TAG, "Ad insertion points: ${points.map { "${it / 1000}s" }}")
        }
    }

    private fun findNearestBreak(target: Double, timings: List<SegmentTiming>): Double {
        var closest = target
        var minDist = Double.MAX_VALUE

        for (timing in timings) {
            val dist = abs(timing.endTime - target)
            if (dist < minDist) {
                minDist = dist
                closest = timing.endTime
            }
        }

        return closest
    }

    private fun checkForAdInsertion(currentPositionMs: Long) {
        if (_uiState.value.isPlayingAd) return
        if (nextAdIndex >= _uiState.value.ads.size) return
        if (nextAdIndex >= adInsertionPoints.size) return

        val insertionPoint = adInsertionPoints[nextAdIndex]

        // Trigger ad when we pass the insertion point (within a 1.5-second window)
        if (currentPositionMs >= insertionPoint && currentPositionMs < insertionPoint + 1500) {
            playAd(_uiState.value.ads[nextAdIndex])
        }
    }

    // MARK: - Ad Playback

    private fun playAd(ad: AdSegment) {
        Log.d(TAG, "Playing ad: ${ad.creativeId}")

        // Pause main episode
        audioManager.pause()

        // Set ad state
        _uiState.value = _uiState.value.copy(
            isPlayingAd = true,
            currentAd = ad,
            adTimeRemaining = ad.audioDurationSeconds * 1000L
        )

        // Create and start ad player
        adPlayer?.release()
        adPlayer = ExoPlayer.Builder(appContext).build().apply {
            addListener(adPlayerListener)
            setMediaItem(MediaItem.fromUri(ad.audioUrl))
            prepare()
            play()
        }

        // Start countdown timer
        viewModelScope.launch {
            while (_uiState.value.isPlayingAd) {
                val pos = adPlayer?.currentPosition ?: 0
                val remaining = (ad.audioDurationSeconds * 1000L - pos).coerceAtLeast(0)
                _uiState.value = _uiState.value.copy(adTimeRemaining = remaining)
                kotlinx.coroutines.delay(500L)
            }
        }

        // Track impression
        viewModelScope.launch {
            val state = _uiState.value
            topicRepository.trackAdImpression(
                AdImpressionRequest(
                    creativeId = ad.creativeId,
                    campaignId = ad.campaignId,
                    episodeId = state.currentEpisode?.id ?: "",
                    topicId = state.topic?.id ?: "",
                    language = state.selectedLanguage.code,
                    durationListenedSeconds = ad.audioDurationSeconds,
                    wasSkipped = false
                )
            )
        }
    }

    fun skipAd() {
        val ad = _uiState.value.currentAd ?: return
        val remaining = _uiState.value.adTimeRemaining
        val listenedMs = ad.audioDurationSeconds * 1000L - remaining
        val listenedSeconds = (listenedMs / 1000).toInt()

        // Track as skipped
        viewModelScope.launch {
            val state = _uiState.value
            topicRepository.trackAdImpression(
                AdImpressionRequest(
                    creativeId = ad.creativeId,
                    campaignId = ad.campaignId,
                    episodeId = state.currentEpisode?.id ?: "",
                    topicId = state.topic?.id ?: "",
                    language = state.selectedLanguage.code,
                    durationListenedSeconds = listenedSeconds,
                    wasSkipped = true
                )
            )
        }

        adPlaybackDidEnd(wasSkipped = true)
    }

    fun handleAdTap() {
        val ad = _uiState.value.currentAd ?: return
        val url = ad.clickThroughUrl ?: return
        if (url.isBlank()) return

        // Track click
        viewModelScope.launch {
            topicRepository.trackAdClick(
                AdClickRequest(
                    creativeId = ad.creativeId,
                    campaignId = ad.campaignId
                )
            )
        }

        // Open URL
        try {
            val intent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            }
            appContext.startActivity(intent)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to open ad URL: ${e.message}")
        }
    }

    private fun adPlaybackDidEnd(wasSkipped: Boolean) {
        val ad = _uiState.value.currentAd
        Log.d(TAG, "Ad ended (skipped: $wasSkipped)")

        stopAdPlayback()
        nextAdIndex++

        // Resume main episode
        audioManager.resume()
    }

    private fun stopAdPlayback() {
        adPlayer?.removeListener(adPlayerListener)
        adPlayer?.release()
        adPlayer = null

        _uiState.value = _uiState.value.copy(
            isPlayingAd = false,
            currentAd = null,
            adTimeRemaining = 0
        )
    }

    // MARK: - Existing Functionality

    fun generateEpisode() {
        val topic = _uiState.value.topic ?: return
        val language = _uiState.value.selectedLanguage.code

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isGenerating = true, error = null)

            topicRepository.generateTopicEpisode(topic.id, language, forceRegenerate = false)
                .onSuccess { response ->
                    val episode = response.data?.episode
                    val ads = response.data?.ads ?: emptyList()
                    if (episode != null) {
                        _uiState.value = _uiState.value.copy(
                            currentEpisode = episode,
                            isGenerating = false,
                            duration = (episode.durationSeconds ?: 0) * 1000L,
                            ads = ads
                        )
                        calculateAdInsertionPoints(episode, ads)
                        audioManager.play(episode)
                    }
                    loadEpisodeHistoryInternal()
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to generate episode: ${e.message}")
                    _uiState.value = _uiState.value.copy(
                        isGenerating = false,
                        error = e.message
                    )
                }
        }
    }

    fun regenerateEpisode() {
        val topic = _uiState.value.topic ?: return
        val language = _uiState.value.selectedLanguage.code

        stopAdPlayback()

        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isGenerating = true, error = null)

            topicRepository.generateTopicEpisode(topic.id, language, forceRegenerate = true)
                .onSuccess { response ->
                    val episode = response.data?.episode
                    val ads = response.data?.ads ?: emptyList()
                    if (episode != null) {
                        _uiState.value = _uiState.value.copy(
                            currentEpisode = episode,
                            isGenerating = false,
                            duration = (episode.durationSeconds ?: 0) * 1000L,
                            ads = ads
                        )
                        calculateAdInsertionPoints(episode, ads)
                        audioManager.play(episode)
                    }
                    loadEpisodeHistoryInternal()
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to regenerate episode: ${e.message}")
                    _uiState.value = _uiState.value.copy(
                        isGenerating = false,
                        error = e.message
                    )
                }
        }
    }

    fun setLanguage(language: SupportedLanguage) {
        stopAdPlayback()
        viewModelScope.launch {
            preferencesManager.setPreferredLanguage(language.code)
        }
        _uiState.value = _uiState.value.copy(
            selectedLanguage = language,
            ads = emptyList(),
            isLoading = true,
            error = null
        )
        adInsertionPoints = emptyList()
        nextAdIndex = 0

        viewModelScope.launch {
            coroutineScope {
                val episodeJob = async { loadEpisodeInternal() }
                val historyJob = async { loadEpisodeHistoryInternal() }
                episodeJob.await()
                historyJob.await()
            }

            val state = _uiState.value
            val current = state.currentEpisode
            if (current == null || current.status != "completed" || current.audioUrl == null) {
                val fallback = state.episodeHistory.firstOrNull {
                    it.status == "completed" && it.audioUrl != null
                }
                if (fallback != null) {
                    val ads = if (isSubscriber) emptyList() else state.ads
                    _uiState.value = _uiState.value.copy(
                        currentEpisode = fallback,
                        duration = (fallback.durationSeconds ?: 0) * 1000L,
                        ads = ads
                    )
                    calculateAdInsertionPoints(fallback, ads)
                    audioManager.play(fallback)
                    queueEpisodeHistory()
                    recordListeningHistory(fallback)
                }
            }

            _uiState.value = _uiState.value.copy(isLoading = false)
        }
    }

    fun togglePlayPause() {
        if (_uiState.value.isPlayingAd) {
            skipAd()
            return
        }

        val episode = _uiState.value.currentEpisode

        if (episode == null || episode.audioUrl == null) {
            if (!_uiState.value.isGenerating && !_uiState.value.isLoading) {
                generateEpisode()
            }
            return
        }

        if (_uiState.value.isPlaying) {
            audioManager.pause()
        } else {
            Log.d(TAG, "Playing episode: ${episode.title} with URL: ${episode.audioUrl}")
            audioManager.play(episode)
        }
    }

    fun seekTo(positionMs: Long) {
        val currentEpisodeId = _uiState.value.currentEpisode?.id
        if (currentEpisodeId != null && audioManager.currentEpisodeId.value == currentEpisodeId) {
            audioManager.seekTo(positionMs)
        }
    }

    fun skipForward() {
        val currentEpisodeId = _uiState.value.currentEpisode?.id
        if (currentEpisodeId != null && audioManager.currentEpisodeId.value == currentEpisodeId) {
            audioManager.skipForward(15)
        }
    }

    fun skipBackward() {
        val currentEpisodeId = _uiState.value.currentEpisode?.id
        if (currentEpisodeId != null && audioManager.currentEpisodeId.value == currentEpisodeId) {
            audioManager.skipBackward(15)
        }
    }

    fun toggleBookmark() {
        val topic = _uiState.value.topic ?: return

        viewModelScope.launch {
            val current = preferencesManager.bookmarkedTopics.first()
            val updated = if (topic.id in current) {
                current - topic.id
            } else {
                current + topic.id
            }
            preferencesManager.setBookmarkedTopics(updated)
            _uiState.value = _uiState.value.copy(isBookmarked = topic.id in updated)
        }
    }

    fun playEpisode(episode: TopicEpisode) {
        stopAdPlayback()
        _uiState.value = _uiState.value.copy(
            currentEpisode = episode,
            ads = emptyList()
        )
        adInsertionPoints = emptyList()
        nextAdIndex = 0
        audioManager.play(episode)
        queueEpisodeHistory()
        recordListeningHistory(episode)
    }

    fun updatePosition() {
        audioManager.updatePosition()
    }

    // MARK: - Playback Speed

    fun cyclePlaybackSpeed() {
        audioManager.cyclePlaybackSpeed()
        viewModelScope.launch {
            preferencesManager.setPlaybackSpeed(audioManager.playbackSpeed.value)
        }
    }

    fun setPlaybackSpeed(speed: Float) {
        audioManager.setPlaybackSpeed(speed)
        viewModelScope.launch {
            preferencesManager.setPlaybackSpeed(speed)
        }
    }

    // MARK: - Sleep Timer

    fun startSleepTimer(minutes: Int) {
        audioManager.startSleepTimer(minutes)
    }

    fun cancelSleepTimer() {
        audioManager.cancelSleepTimer()
    }

    // MARK: - Queue

    private fun queueEpisodeHistory() {
        val current = _uiState.value.currentEpisode ?: return
        val history = _uiState.value.episodeHistory
        val items = history
            .filter { it.id != current.id && it.audioUrl != null }
            .map { ep ->
                QueueItem(
                    id = ep.id,
                    title = ep.title,
                    audioUrl = ep.audioUrl!!,
                    topicId = ep.topicId,
                    durationSeconds = ep.durationSeconds ?: 0
                )
            }
        audioManager.setQueue(items)
    }

    // MARK: - Listening History

    private fun recordListeningHistory(episode: TopicEpisode) {
        val topic = _uiState.value.topic ?: return
        viewModelScope.launch {
            preferencesManager.addListeningHistoryEntry(
                PreferencesManager.ListeningHistoryEntry(
                    episodeId = episode.id,
                    episodeTitle = episode.title,
                    topicId = topic.id,
                    topicName = topic.name,
                    playedAt = System.currentTimeMillis(),
                    durationSeconds = episode.durationSeconds ?: 0
                )
            )
        }
    }

    override fun onCleared() {
        super.onCleared()
        adPlayer?.removeListener(adPlayerListener)
        adPlayer?.release()
        adPlayer = null
    }
}
