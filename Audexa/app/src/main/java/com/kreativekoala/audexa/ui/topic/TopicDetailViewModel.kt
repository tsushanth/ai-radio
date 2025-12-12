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
        // Observe audio state
        viewModelScope.launch {
            combine(
                audioManager.isPlaying,
                audioManager.currentPosition,
                audioManager.duration,
                audioManager.currentEpisodeId
            ) { isPlaying, position, duration, episodeId ->
                Triple(
                    isPlaying && episodeId == _uiState.value.currentEpisode?.id,
                    position,
                    duration
                )
            }.collect { (isPlaying, position, duration) ->
                _uiState.value = _uiState.value.copy(
                    isPlaying = isPlaying,
                    currentTime = position,
                    duration = duration
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
        _uiState.value = _uiState.value.copy(topic = topic)
        
        viewModelScope.launch {
            // Check if bookmarked
            preferencesManager.bookmarkedTopics.collect { bookmarked ->
                _uiState.value = _uiState.value.copy(
                    isBookmarked = topic.id in bookmarked
                )
            }
        }
        
        loadEpisode()
        loadEpisodeHistory()
    }

    private fun loadEpisode() {
        val topic = _uiState.value.topic ?: return
        val language = _uiState.value.selectedLanguage.code
        
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            
            topicRepository.getTopicEpisode(topic.id, language)
                .onSuccess { response ->
                    if (response.episode.status == "completed") {
                        _uiState.value = _uiState.value.copy(
                            currentEpisode = response.episode,
                            isLoading = false,
                            duration = (response.episode.durationSeconds ?: 0) * 1000L
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
                        episodeHistory = response.episodes
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
                    _uiState.value = _uiState.value.copy(
                        currentEpisode = response.episode,
                        isGenerating = false,
                        duration = (response.episode.durationSeconds ?: 0) * 1000L
                    )
                    
                    // Auto-play
                    audioManager.play(response.episode)
                    
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
                    _uiState.value = _uiState.value.copy(
                        currentEpisode = response.episode,
                        isGenerating = false,
                        duration = (response.episode.durationSeconds ?: 0) * 1000L
                    )
                    
                    audioManager.play(response.episode)
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
        if (episode == null) {
            generateEpisode()
            return
        }
        
        if (_uiState.value.isPlaying) {
            audioManager.pause()
        } else {
            if (audioManager.currentEpisodeId.value == episode.id) {
                audioManager.resume()
            } else {
                audioManager.play(episode)
            }
        }
    }

    fun seekTo(positionMs: Long) {
        audioManager.seekTo(positionMs)
    }

    fun skipForward() {
        audioManager.skipForward(15)
    }

    fun skipBackward() {
        audioManager.skipBackward(15)
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
}
