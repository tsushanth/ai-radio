package com.kreativekoala.audexa.data.repository

import android.content.Context
import android.util.Log
import com.kreativekoala.audexa.data.model.*
import com.kreativekoala.audexa.data.remote.*
import dagger.hilt.android.qualifiers.ApplicationContext
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
    }

    private val json = Json { ignoreUnknownKeys = true }
    private val prefs = context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    // In-memory cache for instant access
    @Volatile
    private var cachedTopics: List<Topic>? = null

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
            response
        } catch (e: Exception) {
            // If network fails and we have cache, return cached response
            val cached = cachedTopics
            if (cached != null && cached.isNotEmpty()) {
                Log.w(TAG, "⚠️ Network failed, using cached topics: ${e.message}")
                TopicsResponse(
                    success = true,
                    data = TopicsData(topics = cached)
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
