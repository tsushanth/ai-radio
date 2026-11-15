package com.kreativekoala.audexa

import com.kreativekoala.audexa.data.model.UiLanguages
import com.kreativekoala.audexa.util.AppLanguageManager
import com.kreativekoala.audexa.util.AppLocaleStore
import com.kreativekoala.audexa.util.UiLanguageOfferStore
import kotlinx.coroutines.runBlocking
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AppLanguageManagerTest {
    /** Stands in for AppCompatDelegate.setApplicationLocales: records every call. */
    private class FakeStore(var tag: String? = null) : AppLocaleStore {
        val calls = mutableListOf<String?>()
        override fun get() = tag
        override fun set(tag: String?) { calls += tag; this.tag = tag }
    }

    private class FakeOffers(val declined: MutableSet<String> = mutableSetOf()) : UiLanguageOfferStore {
        override suspend fun declined(): Set<String> = declined.toSet()
        override suspend fun decline(tag: String) { declined += tag }
    }

    private fun manager(store: FakeStore = FakeStore(), offers: FakeOffers = FakeOffers()) = AppLanguageManager(store, offers)

    @Test fun eachNewLanguageCallsSetApplicationLocalesWithItsOwnTag() {
        for (t in listOf("cs", "el", "fi", "hu", "ro", "sv", "uk", "fil")) {
            val store = FakeStore()
            assertTrue(manager(store).select(t))
            assertEquals("tag $t", listOf<String?>(t), store.calls)
            assertEquals(t, manager(store).selected()!!.tag)
        }
    }

    @Test fun regionalTagsReachThePlatformWithTheirResourceTag() {
        val store = FakeStore()
        manager(store).select("pt-BR")
        manager(store).select("zh-CN") // the exact tag of the zh-rCN folder: a script-only "zh-Hans" also matches the plain values-zh of a library
        manager(store).select("in")
        assertEquals(listOf<String?>("pt-BR", "zh-CN", "id"), store.calls)
    }

    @Test fun followPhoneClearsTheOverride() {
        val store = FakeStore("de")
        assertTrue(manager(store).select(null))
        assertEquals(listOf<String?>(null), store.calls)
        assertNull(manager(store).selected())
    }

    @Test fun selectingTheCurrentLanguageDoesNotRestartTheScreen() {
        val store = FakeStore("fi")
        manager(store).select("fi")
        assertTrue(store.calls.isEmpty())
        store.tag = null
        manager(store).select(null) // already following the phone
        assertTrue(store.calls.isEmpty())
    }

    @Test fun anUnknownTagIsRejectedAndNothingChanges() {
        val store = FakeStore("de")
        assertFalse(manager(store).select("xx"))
        assertTrue(store.calls.isEmpty())
        assertEquals("de", manager(store).selected()!!.tag)
    }

    @Test fun theSettingSurvivesARestartBecauseItIsReadBackFromTheStore() {
        val store = FakeStore()
        manager(store).select("hu")
        assertEquals("hu", manager(store).selected()!!.tag) // a new manager (new process) reads the same stored tag
    }

    @Test fun yesSwitchesTheInterface() = runBlocking {
        val store = FakeStore()
        val m = manager(store)
        val offer = m.offerFor("es", "en-US")!!
        m.acceptOffer(offer)
        assertEquals(listOf<String?>("es"), store.calls)
        assertNull(m.offerFor("es", "en-US"))
    }

    @Test fun noKeepsTheInterfaceAndIsRemembered() = runBlocking {
        val store = FakeStore()
        val offers = FakeOffers()
        val m = manager(store, offers)
        val offer = m.offerFor("de", "en-US")!!
        m.declineOffer(offer)
        assertTrue("No must never touch the app language", store.calls.isEmpty())
        assertNull(store.tag)
        assertEquals(setOf("de"), offers.declined)
        assertNull("not offered again", m.offerFor("de", "en-US"))
        assertEquals("another language is still offered", "fr", m.offerFor("fr", "en-US")!!.tag)
    }

    @Test fun neverSwitchesWithoutAnAnswer() = runBlocking {
        val store = FakeStore()
        val m = manager(store)
        m.offerFor("cs", "en-US")
        m.offerFor("el", "en-US")
        assertTrue(store.calls.isEmpty())
    }

    @Test fun everyShippedLanguageIsAcceptedByTheSetter() {
        for (l in UiLanguages.ALL) assertTrue(l.tag, manager().select(l.tag))
    }
}
