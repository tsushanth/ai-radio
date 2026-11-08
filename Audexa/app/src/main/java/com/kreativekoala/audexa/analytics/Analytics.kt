package com.kreativekoala.audexa.analytics

import android.app.Activity
import android.app.Application
import android.content.Context
import android.os.Bundle
import java.net.HttpURLConnection
import java.net.URL
import java.util.Locale
import java.util.UUID
import java.util.concurrent.Executors
import java.util.concurrent.TimeUnit

/**
 * Anonymous product analytics (first party, no third-party SDK). See docs/DATA-COLLECTION.md for exactly what is collected.
 *
 *   Analytics.init(this, BuildConfig.API_BASE_URL, versionName)   // Application.onCreate
 *   Analytics.track("topic_open", mapOf("topic_id" to id))        // allowlisted events only (the server rejects anything else)
 *   Analytics.listenStart(ListenContext(...)) / listenStop()      // from the player: counts real playing time
 *
 * Events are queued, sent in batches (when 20 are waiting, once a few minutes, and when the app goes to the background), kept
 * across restarts while offline, and never block the UI. The user can switch it off in Profile; that deletes the install id.
 * Never pass user content (topic text, search text, names, emails) as a property.
 */
object Analytics {
    private const val PREFS = "audexa_analytics"
    private const val FLUSH_EVERY_S = 120L
    private const val NEW_SESSION_AFTER_MS = 30 * 60_000L

    private val io = Executors.newSingleThreadScheduledExecutor { r -> Thread(r, "analytics").apply { isDaemon = true } }
    @Volatile private var engine: AnalyticsEngine? = null

    /** The user's app language, kept current by PreferencesManager; used when a player call site does not know the language. */
    @Volatile var preferredLanguage: String = "en"

    fun init(app: Application, apiBaseUrl: String, appVersion: String) {
        if (engine != null) return
        val prefs = app.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
        val endpoint = "$apiBaseUrl/events"
        val e = AnalyticsEngine(
            store = object : AnalyticsStore {
                override fun get(key: String): String? = prefs.getString(key, null)
                override fun put(key: String, value: String) { prefs.edit().putString(key, value).apply() }
                override fun remove(key: String) { prefs.edit().remove(key).apply() }
            },
            transport = AnalyticsTransport { body -> post(endpoint, body) },
            now = { System.currentTimeMillis() },
            newId = { UUID.randomUUID().toString() },
            appVersion = appVersion.takeIf { Regex("^[0-9A-Za-z._-]{1,20}$").matches(it) } ?: "unknown"
        )
        engine = e

        var started = 0
        var backgroundedAt = 0L
        app.registerActivityLifecycleCallbacks(object : Application.ActivityLifecycleCallbacks {
            override fun onActivityStarted(activity: Activity) {
                if (started++ == 0 && backgroundedAt != 0L && System.currentTimeMillis() - backgroundedAt > NEW_SESSION_AFTER_MS) {
                    trackAppOpen() // back after a long break: a new visit
                }
            }
            override fun onActivityStopped(activity: Activity) {
                if (--started == 0) {
                    backgroundedAt = System.currentTimeMillis()
                    io.execute { e.persist(); e.flush(force = true) } // listening is NOT stopped: radio keeps playing in the background
                }
            }
            override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
            override fun onActivityResumed(activity: Activity) {}
            override fun onActivityPaused(activity: Activity) {}
            override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
            override fun onActivityDestroyed(activity: Activity) {}
        })

        // Once a minute: report long listening; every FLUSH_EVERY_S seconds send what is queued.
        var ticks = 0L
        io.scheduleWithFixedDelay({
            try {
                e.checkpoint()
                if (++ticks % (FLUSH_EVERY_S / 60) == 0L) e.flush()
            } catch (_: Throwable) {
            }
        }, 60, 60, TimeUnit.SECONDS)
    }

    /** One app_open per process start and per return after a long break. */
    fun trackAppOpen() {
        track("app_open", mapOf("locale" to AnalyticsEngine.cleanLocale(Locale.getDefault().toLanguageTag())))
    }

    fun track(name: String, props: Map<String, Any> = emptyMap()) {
        val e = engine ?: return
        try {
            e.track(name, props)
            if (e.shouldFlushNow()) io.execute { try { e.flush() } catch (_: Throwable) {} }
        } catch (_: Throwable) {
            // analytics must never break the app
        }
    }

    fun listenStart(ctx: ListenContext) { try { engine?.listenStart(ctx) } catch (_: Throwable) {} }
    fun listenStop() { try { engine?.listenStop() } catch (_: Throwable) {} }

    fun isEnabled(): Boolean = try { engine?.isEnabled() ?: false } catch (_: Throwable) { false }

    /** The Profile switch. Off: stops collecting and deletes the install id, the queue and the first-play flag. */
    fun setEnabled(on: Boolean) { try { engine?.setEnabled(on) } catch (_: Throwable) {} }

    // Plain HttpURLConnection on purpose: no auth header, no cookies, no interceptors, and a fixed neutral User-Agent
    // (the default one carries the device model and Android version).
    private fun post(endpoint: String, body: String): Int {
        val conn = URL(endpoint).openConnection() as HttpURLConnection
        return try {
            conn.requestMethod = "POST"
            conn.doOutput = true
            conn.connectTimeout = 10_000
            conn.readTimeout = 10_000
            conn.setRequestProperty("Content-Type", "application/json")
            conn.setRequestProperty("User-Agent", "Audexa-Android")
            conn.outputStream.use { it.write(body.toByteArray()) }
            conn.responseCode
        } finally {
            conn.disconnect()
        }
    }
}
