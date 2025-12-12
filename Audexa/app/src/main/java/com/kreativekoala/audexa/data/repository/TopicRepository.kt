package com.kreativekoala.audexa.data.repository

import com.kreativekoala.audexa.data.model.*
import com.kreativekoala.audexa.data.remote.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class TopicRepository @Inject constructor(
    private val apiService: ApiService
) {
    suspend fun getTopics(): Result<TopicsResponse> = runCatching {
        apiService.getTopics()
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
        apiService.generateTopicEpisode(
            topicId,
            GenerateTopicRequest(
                language = language,
                forceRegenerate = forceRegenerate
            )
        )
    }

    suspend fun getTopicEpisodes(
        topicId: String,
        language: String = "en",
        limit: Int = 7
    ): Result<TopicEpisodesResponse> = runCatching {
        apiService.getTopicEpisodes(topicId, language, limit)
    }
}
