package com.kreativekoala.audexa.data.repository

import com.kreativekoala.audexa.data.model.*
import com.kreativekoala.audexa.data.remote.*
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class VoiceRepository @Inject constructor(
    private val apiService: ApiService
) {
    // Cache for voices
    private var voicesCache: List<Voice>? = null
    private var voicePairsCache: List<VoicePair>? = null
    private var providersCache: List<ProviderInfo>? = null

    /**
     * Get all available voices, optionally filtered by provider
     */
    suspend fun getVoices(provider: TTSProvider? = null, forceRefresh: Boolean = false): Result<List<Voice>> = runCatching {
        if (!forceRefresh && voicesCache != null) {
            val cached = voicesCache!!
            return@runCatching if (provider != null) {
                cached.filter { it.provider == provider.value }
            } else {
                cached
            }
        }

        val response = apiService.getVoices(provider?.value)
        if (response.success) {
            voicesCache = response.voices
            response.voices
        } else {
            throw Exception("Failed to fetch voices")
        }
    }

    /**
     * Get recommended voice pairs for two-host podcasts
     */
    suspend fun getVoicePairs(provider: TTSProvider? = null, forceRefresh: Boolean = false): Result<List<VoicePair>> = runCatching {
        if (!forceRefresh && voicePairsCache != null) {
            val cached = voicePairsCache!!
            return@runCatching if (provider != null) {
                cached.filter { it.provider == provider.value }
            } else {
                cached
            }
        }

        val response = apiService.getVoicePairs(provider?.value)
        if (response.success) {
            voicePairsCache = response.pairs
            response.pairs
        } else {
            throw Exception("Failed to fetch voice pairs")
        }
    }

    /**
     * Get available TTS providers
     */
    suspend fun getProviders(forceRefresh: Boolean = false): Result<List<ProviderInfo>> = runCatching {
        if (!forceRefresh && providersCache != null) {
            return@runCatching providersCache!!
        }

        val response = apiService.getVoiceProviders()
        if (response.success) {
            providersCache = response.providers
            response.providers
        } else {
            throw Exception("Failed to fetch providers")
        }
    }

    /**
     * Find a voice by ID
     */
    fun findVoice(voiceId: String): Voice? {
        return voicesCache?.find { it.id == voiceId }
    }

    /**
     * Get display name for a voice ID
     */
    fun getVoiceDisplayName(voiceId: String?): String {
        if (voiceId == null) return "Default Voice"
        return findVoice(voiceId)?.name ?: "Default Voice"
    }

    /**
     * Clear cache
     */
    fun clearCache() {
        voicesCache = null
        voicePairsCache = null
        providersCache = null
    }
}
