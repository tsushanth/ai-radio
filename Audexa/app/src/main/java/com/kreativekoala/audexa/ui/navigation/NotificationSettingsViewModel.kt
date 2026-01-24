package com.kreativekoala.audexa.ui.navigation

import android.Manifest
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.content.ContextCompat
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.service.NotificationService
import dagger.hilt.android.lifecycle.HiltViewModel
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import java.util.TimeZone
import javax.inject.Inject

data class NotificationSettingsUiState(
    val notificationsEnabled: Boolean = true,
    val briefingHour: Int = 7,
    val briefingMinute: Int = 0,
    val briefingTimezone: String = TimeZone.getDefault().id,
    val includeTopicUpdates: Boolean = true,
    val hasNotificationPermission: Boolean = false,
    val isSaving: Boolean = false
)

@HiltViewModel
class NotificationSettingsViewModel @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferencesManager: PreferencesManager,
    private val notificationService: NotificationService
) : ViewModel() {

    private val _uiState = MutableStateFlow(NotificationSettingsUiState())
    val uiState: StateFlow<NotificationSettingsUiState> = _uiState.asStateFlow()

    init {
        loadSettings()
    }

    private fun loadSettings() {
        viewModelScope.launch {
            combine(
                preferencesManager.notificationsEnabled,
                preferencesManager.briefingTimeHour,
                preferencesManager.briefingTimeMinute,
                preferencesManager.briefingTimezone,
                preferencesManager.includeTopicUpdates
            ) { enabled, hour, minute, timezone, includeTopics ->
                NotificationSettingsUiState(
                    notificationsEnabled = enabled,
                    briefingHour = hour,
                    briefingMinute = minute,
                    briefingTimezone = timezone,
                    includeTopicUpdates = includeTopics,
                    hasNotificationPermission = checkNotificationPermission()
                )
            }.collect { state ->
                _uiState.value = state
            }
        }
    }

    private fun checkNotificationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    fun updatePermissionStatus() {
        _uiState.value = _uiState.value.copy(
            hasNotificationPermission = checkNotificationPermission()
        )
    }

    fun setNotificationsEnabled(enabled: Boolean) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSaving = true)

            if (enabled) {
                notificationService.scheduleDailyNotification(
                    _uiState.value.briefingHour,
                    _uiState.value.briefingMinute,
                    _uiState.value.briefingTimezone
                )
            } else {
                notificationService.cancelDailyNotification()
            }

            // Sync with backend
            syncWithBackend()

            _uiState.value = _uiState.value.copy(
                notificationsEnabled = enabled,
                isSaving = false
            )
        }
    }

    fun setBriefingTime(hour: Int, minute: Int) {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isSaving = true)

            preferencesManager.setBriefingTime(hour, minute)

            if (_uiState.value.notificationsEnabled) {
                notificationService.scheduleDailyNotification(
                    hour,
                    minute,
                    _uiState.value.briefingTimezone
                )
            }

            // Sync with backend
            syncWithBackend()

            _uiState.value = _uiState.value.copy(
                briefingHour = hour,
                briefingMinute = minute,
                isSaving = false
            )
        }
    }

    fun setIncludeTopicUpdates(enabled: Boolean) {
        viewModelScope.launch {
            preferencesManager.setIncludeTopicUpdates(enabled)
            _uiState.value = _uiState.value.copy(includeTopicUpdates = enabled)
        }
    }

    private suspend fun syncWithBackend() {
        val userId = preferencesManager.userEmail.first()
        if (!userId.isNullOrEmpty()) {
            val briefingTime = String.format(
                "%02d:%02d",
                _uiState.value.briefingHour,
                _uiState.value.briefingMinute
            )
            val token = preferencesManager.fcmToken.first()
            notificationService.syncSettingsWithBackend(
                userId = userId,
                briefingTime = briefingTime,
                timezone = _uiState.value.briefingTimezone,
                enabled = _uiState.value.notificationsEnabled,
                deviceToken = token
            )
        }
    }
}
