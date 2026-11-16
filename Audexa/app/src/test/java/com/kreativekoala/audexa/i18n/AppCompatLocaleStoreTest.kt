package com.kreativekoala.audexa.i18n

import android.app.Application
import androidx.appcompat.app.AppCompatActivity
import com.kreativekoala.audexa.util.AppCompatLocaleStore
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.Robolectric
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

/** A bare AppCompat activity so AppCompatDelegate has a window to apply locales to. */
class LocaleHostActivity : AppCompatActivity()

/** The real per-app language API (AppCompatDelegate.setApplicationLocales), on Android 13+ behaviour and on older. */
@RunWith(RobolectricTestRunner::class)
class AppCompatLocaleStoreTest {
    private fun roundTrip() {
        Robolectric.buildActivity(LocaleHostActivity::class.java).setup()
        val store = AppCompatLocaleStore()
        assertNull("starts on Follow phone", store.get())
        for (tag in listOf("cs", "el", "fi", "hu", "ro", "sv", "uk", "fil", "pt-BR", "zh-CN", "id")) {
            store.set(tag)
            assertEquals(tag, store.get())
        }
        store.set(null)
        assertNull(store.get())
    }

    @Test @Config(sdk = [34], application = Application::class) fun roundTripOnAndroid14() = roundTrip()

    @Test @Config(sdk = [30], application = Application::class) fun roundTripBeforeAndroid13() = roundTrip()
}
