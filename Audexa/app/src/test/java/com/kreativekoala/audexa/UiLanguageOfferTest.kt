package com.kreativekoala.audexa

import com.kreativekoala.audexa.data.model.UiLanguageOffer
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/** The onboarding offer "Show the app in <language> too?": when it appears and when it must stay silent. */
class UiLanguageOfferTest {
    private fun offer(
        content: String?, device: String = "en-US", override: String? = null, declined: Set<String> = emptySet(),
        enabled: Boolean = true, only: Set<String>? = null
    ) = UiLanguageOffer.decide(content, device, override, declined, enabled, only)?.tag

    @Test fun anEnglishPhoneThatPicksATranslatedLanguageIsOfferedIt() {
        assertEquals("es", offer("es"))
        assertEquals("de", offer("de"))
        assertEquals("fr", offer("fr"))
        assertEquals("pt-BR", offer("pt"))
        assertEquals("it", offer("it"))
        assertEquals("ja", offer("ja"))
        assertEquals("zh-CN", offer("zh"))
        assertEquals("fil", offer("fil"))
        assertEquals("fil", offer("tl"))
    }

    @Test fun theSevenNewLanguagesAreOffered() {
        for (c in listOf("cs", "el", "fi", "hu", "ro", "sv", "uk")) assertEquals(c, offer(c))
    }

    @Test fun noOfferWhenThereIsNoTranslationForTheLanguage() {
        assertNull(offer("sw"))
        assertNull(offer(""))
        assertNull(offer(null))
    }

    @Test fun noOfferWhenTheInterfaceAlreadyIsThatLanguage() {
        assertNull(offer("en", device = "en-GB"))
        assertNull(offer("es", device = "es-MX"))
        assertNull(offer("de", override = "de"))
        assertNull(offer("pt", device = "pt-PT")) // Portuguese phone: already Portuguese
    }

    @Test fun aPhoneAlreadyInATranslatedLanguageIsNotAskedAnything() {
        // German phone picks Spanish podcasts: the interface stays German (Follow phone covers it), no prompt.
        assertNull(offer("es", device = "de-DE"))
        assertNull(offer("cs", device = "fr-FR"))
    }

    @Test fun anUntranslatedPhoneLanguageFallsBackToEnglishSoItIsOffered() {
        assertEquals("es", offer("es", device = "sw-KE"))
    }

    @Test fun anExplicitAppLanguageMeansThePhoneLanguageIsNoLongerWhatIsShown() {
        assertEquals("fr", offer("fr", device = "de-DE", override = "en"))
        assertNull(offer("fr", device = "en-US", override = "fr"))
    }

    @Test fun aDeclinedLanguageIsNotOfferedAgain() {
        assertNull(offer("es", declined = setOf("es")))
        assertEquals("fr", offer("fr", declined = setOf("es")))
    }

    @Test fun theOfferSwitchCanTurnItOffOrLimitItToSomeLanguages() {
        assertNull(offer("es", enabled = false))
        assertEquals("es", offer("es", only = setOf("es", "de")))
        assertNull(offer("fr", only = setOf("es", "de")))
        assertEquals("cs", offer("cs", only = setOf("cs")))
    }

    @Test fun traditionalChinesePhoneIsOfferedSimplifiedChineseBecauseItSeesEnglishToday() {
        assertEquals("zh-CN", offer("zh", device = "zh-Hant-TW"))
    }
}
