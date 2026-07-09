package com.kreativekoala.audexa.tts.kokoro

import android.content.Context
import android.content.SharedPreferences
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow

/**
 * Thin preferences wrapper for the Kokoro on-device TTS subsystem.
 *
 * Mirrors the shape of ReadAloud's SettingsManager so the ported
 * [KokoroModelDownloader] and [KokoroDownloadWorker] read the same
 * `allowCellularModelDownload` flag they expect — but doesn't pull
 * in the rest of Audexa's app-wide preferences, which already live
 * in `com.kreativekoala.audexa.data.local.PreferencesManager`.
 *
 * Audexa-app integration can later collapse this into the central
 * PreferencesManager if it grows beyond Kokoro-local concerns.
 */
class KokoroPreferences private constructor(private val prefs: SharedPreferences) {

    private val _allowCellularModelDownload =
        MutableStateFlow(prefs.getBoolean(KEY_ALLOW_CELLULAR, false))

    /** Observable; UI binds to this. False = WiFi-only (the safer default). */
    val allowCellularModelDownload: StateFlow<Boolean> =
        _allowCellularModelDownload.asStateFlow()

    fun setAllowCellularModelDownload(allow: Boolean) {
        prefs.edit().putBoolean(KEY_ALLOW_CELLULAR, allow).apply()
        _allowCellularModelDownload.value = allow
    }

    // ── on-device voice selection ────────────────────────────────────────────
    // When enabled=true, ReadAloudManager routes podcasts/deep-dives through
    // KokoroTtsEngine using selectedVoiceId. When enabled=false (default), the
    // system TTS engine is used (Phase A behavior).

    private val _useKokoroEngine =
        MutableStateFlow(prefs.getBoolean(KEY_USE_KOKORO, false))

    /** When true, on-device Audexa content routes through Kokoro instead of system TTS. */
    val useKokoroEngine: StateFlow<Boolean> =
        _useKokoroEngine.asStateFlow()

    fun setUseKokoroEngine(enabled: Boolean) {
        prefs.edit().putBoolean(KEY_USE_KOKORO, enabled).apply()
        _useKokoroEngine.value = enabled
    }

    private val _selectedVoiceId =
        MutableStateFlow(prefs.getString(KEY_SELECTED_VOICE_ID, null))

    /** User's picked Kokoro voice id. Null = engine default. */
    val selectedVoiceId: StateFlow<String?> =
        _selectedVoiceId.asStateFlow()

    fun setSelectedVoiceId(voiceId: String?) {
        prefs.edit().apply {
            if (voiceId == null) remove(KEY_SELECTED_VOICE_ID)
            else putString(KEY_SELECTED_VOICE_ID, voiceId)
        }.apply()
        _selectedVoiceId.value = voiceId
    }

    companion object {
        private const val PREFS_FILE = "kokoro_prefs"
        private const val KEY_ALLOW_CELLULAR = "allow_cellular_model_download"
        private const val KEY_USE_KOKORO = "use_kokoro_engine"
        private const val KEY_SELECTED_VOICE_ID = "selected_voice_id"

        @Volatile private var instance: KokoroPreferences? = null

        fun getInstance(context: Context): KokoroPreferences {
            return instance ?: synchronized(this) {
                instance ?: KokoroPreferences(
                    context.applicationContext
                        .getSharedPreferences(PREFS_FILE, Context.MODE_PRIVATE)
                ).also { instance = it }
            }
        }
    }
}
