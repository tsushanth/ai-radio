package com.kreativekoala.audexa

import android.app.Application
import android.app.Service
import android.content.Intent
import android.os.IBinder
import androidx.media3.session.DefaultMediaNotificationProvider
import com.kreativekoala.audexa.service.AudioPlaybackService
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config

/**
 * A media button that started the playback service with nothing to play crashed the app with
 * "startForegroundService() did not then call startForeground()". Such a start must be answered and the service stopped.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [26, 30, 34], application = Application::class)
class IdleMediaButtonStartTest {

    class PlainService : Service() {
        override fun onBind(intent: Intent?): IBinder? = null
    }

    private val service = Robolectric.buildService(PlainService::class.java).create().get()

    private fun answer(intent: Intent?, mediaItems: Int) =
        AudioPlaybackService.answerIdleMediaButtonStart(service, intent, 1, mediaItems)

    @Test
    fun mediaButtonWithNothingToPlayGoesForegroundThenStops() {
        assertTrue(answer(Intent(Intent.ACTION_MEDIA_BUTTON), mediaItems = 0))
        val shadow = shadowOf(service)
        // Robolectric forgets the notification once it is removed, but keeps its id.
        assertEquals(DefaultMediaNotificationProvider.DEFAULT_NOTIFICATION_ID, shadow.lastForegroundNotificationId)
        assertTrue(shadow.isForegroundStopped)
        assertTrue(shadow.isStoppedBySelf)
    }

    @Test
    fun mediaButtonWithSomethingToPlayIsLeftToMedia3() {
        assertFalse(answer(Intent(Intent.ACTION_MEDIA_BUTTON), mediaItems = 1))
        assertEquals(0, shadowOf(service).lastForegroundNotificationId)
        assertFalse(shadowOf(service).isStoppedBySelf)
    }

    @Test
    fun otherStartsAreLeftAlone() {
        assertFalse(answer(null, mediaItems = 0))
        assertFalse(answer(Intent(), mediaItems = 0))
        assertEquals(0, shadowOf(service).lastForegroundNotificationId)
    }
}
