package com.kreativekoala.audexa.data.model

import androidx.compose.ui.graphics.Color
import com.kreativekoala.audexa.ui.theme.*
import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class Topic(
    val id: String,
    val name: String,
    val description: String = "",
    val icon: String = "radio",
    val color: String = "#FF6B35",
    val category: String = "general",
    @SerialName("target_duration_minutes")
    val targetDurationMinutes: Int = 5,
    @SerialName("is_active")
    val isActive: Boolean = true
) {
    val composableColor: Color
        get() = try {
            Color(android.graphics.Color.parseColor(color))
        } catch (e: Exception) {
            AccentOrange
        }
    
    val materialIcon: String
        get() = when (icon.lowercase()) {
            "laptopcomputer", "laptop" -> "computer"
            "cpu" -> "memory"
            "chart.line.uptrend.xyaxis", "chart" -> "trending_up"
            "newspaper" -> "newspaper"
            "dollarsign.circle", "dollar" -> "attach_money"
            "sportscourt", "sports" -> "sports_basketball"
            "film" -> "movie"
            "atom" -> "science"
            "heart" -> "favorite"
            "building.columns", "building" -> "account_balance"
            else -> "radio"
        }
}

@Serializable
data class TopicEpisode(
    val id: String,
    val topicId: String,
    val date: String,
    val status: String = "not_generated", // not_generated, generating, completed, failed
    val title: String = "",
    val description: String = "",
    val audioUrl: String? = null,
    val durationSeconds: Int? = null,
    val playCount: Int = 0,
    val error: String? = null,
    val language: String = "en"
) {
    val durationFormatted: String
        get() {
            val totalSeconds = durationSeconds ?: 0
            val minutes = totalSeconds / 60
            val seconds = totalSeconds % 60
            return String.format("%d:%02d", minutes, seconds)
        }
}

enum class TopicCategory(val displayName: String) {
    NEWS("News"),
    TECHNOLOGY("Technology"),
    BUSINESS("Business"),
    SCIENCE("Science"),
    LIFESTYLE("Lifestyle"),
    ENTERTAINMENT("Entertainment"),
    SPORTS("Sports")
}
