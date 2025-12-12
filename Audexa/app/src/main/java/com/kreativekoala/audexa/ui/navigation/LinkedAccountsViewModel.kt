package com.kreativekoala.audexa.ui.navigation

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
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
    val error: String? = null
)

@HiltViewModel
class LinkedAccountsViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager
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

    fun linkGoogle() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLinkingGoogle = true, error = null)

            // TODO: Implement actual Google OAuth flow
            // This would typically launch a Google Sign-In intent
            // and handle the result via an ActivityResultContract

            Log.d(TAG, "Google linking requested - implement OAuth flow")

            _uiState.value = _uiState.value.copy(
                isLinkingGoogle = false,
                error = "Please use Google Sign-In from the Profile screen"
            )
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
                    linkedGoogleEmail = null
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
}
