package com.kreativekoala.audexa.data.repository

import android.content.Context
import android.util.Log
import com.google.android.gms.auth.GoogleAuthUtil
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.google.android.gms.auth.api.signin.GoogleSignInClient
import com.google.android.gms.auth.api.signin.GoogleSignInOptions
import com.google.android.gms.common.api.Scope
import com.kreativekoala.audexa.BuildConfig
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.User
import com.kreativekoala.audexa.data.remote.ApiService
import dagger.hilt.android.qualifiers.ApplicationContext
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.auth.auth
import io.github.jan.supabase.auth.providers.Google
import io.github.jan.supabase.auth.providers.builtin.IDToken
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class AuthRepository @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferencesManager: PreferencesManager,
    private val apiService: ApiService,
    private val supabaseClient: SupabaseClient
) {
    companion object {
        private const val TAG = "AuthRepository"
        // Using gmail.modify because that's what the app is verified for in Google Cloud Console
        private const val GMAIL_MODIFY_SCOPE = "https://www.googleapis.com/auth/gmail.modify"
        // Calendar read-only scope for Daily Brief
        private const val CALENDAR_READONLY_SCOPE = "https://www.googleapis.com/auth/calendar.readonly"
    }

    // Basic sign-in client - only requests email and profile
    val googleSignInClient: GoogleSignInClient by lazy {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .requestEmail()
            .requestProfile()
            .build()
        GoogleSignIn.getClient(context, gso)
    }

    // Gmail-only sign-in client - requests only email scope for Daily Brief
    // Uses separate OAuth client ID for linking (different from sign-in client)
    val googleSignInClientWithGmail: GoogleSignInClient by lazy {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(BuildConfig.GOOGLE_OAUTH_CLIENT_ID)
            .requestEmail()
            .requestProfile()
            .requestScopes(Scope(GMAIL_MODIFY_SCOPE))
            .build()
        GoogleSignIn.getClient(context, gso)
    }

    // Calendar-only sign-in client - requests only calendar scope
    val googleSignInClientWithCalendar: GoogleSignInClient by lazy {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(BuildConfig.GOOGLE_OAUTH_CLIENT_ID)
            .requestEmail()
            .requestProfile()
            .requestScopes(Scope(CALENDAR_READONLY_SCOPE))
            .build()
        GoogleSignIn.getClient(context, gso)
    }

    /**
     * Basic sign-in - just authenticates the user without Gmail access
     */
    suspend fun signInWithGoogle(account: GoogleSignInAccount): Result<User> = runCatching {
        val idToken = account.idToken
            ?: throw Exception("No ID token received from Google")

        Log.d(TAG, "Signing in with Google: ${account.email}")

        // Sign in to Supabase with Google ID token
        supabaseClient.auth.signInWith(IDToken) {
            this.idToken = idToken
            this.provider = Google
        }

        val email = account.email ?: throw Exception("No email from Google")
        val name = account.displayName ?: email.substringBefore("@")

        // Save to preferences - no Gmail linked yet
        preferencesManager.setLoggedIn(
            isLoggedIn = true,
            userId = email,
            email = email,
            name = name
        )

        User(
            id = email,
            email = email,
            name = name
        )
    }

    /**
     * Link Gmail account for Daily Brief feature (email only, no calendar)
     * This is called separately after user explicitly opts in
     *
     * Uses GoogleAuthUtil.getToken() to get an actual OAuth access token,
     * similar to how iOS gets user.accessToken.tokenString directly
     */
    suspend fun linkGmailAccount(account: GoogleSignInAccount): Result<Unit> = runCatching {
        val email = account.email ?: throw Exception("No email from Google")
        val googleAccount = account.account ?: throw Exception("No Google account available")

        Log.d(TAG, "Linking Gmail account: $email")

        // Get actual OAuth access token using GoogleAuthUtil - Gmail only
        val scope = "oauth2:$GMAIL_MODIFY_SCOPE"

        val accessToken = withContext(Dispatchers.IO) {
            try {
                GoogleAuthUtil.getToken(context, googleAccount, scope)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get access token: ${e.message}")
                val userMessage = when {
                    e.message?.contains("NeedRemoteConsent", ignoreCase = true) == true ||
                    e.message?.contains("remote consent", ignoreCase = true) == true ->
                        "Gmail access was not granted. Please tap Connect again and make sure to allow Gmail access when prompted."
                    e.message?.contains("UserRecoverableAuthException", ignoreCase = true) == true ->
                        "Additional permissions required. Please try again."
                    e.message?.contains("network", ignoreCase = true) == true ->
                        "Network error. Please check your connection and try again."
                    else -> "Failed to connect Gmail. Please try again."
                }
                throw Exception(userMessage)
            }
        }

        Log.d(TAG, "Got access token for Gmail (length: ${accessToken.length})")

        // Get current calendar status (preserve if already linked)
        val calendarAlreadyEnabled = preferencesManager.calendarEnabled.first()

        apiService.linkAccount(
            userId = email,
            request = com.kreativekoala.audexa.data.remote.LinkAccountRequest(
                provider = "google",
                email = email,
                accessToken = accessToken,
                refreshToken = "",
                emailEnabled = true,
                calendarEnabled = calendarAlreadyEnabled
            )
        )

        // Save linked status
        preferencesManager.setLinkedAccount(
            hasLinked = true,
            email = email,
            provider = "google"
        )

        // Also update main user email if it was empty (guest user linking Gmail)
        val currentEmail = preferencesManager.userEmail.first()
        if (currentEmail.isNullOrEmpty()) {
            preferencesManager.setLoggedIn(
                isLoggedIn = true,
                userId = email,
                email = email,
                name = null
            )
            Log.d(TAG, "Updated guest user email to: $email")
        }

        Log.d(TAG, "Successfully linked Gmail account")
    }

    /**
     * Link Google Calendar for Daily Brief feature (calendar only)
     * This is called separately after user explicitly opts in for calendar access
     */
    suspend fun linkCalendarAccount(account: GoogleSignInAccount): Result<Unit> = runCatching {
        val email = account.email ?: throw Exception("No email from Google")
        val googleAccount = account.account ?: throw Exception("No Google account available")

        Log.d(TAG, "Linking Calendar account: $email")

        // Get actual OAuth access token using GoogleAuthUtil - Calendar only
        val scope = "oauth2:$CALENDAR_READONLY_SCOPE"

        val accessToken = withContext(Dispatchers.IO) {
            try {
                GoogleAuthUtil.getToken(context, googleAccount, scope)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get calendar access token: ${e.message}")
                val userMessage = when {
                    e.message?.contains("NeedRemoteConsent", ignoreCase = true) == true ||
                    e.message?.contains("remote consent", ignoreCase = true) == true ->
                        "Calendar access was not granted. Please tap Connect again and make sure to allow Calendar access when prompted."
                    e.message?.contains("UserRecoverableAuthException", ignoreCase = true) == true ->
                        "Additional permissions required. Please try again."
                    e.message?.contains("network", ignoreCase = true) == true ->
                        "Network error. Please check your connection and try again."
                    else -> "Failed to connect Calendar. Please try again."
                }
                throw Exception(userMessage)
            }
        }

        Log.d(TAG, "Got access token for Calendar (length: ${accessToken.length})")

        // Get current email status (preserve if already linked)
        val emailAlreadyEnabled = preferencesManager.emailEnabled.first()
        val linkedEmail = preferencesManager.linkedEmail.first() ?: email

        apiService.linkAccount(
            userId = linkedEmail,
            request = com.kreativekoala.audexa.data.remote.LinkAccountRequest(
                provider = "google",
                email = linkedEmail,
                accessToken = accessToken,
                refreshToken = "",
                emailEnabled = emailAlreadyEnabled,
                calendarEnabled = true
            )
        )

        // Update calendar enabled preference
        preferencesManager.setCalendarEnabled(true)

        // If no email linked yet, set up the linked account
        val hasLinked = preferencesManager.hasLinkedGoogle.first()
        if (!hasLinked) {
            preferencesManager.setLinkedAccount(
                hasLinked = true,
                email = linkedEmail,
                provider = "google"
            )
        }

        Log.d(TAG, "Successfully linked Calendar account")
    }

    /**
     * Continue without signing in - creates a guest session
     * User can explore topic podcasts but won't have Daily Brief until they link email
     */
    suspend fun continueAsGuest(): Result<User> = runCatching {
        val guestId = "guest_${System.currentTimeMillis()}"

        Log.d(TAG, "Continuing as guest: $guestId")

        // Save guest session to preferences
        preferencesManager.setLoggedIn(
            isLoggedIn = true,
            userId = guestId,
            email = "", // No email for guest
            name = "Guest"
        )

        User(
            id = guestId,
            email = "",
            name = "Guest"
        )
    }

    suspend fun signOut() {
        try {
            googleSignInClient.signOut()
            supabaseClient.auth.signOut()
        } catch (e: Exception) {
            Log.e(TAG, "Error during sign out: ${e.message}")
        }
        preferencesManager.clearAll()
    }

    suspend fun deleteAccount(): Result<Unit> = runCatching {
        val userId = preferencesManager.userEmail.first() 
            ?: throw Exception("No user logged in")
        
        // Delete from backend
        apiService.deleteUser(userId)
        
        // Sign out
        signOut()
    }

    suspend fun isLoggedIn(): Boolean = preferencesManager.isLoggedIn.first()
    
    suspend fun getCurrentUser(): User? {
        val isLoggedIn = preferencesManager.isLoggedIn.first()
        if (!isLoggedIn) return null
        
        val email = preferencesManager.userEmail.first() ?: return null
        val name = preferencesManager.userName.first()
        
        return User(
            id = email,
            email = email,
            name = name
        )
    }
}
