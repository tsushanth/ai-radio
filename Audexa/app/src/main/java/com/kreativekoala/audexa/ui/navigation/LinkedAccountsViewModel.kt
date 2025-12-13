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
import javax.inject.Inject

data class LinkedAccountsUiState(
    val hasLinkedGoogle: Boolean = false,
    val linkedGoogleEmail: String? = null,
    val hasLinkedMicrosoft: Boolean = false,
    val linkedMicrosoftEmail: String? = null,
    val isLinkingGoogle: Boolean = false,
    val isLinkingMicrosoft: Boolean = false,
    val showComingSoonDialog: Boolean = false,
    val error: String? = null,
    val successMessage: String? = null
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
                preferencesManager.linkedProvider
            ) { hasGoogle, email, provider ->
                Triple(hasGoogle, email, provider)
            }.collect { (hasGoogle, email, provider) ->
                _uiState.value = _uiState.value.copy(
                    hasLinkedGoogle = hasGoogle && provider == "google",
                    linkedGoogleEmail = if (provider == "google") email else null,
                    hasLinkedMicrosoft = provider == "microsoft",
                    linkedMicrosoftEmail = if (provider == "microsoft") email else null
                )
            }
        }
    }

    fun getGmailLinkIntent(): Intent {
        // Sign out first to ensure fresh consent screen with Gmail permissions
        authRepository.googleSignInClientWithGmail.signOut()
        return authRepository.googleSignInClientWithGmail.signInIntent
    }

    fun startGoogleLinking() {
        _uiState.value = _uiState.value.copy(isLinkingGoogle = true, error = null, successMessage = null)
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
            error = message
        )
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
}
