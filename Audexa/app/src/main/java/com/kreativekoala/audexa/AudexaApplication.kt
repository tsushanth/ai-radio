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
import dagger.hilt.android.HiltAndroidApp

@HiltAndroidApp
class AudexaApplication : Application() {

    override fun onCreate() {
        super.onCreate()
        ExperimentManager.init(this)
        PromoCodeManager.init(this)
        configureRevenueCat()
        createNotificationChannels()
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
        const val CHANNEL_ID_DAILY_BRIEF = "daily_brief_channel"
        // TODO: Replace with your Google public API key from RevenueCat dashboard
        // Go to RevenueCat > Audexa project > API Keys > Google public key (goog_xxx)
        const val REVENUECAT_API_KEY = "goog_LKFhnHmKhKjfezMFzViXElCPLzg"
    }
}
