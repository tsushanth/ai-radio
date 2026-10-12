package com.kreativekoala.audexa.service

import android.content.Context
import android.util.Log
import com.kreativekoala.audexa.BuildConfig
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
import java.util.concurrent.TimeUnit
import javax.inject.Inject
import javax.inject.Singleton

/**
 * Morning briefing: one local notification per day at a time the user picked,
 * whose text is built from the backend's read-only GET /topics/briefing
 * summary. Entirely on-device scheduling (no FCM): see NotificationService
 * for the alarm and DailyNotificationReceiver for the fire path.
 *
 * Guard rails owned here:
 *  - max one briefing per local calendar day (shouldShowNow / markShown)
 *  - quiet hours 22:00-06:00 local (a late-delivered alarm is dropped, not shown)
 *  - anonymous funnel events (random install id, no account identifiers)
 */
@Singleton
class BriefingManager @Inject constructor(
    @ApplicationContext private val context: Context,
    private val preferencesManager: PreferencesManager
) {
    data class Summary(val count: Int, val names: List<String>)

    enum class Gate { SHOW, QUIET_HOURS, ALREADY_SHOWN }

    companion object {
        private const val TAG = "BriefingManager"
        const val NOTIFICATION_TYPE = "daily_briefing"
        const val QUIET_START_HOUR = 22 // inclusive
        const val QUIET_END_HOUR = 6 // exclusive
        /** Times offered in the opt-in dialog; all outside quiet hours. */
        val OPT_IN_HOURS = intArrayOf(7, 8, 12, 18)
        const val DEFAULT_OPT_IN_INDEX = 0

        const val EVENT_OPTIN_SHOWN = "briefing_optin_shown"
        const val EVENT_OPTIN_ACCEPTED = "briefing_optin_accepted"
        const val EVENT_OPTIN_DECLINED = "briefing_optin_declined"
        const val EVENT_PERMISSION_DENIED = "briefing_permission_denied"
        const val EVENT_SHOWN = "briefing_shown"
        const val EVENT_SKIPPED_QUIET_HOURS = "briefing_skipped_quiet_hours"
        const val EVENT_OPENED = "briefing_opened"
    }

    private val client = OkHttpClient.Builder()
        .connectTimeout(4, TimeUnit.SECONDS)
        .readTimeout(4, TimeUnit.SECONDS)
        .callTimeout(6, TimeUnit.SECONDS)
        .build()

    private fun isQuietHour(hour: Int) = hour >= QUIET_START_HOUR || hour < QUIET_END_HOUR

    /**
     * Local-clock gate. Pure of side effects; call markShown() after posting.
     * Quiet hours only protect against a late-delivered alarm: if the user
     * deliberately picked a time inside the quiet window in Profile, honour it.
     */
    suspend fun gate(now: Calendar = Calendar.getInstance()): Gate {
        val chosenHour = preferencesManager.getNotificationSettingsSync().hour
        if (!isQuietHour(chosenHour) && isQuietHour(now.get(Calendar.HOUR_OF_DAY))) {
            return Gate.QUIET_HOURS
        }
        if (preferencesManager.getLastBriefingDate() == localDateKey(now)) return Gate.ALREADY_SHOWN
        return Gate.SHOW
    }

    suspend fun markShown(now: Calendar = Calendar.getInstance()) {
        preferencesManager.setLastBriefingDate(localDateKey(now))
    }

    private fun localDateKey(c: Calendar): String = "%04d-%02d-%02d".format(
        c.get(Calendar.YEAR), c.get(Calendar.MONTH) + 1, c.get(Calendar.DAY_OF_MONTH)
    )

    /** Returns null on any failure so the caller falls back to the static copy. */
    suspend fun fetchSummary(): Summary? = withContext(Dispatchers.IO) {
        try {
            val lang = preferencesManager.preferredLanguage.first()
            val request = Request.Builder()
                .url("${BuildConfig.API_BASE_URL}/topics/briefing?lang=$lang")
                .build()
            client.newCall(request).execute().use { response ->
                if (!response.isSuccessful) return@withContext null
                val body = response.body?.string().orEmpty()
                val data = JSONObject(body).optJSONObject("data") ?: return@withContext null
                val headlines = data.optJSONArray("headlines")
                val names = mutableListOf<String>()
                if (headlines != null) {
                    for (i in 0 until headlines.length()) {
                        val name = headlines.optJSONObject(i)?.optString("name").orEmpty().trim()
                        if (name.isNotEmpty()) names.add(name)
                    }
                }
                Summary(data.optInt("count", 0), names)
            }
        } catch (e: Exception) {
            Log.w(TAG, "briefing summary unavailable: ${e.message}")
            null
        }
    }

    /** Title and body. Falls back to a plain true statement when no summary. */
    fun buildCopy(summary: Summary?): Pair<String, String> {
        val title = context.getString(R.string.briefing_notification_title)
        if (summary == null || summary.count <= 0 || summary.names.isEmpty()) {
            return title to context.getString(R.string.briefing_notification_body_fallback)
        }
        val extra = summary.count - summary.names.size
        var list = summary.names.joinToString(", ")
        if (extra > 0) {
            list = context.getString(R.string.briefing_names_with_more, list, extra)
        }
        val body = context.resources.getQuantityString(
            R.plurals.briefing_notification_body_topics, summary.count, summary.count, list
        )
        return title to body
    }

    /**
     * Fire-and-forget anonymous event (backend logs one line; nothing stored).
     * Must never throw or block UI; callers may invoke from any coroutine.
     */
    suspend fun logEvent(event: String, hour: Int? = null, topicCount: Int? = null) {
        withContext(Dispatchers.IO) {
            try {
                val json = JSONObject().apply {
                    put("event", event)
                    put("install_id", preferencesManager.getOrCreateBriefingInstallId())
                    if (hour != null) put("hour", hour)
                    if (topicCount != null) put("topic_count", topicCount)
                }
                val request = Request.Builder()
                    .url("${BuildConfig.API_BASE_URL}/notifications/event")
                    .post(json.toString().toRequestBody("application/json".toMediaType()))
                    .build()
                client.newCall(request).execute().close()
            } catch (e: Exception) {
                Log.d(TAG, "event $event not sent: ${e.message}")
            }
        }
    }
}
