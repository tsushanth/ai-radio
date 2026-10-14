package com.kreativekoala.audexa.ui.navigation

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.service.BriefingManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class LanguageSettingsUiState(
    val selectedLanguage: SupportedLanguage = SupportedLanguage.ENGLISH
)

@HiltViewModel
class LanguageSettingsViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager,
    private val briefingManager: BriefingManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(LanguageSettingsUiState())
    val uiState: StateFlow<LanguageSettingsUiState> = _uiState.asStateFlow()

    init {
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
            preferencesManager.setPreferredLanguage(language.code)
            briefingManager.logEvent(BriefingManager.EVENT_LANGUAGE_PICKED, lang = language.code)
        }
    }
}
