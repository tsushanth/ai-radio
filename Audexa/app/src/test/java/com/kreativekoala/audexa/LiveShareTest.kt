package com.kreativekoala.audexa

import com.kreativekoala.audexa.util.LiveShare
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class LiveShareTest {
    @Test fun languageFromStreamUrl() {
        assertEquals("en", LiveShare.languageFromStreamUrl("https://radio.audexa.app/stream"))
        assertEquals("fr", LiveShare.languageFromStreamUrl("https://radio.audexa.app/stream-fr"))
        assertEquals("en", LiveShare.languageFromStreamUrl("https://radio.audexa.app/stream-xx"))
    }

    @Test fun shareUrlCarriesUtmAndRoundTrips() {
        val url = LiveShare.buildShareUrl("en")
        assertTrue(url.startsWith("https://audexa.app/live?lang=en"))
        assertTrue(url.contains("utm_source=audexa_android"))
        assertTrue(url.contains("utm_medium=share"))
        assertTrue(url.contains("utm_campaign=live_share"))
        assertEquals("en", LiveShare.parseLiveLink(url))
        assertEquals("fr", LiveShare.parseLiveLink(LiveShare.buildShareUrl("fr")))
        // Old links use lang=tl, the app's tag is fil, and the web page only knows tl.
        assertEquals("fil", LiveShare.parseLiveLink("https://audexa.app/live?lang=tl"))
        assertEquals("fil", LiveShare.parseLiveLink("https://audexa.app/live?lang=fil"))
        assertEquals("fil", LiveShare.parseLiveLink(LiveShare.buildShareUrl("fil")))
        assertTrue(LiveShare.buildShareUrl("fil").contains("lang=tl"))
        assertEquals("fil", LiveShare.languageFromStreamUrl("https://radio.audexa.app/stream-tl"))
    }

    @Test fun parseIgnoresOtherLinks() {
        assertNull(LiveShare.parseLiveLink(null))
        assertNull(LiveShare.parseLiveLink(""))
        assertNull(LiveShare.parseLiveLink("http://audexa.app/live"))
        assertNull(LiveShare.parseLiveLink("https://evil.example/live"))
        assertNull(LiveShare.parseLiveLink("https://audexa.app.evil.example/live"))
        assertNull(LiveShare.parseLiveLink("https://audexa.app/episodes"))
        assertNull(LiveShare.parseLiveLink("not a url"))
    }

    @Test fun unknownOrMissingLangFallsBackToEnglish() {
        assertEquals("en", LiveShare.parseLiveLink("https://audexa.app/live"))
        assertEquals("en", LiveShare.parseLiveLink("https://audexa.app/live?lang=zz"))
    }

    private fun share(station: String, topic: String?, url: String) = LiveShare.buildShareText(
        station, topic, url,
        withTopic = { s, t, u -> "$s is on air right now with: $t. It is an AI-generated news and talk station. Tune in live: $u" },
        withoutTopic = { s, u -> "I'm listening to $s, an AI-generated news and talk station. Tune in live: $u" }
    )

    @Test fun shareTextNamesTopicOnlyWhenKnown() {
        val url = "https://audexa.app/live?lang=en"
        val with = share("Audexa Radio", "[en] US Politics", url)
        assertTrue(with.contains("US Politics"))
        assertFalse(with.contains("[en]"))
        val without = share("Audexa Radio", null, url)
        assertFalse(without.contains("on air right now with"))
        assertFalse(share("Audexa Radio", "  ", url).contains("with:"))
    }

    @Test fun shareTextMakesNoListenerClaims() {
        val text = share("Audexa Radio", "World Update", "https://audexa.app/live")
        assertFalse(text.contains("listeners", ignoreCase = true))
        assertTrue(text.contains("AI-generated"))
    }
}
