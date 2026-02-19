package com.kreativekoala.audexa.data.local

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.*
import androidx.datastore.preferences.preferencesDataStore
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import javax.inject.Inject
import javax.inject.Singleton

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "audexa_preferences")

@Singleton
class PreferencesManager @Inject constructor(
    @ApplicationContext private val context: Context
) {
    private val dataStore = context.dataStore

    // Keys
    private object Keys {
        val IS_LOGGED_IN = booleanPreferencesKey("is_logged_in")
        val USER_ID = stringPreferencesKey("user_id")
        val USER_EMAIL = stringPreferencesKey("user_email")
        val USER_NAME = stringPreferencesKey("user_name")
        val ACCESS_TOKEN = stringPreferencesKey("access_token")
        val HAS_LINKED_GOOGLE = booleanPreferencesKey("has_linked_google")
        val LINKED_EMAIL = stringPreferencesKey("linked_email")
        val LINKED_PROVIDER = stringPreferencesKey("linked_provider")
        val HAS_COMPLETED_ONBOARDING = booleanPreferencesKey("has_completed_onboarding")
        val BOOKMARKED_TOPICS = stringSetPreferencesKey("bookmarked_topics")
        val HIDDEN_TOPICS = stringSetPreferencesKey("hidden_topics")
        val PREFERRED_LANGUAGE = stringPreferencesKey("preferred_language")
        val SELECTED_TOPICS = stringSetPreferencesKey("selected_topics")
        val APP_THEME = stringPreferencesKey("app_theme")
        val EMAIL_ENABLED = booleanPreferencesKey("email_enabled")
        val CALENDAR_ENABLED = booleanPreferencesKey("calendar_enabled")
        val VOICE_HOST1 = stringPreferencesKey("voice_host1")
        val VOICE_HOST2 = stringPreferencesKey("voice_host2")

        // Cached episode for today (to avoid regeneration)
        val CACHED_EPISODE_ID = stringPreferencesKey("cached_episode_id")
        val CACHED_EPISODE_AUDIO_URL = stringPreferencesKey("cached_episode_audio_url")
        val CACHED_EPISODE_DURATION = intPreferencesKey("cached_episode_duration")
        val CACHED_EPISODE_DATE = stringPreferencesKey("cached_episode_date")

        // Notification settings
        val NOTIFICATIONS_ENABLED = booleanPreferencesKey("notifications_enabled")
        val BRIEFING_TIME_HOUR = intPreferencesKey("briefing_time_hour")
        val BRIEFING_TIME_MINUTE = intPreferencesKey("briefing_time_minute")
        val BRIEFING_TIMEZONE = stringPreferencesKey("briefing_timezone")
        val FCM_TOKEN = stringPreferencesKey("fcm_token")
        val INCLUDE_TOPIC_UPDATES = booleanPreferencesKey("include_topic_updates")

        // Subscription
        val IS_SUBSCRIBED = booleanPreferencesKey("is_subscribed")

        // Playback
        val PLAYBACK_SPEED = floatPreferencesKey("playback_speed")
        val PLAYBACK_POSITIONS = stringPreferencesKey("playback_positions")
        val LISTENING_HISTORY = stringPreferencesKey("listening_history")
    }

    /**
     * Cached episode data for persistence
     */
    data class CachedEpisode(
        val id: String,
        val audioUrl: String,
        val durationSeconds: Int,
        val date: String  // YYYY-MM-DD format
    )

    // Auth state
    val isLoggedIn: Flow<Boolean> = dataStore.data.map { it[Keys.IS_LOGGED_IN] ?: false }
    val userId: Flow<String?> = dataStore.data.map { it[Keys.USER_ID] }
    val userEmail: Flow<String?> = dataStore.data.map { it[Keys.USER_EMAIL] }
    val userName: Flow<String?> = dataStore.data.map { it[Keys.USER_NAME] }
    val accessToken: Flow<String?> = dataStore.data.map { it[Keys.ACCESS_TOKEN] }

    // Linked accounts
    val hasLinkedGoogle: Flow<Boolean> = dataStore.data.map { it[Keys.HAS_LINKED_GOOGLE] ?: false }
    val linkedEmail: Flow<String?> = dataStore.data.map { it[Keys.LINKED_EMAIL] }
    val linkedProvider: Flow<String?> = dataStore.data.map { it[Keys.LINKED_PROVIDER] }

    // Onboarding
    val hasCompletedOnboarding: Flow<Boolean> = dataStore.data.map { 
        it[Keys.HAS_COMPLETED_ONBOARDING] ?: false 
    }

    // Topics
    val bookmarkedTopics: Flow<Set<String>> = dataStore.data.map { 
        it[Keys.BOOKMARKED_TOPICS] ?: emptySet() 
    }
    val hiddenTopics: Flow<Set<String>> = dataStore.data.map { 
        it[Keys.HIDDEN_TOPICS] ?: emptySet() 
    }
    val selectedTopics: Flow<Set<String>> = dataStore.data.map {
        it[Keys.SELECTED_TOPICS] ?: setOf("Technology", "News", "Business")
    }

    // Language
    val preferredLanguage: Flow<String> = dataStore.data.map {
        it[Keys.PREFERRED_LANGUAGE] ?: "en"
    }

    // Theme (system, dark, light)
    val appTheme: Flow<String> = dataStore.data.map {
        it[Keys.APP_THEME] ?: "system"
    }

    // Email/Calendar integration
    val emailEnabled: Flow<Boolean> = dataStore.data.map {
        it[Keys.EMAIL_ENABLED] ?: true  // Default to true
    }
    val calendarEnabled: Flow<Boolean> = dataStore.data.map {
        it[Keys.CALENDAR_ENABLED] ?: true  // Default to true
    }

    // Voice preferences
    val voiceHost1: Flow<String?> = dataStore.data.map {
        it[Keys.VOICE_HOST1]
    }
    val voiceHost2: Flow<String?> = dataStore.data.map {
        it[Keys.VOICE_HOST2]
    }

    // Notification preferences
    val notificationsEnabled: Flow<Boolean> = dataStore.data.map {
        it[Keys.NOTIFICATIONS_ENABLED] ?: true  // Default to true
    }
    val briefingTimeHour: Flow<Int> = dataStore.data.map {
        it[Keys.BRIEFING_TIME_HOUR] ?: 7  // Default to 7 AM
    }
    val briefingTimeMinute: Flow<Int> = dataStore.data.map {
        it[Keys.BRIEFING_TIME_MINUTE] ?: 0
    }
    val briefingTimezone: Flow<String> = dataStore.data.map {
        it[Keys.BRIEFING_TIMEZONE] ?: java.util.TimeZone.getDefault().id
    }
    val fcmToken: Flow<String?> = dataStore.data.map {
        it[Keys.FCM_TOKEN]
    }
    val includeTopicUpdates: Flow<Boolean> = dataStore.data.map {
        it[Keys.INCLUDE_TOPIC_UPDATES] ?: true  // Default to true
    }

    // Subscription (cached for offline/instant access)
    val isSubscribed: Flow<Boolean> = dataStore.data.map {
        it[Keys.IS_SUBSCRIBED] ?: false
    }

    // Setters
    suspend fun setLoggedIn(
        isLoggedIn: Boolean,
        userId: String? = null,
        email: String? = null,
        name: String? = null,
        token: String? = null
    ) {
        dataStore.edit { prefs ->
            prefs[Keys.IS_LOGGED_IN] = isLoggedIn
            if (userId != null) prefs[Keys.USER_ID] = userId
            if (email != null) prefs[Keys.USER_EMAIL] = email
            if (name != null) prefs[Keys.USER_NAME] = name
            if (token != null) prefs[Keys.ACCESS_TOKEN] = token
        }
    }

    suspend fun setLinkedAccount(
        hasLinked: Boolean,
        email: String? = null,
        provider: String? = null
    ) {
        dataStore.edit { prefs ->
            prefs[Keys.HAS_LINKED_GOOGLE] = hasLinked
            if (email != null) prefs[Keys.LINKED_EMAIL] = email
            if (provider != null) prefs[Keys.LINKED_PROVIDER] = provider
        }
    }

    suspend fun setOnboardingCompleted(completed: Boolean) {
        dataStore.edit { prefs ->
            prefs[Keys.HAS_COMPLETED_ONBOARDING] = completed
        }
    }

    suspend fun setBookmarkedTopics(topics: Set<String>) {
        dataStore.edit { prefs ->
            prefs[Keys.BOOKMARKED_TOPICS] = topics
        }
    }

    suspend fun setHiddenTopics(topics: Set<String>) {
        dataStore.edit { prefs ->
            prefs[Keys.HIDDEN_TOPICS] = topics
        }
    }

    suspend fun setSelectedTopics(topics: Set<String>) {
        dataStore.edit { prefs ->
            prefs[Keys.SELECTED_TOPICS] = topics
        }
    }

    suspend fun setPreferredLanguage(language: String) {
        dataStore.edit { prefs ->
            prefs[Keys.PREFERRED_LANGUAGE] = language
        }
    }

    suspend fun setAppTheme(theme: String) {
        dataStore.edit { prefs ->
            prefs[Keys.APP_THEME] = theme
        }
    }

    suspend fun setEmailEnabled(enabled: Boolean) {
        dataStore.edit { prefs ->
            prefs[Keys.EMAIL_ENABLED] = enabled
        }
    }

    suspend fun setCalendarEnabled(enabled: Boolean) {
        dataStore.edit { prefs ->
            prefs[Keys.CALENDAR_ENABLED] = enabled
        }
    }

    suspend fun setVoiceHost1(voiceId: String) {
        dataStore.edit { prefs ->
            prefs[Keys.VOICE_HOST1] = voiceId
        }
    }

    suspend fun setVoiceHost2(voiceId: String) {
        dataStore.edit { prefs ->
            prefs[Keys.VOICE_HOST2] = voiceId
        }
    }

    suspend fun clearAll() {
        dataStore.edit { it.clear() }
    }

    // Episode caching for today (to avoid regeneration)
    suspend fun getCachedEpisode(): CachedEpisode? {
        return dataStore.data.map { preferences ->
            val id = preferences[Keys.CACHED_EPISODE_ID]
            val audioUrl = preferences[Keys.CACHED_EPISODE_AUDIO_URL]
            val duration = preferences[Keys.CACHED_EPISODE_DURATION]
            val date = preferences[Keys.CACHED_EPISODE_DATE]

            if (id != null && audioUrl != null && duration != null && date != null) {
                CachedEpisode(id, audioUrl, duration, date)
            } else {
                null
            }
        }.first()
    }

    suspend fun setCachedEpisode(
        id: String,
        audioUrl: String,
        durationSeconds: Int,
        date: String
    ) {
        dataStore.edit { prefs ->
            prefs[Keys.CACHED_EPISODE_ID] = id
            prefs[Keys.CACHED_EPISODE_AUDIO_URL] = audioUrl
            prefs[Keys.CACHED_EPISODE_DURATION] = durationSeconds
            prefs[Keys.CACHED_EPISODE_DATE] = date
        }
    }

    suspend fun clearCachedEpisode() {
        dataStore.edit { prefs ->
            prefs.remove(Keys.CACHED_EPISODE_ID)
            prefs.remove(Keys.CACHED_EPISODE_AUDIO_URL)
            prefs.remove(Keys.CACHED_EPISODE_DURATION)
            prefs.remove(Keys.CACHED_EPISODE_DATE)
        }
    }

    // Notification settings
    suspend fun setNotificationsEnabled(enabled: Boolean) {
        dataStore.edit { prefs ->
            prefs[Keys.NOTIFICATIONS_ENABLED] = enabled
        }
    }

    suspend fun setBriefingTime(hour: Int, minute: Int) {
        dataStore.edit { prefs ->
            prefs[Keys.BRIEFING_TIME_HOUR] = hour
            prefs[Keys.BRIEFING_TIME_MINUTE] = minute
        }
    }

    suspend fun setBriefingTimezone(timezone: String) {
        dataStore.edit { prefs ->
            prefs[Keys.BRIEFING_TIMEZONE] = timezone
        }
    }

    suspend fun setFcmToken(token: String) {
        dataStore.edit { prefs ->
            prefs[Keys.FCM_TOKEN] = token
        }
    }

    suspend fun setIncludeTopicUpdates(enabled: Boolean) {
        dataStore.edit { prefs ->
            prefs[Keys.INCLUDE_TOPIC_UPDATES] = enabled
        }
    }

    suspend fun setSubscribed(subscribed: Boolean) {
        dataStore.edit { prefs ->
            prefs[Keys.IS_SUBSCRIBED] = subscribed
        }
    }

    suspend fun getNotificationSettingsSync(): NotificationSettings {
        return dataStore.data.map { prefs ->
            NotificationSettings(
                enabled = prefs[Keys.NOTIFICATIONS_ENABLED] ?: true,
                hour = prefs[Keys.BRIEFING_TIME_HOUR] ?: 7,
                minute = prefs[Keys.BRIEFING_TIME_MINUTE] ?: 0,
                timezone = prefs[Keys.BRIEFING_TIMEZONE] ?: java.util.TimeZone.getDefault().id,
                includeTopicUpdates = prefs[Keys.INCLUDE_TOPIC_UPDATES] ?: true
            )
        }.first()
    }

    data class NotificationSettings(
        val enabled: Boolean,
        val hour: Int,
        val minute: Int,
        val timezone: String,
        val includeTopicUpdates: Boolean
    )

    // Playback speed
    val playbackSpeed: Flow<Float> = dataStore.data.map {
        it[Keys.PLAYBACK_SPEED] ?: 1.0f
    }

    suspend fun setPlaybackSpeed(speed: Float) {
        dataStore.edit { prefs ->
            prefs[Keys.PLAYBACK_SPEED] = speed
        }
    }

    // Playback position persistence (JSON map: {"episodeId": positionMs, ...})
    suspend fun savePlaybackPosition(episodeId: String, positionMs: Long) {
        dataStore.edit { prefs ->
            val json = prefs[Keys.PLAYBACK_POSITIONS] ?: "{}"
            val positions = parsePositionsJson(json).toMutableMap()
            positions[episodeId] = positionMs
            // Keep only last 50 entries to prevent bloat
            val trimmed = if (positions.size > 50) {
                positions.entries.toList().takeLast(50).associate { it.key to it.value }
            } else {
                positions
            }
            prefs[Keys.PLAYBACK_POSITIONS] = buildPositionsJson(trimmed)
        }
    }

    suspend fun getPlaybackPosition(episodeId: String): Long {
        return dataStore.data.map { prefs ->
            val json = prefs[Keys.PLAYBACK_POSITIONS] ?: "{}"
            parsePositionsJson(json)[episodeId] ?: 0L
        }.first()
    }

    suspend fun clearPlaybackPosition(episodeId: String) {
        dataStore.edit { prefs ->
            val json = prefs[Keys.PLAYBACK_POSITIONS] ?: "{}"
            val positions = parsePositionsJson(json).toMutableMap()
            positions.remove(episodeId)
            prefs[Keys.PLAYBACK_POSITIONS] = buildPositionsJson(positions)
        }
    }

    private fun parsePositionsJson(json: String): Map<String, Long> {
        return try {
            val map = mutableMapOf<String, Long>()
            val content = json.trim().removeSurrounding("{", "}")
            if (content.isBlank()) return map
            content.split(",").forEach { entry ->
                val parts = entry.split(":")
                if (parts.size == 2) {
                    val key = parts[0].trim().removeSurrounding("\"")
                    val value = parts[1].trim().toLongOrNull()
                    if (key.isNotBlank() && value != null) {
                        map[key] = value
                    }
                }
            }
            map
        } catch (_: Exception) { emptyMap() }
    }

    private fun buildPositionsJson(map: Map<String, Long>): String {
        val entries = map.entries.joinToString(",") { "\"${it.key}\":${it.value}" }
        return "{$entries}"
    }

    // Listening history (JSON array of recent plays, max 30)
    data class ListeningHistoryEntry(
        val episodeId: String,
        val episodeTitle: String,
        val topicId: String,
        val topicName: String,
        val playedAt: Long, // epoch millis
        val durationSeconds: Int
    )

    suspend fun addListeningHistoryEntry(entry: ListeningHistoryEntry) {
        dataStore.edit { prefs ->
            val json = prefs[Keys.LISTENING_HISTORY] ?: "[]"
            val history = parseHistoryJson(json).toMutableList()
            // Remove duplicate if exists
            history.removeAll { it.episodeId == entry.episodeId }
            // Add at front (most recent)
            history.add(0, entry)
            // Keep only last 30
            val trimmed = history.take(30)
            prefs[Keys.LISTENING_HISTORY] = buildHistoryJson(trimmed)
        }
    }

    suspend fun getListeningHistory(): List<ListeningHistoryEntry> {
        return dataStore.data.map { prefs ->
            val json = prefs[Keys.LISTENING_HISTORY] ?: "[]"
            parseHistoryJson(json)
        }.first()
    }

    private fun parseHistoryJson(json: String): List<ListeningHistoryEntry> {
        return try {
            val entries = mutableListOf<ListeningHistoryEntry>()
            val content = json.trim().removeSurrounding("[", "]")
            if (content.isBlank()) return entries
            // Simple JSON array of objects parser
            var depth = 0
            var current = StringBuilder()
            for (ch in content) {
                when (ch) {
                    '{' -> { depth++; current.append(ch) }
                    '}' -> {
                        depth--; current.append(ch)
                        if (depth == 0) {
                            parseHistoryEntry(current.toString())?.let { entries.add(it) }
                            current = StringBuilder()
                        }
                    }
                    ',' -> if (depth == 0) { /* skip separator */ } else current.append(ch)
                    else -> if (depth > 0) current.append(ch)
                }
            }
            entries
        } catch (_: Exception) { emptyList() }
    }

    private fun parseHistoryEntry(json: String): ListeningHistoryEntry? {
        return try {
            val content = json.trim().removeSurrounding("{", "}")
            val fields = mutableMapOf<String, String>()
            content.split(",").forEach { pair ->
                val colonIndex = pair.indexOf(":")
                if (colonIndex > 0) {
                    val key = pair.substring(0, colonIndex).trim().removeSurrounding("\"")
                    val value = pair.substring(colonIndex + 1).trim().removeSurrounding("\"")
                    fields[key] = value
                }
            }
            ListeningHistoryEntry(
                episodeId = fields["eid"] ?: return null,
                episodeTitle = fields["et"] ?: "",
                topicId = fields["tid"] ?: "",
                topicName = fields["tn"] ?: "",
                playedAt = fields["pa"]?.toLongOrNull() ?: 0L,
                durationSeconds = fields["ds"]?.toIntOrNull() ?: 0
            )
        } catch (_: Exception) { null }
    }

    private fun buildHistoryJson(list: List<ListeningHistoryEntry>): String {
        val entries = list.joinToString(",") { e ->
            "{\"eid\":\"${e.episodeId}\",\"et\":\"${e.episodeTitle.replace("\"", "'")}\",\"tid\":\"${e.topicId}\",\"tn\":\"${e.topicName.replace("\"", "'")}\",\"pa\":${e.playedAt},\"ds\":${e.durationSeconds}}"
        }
        return "[$entries]"
    }
}
