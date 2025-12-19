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

        // Cached episode for today (to avoid regeneration)
        val CACHED_EPISODE_ID = stringPreferencesKey("cached_episode_id")
        val CACHED_EPISODE_AUDIO_URL = stringPreferencesKey("cached_episode_audio_url")
        val CACHED_EPISODE_DURATION = intPreferencesKey("cached_episode_duration")
        val CACHED_EPISODE_DATE = stringPreferencesKey("cached_episode_date")
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
}
