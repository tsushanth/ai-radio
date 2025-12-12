package com.kreativekoala.audexa

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class MainUiState(
    val isLoggedIn: Boolean = false,
    val isLoading: Boolean = true
)

@HiltViewModel
class MainViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager
) : ViewModel() {

    private val _uiState = MutableStateFlow(MainUiState())
    val uiState: StateFlow<MainUiState> = _uiState.asStateFlow()

    init {
        viewModelScope.launch {
            preferencesManager.isLoggedIn.collect { isLoggedIn ->
                _uiState.value = _uiState.value.copy(
                    isLoggedIn = isLoggedIn,
                    isLoading = false
                )
            }
        }
    }

    fun hideTopic(topicId: String) {
        viewModelScope.launch {
            val current = preferencesManager.hiddenTopics.first()
            preferencesManager.setHiddenTopics(current + topicId)
        }
    }
}
