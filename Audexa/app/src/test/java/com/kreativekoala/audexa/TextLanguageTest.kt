package com.kreativekoala.audexa

import com.kreativekoala.audexa.data.model.TextLanguage
import org.junit.Assert.assertEquals
import org.junit.Test

/** The language sent to the server for text it writes (topic names, categories, push): Chinese carries its script, nothing else changes. */
class TextLanguageTest {
    private fun req(content: String?, app: String? = null, device: String? = "en-US") = TextLanguage.forRequest(content, app, device)

    @Test fun otherLanguagesAreSentExactlyAsBefore() {
        for (c in listOf("en", "es", "fil", "pt", "ja", "cs")) {
            assertEquals(c, req(c))
            assertEquals(c, req(c, app = "zh-TW"))
            assertEquals(c, req(c, device = "zh-Hant-TW"))
        }
        assertEquals("", req(null))
    }

    @Test fun chineseStaysPlainZhWhenTheAppIsNotTraditional() {
        assertEquals("zh", req("zh"))
        assertEquals("zh", req("zh", device = "zh-CN"))
        assertEquals("zh", req("zh", app = "zh-CN", device = "zh-Hant-TW"))
        assertEquals("zh", req("zh", app = "en", device = "zh-Hant-TW"))
    }

    @Test fun chineseCarriesTheTraditionalScriptOfTheAppOrThePhone() {
        assertEquals("zh-TW", req("zh", app = "zh-TW"))
        assertEquals("zh-HK", req("zh", app = "zh-HK"))
        assertEquals("zh-TW", req("zh", app = "zh-Hant-TW"))
        assertEquals("zh-TW", req("zh", device = "zh-Hant-TW"))
        assertEquals("zh-HK", req("zh", device = "zh-HK"))
        assertEquals("zh-TW", req("zh", device = "zh-Hant-MO"))
        assertEquals("zh-TW", req("zh-CN", app = "zh-TW")) // regional content tags count as Chinese too
    }
}
