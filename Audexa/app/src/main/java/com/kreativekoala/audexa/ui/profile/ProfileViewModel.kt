package com.kreativekoala.audexa.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.data.repository.AuthRepository
import com.kreativekoala.audexa.service.AudioManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class ProfileUiState(
    val userName: String = "",
    val userEmail: String = "",
    val hasLinkedGoogle: Boolean = false,
    val preferredLanguage: String = "English",
    val hiddenTopicsCount: Int = 0,
    val isSignedOut: Boolean = false,
    val isDeleting: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class ProfileViewModel @Inject constructor(
    private val authRepository: AuthRepository,
    private val preferencesManager: PreferencesManager,
    private val audioManager: AudioManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(ProfileUiState())
    val uiState: StateFlow<ProfileUiState> = _uiState.asStateFlow()

    init {
        loadProfile()
    }

    private fun loadProfile() {
        viewModelScope.launch {
            combine(
                preferencesManager.userName,
                preferencesManager.userEmail,
                preferencesManager.hasLinkedGoogle,
                preferencesManager.preferredLanguage,
                preferencesManager.hiddenTopics
            ) { name, email, hasGoogle, language, hidden ->
                ProfileUiState(
                    userName = name ?: "User",
                    userEmail = email ?: "",
                    hasLinkedGoogle = hasGoogle,
                    preferredLanguage = SupportedLanguage.fromCode(language).displayName,
                    hiddenTopicsCount = hidden.size
                )
            }.collect { state ->
                _uiState.value = state
            }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            // Stop any playing audio before signing out
            audioManager.stop()
            authRepository.signOut()
            _uiState.value = _uiState.value.copy(isSignedOut = true)
        }
    }

    fun deleteAccount() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isDeleting = true)

            // Stop any playing audio before deleting account
            audioManager.stop()

            authRepository.deleteAccount()
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isDeleting = false,
                        isSignedOut = true
                    )
                }
                .onFailure { e ->
                    _uiState.value = _uiState.value.copy(
                        isDeleting = false,
                        error = e.message
                    )
                }
        }
    }
}
