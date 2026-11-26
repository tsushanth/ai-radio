package com.kreativekoala.audexa.tts

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import androidx.work.ForegroundInfo
import androidx.work.ForegroundUpdater
import androidx.work.testing.TestListenableWorkerBuilder
import androidx.work.impl.utils.futures.SettableFuture
import com.kreativekoala.audexa.tts.kokoro.KokoroDownloadWorker
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/**
 * The voice download crashed the app on Android 14+: it started a `dataSync` foreground service that the manifest
 * does not declare. It must not ask for a foreground service there; older versions keep the progress notification.
 */
@RunWith(RobolectricTestRunner::class)
class KokoroDownloadForegroundTest {

    private fun foregroundRequests(): List<ForegroundInfo> {
        val requests = mutableListOf<ForegroundInfo>()
        val recorder = ForegroundUpdater { _, _, info ->
            requests += info
            SettableFuture.create<Void>().apply { set(null) }
        }
        val worker = TestListenableWorkerBuilder<KokoroDownloadWorker>(ApplicationProvider.getApplicationContext<Context>())
            .setForegroundUpdater(recorder)
            .build()
        runBlocking { worker.showProgressNotification(percent = 10, downloadedMb = 8, totalMb = 80) }
        return requests
    }

    @Test @Config(sdk = [34], application = Application::class)
    fun noForegroundServiceOnAndroid14() {
        assertEquals(0, foregroundRequests().size)
    }

    @Test @Config(sdk = [33], application = Application::class)
    fun progressNotificationKeptOnAndroid13() {
        assertEquals(listOf(KokoroDownloadWorker.NOTIFICATION_ID), foregroundRequests().map { it.notificationId })
    }
}
