package com.kreativekoala.audexa

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class AudexaApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
            // Daily Brief Channel
            val dailyBriefChannel = NotificationChannel(
                CHANNEL_ID_DAILY_BRIEF,
                "Daily Brief",
                NotificationManager.IMPORTANCE_HIGH
            ).apply {
                description = "Daily brief reminder notifications"
                enableVibration(true)
                setShowBadge(true)
            }

            val notificationManager = getSystemService(NotificationManager::class.java)
            notificationManager.createNotificationChannel(dailyBriefChannel)
        }
    }

    companion object {
        const val CHANNEL_ID_DAILY_BRIEF = "daily_brief_channel"
    }
}
