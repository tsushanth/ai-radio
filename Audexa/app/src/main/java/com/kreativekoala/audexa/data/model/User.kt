package com.kreativekoala.audexa.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

@Serializable
data class User(
    val id: String,
    val email: String,
    val name: String? = null,
    val timezone: String = "UTC",
    @SerialName("linked_accounts")
    val linkedAccounts: List<LinkedAccount> = emptyList(),
    val preferences: UserPreferences = UserPreferences(),
    @SerialName("created_at")
    val createdAt: String? = null,
    @SerialName("updated_at")
    val updatedAt: String? = null
)

@Serializable
data class LinkedAccount(
    val id: String,
    val provider: String, // "google", "microsoft"
    val email: String,
    @SerialName("is_active")
    val isActive: Boolean = true,
    @SerialName("connected_at")
    val connectedAt: String? = null,
    @SerialName("last_synced_at")
    val lastSyncedAt: String? = null
)

@Serializable
data class UserPreferences(
    @SerialName("briefing_time")
    val briefingTime: String? = "07:00",
    val topics: List<String>? = null,
    @SerialName("voice_host1")
    val voiceHost1: String? = "nova",
    @SerialName("voice_host2")
    val voiceHost2: String? = "onyx",
    @SerialName("include_weather")
    val includeWeather: Boolean? = false,
    @SerialName("include_calendar")
    val includeCalendar: Boolean? = false,
    @SerialName("include_email")
    val includeEmail: Boolean? = true,
    val language: String? = "en" // Language code: en, es, fr, de, hi, etc.
)
