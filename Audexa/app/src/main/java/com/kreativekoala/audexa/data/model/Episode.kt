package com.kreativekoala.audexa.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Episode(
    val id: String,
    @SerialName("user_id")
    val userId: String? = null,
    val title: String,
    val description: String = "",
    @SerialName("audio_url")
    val audioUrl: String? = null,
    @SerialName("duration_seconds")
    val durationSeconds: Int? = null,
    val status: String = "completed", // pending, generating, completed, failed
    @SerialName("error_message")
    val errorMessage: String? = null,
    @SerialName("generated_at")
    val generatedAt: String? = null,
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("show_id")
    val showId: String? = null,
    @SerialName("show_name")
    val showName: String? = null,
    @SerialName("image_color")
    val imageColor: String = "#FF6B35"
) {
    val durationFormatted: String
        get() {
            val totalSeconds = durationSeconds ?: 0
            val minutes = totalSeconds / 60
            val seconds = totalSeconds % 60
            return String.format("%d:%02d", minutes, seconds)
        }
    
    val durationMinutes: Int
        get() = (durationSeconds ?: 0) / 60
}

enum class EpisodeStatus {
    PENDING,
    GENERATING,
    COMPLETED,
    FAILED
}
