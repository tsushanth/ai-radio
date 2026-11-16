package com.kreativekoala.audexa.ui.onboarding

import android.content.Context
import android.content.res.Configuration
import android.os.LocaleList
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.CompositionLocalProvider
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalLayoutDirection
import androidx.compose.ui.unit.LayoutDirection
import androidx.compose.ui.unit.dp
import androidx.core.text.TextUtilsCompat
import androidx.core.view.ViewCompat
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.model.UiLanguage
import java.util.Locale

/** A context whose resources use [locale], without changing the app's own language. */
internal fun Context.withLocale(locale: Locale): Context {
    val config = Configuration(resources.configuration)
    config.setLocales(LocaleList(locale))
    return createConfigurationContext(config)
}

/** A language's name as written in [inLocale] ("Deutsch" in German, "German" in English), first letter kept as that language writes it. */
internal fun languageName(language: UiLanguage, inLocale: Locale): String =
    Locale.forLanguageTag(language.tag).getDisplayLanguage(inLocale).ifBlank { language.nativeName }

/**
 * Onboarding: after the user picked a podcast language that the app interface is also translated into, ask first, never switch silently.
 *
 * The question is written in [offer]'s language (the user just chose it, so they can read it) with the same question in the language
 * the app is showing now underneath, in case they cannot. "No" and tapping outside both keep the interface as it is.
 *
 * @param current the interface language the app is showing right now
 */
@Composable
fun UiLanguageOfferDialog(
    offer: UiLanguage,
    current: UiLanguage,
    onYes: () -> Unit,
    onNo: () -> Unit
) {
    val appContext = LocalContext.current
    val offerLocale = remember(offer.tag) { Locale.forLanguageTag(offer.tag) }
    val currentLocale = remember(current.tag) { Locale.forLanguageTag(current.tag) }
    val offerContext = remember(appContext, offer.tag) { appContext.withLocale(offerLocale) }
    val offerName = languageName(offer, offerLocale)
    val currentNameInOffer = languageName(current, offerLocale)
    val direction = if (TextUtilsCompat.getLayoutDirectionFromLocale(offerLocale) == ViewCompat.LAYOUT_DIRECTION_RTL)
        LayoutDirection.Rtl else LayoutDirection.Ltr

    CompositionLocalProvider(LocalLayoutDirection provides direction) {
        AlertDialog(
            onDismissRequest = onNo,
            title = { Text(offerContext.getString(R.string.ui_lang_offer_title, offerName)) },
            text = {
                Column {
                    Text(offerContext.getString(R.string.ui_lang_offer_body), style = MaterialTheme.typography.bodyMedium)
                    // Same question in the language the app shows now (the phone's language), as a fallback for a reader of that one.
                    Text(
                        text = appContext.getString(R.string.ui_lang_offer_title, languageName(offer, currentLocale)),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        modifier = Modifier.padding(top = 12.dp)
                    )
                }
            },
            confirmButton = {
                TextButton(onClick = onYes) { Text(offerContext.getString(R.string.ui_lang_offer_yes, offerName)) }
            },
            dismissButton = {
                TextButton(onClick = onNo) { Text(offerContext.getString(R.string.ui_lang_offer_no, currentNameInOffer)) }
            }
        )
    }
}
