package com.kreativekoala.audexa.ui.home

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.*
import com.kreativekoala.audexa.data.repository.PodcastRepository
import com.kreativekoala.audexa.data.repository.TopicRepository
import com.kreativekoala.audexa.service.AudioManager
import com.kreativekoala.audexa.ui.components.DailyBriefState
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    private val podcastRepository: PodcastRepository,
    private val topicRepository: TopicRepository,
    private val preferencesManager: PreferencesManager,
    private val audioManager: AudioManager
) : ViewModel() {

    companion object {
        private const val TAG = "HomeViewModel"
    }

    // UI State
    private val _selectedTab = MutableStateFlow(0)
    val selectedTab = _selectedTab.asStateFlow()

    private val _userName = MutableStateFlow("")
    val userName = _userName.asStateFlow()

    private val _userEmail = MutableStateFlow("")
    val userEmail = _userEmail.asStateFlow()

    private val _dailyBriefState = MutableStateFlow<DailyBriefState>(DailyBriefState.NotLinked)
    val dailyBriefState = _dailyBriefState.asStateFlow()

    private val _topics = MutableStateFlow<List<Topic>>(emptyList())
    val topics = _topics.asStateFlow()

    private val _forYouEpisodes = MutableStateFlow<List<Episode>>(emptyList())
    val forYouEpisodes = _forYouEpisodes.asStateFlow()

    private val _keepListening = MutableStateFlow<List<Episode>>(emptyList())
    val keepListening = _keepListening.asStateFlow()

    private val _discoverCategories = MutableStateFlow<List<DiscoverCategory>>(emptyList())
    val discoverCategories = _discoverCategories.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()

    // Bookmarked and hidden topics from preferences
    val bookmarkedTopicIds = preferencesManager.bookmarkedTopics
    val hiddenTopicIds = preferencesManager.hiddenTopics
    val hasLinkedGoogle = preferencesManager.hasLinkedGoogle

    // Visible topics (filter out hidden)
    val visibleTopics: Flow<List<Topic>> = combine(
        _topics,
        hiddenTopicIds
    ) { topics, hidden ->
        topics.filter { it.id !in hidden }
    }

    // Bookmarked topics
    val bookmarkedTopics: Flow<List<Topic>> = combine(
        _topics,
        bookmarkedTopicIds,
        hiddenTopicIds
    ) { topics, bookmarked, hidden ->
        topics.filter { it.id in bookmarked && it.id !in hidden }
    }

    // Currently playing topic ID (for showing "Playing" indicator on tiles)
    val playingTopicId: Flow<String?> = combine(
        audioManager.currentShowId,
        audioManager.isPlaying
    ) { showId, isPlaying ->
        if (isPlaying) showId else null
    }

    // Store the Daily Brief audio URL when generated
    private var dailyBriefAudioUrl: String? = null

    val dailyBriefDate: String
        get() {
            val dateFormat = SimpleDateFormat("EEEE, MMM d", Locale.getDefault())
            return dateFormat.format(Date())
        }

    init {
        loadUserInfo()
        checkLinkedAccounts()
        loadData()
        observeAudioState()
    }

    /**
     * Observe audio player state to sync Daily Brief UI with MiniPlayer
     */
    private fun observeAudioState() {
        viewModelScope.launch {
            // Combine isPlaying and currentEpisodeTitle to determine Daily Brief state
            combine(
                audioManager.isPlaying,
                audioManager.currentEpisodeTitle
            ) { isPlaying, currentTitle ->
                Pair(isPlaying, currentTitle)
            }.collect { (isPlaying, currentTitle) ->
                val currentState = _dailyBriefState.value
                val audioUrl = dailyBriefAudioUrl

                // Only update if we have a Daily Brief loaded and it's the current playing item
                if (audioUrl != null && currentTitle?.startsWith("Daily Brief") == true) {
                    when {
                        isPlaying && currentState !is DailyBriefState.Playing -> {
                            _dailyBriefState.value = DailyBriefState.Playing(audioUrl)
                        }
                        !isPlaying && currentState is DailyBriefState.Playing -> {
                            _dailyBriefState.value = DailyBriefState.Completed(audioUrl)
                        }
                    }
                }
            }
        }
    }

    private fun loadUserInfo() {
        viewModelScope.launch {
            preferencesManager.userName.collect { name ->
                _userName.value = name ?: "there"
            }
        }
        viewModelScope.launch {
            preferencesManager.userEmail.collect { email ->
                _userEmail.value = email ?: ""
            }
        }
    }

    private fun checkLinkedAccounts() {
        viewModelScope.launch {
            preferencesManager.hasLinkedGoogle.collect { hasLinked ->
                _dailyBriefState.value = if (hasLinked) {
                    DailyBriefState.Ready
                } else {
                    DailyBriefState.NotLinked
                }
            }
        }
    }

    fun loadData() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null

            // Load topics
            topicRepository.getTopics()
                .onSuccess { response ->
                    val topics = response.data?.topics ?: emptyList()
                    _topics.value = topics
                    Log.d(TAG, "Loaded ${topics.size} topics")
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to load topics: ${e.message}")
                    _error.value = e.message
                }

            // Load episodes
            val email = _userEmail.value
            if (email.isNotEmpty()) {
                podcastRepository.getEpisodes(email)
                    .onSuccess { response ->
                        _keepListening.value = response.episodes.take(5)
                    }
                    .onFailure { e ->
                        Log.e(TAG, "Failed to load episodes: ${e.message}")
                    }

                podcastRepository.getForYou(email)
                    .onSuccess { response ->
                        _forYouEpisodes.value = response.episodes
                    }
                    .onFailure { e ->
                        Log.e(TAG, "Failed to load for you: ${e.message}")
                    }
            }

            // Load discover categories
            podcastRepository.getDiscover()
                .onSuccess { response ->
                    _discoverCategories.value = response.categories
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to load discover: ${e.message}")
                }

            _isLoading.value = false
        }
    }

    fun selectTab(index: Int) {
        _selectedTab.value = index
    }

    fun playDailyBrief() {
        viewModelScope.launch {
            val email = _userEmail.value
            if (email.isEmpty()) {
                _dailyBriefState.value = DailyBriefState.NotLinked
                return@launch
            }

            _dailyBriefState.value = DailyBriefState.Generating(0)

            // Get user's preferred language from settings
            val language = preferencesManager.preferredLanguage.first()
            Log.d(TAG, "Playing Daily Brief with language: $language")

            val preferences = UserPreferences(
                briefingTime = "07:00",
                topics = listOf("Technology", "News", "Business"),
                voiceHost1 = "nova",
                voiceHost2 = "onyx",
                includeWeather = false,
                includeCalendar = false,
                includeEmail = true,
                language = language
            )

            podcastRepository.generatePodcast(email, preferences)
                .onSuccess { response ->
                    // Store the audio URL for state synchronization
                    dailyBriefAudioUrl = response.episode.audioUrl
                    _dailyBriefState.value = DailyBriefState.Completed(response.episode.audioUrl)

                    // Auto-play
                    audioManager.play(
                        id = response.episode.id,
                        title = "Daily Brief - $dailyBriefDate",
                        description = "Your personalized morning briefing",
                        audioUrl = response.episode.audioUrl
                    )
                    _dailyBriefState.value = DailyBriefState.Playing(response.episode.audioUrl)
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to generate podcast: ${e.message}")
                    _dailyBriefState.value = DailyBriefState.Error(e.message ?: "Generation failed")
                }
        }
    }

    fun pauseDailyBrief() {
        // Only pause if Daily Brief is actually the content currently playing
        val currentTitle = audioManager.currentEpisodeTitle.value
        if (currentTitle?.startsWith("Daily Brief") == true) {
            audioManager.pause()
            val currentState = _dailyBriefState.value
            if (currentState is DailyBriefState.Playing) {
                _dailyBriefState.value = DailyBriefState.Completed(currentState.audioUrl)
            }
        }
    }

    fun toggleBookmark(topicId: String) {
        viewModelScope.launch {
            val current = bookmarkedTopicIds.first()
            val updated = if (topicId in current) {
                current - topicId
            } else {
                current + topicId
            }
            preferencesManager.setBookmarkedTopics(updated)
        }
    }

    fun hideTopic(topicId: String) {
        viewModelScope.launch {
            val current = hiddenTopicIds.first()
            preferencesManager.setHiddenTopics(current + topicId)
        }
    }

    fun playEpisode(episode: Episode) {
        audioManager.play(episode)
    }
}
