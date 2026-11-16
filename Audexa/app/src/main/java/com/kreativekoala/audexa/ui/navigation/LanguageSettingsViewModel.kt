package com.kreativekoala.audexa.ui.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.data.model.UiLanguage
import com.kreativekoala.audexa.util.AppLanguageManager
import com.kreativekoala.audexa.service.BriefingManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LanguageSettingsUiState(
    val selectedLanguage: SupportedLanguage = SupportedLanguage.ENGLISH,
    /** Interface language the user chose for the app; null = follow the phone. Separate from [selectedLanguage] (podcasts). */
    val appLanguage: UiLanguage? = null
)

@HiltViewModel
class LanguageSettingsViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager,
    private val briefingManager: BriefingManager,
    private val appLanguageManager: AppLanguageManager,
    private val remoteLanguages: com.kreativekoala.audexa.data.repository.RemoteLanguagesRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(LanguageSettingsUiState())
    val uiState: StateFlow<LanguageSettingsUiState> = _uiState.asStateFlow()

    init {
        _uiState.value = _uiState.value.copy(appLanguage = appLanguageManager.selected())
        viewModelScope.launch { remoteLanguages.refresh() } // the picker lists the languages the server has on right now
        viewModelScope.launch {
            preferencesManager.preferredLanguage.collect { langCode ->
                _uiState.value = _uiState.value.copy(
                    selectedLanguage = SupportedLanguage.fromCode(langCode)
                )
            }
        }
    }

    fun setLanguage(language: SupportedLanguage) {
        viewModelScope.launch {
            briefingManager.logEvent(BriefingManager.EVENT_LANGUAGE_PICKED, lang = language.code)
            if (language.podcastAvailable) preferencesManager.setPreferredLanguage(language.code)
        }
    }

    /** Sets the interface language (null = Follow phone). The activity is recreated by the platform; the state is updated first. */
    fun setAppLanguage(language: UiLanguage?) {
        _uiState.value = _uiState.value.copy(appLanguage = language)
        appLanguageManager.select(language?.tag)
    }
}
