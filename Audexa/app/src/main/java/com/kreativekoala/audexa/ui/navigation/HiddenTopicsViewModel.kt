package com.kreativekoala.audexa.ui.navigation

import android.util.Log
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.data.repository.TopicRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.*
import kotlinx.coroutines.launch
import javax.inject.Inject

data class HiddenTopicsUiState(
    val hiddenTopics: List<Topic> = emptyList(),
    val isLoading: Boolean = false
)

@HiltViewModel
class HiddenTopicsViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager,
    private val topicRepository: TopicRepository
) : ViewModel() {

    companion object {
        private const val TAG = "HiddenTopicsVM"
    }

    private val _uiState = MutableStateFlow(HiddenTopicsUiState())
    val uiState: StateFlow<HiddenTopicsUiState> = _uiState.asStateFlow()

    private var allTopics: List<Topic> = emptyList()

    init {
        loadHiddenTopics()
    }

    private fun loadHiddenTopics() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)

            // First load all topics
            topicRepository.getTopics()
                .onSuccess { response ->
                    allTopics = response.data?.topics ?: emptyList()
                }
                .onFailure { e ->
                    Log.e(TAG, "Failed to load topics", e)
                }

            // Then observe hidden topic IDs
            preferencesManager.hiddenTopics.collect { hiddenIds ->
                val hiddenTopics = allTopics.filter { it.id in hiddenIds }
                _uiState.value = _uiState.value.copy(
                    hiddenTopics = hiddenTopics,
                    isLoading = false
                )
            }
        }
    }

    fun unhideTopic(topicId: String) {
        viewModelScope.launch {
            val currentHidden = preferencesManager.hiddenTopics.first()
            val updated = currentHidden - topicId
            preferencesManager.setHiddenTopics(updated)
        }
    }
}
