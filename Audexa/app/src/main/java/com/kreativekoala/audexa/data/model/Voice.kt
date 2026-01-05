package com.kreativekoala.audexa.data.model

import kotlinx.serialization.SerialName
import kotlinx.serialization.Serializable

/**
 * TTS Provider options
 */
enum class TTSProvider(val value: String, val displayName: String, val description: String) {
    OPENAI("openai", "OpenAI", "Fast, high-quality neural voices"),
    ELEVENLABS("elevenlabs", "ElevenLabs", "Ultra-realistic with voice cloning");

    companion object {
        fun fromValue(value: String): TTSProvider? {
            return entries.find { it.value == value }
        }
    }
}

/**
 * Unified voice representation from API
 */
@Serializable
data class Voice(
    val id: String,
    val name: String,
    val provider: String,
    val gender: String,
    val accent: String? = null,
    val description: String? = null,
    @SerialName("preview_url")
    val previewUrl: String? = null,
    val category: String? = null
) {
    val displayGender: String
        get() = gender.replaceFirstChar { it.uppercase() }

    val providerType: TTSProvider?
        get() = TTSProvider.fromValue(provider)

    val genderIcon: String
        get() = when (gender.lowercase()) {
            "male" -> "person"
            "female" -> "person"
            else -> "person_outline"
        }
}

/**
 * Voice pair recommendation for two-host podcasts
 */
@Serializable
data class VoicePair(
    val id: String,
    val name: String,
    val provider: String,
    val host1: Voice,
    val host2: Voice,
    val description: String
) {
    val providerType: TTSProvider?
        get() = TTSProvider.fromValue(provider)
}

/**
 * API response for voices endpoint
 */
@Serializable
data class VoicesResponse(
    val success: Boolean,
    val total: Int,
    val voices: List<Voice>,
    val grouped: Map<String, List<Voice>>? = null
)

/**
 * API response for voice pairs endpoint
 */
@Serializable
data class VoicePairsResponse(
    val success: Boolean,
    val pairs: List<VoicePair>
)

/**
 * API response for providers endpoint
 */
@Serializable
data class ProvidersResponse(
    val success: Boolean,
    val providers: List<ProviderInfo>
)

/**
 * Provider info from API
 */
@Serializable
data class ProviderInfo(
    val id: String,
    val name: String,
    val description: String,
    val available: Boolean,
    val configured: Boolean,
    @SerialName("voice_count")
    val voiceCount: Int,
    val features: List<String>
)

/**
 * Current voice configuration
 */
data class VoiceConfiguration(
    val provider: TTSProvider,
    val host1VoiceId: String,
    val host2VoiceId: String
) {
    companion object {
        val default = VoiceConfiguration(
            provider = TTSProvider.OPENAI,
            host1VoiceId = "openai:nova",
            host2VoiceId = "openai:onyx"
        )
    }
}
