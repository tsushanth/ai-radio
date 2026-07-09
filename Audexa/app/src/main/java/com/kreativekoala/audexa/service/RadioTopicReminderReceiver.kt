package com.kreativekoala.audexa.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import dagger.hilt.android.AndroidEntryPoint
import javax.inject.Inject

/**
 * Fired by AlarmManager when a bookmarked topic's predicted play time hits.
 * Posts a notification that deep-links to the live radio view. See
 * [RadioReminderManager] for how the alarm is armed.
 */
@AndroidEntryPoint
class RadioTopicReminderReceiver : BroadcastReceiver() {

    @Inject
    lateinit var notificationService: NotificationService

    override fun onReceive(context: Context, intent: Intent) {
        val topicId = intent.getStringExtra(RadioReminderManager.EXTRA_TOPIC_ID) ?: return
        val topicName = intent.getStringExtra(RadioReminderManager.EXTRA_TOPIC_NAME) ?: topicId
        Log.d("RadioTopicReminderRx", "alarm: $topicName ($topicId)")
        notificationService.showRadioTopicNotification(topicId, topicName)
    }
}
