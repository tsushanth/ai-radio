package com.kreativekoala.audexa.data.remote

import com.kreativekoala.audexa.data.model.*
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable
import retrofit2.http.*

interface ApiService {
    
    // User endpoints
    @GET("user/{userId}")
    suspend fun getUser(@Path("userId") userId: String): User
    
    @PUT("user/{userId}/preferences")
    suspend fun updatePreferences(
        @Path("userId") userId: String,
        @Body preferences: UserPreferences
    ): User
    
    @DELETE("user/{userId}")
    suspend fun deleteUser(@Path("userId") userId: String): DeleteResponse
    
    // Episode endpoints
    @GET("podcast/episodes/{userId}")
    suspend fun getEpisodes(
        @Path("userId") userId: String,
        @Query("limit") limit: Int = 10,
        @Query("offset") offset: Int = 0
    ): EpisodesResponse
    
    @POST("podcast/generate")
    suspend fun generatePodcast(@Body request: GeneratePodcastRequest): GeneratePodcastResponse

    // Async generation endpoints (recommended for production)
    @POST("podcast/generate-async")
    suspend fun startAsyncGeneration(@Body request: GeneratePodcastRequest): AsyncGenerateResponse

    @GET("podcast/job/{jobId}")
    suspend fun getJobStatus(@Path("jobId") jobId: String): JobStatusResponse

    @POST("podcast/estimate")
    suspend fun estimateCost(@Body request: CostEstimateRequest): CostEstimateResponse
    
    // Topic endpoints
    @GET("topics")
    suspend fun getTopics(): TopicsResponse
    
    @GET("topics/{topicId}")
    suspend fun getTopic(@Path("topicId") topicId: String): TopicResponse
    
    @GET("topics/{topicId}/episode")
    suspend fun getTopicEpisode(
        @Path("topicId") topicId: String,
        @Query("lang") language: String = "en"
    ): TopicEpisodeResponse
    
    @POST("topics/{topicId}/generate")
    suspend fun generateTopicEpisode(
        @Path("topicId") topicId: String,
        @Body request: GenerateTopicRequest
    ): TopicEpisodeResponse
    
    @GET("topics/{topicId}/episodes")
    suspend fun getTopicEpisodes(
        @Path("topicId") topicId: String,
        @Query("lang") language: String = "en",
        @Query("limit") limit: Int = 7
    ): TopicEpisodesResponse
    
    // Linked accounts
    @POST("linked-accounts/{userId}")
    suspend fun linkAccount(
        @Path("userId") userId: String,
        @Body request: LinkAccountRequest
    ): LinkAccountResponse
    
    @DELETE("linked-accounts/{userId}/{accountId}")
    suspend fun unlinkAccount(
        @Path("userId") userId: String,
        @Path("accountId") accountId: String
    ): DeleteResponse
    
    @GET("linked-accounts/{userId}")
    suspend fun getLinkedAccounts(@Path("userId") userId: String): LinkedAccountsResponse
    
    // Discover
    @GET("discover")
    suspend fun getDiscover(): DiscoverResponse

    @GET("for-you/{userId}")
    suspend fun getForYou(@Path("userId") userId: String): ForYouResponse

    // Voice endpoints
    @GET("voices")
    suspend fun getVoices(
        @Query("provider") provider: String? = null
    ): VoicesResponse

    @GET("voices/providers")
    suspend fun getVoiceProviders(): ProvidersResponse

    @GET("voices/pairs")
    suspend fun getVoicePairs(
        @Query("provider") provider: String? = null
    ): VoicePairsResponse
}

// Request/Response models
@Serializable
data class GeneratePodcastRequest(
    @SerialName("user_id")
    val userId: String,
    val date: String,
    val preferences: UserPreferences
)

@Serializable
data class GeneratePodcastResponse(
    val success: Boolean,
    val episode: EpisodeInfo,
    @SerialName("cost_estimate")
    val costEstimate: CostEstimate? = null
)

@Serializable
data class EpisodeInfo(
    val id: String,
    @SerialName("audio_url")
    val audioUrl: String,
    @SerialName("duration_seconds")
    val durationSeconds: Int,
    @SerialName("script_segments")
    val scriptSegments: Int? = null
)

