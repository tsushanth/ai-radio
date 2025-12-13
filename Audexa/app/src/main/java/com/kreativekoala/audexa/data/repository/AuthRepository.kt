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

    // Gmail-enabled sign-in client - requests Gmail modify access for Daily Brief
    val googleSignInClientWithGmail: GoogleSignInClient by lazy {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .requestEmail()
            .requestProfile()
            .requestScopes(Scope(GMAIL_MODIFY_SCOPE))
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
     * Link Gmail account for Daily Brief feature
     * This is called separately after user explicitly opts in
     *
     * Uses GoogleAuthUtil.getToken() to get an actual OAuth access token,
     * similar to how iOS gets user.accessToken.tokenString directly
     */
    suspend fun linkGmailAccount(account: GoogleSignInAccount): Result<Unit> = runCatching {
        val email = account.email ?: throw Exception("No email from Google")
        val googleAccount = account.account ?: throw Exception("No Google account available")

        Log.d(TAG, "Linking Gmail account: $email")

        // Get actual OAuth access token using GoogleAuthUtil
        // The scope format for GoogleAuthUtil is "oauth2:scope1 scope2"
        val scope = "oauth2:$GMAIL_MODIFY_SCOPE"

        val accessToken = withContext(Dispatchers.IO) {
            try {
                GoogleAuthUtil.getToken(context, googleAccount, scope)
            } catch (e: Exception) {
                Log.e(TAG, "Failed to get access token: ${e.message}")
                throw Exception("Failed to get Gmail access token: ${e.message}")
            }
        }

        Log.d(TAG, "Got access token for Gmail (length: ${accessToken.length})")

        // Send the actual access token to backend
        // Note: Android doesn't provide a refresh token via GoogleAuthUtil
        // The backend will need to handle token refresh differently for Android users
        apiService.linkAccount(
            userId = email,
            request = com.kreativekoala.audexa.data.remote.LinkAccountRequest(
                provider = "google",
                email = email,
                accessToken = accessToken,
                refreshToken = "", // Android doesn't provide refresh token directly
                emailEnabled = true,
                calendarEnabled = false
            )
        )

        // Save linked status
        preferencesManager.setLinkedAccount(
            hasLinked = true,
            email = email,
            provider = "google"
        )

        Log.d(TAG, "Successfully linked Gmail account")
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
