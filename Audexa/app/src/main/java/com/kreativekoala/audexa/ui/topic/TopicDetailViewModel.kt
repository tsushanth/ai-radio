package com.kreativekoala.audexa.ui.topic

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.data.model.TopicEpisode
import com.kreativekoala.audexa.data.repository.TopicRepository
import com.kreativekoala.audexa.service.AudioManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

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
    val isEpisodeActiveInPlayer: Boolean = false, // true when this episode is loaded in the audio player
    val error: String? = null
)

@HiltViewModel
class TopicDetailViewModel @Inject constructor(
    private val topicRepository: TopicRepository,
    private val preferencesManager: PreferencesManager,
    private val audioManager: AudioManager
) : ViewModel() {

    companion object {
        private const val TAG = "TopicDetailViewModel"
    }

    private val _uiState = MutableStateFlow(TopicDetailUiState())
    val uiState: StateFlow<TopicDetailUiState> = _uiState.asStateFlow()

    init {
        // Observe audio state - only update position/duration when THIS episode is playing
        viewModelScope.launch {
            combine(
                audioManager.isPlaying,
                audioManager.currentPosition,
                audioManager.duration,
                audioManager.currentEpisodeId,
                _uiState.map { it.currentEpisode?.id }.distinctUntilChanged()
            ) { isPlaying, position, duration, playerEpisodeId, currentEpisodeId ->
                // If our episode hasn't loaded yet, keep default state
                if (currentEpisodeId == null) {
                    return@combine arrayOf(false, 0L, 0L, false)
                }

                val isThisEpisodePlaying = isPlaying && playerEpisodeId == currentEpisodeId
                val isThisEpisodeLoaded = playerEpisodeId == currentEpisodeId

                // Return: isPlaying, position, duration, isActiveInPlayer
                if (isThisEpisodeLoaded) {
                    arrayOf(isThisEpisodePlaying, position, duration, true)
                } else {
                    // Different episode is playing - show 0 position and episode's expected duration
                    val episodeDuration = (_uiState.value.currentEpisode?.durationSeconds ?: 0) * 1000L
                    arrayOf(false, 0L, episodeDuration, false)
                }
            }.collect { result ->
                val isPlaying = result[0] as Boolean
                val position = result[1] as Long
                val duration = result[2] as Long
                val isActiveInPlayer = result[3] as Boolean

                _uiState.value = _uiState.value.copy(
                    isPlaying = isPlaying,
                    currentTime = position,
                    duration = duration,
                    isEpisodeActiveInPlayer = isActiveInPlayer
                )
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
    }

    fun loadTopic(topic: Topic) {
        // Reset playback state when loading a new topic
        _uiState.value = _uiState.value.copy(
            topic = topic,
            currentTime = 0,
            duration = 0,
            isPlaying = false
        )

        viewModelScope.launch {
            // Check if bookmarked
            preferencesManager.bookmarkedTopics.collect { bookmarked ->
                _uiState.value = _uiState.value.copy(
                    isBookmarked = topic.id in bookmarked
                )
            }
        }

        // Wait for the preferred language to load first, then load episodes
        viewModelScope.launch {
            val langCode = preferencesManager.preferredLanguage.first()
            val language = SupportedLanguage.fromCode(langCode)
            _uiState.value = _uiState.value.copy(selectedLanguage = language)
            loadEpisode()
            loadEpisodeHistory()
        }
    }

    private fun loadEpisode() {
        val topic = _uiState.value.topic ?: return
        val language = _uiState.value.selectedLanguage.code
        
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            
            topicRepository.getTopicEpisode(topic.id, language)
                .onSuccess { response ->
                    val episode = response.data?.episode
                    if (episode != null && episode.status == "completed") {
                        _uiState.value = _uiState.value.copy(
                            currentEpisode = episode,
                            isLoading = false,
                            duration = (episode.durationSeconds ?: 0) * 1000L
                        )
                    } else {
                        _uiState.value = _uiState.value.copy(
                            currentEpisode = null,
                            isLoading = false
                        )
                    }
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to load episode: ${e.message}")
                    _uiState.value = _uiState.value.copy(
                        isLoading = false,
                        error = e.message
                    )
                }
        }
    }

    private fun loadEpisodeHistory() {
        val topic = _uiState.value.topic ?: return
        val language = _uiState.value.selectedLanguage.code
        
        viewModelScope.launch {
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
    }

    fun generateEpisode() {
        val topic = _uiState.value.topic ?: return
        val language = _uiState.value.selectedLanguage.code
        
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isGenerating = true, error = null)
            
            topicRepository.generateTopicEpisode(topic.id, language, forceRegenerate = false)
                .onSuccess { response ->
                    val episode = response.data?.episode
                    if (episode != null) {
                        _uiState.value = _uiState.value.copy(
                            currentEpisode = episode,
                            isGenerating = false,
                            duration = (episode.durationSeconds ?: 0) * 1000L
                        )

                        // Auto-play
                        audioManager.play(episode)
                    }

                    loadEpisodeHistory()
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
        
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isGenerating = true, error = null)
            
            topicRepository.generateTopicEpisode(topic.id, language, forceRegenerate = true)
                .onSuccess { response ->
                    val episode = response.data?.episode
                    if (episode != null) {
                        _uiState.value = _uiState.value.copy(
                            currentEpisode = episode,
                            isGenerating = false,
                            duration = (episode.durationSeconds ?: 0) * 1000L
                        )

                        audioManager.play(episode)
                    }
                    loadEpisodeHistory()
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
        viewModelScope.launch {
            preferencesManager.setPreferredLanguage(language.code)
        }
        _uiState.value = _uiState.value.copy(selectedLanguage = language)
        loadEpisode()
        loadEpisodeHistory()
    }

    fun togglePlayPause() {
        val episode = _uiState.value.currentEpisode

        // If no episode or episode doesn't have audio URL, try to generate one
        if (episode == null || episode.audioUrl == null) {
            // Don't generate if already generating or loading
            if (!_uiState.value.isGenerating && !_uiState.value.isLoading) {
                generateEpisode()
            }
            return
        }

        if (_uiState.value.isPlaying) {
            audioManager.pause()
        } else {
            // If this episode is already loaded in the player, just resume
            if (audioManager.currentEpisodeId.value == episode.id) {
                audioManager.resume()
            } else {
                // Play the episode
                Log.d(TAG, "Playing episode: ${episode.title} with URL: ${episode.audioUrl}")
                audioManager.play(episode)
            }
        }
    }

    fun seekTo(positionMs: Long) {
        // Only seek if this episode is currently loaded in the player
        val currentEpisodeId = _uiState.value.currentEpisode?.id
        if (currentEpisodeId != null && audioManager.currentEpisodeId.value == currentEpisodeId) {
            audioManager.seekTo(positionMs)
        }
    }

    fun skipForward() {
        // Only skip if this episode is currently loaded in the player
        val currentEpisodeId = _uiState.value.currentEpisode?.id
        if (currentEpisodeId != null && audioManager.currentEpisodeId.value == currentEpisodeId) {
            audioManager.skipForward(15)
        }
    }

    fun skipBackward() {
        // Only skip if this episode is currently loaded in the player
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
        _uiState.value = _uiState.value.copy(currentEpisode = episode)
        audioManager.play(episode)
    }

    fun updatePosition() {
        audioManager.updatePosition()
    }
}
