package com.kreativekoala.audexa.ui.onboarding

import com.kreativekoala.audexa.service.BriefingManager
import android.content.Intent
import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.google.android.gms.auth.api.signin.GoogleSignInAccount
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.ContentLanguage
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.data.remote.SuggestTopicRequest
import com.kreativekoala.audexa.data.repository.AuthRepository
import com.kreativekoala.audexa.data.repository.TopicRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

data class OnboardingUiState(
    val currentPage: Int = 0,
    val googleLinked: Boolean = false,
    val isLinkingGoogle: Boolean = false,
    val emailEnabled: Boolean = true,
    val calendarEnabled: Boolean = false,
    val isLinkingCalendar: Boolean = false,
    val linkedEmail: String? = null,
    val topics: List<Topic> = emptyList(),
    val selectedTopicIds: Set<String> = emptySet(),
    val selectedLanguage: SupportedLanguage = SupportedLanguage.ENGLISH,
    // Device language that podcasts do not exist in (display name), so the language page can say what we picked instead.
    val unsupportedDeviceLanguage: String? = null,
    val isLoadingTopics: Boolean = false,
    val isCompleting: Boolean = false,
    val error: String? = null
)

@HiltViewModel
class OnboardingViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager,
    private val authRepository: AuthRepository,
    private val topicRepository: TopicRepository,
    private val briefingManager: BriefingManager
) : ViewModel() {

    companion object {
        private const val TAG = "OnboardingViewModel"
    }

    private val _uiState = MutableStateFlow(OnboardingUiState())
    val uiState: StateFlow<OnboardingUiState> = _uiState.asStateFlow()

    init {
        loadInitialState()
    }

    private fun loadInitialState() {
        viewModelScope.launch {
            // Check if Google is already linked (from auth flow)
            val hasLinked = preferencesManager.hasLinkedGoogle.first()
            val email = preferencesManager.linkedEmail.first()

            // Auto-detect device locale
            // Only a language podcasts can be generated in may be pre-selected (and later saved): a Japanese, Korean, Hindi, Chinese
            // or Tagalog device gets the closest supported language (English by default) plus a one-line explanation.
            val deviceLocale = java.util.Locale.getDefault().language
            val resolved = ContentLanguage.resolve(deviceLocale)

            _uiState.value = _uiState.value.copy(
                googleLinked = hasLinked,
                linkedEmail = email,
                selectedLanguage = resolved.language,
                unsupportedDeviceLanguage = if (resolved.substituted) languageDisplayName(resolved.requested) else null
            )

            // Load topics
            loadTopics()
        }
    }

    private fun loadTopics() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoadingTopics = true)

            // Fetch fresh with selected language (skip cache during onboarding
            // since cached topics may be from a different language)
            topicRepository.getTopics(_uiState.value.selectedLanguage.code)
                .onSuccess { response ->
                    val activeTopics = response.data?.topics
                        ?.filter { it.isActive }
                        ?.distinctBy { it.name } // Deduplicate by name
                        ?: emptyList()
                    // Always clear the loading state; an empty topics list is a
                    // valid (if rare) response and the UI must still be usable.
                    // Previously this branch ran only on non-empty results,
                    // leaving the spinner spinning forever on empty responses.
                    _uiState.value = _uiState.value.copy(
                        topics = activeTopics,
                        isLoadingTopics = false
                    )
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to load topics: ${e.message}")
                    _uiState.value = _uiState.value.copy(
                        isLoadingTopics = false,
                        error = "Couldn't load topics. You can continue and pick them later."
                    )
                }
        }
    }

    // Page navigation
    fun nextPage() {
        val current = _uiState.value.currentPage
        if (current < 3) {
            _uiState.value = _uiState.value.copy(currentPage = current + 1)
        }
    }

    fun goToPage(page: Int) {
        _uiState.value = _uiState.value.copy(currentPage = page.coerceIn(0, 3))
    }

    // Language selection
    fun selectLanguage(language: SupportedLanguage) {
        viewModelScope.launch { briefingManager.logEvent(BriefingManager.EVENT_LANGUAGE_PICKED, lang = language.code) }
        if (!language.podcastAvailable) return // coming soon: the pick is recorded, the selection stays
        _uiState.value = _uiState.value.copy(selectedLanguage = language, unsupportedDeviceLanguage = null)
        loadTopics() // Reload with new language
    }

    // Page 2: Account linking
    fun getGmailLinkIntent(): Intent {
        return authRepository.googleSignInClientWithGmail.signInIntent
    }

    fun getCalendarLinkIntent(): Intent {
        return authRepository.googleSignInClientWithCalendar.signInIntent
    }

    fun handleGmailLinkResult(account: GoogleSignInAccount) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLinkingGoogle = true, error = null)

            authRepository.linkGmailAccount(account)
                .onSuccess {
                    val email = account.email
                    _uiState.value = _uiState.value.copy(
                        isLinkingGoogle = false,
                        googleLinked = true,
                        emailEnabled = true,
                        linkedEmail = email
                    )
                    preferencesManager.setEmailEnabled(true)
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to link Gmail: ${e.message}")
                    _uiState.value = _uiState.value.copy(
                        isLinkingGoogle = false,
                        error = e.message ?: "Failed to link Gmail"
                    )
                }
        }
    }

    fun handleCalendarLinkResult(account: GoogleSignInAccount) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLinkingCalendar = true, error = null)

            authRepository.linkCalendarAccount(account)
                .onSuccess {
                    _uiState.value = _uiState.value.copy(
                        isLinkingCalendar = false,
                        calendarEnabled = true
                    )
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to link Calendar: ${e.message}")
                    _uiState.value = _uiState.value.copy(
                        isLinkingCalendar = false,
                        error = e.message ?: "Failed to link Calendar"
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

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    // Page 3: Topic selection
    fun toggleTopic(topicId: String) {
        val current = _uiState.value.selectedTopicIds
        val updated = if (current.contains(topicId)) {
            current - topicId
        } else {
            current + topicId
        }
        _uiState.value = _uiState.value.copy(selectedTopicIds = updated)
    }

    // Topic suggestion
    fun suggestTopic(topicName: String, language: String) {
        viewModelScope.launch {
            topicRepository.suggestTopic(
                SuggestTopicRequest(
                    topicName = topicName,
                    language = language,
                    description = null
                )
            ).onSuccess {
                Log.d(TAG, "Topic suggested successfully: $topicName")
            }.onFailure { e ->
                Log.e(TAG, "Failed to suggest topic: ${e.message}")
            }
        }
    }

    // Completion
    fun completeOnboarding(onComplete: () -> Unit) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isCompleting = true)

            // Save selected topics
            val selectedIds = _uiState.value.selectedTopicIds
            Log.d(TAG, "Completing onboarding. Selected topic IDs: $selectedIds")
            Log.d(TAG, "Available topics: ${_uiState.value.topics.map { it.id }}")
            if (selectedIds.isNotEmpty()) {
                preferencesManager.setSelectedTopics(selectedIds)
                preferencesManager.setBookmarkedTopics(selectedIds)
            }

            // Save selected language
            preferencesManager.setPreferredLanguage(ContentLanguage.resolve(uiState.value.selectedLanguage.code).language.code)

            // Mark onboarding complete
            preferencesManager.setOnboardingCompleted(true)

            _uiState.value = _uiState.value.copy(isCompleting = false)
            onComplete()
        }
    }
}

/** A language's name as the device shows it (for example "Japanese" on an English phone); the code itself if the device has no name for it. */
fun languageDisplayName(code: String): String {
    val name = java.util.Locale.forLanguageTag(code).getDisplayLanguage(java.util.Locale.getDefault())
    return name.takeIf { it.isNotBlank() && !it.equals(code, ignoreCase = true) } ?: code
}
