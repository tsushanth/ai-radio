package com.kreativekoala.audexa.ui.ask

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.ask.AskRepository
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

/** Decides whether Home shows the "Ask the hosts" entry. Hidden until the server says it is on; hidden on any error. */
@HiltViewModel
class AskEntryViewModel @Inject constructor(repo: AskRepository) : ViewModel() {
    private val _available = MutableStateFlow(false)
    val available: StateFlow<Boolean> = _available.asStateFlow()

    init {
        viewModelScope.launch { _available.value = repo.config() != null }
    }
}
