package com.kreativekoala.audexa.data.model

/**
 * A language the app interface (menus, buttons, messages) is translated into. Pure Kotlin, so it runs in JVM unit tests.
 *
 * This is NOT the podcast (content) language: see [SupportedLanguage] and [ContentLanguage]. The two are linked only in onboarding,
 * where picking a podcast language can offer the matching interface language ([UiLanguageOffer]).
 *
 * @param tag BCP 47 tag handed to the per-app language API, same as the entry in res/xml/locales_config.xml.
 * @param resFolder the res/values-* qualifier that holds the translation (checked against the real folders by a unit test).
 * @param nativeName the language written in itself; shown in the picker so a user who cannot read the current language can find theirs.
 */
data class UiLanguage(val tag: String, val resFolder: String, val nativeName: String) {
    /** Language subtag only: "pt-BR" -> "pt". */
    val language: String get() = tag.substringBefore('-')
}

object UiLanguages {
    /** Every interface language that ships a translation: English (default values/) plus 28 translated res folders. */
    val ALL: List<UiLanguage> = listOf(
        UiLanguage("en", "values", "English"),
        UiLanguage("ar", "values-ar", "العربية"),
        UiLanguage("cs", "values-cs", "Čeština"),
        UiLanguage("de", "values-de", "Deutsch"),
        UiLanguage("el", "values-el", "Ελληνικά"),
        UiLanguage("es", "values-es", "Español"),
        UiLanguage("fil", "values-fil", "Filipino"),
        UiLanguage("fi", "values-fi", "Suomi"),
        UiLanguage("fr", "values-fr", "Français"),
        UiLanguage("hi", "values-hi", "हिन्दी"),
        UiLanguage("hu", "values-hu", "Magyar"),
        UiLanguage("id", "values-in", "Bahasa Indonesia"),
        UiLanguage("it", "values-it", "Italiano"),
        UiLanguage("ja", "values-ja", "日本語"),
        UiLanguage("ko", "values-ko", "한국어"),
        UiLanguage("ms", "values-ms", "Bahasa Melayu"),
        UiLanguage("nl", "values-nl", "Nederlands"),
        UiLanguage("pl", "values-pl", "Polski"),
        UiLanguage("pt-BR", "values-pt-rBR", "Português (Brasil)"),
        UiLanguage("ro", "values-ro", "Română"),
        UiLanguage("ru", "values-ru", "Русский"),
        UiLanguage("sv", "values-sv", "Svenska"),
        UiLanguage("th", "values-th", "ไทย"),
        UiLanguage("tr", "values-tr", "Türkçe"),
        UiLanguage("uk", "values-uk", "Українська"),
        UiLanguage("vi", "values-vi", "Tiếng Việt"),
        UiLanguage("zh-CN", "values-zh-rCN", "简体中文"),
        // Traditional Chinese: Taiwan wording (values-b+zh+Hant carries the same text for Macau and other Hant regions) and Hong Kong wording.
        UiLanguage("zh-TW", "values-zh-rTW", "繁體中文（台灣）"),
        UiLanguage("zh-HK", "values-zh-rHK", "繁體中文（香港）")
    )

    val ENGLISH: UiLanguage = ALL.first()

    /**
     * The shipped Chinese interface tag for any Chinese tag: zh-TW, zh-Hant, zh-Hant-TW, zh-MO -> "zh-TW"; zh-HK, zh-Hant-HK -> "zh-HK";
     * zh, zh-CN, zh-SG, zh-Hans -> "zh-CN" (Simplified, what a bare "zh" always meant). Null when [tag] is not Chinese.
     */
    fun chineseTag(tag: String?): String? {
        val parts = tag.orEmpty().trim().replace('_', '-').lowercase().split('-')
        if (parts.firstOrNull() != "zh") return null
        val rest = parts.drop(1)
        return when {
            "hans" in rest || "cn" in rest || "sg" in rest -> "zh-CN" // i18n-ok: locale tag
            "hk" in rest -> "zh-HK" // i18n-ok: locale tag
            "tw" in rest || "mo" in rest || "hant" in rest -> "zh-TW" // i18n-ok: locale tag
            else -> "zh-CN" // i18n-ok: locale tag
        }
    }

    /** Exact tag match ("pt-BR", "zh-CN"); also accepts "pt" / "zh" / "in" style language-only input. Null when there is no translation. */
    fun fromTag(raw: String?): UiLanguage? {
        val t = raw.orEmpty().trim().replace('_', '-')
        if (t.isEmpty()) return null
        ALL.firstOrNull { it.tag.equals(t, ignoreCase = true) }?.let { return it }
        chineseTag(t)?.let { zh -> return ALL.first { it.tag == zh } } // Script and region decide: Traditional is not Simplified
        val lang = legacy(t.substringBefore('-').lowercase())
        return ALL.firstOrNull { it.language.equals(lang, ignoreCase = true) }
    }

    /** Java and old Android report Indonesian as "in" and Filipino as "tl". */
    private fun legacy(lang: String): String = when (lang) {
        "in" -> "id"
        "tl" -> "fil"
        else -> lang
    }

    /**
     * The interface language that goes with a podcast (content) language code, or null when the app has no translation for it.
     * Content codes are language-only ("pt", "zh"), the interface tags are the regional ones the resources use.
     */
    fun forContentLanguage(contentCode: String?): UiLanguage? {
        val code = ContentLanguage.normalize(contentCode)
        if (code.isEmpty()) return null
        val lang = legacy(code)
        return ALL.firstOrNull { it.language == lang }
    }

    /**
     * The interface language a phone with this system language gets when the app is set to "Follow phone": the translation for it,
     * or English when there is none (Android then falls back to the default resources). Pass the full tag when known ("zh-Hant-TW"):
     * Chinese has three translations (Simplified, Traditional for Taiwan, Traditional for Hong Kong) picked by script and region.
     */
    fun forDeviceLanguage(deviceTag: String?): UiLanguage = fromTag(deviceTag) ?: ENGLISH
}

/**
 * The language to tell the server for text it writes in the listener's language (topic and category names, push notifications).
 * It is the podcast language code ("es", "zh"...), except that Chinese carries its script: a listener whose app (or phone) is in
 * Traditional Chinese sends "zh-TW" or "zh-HK" instead of "zh", so the server writes Traditional. Podcast generation, episodes and
 * topic availability keep using the plain podcast code ("zh"). Old servers only know "zh", so [forRequest] is used only for text.
 */
object TextLanguage {
    /**
     * @param contentCode the saved podcast language
     * @param appTag the language set for this app (per-app language), or null for "Follow phone"
     * @param deviceTag the phone's system language tag
     */
    fun forRequest(contentCode: String?, appTag: String?, deviceTag: String?): String {
        val code = contentCode.orEmpty()
        if (ContentLanguage.normalize(code) != "zh") return code
        val ui = UiLanguages.fromTag(appTag) ?: UiLanguages.forDeviceLanguage(deviceTag)
        return if (ui.tag == "zh-TW" || ui.tag == "zh-HK") ui.tag else code
    }
}
