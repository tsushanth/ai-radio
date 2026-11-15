package com.kreativekoala.audexa.i18n

import android.app.Application
import android.content.Context
import androidx.compose.material3.MaterialTheme
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsSelected
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.test.core.app.ApplicationProvider
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.model.UiLanguage
import com.kreativekoala.audexa.data.model.UiLanguages
import com.kreativekoala.audexa.ui.navigation.AppLanguageDialog
import com.kreativekoala.audexa.ui.onboarding.UiLanguageOfferDialog
import com.kreativekoala.audexa.ui.onboarding.languageName
import com.kreativekoala.audexa.ui.onboarding.withLocale
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.util.Locale

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [34], qualifiers = "w360dp-h800dp-port-xxhdpi", application = Application::class)
class UiLanguageDialogsTest {
    @get:Rule val rule = createComposeRule()

    private val app: Context get() = ApplicationProvider.getApplicationContext()
    private fun lang(tag: String) = UiLanguages.fromTag(tag)!!

    @Test fun offerIsAskedInTheOfferedLanguageWithTheCurrentLanguageUnderneath() {
        val de = lang("de")
        rule.setContent { MaterialTheme { UiLanguageOfferDialog(de, UiLanguages.ENGLISH, onYes = {}, onNo = {}) } }
        val de2 = Locale.forLanguageTag("de")
        val title = app.withLocale(de2).getString(R.string.ui_lang_offer_title, languageName(de, de2))
        rule.onNodeWithText(title).assertIsDisplayed()
        // The same question in the language the app shows now, for a reader of that one.
        rule.onNodeWithText(app.getString(R.string.ui_lang_offer_title, languageName(de, Locale.ENGLISH))).assertIsDisplayed()
        rule.onNodeWithText(app.withLocale(de2).getString(R.string.ui_lang_offer_yes, languageName(de, de2))).assertIsDisplayed()
        rule.onNodeWithText(app.withLocale(de2).getString(R.string.ui_lang_offer_no, languageName(UiLanguages.ENGLISH, de2))).assertIsDisplayed()
    }

    @Test fun yesAnswersYesAndNoAnswersNo() {
        var yes = 0
        var no = 0
        val es = lang("es")
        rule.setContent { MaterialTheme { UiLanguageOfferDialog(es, UiLanguages.ENGLISH, onYes = { yes++ }, onNo = { no++ }) } }
        val l = Locale.forLanguageTag("es")
        rule.onNodeWithText(app.withLocale(l).getString(R.string.ui_lang_offer_no, languageName(UiLanguages.ENGLISH, l))).performClick()
        assertEquals(0, yes)
        assertEquals(1, no)
        rule.onNodeWithText(app.withLocale(l).getString(R.string.ui_lang_offer_yes, languageName(es, l))).performClick()
        assertEquals(1, yes)
    }

    @Test fun offerRendersWithoutClippingInEveryLanguage() {
        var offered by androidx.compose.runtime.mutableStateOf(lang("de"))
        rule.setContent { MaterialTheme { UiLanguageOfferDialog(offered, UiLanguages.ENGLISH, onYes = {}, onNo = {}) } }
        val problems = mutableListOf<String>()
        for (l in UiLanguages.ALL.filter { it.tag != "en" }) {
            offered = l
            rule.waitForIdle()
            ComposeTextChecks.overflowing(rule).forEach { problems += "${l.tag} clipped: ${it.take(60)}" }
            val locale = Locale.forLanguageTag(l.tag)
            val shown = ComposeTextChecks.texts(rule)
            val title = app.withLocale(locale).getString(R.string.ui_lang_offer_title, languageName(l, locale))
            if (title !in shown) problems += "${l.tag}: title '$title' not shown"
        }
        assertTrue(problems.joinToString("\n"), problems.isEmpty())
    }

    @Test fun appLanguagePickerListsFollowPhoneAndEveryLanguageInItsOwnName() {
        var picked: UiLanguage? = lang("de")
        var called = false
        rule.setContent { MaterialTheme { AppLanguageDialog(selected = null, onSelect = { picked = it; called = true }, onDismiss = {}) } }
        rule.onNodeWithText(app.getString(R.string.app_language_follow_phone)).assertIsSelected()
        for (l in listOf("Magyar", "Čeština", "Suomi", "Ελληνικά", "Română", "Svenska", "Українська", "Filipino")) {
            rule.onNodeWithText(l).performScrollTo().assertIsDisplayed()
        }
        rule.onNodeWithText("Magyar").performClick()
        assertTrue(called)
        assertEquals("hu", picked!!.tag)
    }

    @Test fun pickingFollowPhoneReturnsNull() {
        var picked: UiLanguage? = lang("de")
        rule.setContent { MaterialTheme { AppLanguageDialog(selected = lang("fi"), onSelect = { picked = it }, onDismiss = {}) } }
        rule.onNodeWithText("Suomi").assertIsSelected()
        rule.onNodeWithText(app.getString(R.string.app_language_follow_phone)).performClick()
        assertEquals(null, picked)
    }
}
