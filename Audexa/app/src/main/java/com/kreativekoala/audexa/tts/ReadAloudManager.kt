package com.kreativekoala.audexa.tts

import android.content.Context
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import com.kreativekoala.audexa.tts.kokoro.KokoroPreferences
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.map

/**
 * Singleton entry point exposed via [com.securevox.app.SecureVoxApp].
 *
 * Owns the active [TtsEngine] (Phase A: system TTS, Phase B: Sherpa-ONNX/Kokoro)
 * and the user's persisted preferences (selected voice, on-device toggle).
 *
 * As of Phase B (12.6.0+), [engine] returns the Kokoro on-device engine when
 * [KokoroPreferences.useKokoroEngine] is true, otherwise the system TTS engine.
 * Both are instantiated lazily so the Kokoro engine's model is never touched
 * until the user opts in.
 */
class ReadAloudManager private constructor(context: Context) {

    private val appContext = context.applicationContext
    private val kokoroPrefs = KokoroPreferences.getInstance(appContext)

    private val systemEngine: TtsEngine by lazy { SystemTtsEngine(appContext) }
    private val kokoroEngine: TtsEngine by lazy { KokoroTtsEngine(appContext) }

    /**
     * The active TTS engine, resolved per-call based on the user's preference.
     * Callers (e.g. [com.kreativekoala.audexa.ui.home.HomeViewModel.tryGenerateOnDevice])
     * re-read [engine] each generation so a toggle change picks up on the next play.
     */
    val engine: TtsEngine
        get() = if (kokoroPrefs.useKokoroEngine.value) kokoroEngine else systemEngine

    companion object {
        @Volatile private var INSTANCE: ReadAloudManager? = null

        fun get(context: Context): ReadAloudManager {
            return INSTANCE ?: synchronized(this) {
                INSTANCE ?: ReadAloudManager(context).also { INSTANCE = it }
            }
        }
    }

    private val Context.dataStore by preferencesDataStore(name = "audexa_read_aloud_settings")

    private val keyEnabled = booleanPreferencesKey("read_aloud_enabled")
    private val keyVoiceId = stringPreferencesKey("read_aloud_voice_id")

    /** True (default) when the user wants Read Aloud surfaced in the UI. */
    val isEnabled: Flow<Boolean> = appContext.dataStore.data.map { it[keyEnabled] ?: true }

    /** Persisted voice id; null means "let engine pick locale default". */
    val preferredVoiceId: Flow<String?> = appContext.dataStore.data.map { it[keyVoiceId] }

    suspend fun setEnabled(enabled: Boolean) {
        appContext.dataStore.edit { it[keyEnabled] = enabled }
    }

    suspend fun setPreferredVoice(voiceId: String?) {
        appContext.dataStore.edit { prefs ->
            if (voiceId == null) prefs.remove(keyVoiceId)
            else prefs[keyVoiceId] = voiceId
        }
    }
}