@Serializable
data class CostEstimate(
    @SerialName("script_cost_usd")
    val scriptCostUsd: Double,
    @SerialName("tts_cost_usd")
    val ttsCostUsd: Double,
    @SerialName("total_cost_usd")
    val totalCostUsd: Double
)

@Serializable
data class CostEstimateRequest(
    @SerialName("user_id")
    val userId: String,
    val preferences: CostPreferences
)

@Serializable
data class CostPreferences(
    @SerialName("include_email")
    val includeEmail: Boolean,
    @SerialName("include_calendar")
    val includeCalendar: Boolean
)

@Serializable
data class CostEstimateResponse(
    val success: Boolean,
    val estimate: CostEstimateDetail
)

@Serializable
data class CostEstimateDetail(
    @SerialName("script_cost_usd")
    val scriptCostUsd: Double,
    @SerialName("tts_cost_usd")
    val ttsCostUsd: Double,
    @SerialName("total_cost_usd")
    val totalCostUsd: Double,
    @SerialName("estimated_duration_seconds")
    val estimatedDurationSeconds: Int
)

@Serializable
data class EpisodesResponse(
    val success: Boolean,
    val episodes: List<Episode>,
    val pagination: Pagination? = null
)

@Serializable
data class Pagination(
    val limit: Int,
    val offset: Int,
    val total: Int
)

@Serializable
data class TopicsResponse(
    val success: Boolean,
    val data: TopicsData? = null
)

@Serializable
data class TopicsData(
    val topics: List<Topic>,
    val categories: List<TopicCategory>? = null
)

@Serializable
data class TopicCategory(
    val id: String,
    val name: String,
    val count: Int
)

@Serializable
data class TopicResponse(
    val success: Boolean,
    val topic: Topic
)

@Serializable
data class TopicEpisodeResponse(
    val success: Boolean,
    val data: TopicEpisodeData? = null,
    val message: String? = null,
    val isNew: Boolean? = null
)

@Serializable
data class TopicEpisodeData(
    val episode: TopicEpisode,
    val isNew: Boolean? = null,
    val message: String? = null
)

@Serializable
data class TopicEpisodesResponse(
    val success: Boolean,
    val data: TopicEpisodesData? = null
)

@Serializable
data class TopicEpisodesData(
    val episodes: List<TopicEpisode>
)

@Serializable
data class GenerateTopicRequest(
    val language: String = "en",
    @SerialName("force_regenerate")
    val forceRegenerate: Boolean = false
)

@Serializable
data class LinkAccountRequest(
    val provider: String,
    val email: String,
    @SerialName("access_token")
    val accessToken: String,
    @SerialName("refresh_token")
    val refreshToken: String = "",
    @SerialName("email_enabled")
    val emailEnabled: Boolean = true,
    @SerialName("calendar_enabled")
    val calendarEnabled: Boolean = false
)

@Serializable
data class LinkAccountResponse(
    val success: Boolean,
    val account: LinkedAccount? = null,
    @SerialName("account_id")
    val accountId: String? = null
)

@Serializable
data class LinkedAccountsResponse(
    val success: Boolean,
    val accounts: List<LinkedAccount>
)

@Serializable
data class DeleteResponse(
    val success: Boolean,
    val message: String? = null
)

@Serializable
data class DiscoverResponse(
    val success: Boolean,
    val categories: List<DiscoverCategory>
)

@Serializable
data class ForYouResponse(
    val success: Boolean,
    val episodes: List<Episode>
)

// Async generation models
@Serializable
data class AsyncGenerateResponse(
    val success: Boolean,
    val jobId: String,
    val status: String,
    val message: String
)

@Serializable
data class JobStatusResponse(
    val success: Boolean,
    val jobId: String,
    val status: String,  // "queued", "processing", "completed", "failed"
    val progress: Int,
    val message: String,
    val createdAt: String,
    val updatedAt: String,
    val episode: EpisodeInfo? = null,
    val error: JobError? = null
)

@Serializable
data class JobError(
    val code: String,
    val message: String,
    val action: String,
    val retryable: Boolean
)
