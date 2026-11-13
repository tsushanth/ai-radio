package com.kreativekoala.audexa

import com.kreativekoala.audexa.data.model.ContentLanguage
import com.kreativekoala.audexa.data.model.SupportedLanguage
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ContentLanguageTest {
    private fun code(raw: String?) = ContentLanguage.resolve(raw).language.code

    @Test fun supportedLanguagesPassThroughUnchanged() {
        for (c in listOf("en", "es", "fr", "de", "pt", "it")) {
            val r = ContentLanguage.resolve(c)
            assertEquals(c, r.language.code)
            assertFalse("$c must not count as substituted", r.substituted)
        }
    }

    @Test fun regionAndCaseVariantsAreSupportedToo() {
        assertEquals("pt", code("pt-BR"))
        assertEquals("pt", code("pt_PT"))
        assertEquals("es", code("ES"))
        assertEquals("fr", code("fr-CA"))
        assertFalse(ContentLanguage.resolve("de_AT").substituted)
    }

    @Test fun theLanguagesFromTheAuditFallBackToEnglish() {
        for (c in listOf("ja", "ko", "hi", "zh", "tl")) {
            val r = ContentLanguage.resolve(c)
            assertEquals("$c -> en", "en", r.language.code)
            assertTrue("$c must be reported as substituted", r.substituted)
            assertEquals(c, r.requested)
        }
    }

    @Test fun deviceLocaleFormsAreNormalised() {
        assertEquals("en", code("ja_JP"))
        assertEquals("en", code("zh-Hans-CN"))
        assertEquals("ja", ContentLanguage.resolve("ja-JP").requested)
        assertEquals("fil", ContentLanguage.resolve("fil-PH").requested) // Filipino as newer Android reports it
        assertEquals("en", code("fil"))
    }

    @Test fun otherUnsupportedLanguagesAreEnglish() {
        for (c in listOf("ru", "ar", "fa", "th", "tr", "vi", "id", "in", "nl", "pl", "ms", "he", "iw")) {
            assertEquals(c, "en", code(c))
            assertTrue(c, ContentLanguage.resolve(c).substituted)
        }
    }

    @Test fun closeRelativesMapToTheLanguageTheirSpeakersRead() {
        assertEquals("es", code("ca"))
        assertEquals("es", code("gl"))
        assertEquals("de", code("lb"))
        assertEquals("de", code("gsw"))
        assertEquals("fr", code("oc"))
        assertTrue(ContentLanguage.resolve("ca").substituted) // still tell the user
    }

    @Test fun missingOrJunkIsEnglishAndNotAnAnnouncement() {
        for (raw in listOf(null, "", "  ", "!", "x", "english", "12", "a-b")) {
            val r = ContentLanguage.resolve(raw)
            assertEquals("$raw", "en", r.language.code)
            assertFalse("$raw", r.substituted)
        }
    }

    @Test fun resultIsAlwaysAPodcastLanguage() {
        for (raw in SupportedLanguage.entries.map { it.code } + listOf("xx", "", "ja-JP", "zh_TW", "ca")) {
            assertTrue(raw, ContentLanguage.resolve(raw).language.podcastAvailable)
            assertTrue(raw, ContentLanguage.resolve(raw).language in ContentLanguage.SUPPORTED)
        }
    }

    @Test fun everyNonPodcastEnumEntryIsSubstituted() {
        for (l in SupportedLanguage.entries.filter { !it.podcastAvailable }) {
            assertTrue(l.code, ContentLanguage.resolve(l.code).substituted)
        }
        assertEquals(ContentLanguage.SUPPORTED, SupportedLanguage.PODCAST_LANGUAGES)
    }

    @Test fun supportedSetIsExactlyTheAgreedSix() {
        assertEquals(setOf("en", "es", "fr", "de", "pt", "it"), ContentLanguage.SUPPORTED.map { it.code }.toSet())
    }

    @Test fun migrationRewritesAnUnsupportedSavedValueAndRemembersIt() {
        val m = ContentLanguage.migrationFor("ja")!!
        assertEquals("en", m.newCode)
        assertEquals("ja", m.from)
        assertEquals("en", ContentLanguage.migrationFor("tl")!!.newCode)
        assertEquals("es", ContentLanguage.migrationFor("ca")!!.newCode)
    }

    @Test fun migrationLeavesGoodAndMissingValuesAlone() {
        assertNull(ContentLanguage.migrationFor(null))
        assertNull(ContentLanguage.migrationFor("en"))
        assertNull(ContentLanguage.migrationFor("pt"))
        assertNull(ContentLanguage.migrationFor("")) // blank reads as English already
    }

    @Test fun migrationIsIdempotent() {
        val first = ContentLanguage.migrationFor("ko")!!
        assertNull(ContentLanguage.migrationFor(first.newCode))
    }
}
