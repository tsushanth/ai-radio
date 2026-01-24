package com.kreativekoala.audexa.service

import android.Manifest
import android.app.AlarmManager
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.util.Log
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import com.kreativekoala.audexa.BuildConfig
import com.kreativekoala.audexa.MainActivity
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.local.PreferencesManager
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.Calendar
import java.util.TimeZone
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationService @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferencesManager: PreferencesManager
) {
    companion object {
        private const val TAG = "NotificationService"
        const val CHANNEL_ID_DAILY_BRIEF = "daily_brief_channel"
        const val CHANNEL_NAME_DAILY_BRIEF = "Daily Brief"
        const val NOTIFICATION_ID_DAILY_REMINDER = 1001
        private const val DAILY_REMINDER_REQUEST_CODE = 2001
    }

    private val okHttpClient = OkHttpClient.Builder().build()

    /**
     * Create notification channels (required for Android O+)
     */
    fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            val channel = NotificationChannel(
                CHANNEL_ID_DAILY_BRIEF,
                CHANNEL_NAME_DAILY_BRIEF,
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Daily brief reminder notifications"
                enableVibration(true)
                setShowBadge(true)
            }

            val notificationManager = context.getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(channel)
            Log.d(TAG, "Notification channel created: $CHANNEL_ID_DAILY_BRIEF")
        }
    }

    /**
     * Check if notification permission is granted (Android 13+)
     */
    fun hasNotificationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    /**
     * Schedule daily notification at the specified time
     */
    suspend fun scheduleDailyNotification(hour: Int, minute: Int, timezone: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager

        // Create intent for the notification
        val intent = Intent(context, DailyNotificationReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            DAILY_REMINDER_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // Calculate next alarm time
        val calendar = Calendar.getInstance(TimeZone.getTimeZone(timezone)).apply {
            set(Calendar.HOUR_OF_DAY, hour)
            set(Calendar.MINUTE, minute)
            set(Calendar.SECOND, 0)
            set(Calendar.MILLISECOND, 0)

            // If time has passed today, schedule for tomorrow
            if (timeInMillis <= System.currentTimeMillis()) {
                add(Calendar.DAY_OF_YEAR, 1)
            }
        }

        // Schedule repeating alarm
        alarmManager.setRepeating(
            AlarmManager.RTC_WAKEUP,
            calendar.timeInMillis,
            AlarmManager.INTERVAL_DAY,
            pendingIntent
        )

        // Save settings locally
        preferencesManager.setBriefingTime(hour, minute)
        preferencesManager.setBriefingTimezone(timezone)
        preferencesManager.setNotificationsEnabled(true)

        Log.d(TAG, "Daily notification scheduled for $hour:$minute in $timezone")
    }

    /**
     * Cancel scheduled daily notification
     */
    suspend fun cancelDailyNotification() {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, DailyNotificationReceiver::class.java)
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            DAILY_REMINDER_REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        alarmManager.cancel(pendingIntent)
        preferencesManager.setNotificationsEnabled(false)

        Log.d(TAG, "Daily notification cancelled")
    }

    /**
     * Show the daily brief reminder notification
     */
    fun showDailyReminderNotification() {
        if (!hasNotificationPermission()) {
            Log.w(TAG, "Notification permission not granted")
            return
        }

        val intent = Intent(context, MainActivity::class.java).apply {
            flags = Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_CLEAR_TASK
            putExtra("notification_type", "daily_brief_reminder")
        }

        val pendingIntent = PendingIntent.getActivity(
            context,
            0,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        val notification = NotificationCompat.Builder(context, CHANNEL_ID_DAILY_BRIEF)
            .setSmallIcon(R.drawable.ic_launcher_foreground)
            .setContentTitle("Good Morning!")
            .setContentText("Time for your Daily Brief. Tap to get caught up on emails, calendar, and news.")
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .setContentIntent(pendingIntent)
            .build()

        try {
            NotificationManagerCompat.from(context).notify(NOTIFICATION_ID_DAILY_REMINDER, notification)
            Log.d(TAG, "Daily reminder notification shown")
        } catch (e: SecurityException) {
            Log.e(TAG, "Failed to show notification: ${e.message}")
        }
    }

    /**
     * Sync notification settings with backend
     */
    suspend fun syncSettingsWithBackend(
        userId: String,
        briefingTime: String,
        timezone: String,
        enabled: Boolean,
        deviceToken: String? = null
    ) = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply {
                put("user_id", userId)
                put("briefing_time", briefingTime)
                put("timezone", timezone)
                put("notifications_enabled", enabled)
                if (deviceToken != null) {
                    put("device_token", deviceToken)
                    put("platform", "android")
                }
            }

            val request = Request.Builder()
                .url("${BuildConfig.API_BASE_URL}/notifications/settings")
                .post(json.toString().toRequestBody("application/json".toMediaType()))
                .build()

            okHttpClient.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    Log.d(TAG, "Notification settings synced with backend: $briefingTime $timezone")
                } else {
                    Log.w(TAG, "Backend returned status ${response.code} for notification settings")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to sync notification settings with backend: ${e.message}")
        }
    }

    /**
     * Register device token with backend
     */
    suspend fun registerTokenWithBackend(userId: String, token: String) = withContext(Dispatchers.IO) {
        try {
            val json = JSONObject().apply {
                put("user_id", userId)
                put("device_token", token)
                put("platform", "android")
            }

            val request = Request.Builder()
                .url("${BuildConfig.API_BASE_URL}/notifications/register")
                .post(json.toString().toRequestBody("application/json".toMediaType()))
                .build()

            okHttpClient.newCall(request).execute().use { response ->
                if (response.isSuccessful) {
                    preferencesManager.setFcmToken(token)
                    Log.d(TAG, "Device token registered with backend for user: $userId")
                } else {
                    Log.w(TAG, "Backend returned status ${response.code} for token registration")
                }
            }
        } catch (e: Exception) {
            Log.e(TAG, "Failed to register token with backend: ${e.message}")
        }
    }

    /**
     * Restore scheduled notification on app launch if it was enabled
     */
    suspend fun restoreScheduledNotificationIfNeeded() {
        val settings = preferencesManager.getNotificationSettingsSync()

        if (!settings.enabled) {
            Log.d(TAG, "Notifications disabled, not restoring")
            return
        }

        if (!hasNotificationPermission()) {
            Log.w(TAG, "Notification permission not granted, cannot restore")
            return
        }

        scheduleDailyNotification(settings.hour, settings.minute, settings.timezone)
        Log.d(TAG, "Restored daily notification schedule")
    }

    /**
     * Update notification settings (local + backend)
     */
    suspend fun updateSettings(
        hour: Int,
        minute: Int,
        timezone: String,
        enabled: Boolean
    ) {
        if (enabled) {
            scheduleDailyNotification(hour, minute, timezone)
        } else {
            cancelDailyNotification()
        }

        // Sync with backend
        val userId = preferencesManager.userEmail.first()
        if (!userId.isNullOrEmpty()) {
            val briefingTime = String.format("%02d:%02d", hour, minute)
            val token = preferencesManager.fcmToken.first()
            syncSettingsWithBackend(userId, briefingTime, timezone, enabled, token)
        }
    }
}
