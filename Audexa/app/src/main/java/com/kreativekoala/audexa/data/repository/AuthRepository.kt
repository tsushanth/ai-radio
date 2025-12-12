package com.kreativekoala.audexa.data.repository

import android.content.Context
import android.util.Log
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
import io.github.jan.supabase.gotrue.auth
import io.github.jan.supabase.gotrue.providers.Google
import io.github.jan.supabase.gotrue.providers.builtin.IDToken
import kotlinx.coroutines.flow.first
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
        private const val GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify"
    }

    val googleSignInClient: GoogleSignInClient by lazy {
        val gso = GoogleSignInOptions.Builder(GoogleSignInOptions.DEFAULT_SIGN_IN)
            .requestIdToken(BuildConfig.GOOGLE_WEB_CLIENT_ID)
            .requestEmail()
            .requestProfile()
            .requestScopes(Scope(GMAIL_SCOPE))
            .build()
        GoogleSignIn.getClient(context, gso)
    }

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
        
        // Store linked account on backend
        try {
            apiService.linkAccount(
                userId = email,
                request = com.kreativekoala.audexa.data.remote.LinkAccountRequest(
                    provider = "google",
                    email = email,
                    accessToken = account.serverAuthCode ?: "",
                    refreshToken = "",
                    emailEnabled = true,
                    calendarEnabled = false
                )
            )
        } catch (e: Exception) {
            Log.w(TAG, "Failed to store linked account: ${e.message}")
        }
        
        // Save to preferences
        preferencesManager.setLoggedIn(
            isLoggedIn = true,
            userId = email,
            email = email,
            name = name
        )
        preferencesManager.setLinkedAccount(
            hasLinked = true,
            email = email,
            provider = "google"
        )
        
        User(
            id = email,
            email = email,
            name = name
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
