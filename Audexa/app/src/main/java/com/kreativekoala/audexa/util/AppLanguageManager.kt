package com.kreativekoala.audexa.util

import androidx.appcompat.app.AppCompatDelegate
import androidx.core.os.LocaleListCompat
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.UiLanguage
import com.kreativekoala.audexa.data.model.UiLanguageOffer
import com.kreativekoala.audexa.data.model.UiLanguages
import kotlinx.coroutines.flow.first
import javax.inject.Inject
import javax.inject.Singleton

/** Where the per-app interface language lives. The platform keeps it across restarts; this is the seam unit tests replace. */
interface AppLocaleStore {
    /** The language tag set for this app, or null when the app follows the phone. */
    fun get(): String?

    /** Sets the app language; null goes back to following the phone. Recreates visible activities. */
    fun set(tag: String?)
}

/** Remembers which interface languages the user said no to in the onboarding offer. Backed by [PreferencesManager]; a fake in tests. */
interface UiLanguageOfferStore {
    suspend fun declined(): Set<String>
    suspend fun decline(tag: String)
}

class PreferencesUiLanguageOfferStore @Inject constructor(private val preferences: PreferencesManager) : UiLanguageOfferStore {
    override suspend fun declined(): Set<String> = preferences.uiLanguageOfferDeclined.first()
    override suspend fun decline(tag: String) = preferences.addUiLanguageOfferDeclined(tag)
}

/**
 * Per-app language through AppCompat: Android 13+ hands it to the system (LocaleManager, so it also shows in system Settings >
 * Languages > App languages, listed by res/xml/locales_config.xml) and older versions store it themselves
 * (AppLocalesMetadataHolderService in the manifest, autoStoreLocales).
 */
class AppCompatLocaleStore : AppLocaleStore {
    override fun get(): String? =
        AppCompatDelegate.getApplicationLocales().takeIf { !it.isEmpty }?.get(0)?.toLanguageTag()

    override fun set(tag: String?) {
        AppCompatDelegate.setApplicationLocales(
            if (tag == null) LocaleListCompat.getEmptyLocaleList() else LocaleListCompat.forLanguageTags(tag)
        )
    }
}

/**
 * The interface language (menus and buttons) setting. Separate from the podcast language, which lives in
 * [PreferencesManager.preferredLanguage]. Used by Profile > Podcast Language > App language and by the onboarding offer.
 */
@Singleton
class AppLanguageManager @Inject constructor(
    private val store: AppLocaleStore,
    private val offers: UiLanguageOfferStore
) {
    /** The language the user picked for the app, or null for "Follow phone". */
    fun selected(): UiLanguage? = UiLanguages.fromTag(store.get())

    /** Sets the app language to a shipped translation, or back to following the phone with null. Returns false for an unknown tag. */
    fun select(tag: String?): Boolean {
        if (tag == null) {
            if (store.get() != null) store.set(null)
            return true
        }
        val language = UiLanguages.fromTag(tag) ?: return false
        if (selected()?.tag == language.tag) return true // unchanged: avoids a pointless activity restart
        store.set(language.tag)
        return true
    }

    /**
     * Onboarding: the interface language to offer after the user picked [contentCode] as podcast language, or null for no offer.
     * [deviceTag] is the phone's own language, not the app language.
     */
    suspend fun offerFor(contentCode: String?, deviceTag: String?): UiLanguage? =
        UiLanguageOffer.decide(
            contentCode = contentCode,
            deviceLanguage = deviceTag,
            appOverrideTag = store.get(),
            declined = offers.declined()
        )

    /** The user answered "Yes": switch the interface to [language]. */
    fun acceptOffer(language: UiLanguage) {
        select(language.tag)
    }

    /** The user answered "No": keep the interface as it is and do not offer this language again. */
    suspend fun declineOffer(language: UiLanguage) {
        offers.decline(language.tag)
    }
}
