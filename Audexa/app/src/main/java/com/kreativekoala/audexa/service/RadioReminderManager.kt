package com.kreativekoala.audexa.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build
import android.util.Log
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.data.repository.TopicRepository
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.withContext
import org.json.JSONArray
import org.json.JSONObject
import java.net.HttpURLConnection
import java.net.URL
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Schedules local notifications for bookmarked topics about to play on the
 * radio. Polls the orchestrator's /api/upcoming-plays endpoint, matches
 * predicted plays against the user's bookmarks, and arms an AlarmManager
 * alarm per match.
 *
 * Why this design (vs. server-side push):
 *   Android has no FCM/OneSignal wiring today — the orchestrator can't reach
 *   the device directly. We sidestep that by having the device pull the
 *   schedule and arm local alarms, the same pattern the daily-brief reminder
 *   already uses.
 *
 * Caveats:
 *   - Only covers topics already in the ready queue (~next 30-60 min). Topics
 *     not yet enqueued can't be predicted.
 *   - Predicted play times drift as the orchestrator queue churns; we re-poll
 *     on app foreground to refresh.
 *   - Dedupes per-day so a topic that rotates twice in one day doesn't double-fire.
 */
@Singleton
class RadioReminderManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferencesManager: PreferencesManager,
    private val topicRepository: TopicRepository
) {
    companion object {
        private const val TAG = "RadioReminderManager"
        private const val UPCOMING_PLAYS_URL =
            "http://178.156.192.31:8081/api/upcoming-plays"
        // Base for alarm PendingIntent request codes — we hash topic_id into the
        // 4 lowest bits' worth of slot below this. Keep clear of DailyNotification's
        // request code (2001).
        private const val REQUEST_CODE_BASE = 10000
        const val EXTRA_TOPIC_ID = "topic_id"
        const val EXTRA_TOPIC_NAME = "topic_name"
    }

    /**
     * Pull the predicted queue, match against bookmarks, schedule alarms for
     * matches that haven't already fired today. Safe to call from app start
     * and on every bookmark change — alarms are keyed by topic_id and replaced
     * (FLAG_UPDATE_CURRENT) rather than duplicated.
     */
    suspend fun refresh() = withContext(Dispatchers.IO) {
        try {
            val bookmarked = preferencesManager.bookmarkedTopics.first()
            if (bookmarked.isEmpty()) {
                Log.d(TAG, "no bookmarks → nothing to schedule")
                return@withContext
            }

            val lang = preferencesManager.preferredLanguage.first()
            val topics = topicRepository.getCachedTopics().orEmpty()
            if (topics.isEmpty()) {
                Log.d(TAG, "topics not cached yet → skipping this cycle")
                return@withContext
            }

            // Build display-name → topic.id map. The orchestrator returns the
            // queue's topic_name verbatim (the localized title for podcasts,
            // the topic.name for hardcoded radio topics). We match against
            // both localizedNames[lang] and name to cover either case.
            val nameToId = mutableMapOf<String, String>()
            for (t in topics) {
                nameToId[t.name.trim()] = t.id
                // Topic.kt doesn't currently expose localized_names from Supabase;
                // fall back to `name` is fine because the localized name is what
                // getTopics(lang=X) already returns as t.name from the backend.
            }

            val upcoming = fetchUpcomingPlays(lang)
            if (upcoming.isEmpty()) {
                Log.d(TAG, "no upcoming plays in queue")
                return@withContext
            }

            val nowMs = System.currentTimeMillis()
            val alreadyScheduledToday = preferencesManager.radioRemindersFiredToday.first()
            var scheduled = 0
            var skipped = 0

            for (play in upcoming) {
                val topicId = nameToId[play.topicName.trim()] ?: continue
                if (topicId !in bookmarked) continue

                val dedupeKey = "${todayKey()}:$topicId"
                if (dedupeKey in alreadyScheduledToday) {
                    skipped++
                    continue
                }

                val triggerMs = play.estimatedPlayTimeMs
                // Skip past or near-now times — the user can't usefully react
                // and the orchestrator's prediction may have drifted.
                if (triggerMs - nowMs < 30_000) {
                    skipped++
                    continue
                }

                scheduleAlarm(topicId, play.topicName, triggerMs)
                preferencesManager.markRadioReminderScheduled(dedupeKey)
                scheduled++
            }

            Log.d(TAG, "refresh: scheduled=$scheduled skipped=$skipped from ${upcoming.size} upcoming")
        } catch (e: Exception) {
            Log.w(TAG, "refresh failed: ${e.message}")
        }
    }

    /**
     * Cancel any scheduled alarm for the given topic. Called when the user
     * un-bookmarks. Uses the same request-code derivation as scheduleAlarm
     * so FLAG_UPDATE_CURRENT finds the existing PendingIntent.
     */
    fun cancelForTopic(topicId: String) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, RadioTopicReminderReceiver::class.java).apply {
            putExtra(EXTRA_TOPIC_ID, topicId)
        }
        val pi = PendingIntent.getBroadcast(
            context,
            requestCodeFor(topicId),
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        )
        if (pi != null) {
            alarmManager.cancel(pi)
            pi.cancel()
            Log.d(TAG, "cancelled alarm for $topicId")
        }
    }

    private fun scheduleAlarm(topicId: String, topicName: String, triggerMs: Long) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as AlarmManager
        val intent = Intent(context, RadioTopicReminderReceiver::class.java).apply {
            putExtra(EXTRA_TOPIC_ID, topicId)
            putExtra(EXTRA_TOPIC_NAME, topicName)
        }
        val pi = PendingIntent.getBroadcast(
            context,
            requestCodeFor(topicId),
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )

        // On Android 12+ setExactAndAllowWhileIdle requires SCHEDULE_EXACT_ALARM
        // (we declared it in the manifest) and falls back gracefully to inexact
        // if the user denies the special-access permission.
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S &&
            !alarmManager.canScheduleExactAlarms()) {
            alarmManager.set(AlarmManager.RTC_WAKEUP, triggerMs, pi)
            Log.d(TAG, "scheduled INEXACT alarm '$topicName' at $triggerMs")
        } else {
            alarmManager.setExactAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerMs, pi)
            Log.d(TAG, "scheduled exact alarm '$topicName' at $triggerMs")
        }
    }

    private fun requestCodeFor(topicId: String): Int =
        REQUEST_CODE_BASE + (topicId.hashCode() and 0xFFFF)

    private fun todayKey(): String {
        val cal = java.util.Calendar.getInstance(java.util.TimeZone.getTimeZone("UTC"))
        return "%04d-%02d-%02d".format(
            cal.get(java.util.Calendar.YEAR),
            cal.get(java.util.Calendar.MONTH) + 1,
            cal.get(java.util.Calendar.DAY_OF_MONTH),
        )
    }

    /** Plain HttpURLConnection — matches LiveRadioViewModel's pattern. */
    private fun fetchUpcomingPlays(lang: String): List<UpcomingPlay> {
        val url = URL("$UPCOMING_PLAYS_URL?lang=$lang")
        val conn = (url.openConnection() as HttpURLConnection).apply {
            requestMethod = "GET"
            connectTimeout = 10_000
            readTimeout = 15_000
        }
        try {
            if (conn.responseCode != 200) {
                Log.w(TAG, "upcoming-plays returned ${conn.responseCode}")
                return emptyList()
            }
            val body = conn.inputStream.bufferedReader().use { it.readText() }
            return parseUpcomingPlays(body)
        } finally {
            conn.disconnect()
        }
    }

    private fun parseUpcomingPlays(body: String): List<UpcomingPlay> {
        val root = JSONObject(body)
        val arr: JSONArray = root.optJSONArray("upcoming") ?: return emptyList()
        val out = mutableListOf<UpcomingPlay>()
        for (i in 0 until arr.length()) {
            val item = arr.getJSONObject(i)
            val name = item.optString("topic_name", "").trim()
            val timeStr = item.optString("estimated_play_time", "")
            if (name.isEmpty() || timeStr.isEmpty()) continue
            val ms = try {
                OffsetDateTime.parse(timeStr, DateTimeFormatter.ISO_OFFSET_DATE_TIME)
                    .toInstant().toEpochMilli()
            } catch (e: Exception) {
                continue
            }
            out.add(UpcomingPlay(name, ms))
        }
        return out
    }

    private data class UpcomingPlay(val topicName: String, val estimatedPlayTimeMs: Long)
}
