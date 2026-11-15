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
    /** Every interface language that ships a translation: English (default values/) plus 26 translated res folders. */
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
        UiLanguage("zh-Hans", "values-zh-rCN", "中文 (简体)")
    )

    val ENGLISH: UiLanguage = ALL.first()

    /** Exact tag match ("pt-BR", "zh-Hans"); also accepts "pt" / "zh" / "in" style language-only input. Null when there is no translation. */
    fun fromTag(raw: String?): UiLanguage? {
        val t = raw.orEmpty().trim().replace('_', '-')
        if (t.isEmpty()) return null
        ALL.firstOrNull { it.tag.equals(t, ignoreCase = true) }?.let { return it }
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
     * the Chinese translation is Simplified only, so a Traditional Chinese phone gets English, as Android resolves it.
     */
    fun forDeviceLanguage(deviceTag: String?): UiLanguage {
        val t = deviceTag.orEmpty().trim().replace('_', '-')
        val parts = t.split('-')
        if (parts.firstOrNull().equals("zh", ignoreCase = true) &&
            parts.drop(1).any { it.equals("Hant", true) || it.equals("TW", true) || it.equals("HK", true) || it.equals("MO", true) }
        ) return ENGLISH
        return fromTag(t) ?: ENGLISH
    }
}
