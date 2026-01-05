package com.kreativekoala.audexa.ui.navigation

import android.content.Intent
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.repository.AuthRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import kotlinx.coroutines.suspendCancellableCoroutine
import javax.inject.Inject
import kotlin.coroutines.resume
import kotlin.coroutines.resumeWithException

data class LinkedAccountsUiState(
    val hasLinkedGoogle: Boolean = false,
    val linkedGoogleEmail: String? = null,
    val hasLinkedCalendar: Boolean = false,  // Separate calendar connection status
    val hasLinkedMicrosoft: Boolean = false,
    val linkedMicrosoftEmail: String? = null,
    val isLinkingGoogle: Boolean = false,
    val isLinkingCalendar: Boolean = false,  // Separate calendar linking state
    val isLinkingMicrosoft: Boolean = false,
    val showComingSoonDialog: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null,
    val gmailLinkIntent: Intent? = null,  // Intent ready to launch for Gmail
    val calendarLinkIntent: Intent? = null,  // Intent ready to launch for Calendar
    val emailEnabled: Boolean = true,
    val calendarEnabled: Boolean = false  // Default to false until connected
)

@HiltViewModel
class LinkedAccountsViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager,
    private val authRepository: AuthRepository
) : ViewModel() {

    companion object {
        private const val TAG = "LinkedAccountsVM"
    }

    private val _uiState = MutableStateFlow(LinkedAccountsUiState())
    val uiState: StateFlow<LinkedAccountsUiState> = _uiState.asStateFlow()

    init {
        loadLinkedAccounts()
    }

    private fun loadLinkedAccounts() {
        viewModelScope.launch {
            combine(
                preferencesManager.hasLinkedGoogle,
                preferencesManager.linkedEmail,
                preferencesManager.linkedProvider,
                preferencesManager.emailEnabled,
                preferencesManager.calendarEnabled
            ) { hasGoogle, email, provider, emailEnabled, calendarEnabled ->
                LinkedAccountData(hasGoogle, email, provider, emailEnabled, calendarEnabled)
            }.collect { data ->
                _uiState.value = _uiState.value.copy(
                    hasLinkedGoogle = data.hasGoogle && data.provider == "google",
                    linkedGoogleEmail = if (data.provider == "google") data.email else null,
                    hasLinkedCalendar = data.calendarEnabled,  // Calendar is linked if enabled
                    hasLinkedMicrosoft = data.provider == "microsoft",
                    linkedMicrosoftEmail = if (data.provider == "microsoft") data.email else null,
                    emailEnabled = data.emailEnabled,
                    calendarEnabled = data.calendarEnabled
                )
            }
        }
    }

    private data class LinkedAccountData(
        val hasGoogle: Boolean,
        val email: String?,
        val provider: String?,
        val emailEnabled: Boolean,
        val calendarEnabled: Boolean
    )

    /**
     * Prepare Gmail linking - revokes existing access and prepares the intent
     * This must be called BEFORE launching the sign-in flow
     */
    fun prepareGmailLinking() {
        _uiState.value = _uiState.value.copy(
            isLinkingGoogle = true,
            error = null,
            successMessage = null,
            gmailLinkIntent = null
        )

        viewModelScope.launch {
            try {
                // Revoke access completely to force fresh consent screen with Gmail permissions
                // signOut() alone doesn't clear the granted scopes, revokeAccess() does
                // We must await this to complete before showing sign-in
                suspendCancellableCoroutine<Unit> { continuation ->
                    authRepository.googleSignInClientWithGmail.revokeAccess()
                        .addOnSuccessListener {
                            Log.d(TAG, "Revoked previous Google access")
                            continuation.resume(Unit)
                        }
                        .addOnFailureListener { e ->
                            // Ignore errors - might not have been signed in before
                            Log.d(TAG, "Revoke access failed (expected if not signed in): ${e.message}")
                            continuation.resume(Unit)
                        }
                }
            } catch (e: Exception) {
                Log.d(TAG, "Revoke access completed with exception: ${e.message}")
            }

            // Now set the intent - screen will launch it
            _uiState.value = _uiState.value.copy(
                gmailLinkIntent = authRepository.googleSignInClientWithGmail.signInIntent
            )
        }
    }

    /**
     * Clear the intent after it's been launched
     */
    fun clearGmailLinkIntent() {
        _uiState.value = _uiState.value.copy(gmailLinkIntent = null)
    }

    fun handleGmailLinkResult(account: GoogleSignInAccount) {
        viewModelScope.launch {
            authRepository.linkGmailAccount(account)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isLinkingGoogle = false,
                        successMessage = "Gmail connected successfully! Your Daily Brief will now include email summaries."
                    )
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to link Gmail", e)
                    _uiState.value = _uiState.value.copy(
                        isLinkingGoogle = false,
                        error = e.message ?: "Failed to link Gmail account"
                    )
                }
        }
    }

    fun handleLinkError(message: String) {
        _uiState.value = _uiState.value.copy(
            isLinkingGoogle = false,
            isLinkingCalendar = false,
            error = message
        )
    }

    /**
     * Prepare Calendar linking - revokes existing access and prepares the intent
     */
    fun prepareCalendarLinking() {
        _uiState.value = _uiState.value.copy(
            isLinkingCalendar = true,
            error = null,
            successMessage = null,
            calendarLinkIntent = null
        )

        viewModelScope.launch {
            try {
                suspendCancellableCoroutine<Unit> { continuation ->
                    authRepository.googleSignInClientWithCalendar.revokeAccess()
                        .addOnSuccessListener {
                            Log.d(TAG, "Revoked previous Calendar access")
                            continuation.resume(Unit)
                        }
                        .addOnFailureListener { e ->
                            Log.d(TAG, "Revoke calendar access failed (expected if not signed in): ${e.message}")
                            continuation.resume(Unit)
                        }
                }
            } catch (e: Exception) {
                Log.d(TAG, "Revoke calendar access completed with exception: ${e.message}")
            }

            // Now set the intent - screen will launch it
            _uiState.value = _uiState.value.copy(
                calendarLinkIntent = authRepository.googleSignInClientWithCalendar.signInIntent
            )
        }
    }

    /**
     * Clear the calendar intent after it's been launched
     */
    fun clearCalendarLinkIntent() {
        _uiState.value = _uiState.value.copy(calendarLinkIntent = null)
    }

    fun handleCalendarLinkResult(account: GoogleSignInAccount) {
        viewModelScope.launch {
            authRepository.linkCalendarAccount(account)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isLinkingCalendar = false,
                        hasLinkedCalendar = true,
                        successMessage = "Calendar connected successfully! Your Daily Brief will now include upcoming events."
                    )
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to link Calendar", e)
                    _uiState.value = _uiState.value.copy(
                        isLinkingCalendar = false,
                        error = e.message ?: "Failed to link Calendar"
                    )
                }
        }
    }

    fun unlinkCalendar() {
        viewModelScope.launch {
            try {
                preferencesManager.setCalendarEnabled(false)
                _uiState.value = _uiState.value.copy(
                    hasLinkedCalendar = false,
                    calendarEnabled = false,
                    successMessage = "Calendar disconnected"
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to unlink Calendar", e)
                _uiState.value = _uiState.value.copy(
                    error = "Failed to disconnect calendar: ${e.message}"
                )
            }
        }
    }

    fun unlinkGoogle() {
        viewModelScope.launch {
            try {
                preferencesManager.setLinkedAccount(
                    hasLinked = false,
                    email = null,
                    provider = null
                )
                _uiState.value = _uiState.value.copy(
                    hasLinkedGoogle = false,
                    linkedGoogleEmail = null,
                    successMessage = "Gmail account unlinked"
                )
            } catch (e: Exception) {
                Log.e(TAG, "Failed to unlink Google", e)
                _uiState.value = _uiState.value.copy(
                    error = "Failed to unlink account: ${e.message}"
                )
            }
        }
    }

    fun showMicrosoftComingSoon() {
        _uiState.value = _uiState.value.copy(showComingSoonDialog = true)
    }

    fun dismissComingSoon() {
        _uiState.value = _uiState.value.copy(showComingSoonDialog = false)
    }

    fun clearMessages() {
        _uiState.value = _uiState.value.copy(error = null, successMessage = null)
    }

    fun setEmailEnabled(enabled: Boolean) {
        viewModelScope.launch {
            preferencesManager.setEmailEnabled(enabled)
        }
    }

    fun setCalendarEnabled(enabled: Boolean) {
        viewModelScope.launch {
            preferencesManager.setCalendarEnabled(enabled)
        }
    }
}
