package com.kreativekoala.audexa.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

@AndroidEntryPoint
class DailyNotificationReceiver : BroadcastReceiver() {

    @Inject
    lateinit var notificationService: NotificationService

    override fun onReceive(context: Context, intent: Intent) {
        Log.d("DailyNotificationReceiver", "Daily notification alarm triggered")
        notificationService.showDailyReminderNotification()
    }
}
