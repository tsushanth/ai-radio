package com.kreativekoala.audexa.data.model

enum class SupportedLanguage(
    val code: String,
    val displayName: String,
    val nativeName: String,
    val flagEmoji: String
) {
    ENGLISH("en", "English", "English", "🇺🇸"),
    SPANISH("es", "Spanish", "Español", "🇪🇸"),
    FRENCH("fr", "French", "Français", "🇫🇷"),
    GERMAN("de", "German", "Deutsch", "🇩🇪"),
    PORTUGUESE("pt", "Portuguese", "Português", "🇧🇷"),
    JAPANESE("ja", "Japanese", "日本語", "🇯🇵"),
    CHINESE("zh", "Chinese", "中文", "🇨🇳"),
    HINDI("hi", "Hindi", "हिन्दी", "🇮🇳"),
    KOREAN("ko", "Korean", "한국어", "🇰🇷"),
    ITALIAN("it", "Italian", "Italiano", "🇮🇹");

    val displayWithFlag: String
        get() = "$flagEmoji $displayName"

    companion object {
        fun fromCode(code: String): SupportedLanguage {
            return entries.find { it.code == code } ?: ENGLISH
        }
    }
}
