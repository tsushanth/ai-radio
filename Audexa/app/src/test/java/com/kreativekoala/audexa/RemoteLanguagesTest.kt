package com.kreativekoala.audexa

import com.kreativekoala.audexa.data.model.ContentLanguage
import com.kreativekoala.audexa.data.model.RemoteLanguages
import com.kreativekoala.audexa.data.model.SupportedLanguage
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Test

class RemoteLanguagesTest {
    @Before fun fresh() = RemoteLanguages.clear()
    @After fun cleanUp() = RemoteLanguages.clear()

    private val body = """{"success":true,"data":{"languages":[
        {"code":"cs","name":"Czech","nativeName":"Cestina","status":"beta","beta":true,"wave":1},
        {"code":"ja","name":"Japanese","nativeName":"x","status":"paused","beta":true,"wave":2},
        {"code":"nl","name":"Dutch","nativeName":"x","status":"on","beta":false,"wave":1},
        {"code":"BAD CODE","status":"on"}]}}"""

    @Test fun parsesTheServerAnswerAndDropsBadCodes() {
        val list = RemoteLanguages.parse(body)!!
        assertEquals(listOf("cs", "ja", "nl"), list.map { it.code })
        assertTrue(list[0].beta); assertFalse(list[2].beta)
        assertTrue(list[1].paused)
    }

    @Test fun anythingThatIsNotAValidAnswerKeepsTheOldList() {
        assertNull(RemoteLanguages.parse(null))
        assertNull(RemoteLanguages.parse(""))
        assertNull(RemoteLanguages.parse("<html>502</html>"))
        assertNull(RemoteLanguages.parse("""{"success":false,"error":"x"}"""))
        assertEquals(emptyList<RemoteLanguages.Entry>(), RemoteLanguages.parse("""{"success":true,"data":{"languages":[]}}"""))
    }

    @Test fun nothingRemoteIsOfferedUntilAListIsLoaded() {
        assertFalse(RemoteLanguages.isLoaded)
        val rows = SupportedLanguage.pickerLanguages()
        assertEquals(SupportedLanguage.entries.filter { it !in SupportedLanguage.REMOTE_ONLY }, rows)
        assertFalse(SupportedLanguage.CZECH.podcastAvailable)
        assertFalse(SupportedLanguage.JAPANESE.podcastAvailable) // unchanged from before this feature
        assertTrue(ContentLanguage.resolve("cs").substituted)
    }

    @Test fun enabledLanguagesBecomeSelectableWithTheirBetaLabel() {
        RemoteLanguages.update(RemoteLanguages.parse(body)!!)
        assertTrue(SupportedLanguage.CZECH.podcastAvailable && SupportedLanguage.CZECH.isBeta)
        assertTrue(SupportedLanguage.DUTCH.podcastAvailable && !SupportedLanguage.DUTCH.isBeta)
        assertTrue(SupportedLanguage.JAPANESE.podcastAvailable) // an existing "coming soon" row switches on too
        assertFalse(SupportedLanguage.POLISH.podcastAvailable)
        val rows = SupportedLanguage.pickerLanguages()
        assertTrue(SupportedLanguage.CZECH in rows && SupportedLanguage.DUTCH in rows)
        assertFalse(SupportedLanguage.POLISH in rows)
        assertFalse(ContentLanguage.resolve("cs").substituted)
        assertEquals("nl", ContentLanguage.resolve("nl-NL").language.code)
        assertTrue(ContentLanguage.resolve("pl").substituted)
        assertEquals("en", ContentLanguage.resolve("pl").language.code)
    }

    @Test fun builtInLanguagesNeverDependOnTheServer() {
        RemoteLanguages.update(emptyList())
        for (c in listOf("en", "es", "fr", "de", "pt", "it")) assertFalse(ContentLanguage.resolve(c).substituted)
    }

    @Test fun aSavedLanguageSurvivesAppStartThroughTheSavedList() {
        // First run: the server lists Czech, the phone keeps a copy.
        val saved = RemoteLanguages.encode(RemoteLanguages.parse(body)!!)
        RemoteLanguages.clear()
        // App start before the network answers: without the copy the saved "cs" would be reset to English.
        assertEquals("en", ContentLanguage.resolve("cs").language.code)
        assertNotNull(ContentLanguage.migrationFor("cs"))
        RemoteLanguages.update(RemoteLanguages.decode(saved))
        assertEquals("cs", ContentLanguage.resolve("cs").language.code)
        assertNull(ContentLanguage.migrationFor("cs"))
        assertTrue(SupportedLanguage.CZECH.isBeta)
    }

    @Test fun aLanguageTheServerSwitchesOffIsMigratedWithTheUsualNotice() {
        RemoteLanguages.update(RemoteLanguages.parse(body)!!)
        RemoteLanguages.update(RemoteLanguages.parse("""{"success":true,"data":{"languages":[]}}""")!!)
        val m = ContentLanguage.migrationFor("cs")!!
        assertEquals("en", m.newCode)
        assertEquals("cs", m.from)
    }

    @Test fun versionChangesWithEveryUpdateSoScreensRefresh() {
        val v0 = RemoteLanguages.version.value
        RemoteLanguages.update(emptyList())
        assertTrue(RemoteLanguages.version.value > v0)
    }

    @Test fun savedListRoundTripAndJunkIsIgnored() {
        val list = listOf(RemoteLanguages.Entry("cs", true, false), RemoteLanguages.Entry("nl", false, false))
        assertEquals(list, RemoteLanguages.decode(RemoteLanguages.encode(list)))
        assertEquals(emptyList<RemoteLanguages.Entry>(), RemoteLanguages.decode("x y,,:b,12:"))
        assertEquals(emptyList<RemoteLanguages.Entry>(), RemoteLanguages.decode(null))
    }

    @Test fun everyRemoteLanguageHasAStationNameAndNoRadioStream() {
        for (l in SupportedLanguage.REMOTE_ONLY) assertTrue(l.radioStationName.startsWith("Audexa Radio"))
        assertEquals(listOf(SupportedLanguage.ENGLISH), SupportedLanguage.radioAvailable)
    }
}
