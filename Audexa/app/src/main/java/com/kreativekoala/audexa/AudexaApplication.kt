package com.kreativekoala.audexa

import android.app.Application
import android.app.NotificationChannel
import android.app.NotificationManager
import android.os.Build
import android.util.Log
import com.revenuecat.purchases.LogLevel
import com.revenuecat.purchases.Purchases
import com.revenuecat.purchases.PurchasesConfiguration
import com.kreativekoala.paywallkit.manager.ExperimentManager
import com.kreativekoala.paywallkit.manager.PromoCodeManager
import com.kreativekoala.audexa.analytics.Analytics
import com.kreativekoala.audexa.data.local.PreferencesManager
import dagger.hilt.android.HiltAndroidApp
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch
import javax.inject.Inject

@HiltAndroidApp
class AudexaApplication : Application() {

    @Inject lateinit var preferencesManager: PreferencesManager

    override fun onCreate() {
        super.onCreate()
        com.kreativekoala.audexa.monitoring.FailureReporter.init(
            this, "audexa", FAILURE_REPORTER_KEY,
            runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull() ?: "unknown"
        )
        // Anonymous product analytics (first party; the user can switch it off in Profile). See docs/DATA-COLLECTION.md.
        val versionName = runCatching { packageManager.getPackageInfo(packageName, 0).versionName }.getOrNull() ?: "unknown"
        Analytics.init(this, BuildConfig.API_BASE_URL, versionName)
        Analytics.trackAppOpen()
        CoroutineScope(Dispatchers.IO).launch {
            runCatching { Analytics.preferredLanguage = preferencesManager.preferredLanguage.first() }
        }
        ExperimentManager.init(this)
        PromoCodeManager.init(this)
        configureRevenueCat()
        createNotificationChannels()
        // Ratings: asked rarely, only after a finished episode or 10 minutes of radio, never at launch (see RatingKit v2).
        com.kreativekoala.ratingkit.RatingKit.init(this, appId = "audexa")
    }

    private fun configureRevenueCat() {
        Purchases.logLevel = if (BuildConfig.DEBUG) LogLevel.DEBUG else LogLevel.ERROR
        Purchases.configure(
            PurchasesConfiguration.Builder(this, REVENUECAT_API_KEY).build()
        )
        Purchases.sharedInstance.setAttributes(
            mapOf(
                "app_name" to "Audexa",
                "platform" to "android"
            )
        )
        Log.d("AudexaApplication", "RevenueCat configured")
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
        // Public ingest key from the app-failure-reporter Worker (APP_KEYS["audexa"]). Empty = reporter inert.
        private const val FAILURE_REPORTER_KEY = "0ddf06363a221d55732df23e7dab05af"
        const val CHANNEL_ID_DAILY_BRIEF = "daily_brief_channel"
        // TODO: Replace with your Google public API key from RevenueCat dashboard
        // Go to RevenueCat > Audexa project > API Keys > Google public key (goog_xxx)
        const val REVENUECAT_API_KEY = "goog_LKFhnHmKhKjfezMFzViXElCPLzg"
    }
}
