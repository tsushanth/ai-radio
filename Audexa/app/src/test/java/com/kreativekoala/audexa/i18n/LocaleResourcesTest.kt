package com.kreativekoala.audexa.i18n

import android.app.Application
import android.content.Context
import androidx.test.core.app.ApplicationProvider
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.model.UiLanguages
import com.kreativekoala.audexa.ui.onboarding.withLocale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.Locale

/**
 * Resolves strings through Android's real resource machinery for every interface language tag the app hands to
 * setApplicationLocales. Proves each tag lands on the res folder UiLanguages names for it (id -> values-in, zh-CN -> values-zh-rCN,
 * pt-BR -> values-pt-rBR, fil -> values-fil, cs/el/fi/hu/ro/sv/uk -> their new folders), not on the English fallback.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], application = Application::class)
class LocaleResourcesTest {
    private val app: Context get() = ApplicationProvider.getApplicationContext()
    private fun ctx(tag: String) = app.withLocale(Locale.forLanguageTag(tag))
    /** Android formats numbers with the context's locale, so Arabic may print Arabic-Indic digits; compare on plain digits. */
    private fun asciiDigits(s: String) = s.map { if (it in '\u0660'..'\u0669') '0' + (it - '\u0660') else it }.joinToString("")
    private fun norm(s: String) = s.replace(Regex("\\s+"), " ").trim()

    @Test fun everyInterfaceTagResolvesToItsOwnResourceFolder() {
        val problems = mutableListOf<String>()
        for (language in UiLanguages.ALL.filter { it.tag != "en" }) {
            val c = ctx(language.tag)
            val expected = StringResources.load(language.resFolder)
            var checked = 0
            for ((key, xml) in expected.strings) {
                if ('%' in xml) continue // format strings are covered by the placeholder test
                val id = c.resources.getIdentifier(key, "string", c.packageName)
                if (id == 0) { problems += "${language.tag}: no resource id for $key"; continue }
                if (norm(c.getString(id)) != norm(xml)) problems += "${language.tag}/$key: '${c.getString(id).take(40)}' != '${xml.take(40)}'"
                checked++
            }
            assertTrue("${language.tag} compared only $checked strings", checked > 200)
        }
        assertTrue("tags that do not reach their folder:\n" + problems.take(30).joinToString("\n"), problems.isEmpty())
    }

    @Test fun theSevenNewLanguagesShowTranslatedMainLabels() {
        val english = ctx("en")
        for (tag in listOf("cs", "el", "fi", "hu", "ro", "sv", "uk")) {
            val c = ctx(tag)
            for (id in listOf(R.string.tab_for_you, R.string.tab_discover, R.string.nav_profile, R.string.welcome_to_audexa,
                R.string.get_started, R.string.continue_button, R.string.app_language, R.string.ui_lang_offer_title)) {
                assertNotEquals("$tag still shows the English text for ${c.resources.getResourceEntryName(id)}", english.getString(id), c.getString(id))
            }
        }
    }

    @Test fun anUntranslatedPhoneLanguageFallsBackToEnglishNotToABrokenString() {
        val sw = ctx("sw")
        assertEquals(ctx("en").getString(R.string.nav_home), sw.getString(R.string.nav_home))
    }

    /** Plural category per number as ICU resolves it on the device, for the languages that have more than one/other. */
    @Test fun briefingPluralsPickTheRightFormPerLanguage() {
        val expected = mapOf(
            "cs" to mapOf(1 to "one", 3 to "few", 5 to "other"),
            "uk" to mapOf(1 to "one", 3 to "few", 5 to "many", 21 to "one"),
            "ro" to mapOf(1 to "one", 3 to "few", 20 to "other"),
            "ru" to mapOf(1 to "one", 3 to "few", 5 to "many"),
            "pl" to mapOf(1 to "one", 3 to "few", 5 to "many"),
            "fi" to mapOf(1 to "one", 2 to "other"),
            "hu" to mapOf(1 to "one", 2 to "other"),
            "sv" to mapOf(1 to "one", 2 to "other"),
            "el" to mapOf(1 to "one", 2 to "other"),
            "de" to mapOf(1 to "one", 2 to "other"),
            "ar" to mapOf(0 to "zero", 1 to "one", 2 to "two", 3 to "few", 11 to "many", 100 to "other")
        )
        for ((tag, cases) in expected) {
            val folder = UiLanguages.fromTag(tag)!!.resFolder
            val items = StringResources.load(folder).plurals.getValue("briefing_notification_body_topics")
            for ((n, quantity) in cases) {
                val got = ctx(tag).resources.getQuantityString(R.plurals.briefing_notification_body_topics, n, n, "X")
                val want = String.format(Locale.ROOT, StringResources.unescape(items.getValue(quantity)), n, "X")
                assertEquals("$tag n=$n ($quantity)", norm(want), norm(asciiDigits(got)))
            }
        }
    }

    @Test fun formatStringsAcceptTheirArgumentsInEveryLocale() {
        for (language in UiLanguages.ALL) {
            val c = ctx(language.tag)
            c.getString(R.string.ui_lang_offer_title, "X")
            c.getString(R.string.ui_lang_offer_yes, "X")
            c.getString(R.string.ui_lang_offer_no, "X")
            c.getString(R.string.language_fallback_note, "A", "B")
            c.getString(R.string.generating_language, "A")
            c.getString(R.string.radio_topic_notification_body, "A")
            c.getString(R.string.share_station, "A")
            c.getString(R.string.min_format, 5)
            c.getString(R.string.hidden_count, 3)
            c.getString(R.string.topics_selected, 3, "s")
            c.getString(R.string.briefing_names_with_more, "A", 2)
            c.getString(R.string.ask_progress_description, 40)
            c.getString(R.string.ask_counter, 3, 200)
            c.getString(R.string.generating_progress, 40)
        }
    }
}
