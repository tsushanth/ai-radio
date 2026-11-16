package com.kreativekoala.audexa.data.repository

import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.RemoteLanguages
import com.kreativekoala.audexa.data.remote.ApiService
import javax.inject.Inject
import javax.inject.Singleton

/** Loads the podcast languages the server has switched on and keeps a copy on the phone. Never throws: on any failure the previous list stays. */
@Singleton
class RemoteLanguagesRepository @Inject constructor(
    private val api: ApiService,
    private val preferences: PreferencesManager
) {
    /** The saved copy first (instant, works offline), then the server's answer. Returns true when the server answered with a valid list. */
    suspend fun refresh(): Boolean {
        runCatching { preferences.loadRemoteLanguagesCache() }
        return runCatching {
            val response = api.getPodcastLanguages()
            if (!response.isSuccessful) return@runCatching false
            val list = RemoteLanguages.parse(response.body()?.string()) ?: return@runCatching false
            RemoteLanguages.update(list)
            preferences.saveRemoteLanguagesCache(list)
            true
        }.getOrDefault(false)
    }
}
