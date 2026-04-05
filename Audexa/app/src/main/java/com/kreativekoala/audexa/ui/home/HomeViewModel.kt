package com.kreativekoala.audexa.ui.home

import android.content.Context
import android.net.ConnectivityManager
import android.net.NetworkCapabilities
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.*
import com.kreativekoala.audexa.data.remote.JobError
import com.kreativekoala.audexa.data.repository.AsyncGenerationResult
import com.kreativekoala.audexa.data.repository.PodcastRepository
import com.kreativekoala.audexa.data.repository.TopicRepository
import com.kreativekoala.audexa.service.AudioManager
import com.kreativekoala.audexa.ui.components.DailyBriefState
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

@HiltViewModel
class HomeViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
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

    private val _keepListening = MutableStateFlow<List<Episode>>(emptyList())
    val keepListening = _keepListening.asStateFlow()

    private val _discoverCategories = MutableStateFlow<List<DiscoverCategory>>(emptyList())
    val discoverCategories = _discoverCategories.asStateFlow()

    private val _isLoading = MutableStateFlow(false)
    val isLoading = _isLoading.asStateFlow()

    private val _error = MutableStateFlow<String?>(null)
    val error = _error.asStateFlow()

    // Whether we have a cached episode for today (enables regenerate button)
    private val _hasCachedEpisodeForToday = MutableStateFlow(false)
    val hasCachedEpisodeForToday = _hasCachedEpisodeForToday.asStateFlow()

    // Bookmarked and hidden topics from preferences
    val bookmarkedTopicIds = preferencesManager.bookmarkedTopics
    val hiddenTopicIds = preferencesManager.hiddenTopics
    val hasLinkedGoogle = preferencesManager.hasLinkedGoogle
    val radioLanguages = preferencesManager.radioLanguages

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
    private var dailyBriefEpisodeId: String? = null
    private var dailyBriefDurationSeconds: Int = 0

    val dailyBriefDate: String
        get() {
            val dateFormat = SimpleDateFormat("EEEE, MMM d", Locale.getDefault())
            return dateFormat.format(Date())
        }

    private val todayDateString: String
        get() {
            val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
            return dateFormat.format(Date())
        }

    init {
        // Load cached topics immediately for instant UI display
        loadCachedTopics()
        loadUserInfo()
        checkLinkedAccounts()
        loadCachedEpisode()
        loadData()
        observeAudioState()
    }

    /**
     * Load cached topics from repository for instant UI display
     */
    private fun loadCachedTopics() {
        val cached = topicRepository.getCachedTopics()
        if (cached != null && cached.isNotEmpty()) {
            _topics.value = cached
            updateDiscoverCategories(cached)
            Log.d(TAG, "📦 Loaded ${cached.size} cached topics for instant display")
        }
    }

    /**
     * Update discover categories from topics
     */
    private fun updateDiscoverCategories(topics: List<Topic>) {
        val grouped = topics.groupBy { it.category }
        _discoverCategories.value = grouped.map { (category, categoryTopics) ->
            DiscoverCategory(
                title = category.replaceFirstChar { it.uppercase() },
                shows = categoryTopics.map { topic ->
                    Show(
                        id = topic.id,
                        title = topic.name,
                        description = topic.description,
                        category = topic.category,
                        imageColor = topic.color,
                        episodeCount = topic.targetDurationMinutes
                    )
                }
            )
        }.sortedBy { it.title }
    }

    /**
     * Load cached episode from preferences if available for today
     */
    private fun loadCachedEpisode() {
        viewModelScope.launch {
            val cached = preferencesManager.getCachedEpisode()
            if (cached != null && cached.date == todayDateString) {
                // We have a cached episode for today
                dailyBriefAudioUrl = cached.audioUrl
                dailyBriefEpisodeId = cached.id
                dailyBriefDurationSeconds = cached.durationSeconds
                _hasCachedEpisodeForToday.value = true

                // Check if currently linked
                val hasLinked = preferencesManager.hasLinkedGoogle.first()
                if (hasLinked) {
                    _dailyBriefState.value = DailyBriefState.Completed(cached.audioUrl)
                }
                Log.d(TAG, "Loaded cached episode for today: ${cached.id}")
            }
        }
    }

    /**
     * Cache the episode for today to avoid regeneration
     */
    private fun cacheEpisode(id: String, audioUrl: String, durationSeconds: Int) {
        viewModelScope.launch {
            preferencesManager.setCachedEpisode(
                id = id,
                audioUrl = audioUrl,
                durationSeconds = durationSeconds,
                date = todayDateString
            )
            _hasCachedEpisodeForToday.value = true
            Log.d(TAG, "Cached episode for $todayDateString")
        }
    }

    /**
     * Clear cached episode (for regeneration)
     */
    fun clearCachedEpisode() {
        viewModelScope.launch {
            preferencesManager.clearCachedEpisode()
            _hasCachedEpisodeForToday.value = false
            dailyBriefAudioUrl = null
            dailyBriefEpisodeId = null
            dailyBriefDurationSeconds = 0

            val hasLinked = preferencesManager.hasLinkedGoogle.first()
            _dailyBriefState.value = if (hasLinked) DailyBriefState.Ready else DailyBriefState.NotLinked
            Log.d(TAG, "Cleared cached episode")
        }
    }

    /**
     * Force regenerate today's episode
     */
    fun regenerateDailyBrief() {
        clearCachedEpisode()
        playDailyBrief()
    }

    /**
     * Cancel ongoing generation and reset to ready state
     */
    fun cancelGeneration() {
        viewModelScope.launch {
            Log.d(TAG, "Cancelling generation")
            val hasLinked = preferencesManager.hasLinkedGoogle.first()
            _dailyBriefState.value = if (hasLinked) DailyBriefState.Ready else DailyBriefState.NotLinked
        }
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
                // Only update state if not currently in an active state (generating, playing, etc.)
                // This preserves progress when navigating away and back
                val currentState = _dailyBriefState.value
                when (currentState) {
                    is DailyBriefState.Generating,
                    is DailyBriefState.Playing,
                    is DailyBriefState.Completed -> {
                        // Keep current state - don't reset during active operations
                    }
                    else -> {
                        _dailyBriefState.value = if (hasLinked) {
                            DailyBriefState.Ready
                        } else {
                            DailyBriefState.NotLinked
                        }
                    }
                }
            }
        }
    }

    fun loadData() {
        viewModelScope.launch {
            _isLoading.value = true
            _error.value = null

            // Fetch topics from server (will update cache automatically)
            // Topics are already loaded from cache in init, so this updates in background
            val language = preferencesManager.preferredLanguage.first()
            val bookmarked = preferencesManager.bookmarkedTopics.first()
            Log.d(TAG, "Loading topics with lang=$language, bookmarked=$bookmarked")
            topicRepository.getTopics(language)
                .onSuccess { response ->
                    val serverTopics = response.data?.topics ?: emptyList()
                    Log.d(TAG, "Server returned ${serverTopics.size} topics: ${serverTopics.map { it.id }}")
                    val currentTopicIds = _topics.value.map { it.id }.toSet()
                    val newTopicIds = serverTopics.map { it.id }.toSet()

                    // Only update UI if topics changed (server takes precedence)
                    if (newTopicIds != currentTopicIds || _topics.value.isEmpty()) {
                        _topics.value = serverTopics
                        updateDiscoverCategories(serverTopics)
                        Log.d(TAG, "✅ Updated topics from server: ${serverTopics.size} topics")
                    } else {
                        Log.d(TAG, "✅ Topics unchanged from server")
                    }
                }
                .onFailure { e ->
                    Log.e(TAG, "❌ Failed to load topics from server: ${e.message}")
                    // If we already have cached topics, we're fine
                    if (_topics.value.isEmpty()) {
                        _error.value = e.message
                    }
                }

            // Load episodes for "Keep Listening" section
            val email = _userEmail.value
            if (email.isNotEmpty()) {
                podcastRepository.getEpisodes(email)
                    .onSuccess { response ->
                        _keepListening.value = response.episodes.take(5)
                    }
                    .onFailure { e ->
                        Log.e(TAG, "Failed to load episodes: ${e.message}")
                    }
            }

            // Note: Discover categories are generated from topics in updateDiscoverCategories()
            // This ensures show IDs match topic IDs for proper functionality (bookmarks, hide, etc.)

            _isLoading.value = false
        }
    }

    fun selectTab(index: Int) {
        _selectedTab.value = index
    }

    /**
     * Check if device has active internet connection
     */
    private fun isNetworkAvailable(): Boolean {
        val connectivityManager = context.getSystemService(Context.CONNECTIVITY_SERVICE) as ConnectivityManager
        val network = connectivityManager.activeNetwork ?: return false
        val capabilities = connectivityManager.getNetworkCapabilities(network) ?: return false
        return capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET) &&
               capabilities.hasCapability(NetworkCapabilities.NET_CAPABILITY_VALIDATED)
    }

    fun playDailyBrief() {
        viewModelScope.launch {
            val email = _userEmail.value
            if (email.isEmpty()) {
                _dailyBriefState.value = DailyBriefState.NotLinked
                return@launch
            }

            // If we have a cached episode, just play it
            if (_hasCachedEpisodeForToday.value && dailyBriefAudioUrl != null) {
                val audioUrl = dailyBriefAudioUrl!!
                audioManager.play(
                    id = dailyBriefEpisodeId ?: "daily-brief",
                    title = context.getString(R.string.daily_brief_title_format, dailyBriefDate),
                    description = context.getString(R.string.daily_brief_description),
                    audioUrl = audioUrl
                )
                _dailyBriefState.value = DailyBriefState.Playing(audioUrl)
                return@launch
            }

            // Try to fetch latest episode from backend before generating
            try {
                val episodesResult = podcastRepository.getEpisodes(email, limit = 1, offset = 0)
                episodesResult.getOrNull()?.episodes?.firstOrNull()?.let { latestEpisode ->
                    if (latestEpisode.audioUrl != null && latestEpisode.status == "completed") {
                        dailyBriefAudioUrl = latestEpisode.audioUrl
                        dailyBriefEpisodeId = latestEpisode.id
                        dailyBriefDurationSeconds = latestEpisode.durationSeconds ?: 0
                        cacheEpisode(latestEpisode.id, latestEpisode.audioUrl, latestEpisode.durationSeconds ?: 0)
                        audioManager.play(
                            id = latestEpisode.id,
                            title = context.getString(R.string.daily_brief_title_format, dailyBriefDate),
                            description = context.getString(R.string.daily_brief_description),
                            audioUrl = latestEpisode.audioUrl
                        )
                        _dailyBriefState.value = DailyBriefState.Playing(latestEpisode.audioUrl)
                        return@launch
                    }
                }
            } catch (e: Exception) {
                Log.w(TAG, "Failed to check backend for existing episode: ${e.message}")
            }

            // Check network connectivity before attempting generation
            if (!isNetworkAvailable()) {
                _dailyBriefState.value = DailyBriefState.Error(context.getString(R.string.error_no_internet))
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

            // Use async generation with polling for real-time progress
            try {
                podcastRepository.generatePodcastAsync(email, preferences)
                    .collect { (progress, result) ->
                        // Update progress
                        _dailyBriefState.value = DailyBriefState.Generating(progress.progress)
                        Log.d(TAG, "Progress: ${progress.progress}% - ${progress.message}")

                        // Handle result if available
                        when (result) {
                            is AsyncGenerationResult.Success -> {
                                val episode = result.response.episode
                                dailyBriefAudioUrl = episode.audioUrl
                                dailyBriefEpisodeId = episode.id
                                dailyBriefDurationSeconds = episode.durationSeconds

                                // Cache for today
                                cacheEpisode(episode.id, episode.audioUrl, episode.durationSeconds)

                                _dailyBriefState.value = DailyBriefState.Completed(episode.audioUrl)

                                // Auto-play
                                audioManager.play(
                                    id = episode.id,
                                    title = context.getString(R.string.daily_brief_title_format, dailyBriefDate),
                                    description = context.getString(R.string.daily_brief_description),
                                    audioUrl = episode.audioUrl
                                )
                                _dailyBriefState.value = DailyBriefState.Playing(episode.audioUrl)
                            }

                            is AsyncGenerationResult.Failed -> {
                                handleJobError(result.error)
                            }

                            is AsyncGenerationResult.Error -> {
                                _dailyBriefState.value = DailyBriefState.Error(result.message)
                            }

                            null -> {
                                // Just a progress update, no final result yet
                            }
                        }
                    }
            } catch (e: Exception) {
                Log.e(TAG, "Failed to generate podcast: ${e.message}")
                _dailyBriefState.value = DailyBriefState.Error(e.message ?: context.getString(R.string.generation_failed))
            }
        }
    }

    /**
     * Handle structured error from job failure
     */
    private fun handleJobError(error: JobError) {
        Log.e(TAG, "Job error: ${error.code} - ${error.message}")

        when (error.action) {
            "RELINK_GMAIL", "RELINK_OUTLOOK" -> {
                // Token expired - need to relink
                // Clear local linked status so UI shows account needs reconnection
                viewModelScope.launch {
                    preferencesManager.setLinkedAccount(
                        hasLinked = false,
                        email = null,
                        provider = null
                    )
                }
                _dailyBriefState.value = DailyBriefState.NeedsRelink(error.message)
            }
            else -> {
                _dailyBriefState.value = DailyBriefState.Error(error.message)
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

    // Topic suggestion
    private val _suggestTopicResult = MutableStateFlow<SuggestTopicResult>(SuggestTopicResult.Idle)
    val suggestTopicResult = _suggestTopicResult.asStateFlow()

    fun suggestTopic(topicName: String, description: String?) {
        viewModelScope.launch {
            _suggestTopicResult.value = SuggestTopicResult.Loading
            val language = preferencesManager.preferredLanguage.first()
            topicRepository.suggestTopic(
                com.kreativekoala.audexa.data.remote.SuggestTopicRequest(
                    topicName = topicName,
                    language = language,
                    description = description?.takeIf { it.isNotBlank() }
                )
            ).onSuccess {
                _suggestTopicResult.value = SuggestTopicResult.Success
            }.onFailure { e ->
                _suggestTopicResult.value = SuggestTopicResult.Error(e.message ?: "Failed to suggest topic")
            }
        }
    }

    fun resetSuggestTopicResult() {
        _suggestTopicResult.value = SuggestTopicResult.Idle
    }
}

sealed class SuggestTopicResult {
    object Idle : SuggestTopicResult()
    object Loading : SuggestTopicResult()
    object Success : SuggestTopicResult()
    data class Error(val message: String) : SuggestTopicResult()
}
