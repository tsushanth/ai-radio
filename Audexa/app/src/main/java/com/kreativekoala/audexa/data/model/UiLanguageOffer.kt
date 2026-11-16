package com.kreativekoala.audexa.data.model

/**
 * Remote-style switch for the onboarding offer "Show the app in <language> too?". It only gates the OFFER. The App language setting
 * (Profile > Podcast Language > App language) is never affected. There is no remote-config endpoint in the app, so this is a local
 * switch: flip [ENABLED] or narrow [ONLY_FOR] (interface language tags such as "de", "pt-BR"; null = all) and ship, or replace the
 * object's values with a server read later without touching the callers.
 */
object UiLanguageOfferConfig {
    const val ENABLED: Boolean = true
    val ONLY_FOR: Set<String>? = null
}

/** Decides, without any Android classes, whether onboarding should offer to switch the interface language. */
object UiLanguageOffer {
    /**
     * @param contentCode the podcast language the user just picked ("es", "pt", "zh", "fil", "cs"...)
     * @param deviceLanguage the phone's system language ("de", "en", "in"...), NOT the app language
     * @param appOverrideTag the interface language already set for the app (per-app language), or null for "Follow phone"
     * @param declined interface tags the user already said no to
     * @return the language to offer, or null when no offer should be shown
     */
    fun decide(
        contentCode: String?,
        deviceLanguage: String?,
        appOverrideTag: String?,
        declined: Set<String>,
        enabled: Boolean = UiLanguageOfferConfig.ENABLED,
        onlyFor: Set<String>? = UiLanguageOfferConfig.ONLY_FOR
    ): UiLanguage? {
        if (!enabled) return null
        val target = UiLanguages.forContentLanguage(contentCode) ?: return null
        if (onlyFor != null && target.tag !in onlyFor) return null
        if (target.tag in declined) return null
        val override = UiLanguages.fromTag(appOverrideTag)
        val current = override ?: UiLanguages.forDeviceLanguage(deviceLanguage)
        if (current.tag == target.tag) return null
        // "Follow phone" already gives a user whose phone is set to a translated language their own language: do not second-guess it.
        if (override == null && current != UiLanguages.ENGLISH) return null
        return target
    }
}
