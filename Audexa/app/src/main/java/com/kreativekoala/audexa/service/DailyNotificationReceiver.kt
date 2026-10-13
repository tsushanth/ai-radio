package com.kreativekoala.audexa.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.util.Log
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withTimeoutOrNull
import javax.inject.Inject

@AndroidEntryPoint
class DailyNotificationReceiver : BroadcastReceiver() {

    @Inject
    lateinit var notificationService: NotificationService

    @Inject
    lateinit var briefingManager: BriefingManager

    override fun onReceive(context: Context, intent: Intent) {
        Log.d("DailyNotificationReceiver", "Daily notification alarm triggered")

        // The text needs one short network call, so hold the receiver open
        // (goAsync) and bound the whole thing well under the ~10s ANR limit.
        val pending = goAsync()
        CoroutineScope(Dispatchers.IO).launch {
            try {
                withTimeoutOrNull(8_000) { fire() }
            } catch (e: Exception) {
                Log.w("DailyNotificationReceiver", "briefing failed: ${e.message}")
            } finally {
                pending.finish()
            }
        }
    }

    private suspend fun fire() {
        when (briefingManager.gate()) {
            BriefingManager.Gate.QUIET_HOURS ->
                briefingManager.logEvent(BriefingManager.EVENT_SKIPPED_QUIET_HOURS)
            BriefingManager.Gate.ALREADY_SHOWN -> Unit
            BriefingManager.Gate.SHOW -> {
                val summary = withTimeoutOrNull(6_000) { briefingManager.fetchSummary() }
                val (title, body) = briefingManager.buildCopy(summary)
                if (notificationService.showDailyReminderNotification(title, body)) {
                    briefingManager.markShown()
                    briefingManager.logEvent(
                        BriefingManager.EVENT_SHOWN,
                        topicCount = summary?.count
                    )
                }
            }
        }
    }
}
