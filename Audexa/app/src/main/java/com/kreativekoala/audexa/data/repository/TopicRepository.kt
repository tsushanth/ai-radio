package com.kreativekoala.audexa.data.repository

import android.content.Context
import android.util.Log
import com.kreativekoala.audexa.data.model.*
import com.kreativekoala.audexa.data.remote.*
// Both packages declare a TopicCategory (an enum in data.model, the API category in data.remote): the API one is meant here.
import com.kreativekoala.audexa.data.remote.TopicCategory
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.currentCoroutineContext
import kotlinx.coroutines.ensureActive
import kotlinx.serialization.encodeToString
import kotlinx.serialization.json.Json
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TopicRepository @Inject constructor(
    private val apiService: ApiService,
    @ApplicationContext private val context: Context
) {
    companion object {
        private const val TAG = "TopicRepository"
        private const val PREFS_NAME = "topic_cache"
        private const val KEY_CACHED_TOPICS = "cached_topics"
        private const val KEY_CACHE_TIMESTAMP = "cache_timestamp"
        private const val KEY_CACHED_CATEGORIES = "cached_category_names"
    }

    private val json = Json { ignoreUnknownKeys = true }
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // In-memory cache for instant access
    @Volatile
    private var cachedTopics: List<Topic>? = null

    /** Category id -> name from the last GET /topics, in the language that was asked for. */
    @Volatile
    private var cachedCategoryNames: Map<String, String> = emptyMap()

    init {
        // Load cached topics into memory immediately
        loadCachedTopicsIntoMemory()
    }

    // MARK: - Topic Caching

    private fun loadCachedTopicsIntoMemory() {
        try {
            val cached = prefs.getString(KEY_CACHED_TOPICS, null)
            if (cached != null) {
                cachedTopics = json.decodeFromString<List<Topic>>(cached)
                Log.d(TAG, "📦 Loaded ${cachedTopics?.size ?: 0} cached topics into memory")
            }
            prefs.getString(KEY_CACHED_CATEGORIES, null)?.let {
                cachedCategoryNames = json.decodeFromString<Map<String, String>>(it)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to load cached topics: ${e.message}")
        }
    }

    private fun cacheTopics(topics: List<Topic>) {
        try {
            cachedTopics = topics
            val encoded = json.encodeToString(topics)
            prefs.edit()
                .putString(KEY_CACHED_TOPICS, encoded)
                .putLong(KEY_CACHE_TIMESTAMP, System.currentTimeMillis())
                .apply()
            Log.d(TAG, "💾 Cached ${topics.size} topics")
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cache topics: ${e.message}")
        }
    }

    private fun cacheCategories(categories: List<TopicCategory>) {
        try {
            val names = categories.associate { it.id to it.name }
            cachedCategoryNames = names
            prefs.edit().putString(KEY_CACHED_CATEGORIES, json.encodeToString(names)).apply()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to cache category names: ${e.message}")
        }
    }

    /** Category names from the last successful topics response (empty before the first one). */
    fun getCachedCategoryNames(): Map<String, String> = cachedCategoryNames

    /**
     * Get cached topics immediately (synchronous, from memory)
     */
    fun getCachedTopics(): List<Topic>? = cachedTopics

    /**
     * Check if cache exists
     */
    fun hasCachedTopics(): Boolean = cachedTopics != null && cachedTopics!!.isNotEmpty()

    suspend fun getTopics(language: String = "en"): Result<TopicsResponse> = runCatching {
        try {
            val response = apiService.getTopics(language)
            // Cache the fresh data (server takes precedence)
            response.data?.topics?.let { cacheTopics(it) }
            response.data?.categories?.takeIf { it.isNotEmpty() }?.let { cacheCategories(it) }
            response
        } catch (e: Exception) {
            // If network fails and we have cache, return cached response
            val cached = cachedTopics
            if (cached != null && cached.isNotEmpty()) {
                Log.w(TAG, "⚠️ Network failed, using cached topics: ${e.message}")
                TopicsResponse(
                    success = true,
                    data = TopicsData(
                        topics = cached,
                        categories = cachedCategoryNames.map { (id, name) -> TopicCategory(id = id, name = name, count = 0) }
                            .takeIf { it.isNotEmpty() }
                    )
                )
            } else {
                throw e
            }
        }
    }

    suspend fun getTopic(topicId: String): Result<TopicResponse> = runCatching {
        apiService.getTopic(topicId)
    }

    suspend fun getTopicEpisode(
        topicId: String,
        language: String = "en"
    ): Result<TopicEpisodeResponse> = runCatching {
        apiService.getTopicEpisode(topicId, language)
    }

    suspend fun generateTopicEpisode(
        topicId: String,
        language: String = "en",
        forceRegenerate: Boolean = false
    ): Result<TopicEpisodeResponse> = runCatching {
        val initial = apiService.generateTopicEpisode(
            topicId,
            GenerateTopicRequest(
                language = language,
                forceRegenerate = forceRegenerate
            )
        )
        // Backend returns immediately when forceRegenerate=true (Jun 2026):
        // status=generating, real TTS happens server-side over the next
        // 30+ minutes. Poll the GET endpoint with exponential backoff so
        // callers can simply await this method and receive the completed
        // episode. Matches the iOS TopicService.pollForEpisodeCompletion
        // ceiling of 30 minutes.
        if (initial.data?.episode?.status == "generating") {
            pollUntilCompleted(topicId, language, initial)
        } else {
            initial
        }
    }

    private suspend fun pollUntilCompleted(
        topicId: String,
        language: String,
        fallback: TopicEpisodeResponse,
        maxWaitMs: Long = 30 * 60 * 1000L,
    ): TopicEpisodeResponse {
        val start = System.currentTimeMillis()
        var delayMs = 2_000L
        val maxDelayMs = 10_000L
        while (System.currentTimeMillis() - start < maxWaitMs) {
            kotlinx.coroutines.delay(delayMs)
            val resp = try {
                apiService.getTopicEpisode(topicId, language)
            } catch (e: Exception) {
                Log.w(TAG, "poll fetch failed, retrying: ${e.message}")
                delayMs = (delayMs * 3 / 2).coerceAtMost(maxDelayMs)
                continue
            }
            when (resp.data?.episode?.status) {
                "completed" -> return resp
                "failed" -> return resp
                else -> delayMs = (delayMs * 3 / 2).coerceAtMost(maxDelayMs)
            }
        }
        Log.w(TAG, "polling timed out after ${maxWaitMs}ms; returning last known state")
        return fallback
    }

    suspend fun getTopicEpisodes(
        topicId: String,
        language: String = "en",
        limit: Int = 7
    ): Result<TopicEpisodesResponse> = runCatching {
        apiService.getTopicEpisodes(topicId, language, limit)
    }

    /**
     * An episode that can start now (nothing is generated): the listener's saved topics first, then the topics with the
     * newest podcasts. Null when none of those has a finished episode in [language].
     */
    suspend fun findReadyEpisode(language: String, saved: Set<String>): TopicEpisode? {
        val candidates = ReadyEpisode.candidates(saved, newestTopicIds(language), cachedTopics.orEmpty().map { it.id })
        for (topicId in candidates) {
            currentCoroutineContext().ensureActive()
            val episodes = getTopicEpisodes(topicId, language, 3).getOrNull()?.data?.episodes.orEmpty()
            ReadyEpisode.firstPlayable(episodes)?.let { return it }
        }
        return null
    }

    private suspend fun newestTopicIds(language: String): List<String> = try {
        ReadyEpisode.briefingTopicIds(apiService.getTopicBriefing(language).body()?.string().orEmpty())
    } catch (e: kotlinx.coroutines.CancellationException) {
        throw e
    } catch (e: Exception) {
        emptyList()
    }

    // Ad tracking (fire-and-forget, errors are silently logged)
    suspend fun trackAdImpression(request: AdImpressionRequest) {
        try {
            apiService.trackAdImpression(request)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to track ad impression: ${e.message}")
        }
    }

    suspend fun trackAdClick(request: AdClickRequest) {
        try {
            apiService.trackAdClick(request)
        } catch (e: Exception) {
            Log.e(TAG, "Failed to track ad click: ${e.message}")
        }
    }

    suspend fun suggestTopic(request: SuggestTopicRequest): Result<SuggestTopicResponse> = runCatching {
        apiService.suggestTopic(request)
    }
}
