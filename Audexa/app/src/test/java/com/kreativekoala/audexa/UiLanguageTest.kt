package com.kreativekoala.audexa

import com.kreativekoala.audexa.data.model.UiLanguages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Test

class UiLanguageTest {
    @Test fun theSevenNewLanguagesMapToTheirOwnTag() {
        for (c in listOf("cs", "el", "fi", "hu", "ro", "sv", "uk")) {
            val ui = UiLanguages.fromTag(c)
            assertNotNull("$c must be an interface language", ui)
            assertEquals(c, ui!!.tag)
            assertEquals("values-$c", ui.resFolder)
        }
    }

    @Test fun filipinoUsesFilAndTheOldTlTag() {
        assertEquals("fil", UiLanguages.fromTag("fil")!!.tag)
        assertEquals("fil", UiLanguages.fromTag("tl")!!.tag)
        assertEquals("fil", UiLanguages.forContentLanguage("fil")!!.tag)
        assertEquals("fil", UiLanguages.forContentLanguage("tl")!!.tag)
        assertEquals("values-fil", UiLanguages.fromTag("fil")!!.resFolder)
    }

    @Test fun regionalTagsAndLegacyCodes() {
        assertEquals("pt-BR", UiLanguages.fromTag("pt-BR")!!.tag)
        assertEquals("pt-BR", UiLanguages.fromTag("pt_PT")!!.tag) // Portugal gets the Brazilian translation, as Android resolves it
        assertEquals("zh-Hans", UiLanguages.fromTag("zh-CN")!!.tag)
        assertEquals("id", UiLanguages.fromTag("in")!!.tag) // Java's old code for Indonesian
        assertEquals("values-in", UiLanguages.fromTag("id")!!.resFolder)
        assertEquals("de", UiLanguages.fromTag("de-AT")!!.tag)
        assertNull(UiLanguages.fromTag("sw"))
        assertNull(UiLanguages.fromTag(""))
        assertNull(UiLanguages.fromTag(null))
    }

    @Test fun contentLanguageCodesMapToTheInterfaceTag() {
        assertEquals("pt-BR", UiLanguages.forContentLanguage("pt")!!.tag)
        assertEquals("zh-Hans", UiLanguages.forContentLanguage("zh")!!.tag)
        assertEquals("es", UiLanguages.forContentLanguage("es")!!.tag)
        assertEquals("cs", UiLanguages.forContentLanguage("cs")!!.tag)
        assertEquals("id", UiLanguages.forContentLanguage("in")!!.tag)
        assertNull(UiLanguages.forContentLanguage("sw"))
        assertNull(UiLanguages.forContentLanguage(null))
    }

    @Test fun followPhoneResolvesToTheTranslationOrEnglish() {
        assertEquals("de", UiLanguages.forDeviceLanguage("de-DE").tag)
        assertEquals("cs", UiLanguages.forDeviceLanguage("cs-CZ").tag)
        assertEquals("en", UiLanguages.forDeviceLanguage("sw-KE").tag)
        assertEquals("en", UiLanguages.forDeviceLanguage("").tag)
        assertEquals("zh-Hans", UiLanguages.forDeviceLanguage("zh-Hans-CN").tag)
        assertEquals("en", UiLanguages.forDeviceLanguage("zh-Hant-TW").tag) // only Simplified Chinese is translated
    }

    @Test fun everyTagIsUniqueAndEnglishIsFirst() {
        assertEquals(UiLanguages.ALL.size, UiLanguages.ALL.map { it.tag }.toSet().size)
        assertEquals("en", UiLanguages.ALL.first().tag)
        assertEquals(27, UiLanguages.ALL.size)
    }
}
