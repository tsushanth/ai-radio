package com.kreativekoala.audexa.data.repository

import android.util.Log
import com.kreativekoala.audexa.data.model.*
import com.kreativekoala.audexa.data.remote.*
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.flow
import javax.inject.Inject
import javax.inject.Singleton
import java.text.SimpleDateFormat
import java.util.*

/**
 * Progress update during async generation
 */
data class GenerationProgress(
    val progress: Int,
    val message: String
)

/**
 * Result of async generation - either success with episode or failure with error
 */
sealed class AsyncGenerationResult {
    data class Success(val response: GeneratePodcastResponse) : AsyncGenerationResult()
    data class Failed(val error: JobError) : AsyncGenerationResult()
    data class Error(val message: String) : AsyncGenerationResult()
}

@Singleton
class PodcastRepository @Inject constructor(
    private val apiService: ApiService
) {
    companion object {
        private const val TAG = "PodcastRepository"
        private const val INITIAL_POLL_INTERVAL_MS = 2000L  // 2 seconds
        private const val MAX_POLL_INTERVAL_MS = 10000L    // 10 seconds
        private const val MAX_WAIT_TIME_MS = 360000L       // 6 minutes
    }

    suspend fun getEpisodes(
        userId: String,
        limit: Int = 10,
        offset: Int = 0
    ): Result<EpisodesResponse> = runCatching {
        apiService.getEpisodes(userId, limit, offset)
    }

    /**
     * Synchronous podcast generation (kept for backwards compatibility)
     */
    suspend fun generatePodcast(
        userId: String,
        preferences: UserPreferences
    ): Result<GeneratePodcastResponse> = runCatching {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val today = dateFormat.format(Date())

        Log.d(TAG, "Generating podcast with language: ${preferences.language}")

        apiService.generatePodcast(
            GeneratePodcastRequest(
                userId = userId,
                date = today,
                preferences = preferences
            )
        )
    }

    /**
     * Fetch the script-only response (no TTS / no audio upload). Used by the
     * on-device synthesis path so the device can speak the dialogue locally.
     */
    suspend fun fetchPodcastScript(
        request: GeneratePodcastRequest
    ): com.kreativekoala.audexa.data.remote.GeneratePodcastScriptResponse {
        Log.d(TAG, "Fetching script-only podcast (lang=${request.preferences.language})")
        return apiService.generatePodcastScript(request)
    }

    /**
     * Async podcast generation with polling - emits progress updates
     * This is the recommended method for production use
     */
    fun generatePodcastAsync(
        userId: String,
        preferences: UserPreferences
    ): Flow<Pair<GenerationProgress, AsyncGenerationResult?>> = flow {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val today = dateFormat.format(Date())

        Log.d(TAG, "Starting async generation with language: ${preferences.language}")

        // Start async job
        val asyncResponse = apiService.startAsyncGeneration(
            GeneratePodcastRequest(
                userId = userId,
                date = today,
                preferences = preferences
            )
        )

        val jobId = asyncResponse.jobId
        Log.d(TAG, "Job started: $jobId")

        // Emit initial progress
        emit(GenerationProgress(5, "Starting generation...") to null)

        // Poll for completion with exponential backoff
        var pollInterval = INITIAL_POLL_INTERVAL_MS
        val startTime = System.currentTimeMillis()
        var lastReportedProgress = 5

        while (true) {
            // Check timeout
            if (System.currentTimeMillis() - startTime > MAX_WAIT_TIME_MS) {
                emit(
                    GenerationProgress(lastReportedProgress, "Timed out") to
                    AsyncGenerationResult.Error("Generation timed out. Please try again.")
                )
                return@flow
            }

            // Wait before polling
            delay(pollInterval)

            // Poll job status
            val status = try {
                apiService.getJobStatus(jobId)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to poll job status: ${e.message}")
                // Continue polling on transient errors
                pollInterval = (pollInterval * 1.5).toLong().coerceAtMost(MAX_POLL_INTERVAL_MS)
                continue
            }

            // Only update progress if it increased (prevents flickering)
            val effectiveProgress = maxOf(status.progress, lastReportedProgress)
            if (effectiveProgress > lastReportedProgress) {
                lastReportedProgress = effectiveProgress
                emit(GenerationProgress(effectiveProgress, status.message) to null)
            }

            when (status.status) {
                "completed" -> {
                    val episode = status.episode
                    if (episode != null) {
                        Log.d(TAG, "Generation completed: ${episode.id}")
                        emit(
                            GenerationProgress(100, "Complete") to
                            AsyncGenerationResult.Success(
                                GeneratePodcastResponse(
                                    success = true,
                                    episode = episode,
                                    costEstimate = null
                                )
                            )
                        )
                    } else {
                        emit(
                            GenerationProgress(100, "Complete") to
                            AsyncGenerationResult.Error("No episode data in response")
                        )
                    }
                    return@flow
                }

                "failed" -> {
                    val error = status.error
                    Log.e(TAG, "Generation failed: ${error?.message}")
                    emit(
                        GenerationProgress(lastReportedProgress, status.message) to
                        if (error != null) {
                            AsyncGenerationResult.Failed(error)
                        } else {
                            AsyncGenerationResult.Error(status.message)
                        }
                    )
                    return@flow
                }

                "queued", "processing" -> {
                    // Still running - increase poll interval with exponential backoff
                    pollInterval = (pollInterval * 1.5).toLong().coerceAtMost(MAX_POLL_INTERVAL_MS)
                }

                else -> {
                    // Unknown status - keep polling
                    pollInterval = (pollInterval * 1.5).toLong().coerceAtMost(MAX_POLL_INTERVAL_MS)
                }
            }
        }
    }

    suspend fun estimateCost(
        userId: String,
        includeEmail: Boolean,
        includeCalendar: Boolean
    ): Result<CostEstimateResponse> = runCatching {
        apiService.estimateCost(
            CostEstimateRequest(
                userId = userId,
                preferences = CostPreferences(
                    includeEmail = includeEmail,
                    includeCalendar = includeCalendar
                )
            )
        )
    }

    suspend fun getForYou(userId: String): Result<ForYouResponse> = runCatching {
        apiService.getForYou(userId)
    }

    suspend fun getDiscover(): Result<DiscoverResponse> = runCatching {
        apiService.getDiscover()
    }
}
