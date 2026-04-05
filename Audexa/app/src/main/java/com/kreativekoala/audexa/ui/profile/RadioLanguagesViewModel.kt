package com.kreativekoala.audexa.ui.profile

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltViewModel
class RadioLanguagesViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager
) : ViewModel() {

    val enabledLanguages: Flow<Set<String>> = preferencesManager.radioLanguages

    fun toggleLanguage(code: String) {
        viewModelScope.launch {
            preferencesManager.toggleRadioLanguage(code)
        }
    }
}
