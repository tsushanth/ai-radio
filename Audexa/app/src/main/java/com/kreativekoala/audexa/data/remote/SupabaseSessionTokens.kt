package com.kreativekoala.audexa.data.remote

import android.util.Log
import com.kreativekoala.audexa.data.local.PreferencesManager
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.runBlocking
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject
import javax.inject.Singleton

/**
 * The Supabase session created when the user signed in with Google (AuthRepository.signInWithGoogle) is the token the backend
 * verifies. Same token Delete Account already sends, refreshed the same way (refreshCurrentSession), but only when it is about to
 * expire instead of on every call.
 */
@Singleton
class SupabaseSessionTokens @Inject constructor(
    private val supabase: SupabaseClient,
    private val preferences: PreferencesManager,
) : SessionTokenSource {

    private val refreshLock = Mutex()

    override fun currentToken(): String? = load(forceRefresh = false)

    override fun refreshedToken(): String? = load(forceRefresh = true)

    private fun load(forceRefresh: Boolean): String? = runBlocking {
        try {
            withTimeoutOrNull(LOOKUP_TIMEOUT_MS) { lookup(forceRefresh) }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Log.w(TAG, "No session token: ${e.message}")
            null
        }
    }

    private suspend fun lookup(forceRefresh: Boolean): String? {
        // Guest or signed out: nothing to send.
        val appEmail = preferences.userEmail.first()?.takeIf { it.isNotBlank() } ?: return null
        val auth = supabase.auth
        // The saved session is loaded asynchronously at app start; without this the first calls would go out token-less.
        auth.awaitInitialization()

        refreshLock.withLock {
            val before = auth.currentSessionOrNull() ?: return null
            val nowSeconds = System.currentTimeMillis() / 1000
            if (forceRefresh || SessionTokenRules.needsRefresh(before.expiresAt.epochSeconds, nowSeconds)) {
                try {
                    auth.refreshCurrentSession()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    Log.w(TAG, "Session refresh failed: ${e.message}")
                    // A refresh the server refused on a 401 retry means the old token is dead too.
                    if (forceRefresh) return null
                }
            }
        }
        val session = auth.currentSessionOrNull() ?: return null
        val sessionEmail = session.user?.email ?: SessionTokenRules.emailClaim(session.accessToken)
        return SessionTokenRules.tokenIfFor(appEmail, sessionEmail, session.accessToken)
    }

    private companion object {
        const val TAG = "SessionTokens"
        const val LOOKUP_TIMEOUT_MS = 15_000L
    }
}
