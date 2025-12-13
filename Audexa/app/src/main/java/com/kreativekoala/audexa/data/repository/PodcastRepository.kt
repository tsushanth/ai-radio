package com.kreativekoala.audexa.data.repository

import android.util.Log
import com.kreativekoala.audexa.data.model.*
import com.kreativekoala.audexa.data.remote.*
import javax.inject.Inject
import javax.inject.Singleton
import java.text.SimpleDateFormat
import java.util.*

@Singleton
class PodcastRepository @Inject constructor(
    private val apiService: ApiService
) {
    suspend fun getEpisodes(
        userId: String,
        limit: Int = 10,
        offset: Int = 0
    ): Result<EpisodesResponse> = runCatching {
        apiService.getEpisodes(userId, limit, offset)
    }

    suspend fun generatePodcast(
        userId: String,
        preferences: UserPreferences
    ): Result<GeneratePodcastResponse> = runCatching {
        val dateFormat = SimpleDateFormat("yyyy-MM-dd", Locale.getDefault())
        val today = dateFormat.format(Date())

        Log.d("PodcastRepository", "Generating podcast with language: ${preferences.language}")

        apiService.generatePodcast(
            GeneratePodcastRequest(
                userId = userId,
                date = today,
                preferences = preferences
            )
        )
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
