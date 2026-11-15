package com.kreativekoala.audexa.i18n

import android.app.Application
import android.content.Context
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.width
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.unit.dp
import androidx.test.core.app.ApplicationProvider
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.ui.components.TabSelector
import com.kreativekoala.audexa.ui.navigation.AppLanguageRow
import com.kreativekoala.audexa.ui.onboarding.OnboardingUiState
import com.kreativekoala.audexa.ui.onboarding.pages.LanguageSelectionPage
import com.kreativekoala.audexa.ui.onboarding.pages.TopicSelectionPage
import com.kreativekoala.audexa.ui.onboarding.pages.WelcomePage
import com.kreativekoala.audexa.ui.onboarding.withLocale
import com.kreativekoala.audexa.data.model.UiLanguages
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.Locale

/**
 * Renders the self-contained screens of the first-run flow and the main tabs in every interface language on a 360dp phone, and checks:
 *  - no English text leaks through where the language has a translation (missing-key fallback),
 *  - no text is clipped or ellipsised,
 *  - short labels (tabs, primary buttons) stay on one line, also in the long languages (Hungarian, Finnish, Greek...).
 * Robolectric lays out with real Compose, so these are real measurements, not string-length guesses.
 */
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-port-xxhdpi", application = Application::class)
class LanguageScreensRenderTest {
    @get:org.junit.Rule val rule = createComposeRule()

    private val app: Context get() = ApplicationProvider.getApplicationContext()
    private enum class Screen { WELCOME, LANGUAGE_PAGE, TOPICS_EMPTY, TABS, APP_LANGUAGE_ROW }

    private var tag by mutableStateOf("en")
    private var screen by mutableStateOf(Screen.WELCOME)

    private fun show() = rule.setContent {
        val ctx = remember(tag) { app.withLocale(Locale.forLanguageTag(tag)) }
        CompositionLocalProvider(LocalContext provides ctx) {
            MaterialTheme {
                Box(Modifier.width(360.dp)) {
                    when (screen) {
                        Screen.WELCOME -> WelcomePage(onGetStarted = {})
                        Screen.LANGUAGE_PAGE -> LanguageSelectionPage(SupportedLanguage.ENGLISH, null, {}, {})
                        Screen.TOPICS_EMPTY -> TopicSelectionPage(OnboardingUiState(), {}, {}, null)
                        Screen.TABS -> TabSelector(0, listOf(ctx.getString(R.string.tab_for_you), ctx.getString(R.string.tab_discover)), {})
                        Screen.APP_LANGUAGE_ROW -> AppLanguageRow(null, {})
                    }
                }
            }
        }
    }

    /** English texts that this locale translated; seeing one on screen means the string fell back to the default file. */
    private fun forbiddenEnglish(folder: String): Set<String> {
        val en = StringResources.default.strings
        val l = StringResources.load(folder).strings
        return en.filter { (k, v) -> l[k] != null && l[k] != v && v.length > 3 }.values.map { StringResources.unescape(it) }.toSet()
    }

    @Test fun firstRunScreensAndTabsRenderCleanlyInEveryLanguage() {
        show()
        val problems = mutableListOf<String>()
        for (language in UiLanguages.ALL) {
            val forbidden = if (language.tag == "en") emptySet() else forbiddenEnglish(language.resFolder)
            for (s in Screen.entries) {
                tag = language.tag
                screen = s
                rule.waitForIdle()
                val where = "${language.tag}/$s"
                ComposeTextChecks.overflowing(rule).forEach { problems += "$where clipped: ${it.take(60)}" }
                ComposeTextChecks.texts(rule).filter { it in forbidden }.forEach { problems += "$where English leaked: ${it.take(60)}" }
                if (s == Screen.TABS) {
                    val c = app.withLocale(Locale.forLanguageTag(language.tag))
                    for (id in listOf(R.string.tab_for_you, R.string.tab_discover)) {
                        val text = c.getString(id)
                        val lines = ComposeTextChecks.lineCount(rule, text)
                        if (lines != 1) problems += "$where tab '$text' takes $lines lines"
                    }
                }
                if (s == Screen.WELCOME) {
                    val c = app.withLocale(Locale.forLanguageTag(language.tag))
                    val text = c.getString(R.string.get_started)
                    val lines = ComposeTextChecks.lineCount(rule, text)
                    if (lines != 1) problems += "$where button '$text' takes $lines lines"
                }
                if (s == Screen.LANGUAGE_PAGE) {
                    val c = app.withLocale(Locale.forLanguageTag(language.tag))
                    val text = c.getString(R.string.continue_button)
                    val lines = ComposeTextChecks.lineCount(rule, text)
                    if (lines != 1) problems += "$where button '$text' takes $lines lines"
                }
            }
        }
        assertTrue("render problems (${problems.size}):\n" + problems.take(40).joinToString("\n"), problems.isEmpty())
    }

    @Test fun theSevenNewLanguagesReallyAreInTheirOwnLanguageOnTheWelcomeScreen() {
        show()
        screen = Screen.WELCOME
        for (t in listOf("cs", "el", "fi", "hu", "ro", "sv", "uk")) {
            tag = t
            rule.waitForIdle()
            val expected = app.withLocale(Locale.forLanguageTag(t)).getString(R.string.welcome_to_audexa)
            assertTrue("$t: '$expected' not on screen", expected in ComposeTextChecks.texts(rule))
        }
    }
}
