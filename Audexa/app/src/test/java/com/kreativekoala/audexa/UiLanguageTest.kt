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
        assertEquals("zh-CN", UiLanguages.fromTag("zh-CN")!!.tag)
        assertEquals("id", UiLanguages.fromTag("in")!!.tag) // Java's old code for Indonesian
        assertEquals("values-in", UiLanguages.fromTag("id")!!.resFolder)
        assertEquals("de", UiLanguages.fromTag("de-AT")!!.tag)
        assertNull(UiLanguages.fromTag("sw"))
        assertNull(UiLanguages.fromTag(""))
        assertNull(UiLanguages.fromTag(null))
    }

    @Test fun contentLanguageCodesMapToTheInterfaceTag() {
        assertEquals("pt-BR", UiLanguages.forContentLanguage("pt")!!.tag)
        assertEquals("zh-CN", UiLanguages.forContentLanguage("zh")!!.tag)
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
        assertEquals("zh-CN", UiLanguages.forDeviceLanguage("zh-Hans-CN").tag)
        // Chinese: script and region choose between the three translations
        assertEquals("zh-CN", UiLanguages.forDeviceLanguage("zh").tag)
        assertEquals("zh-CN", UiLanguages.forDeviceLanguage("zh-CN").tag)
        assertEquals("zh-CN", UiLanguages.forDeviceLanguage("zh-SG").tag)
        assertEquals("zh-TW", UiLanguages.forDeviceLanguage("zh-Hant-TW").tag)
        assertEquals("zh-TW", UiLanguages.forDeviceLanguage("zh-TW").tag)
        assertEquals("zh-TW", UiLanguages.forDeviceLanguage("zh_TW").tag)
        assertEquals("zh-TW", UiLanguages.forDeviceLanguage("zh-Hant").tag)
        assertEquals("zh-TW", UiLanguages.forDeviceLanguage("zh-Hant-MO").tag)
        assertEquals("zh-HK", UiLanguages.forDeviceLanguage("zh-HK").tag)
        assertEquals("zh-HK", UiLanguages.forDeviceLanguage("zh-Hant-HK").tag)
        assertEquals("zh-CN", UiLanguages.forDeviceLanguage("zh-Hans-HK").tag) // Simplified script wins over the region
    }

    @Test fun traditionalChineseHasItsOwnFoldersAndNames() {
        assertEquals("values-zh-rTW", UiLanguages.fromTag("zh-TW")!!.resFolder)
        assertEquals("values-zh-rHK", UiLanguages.fromTag("zh-HK")!!.resFolder)
        assertEquals("values-zh-rCN", UiLanguages.fromTag("zh")!!.resFolder) // a bare "zh" stays Simplified, as before
        assertEquals("繁體中文（台灣）", UiLanguages.fromTag("zh-TW")!!.nativeName)
        assertEquals("繁體中文（香港）", UiLanguages.fromTag("zh-HK")!!.nativeName)
        assertEquals("简体中文", UiLanguages.fromTag("zh-CN")!!.nativeName)
        assertEquals("zh-CN", UiLanguages.forContentLanguage("zh")!!.tag) // the podcast language "zh" is the Simplified station
        assertNull(UiLanguages.chineseTag("pt-BR"))
        assertNull(UiLanguages.chineseTag(null))
    }

    @Test fun everyTagIsUniqueAndEnglishIsFirst() {
        assertEquals(UiLanguages.ALL.size, UiLanguages.ALL.map { it.tag }.toSet().size)
        assertEquals("en", UiLanguages.ALL.first().tag)
        assertEquals(29, UiLanguages.ALL.size)
    }
}
