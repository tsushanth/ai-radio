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
    ITALIAN("it", "Italian", "Italiano", "🇮🇹"),
    TAGALOG("tl", "Tagalog", "Tagalog", "🇵🇭");

    val displayWithFlag: String
        get() = "$flagEmoji $displayName"

    /** Station name for Audexa Radio in this language */
    val radioStationName: String
        get() = when (this) {
            ENGLISH -> "Audexa Radio"
            SPANISH -> "Audexa Radio Español"
            HINDI -> "Audexa Radio हिन्दी"
            PORTUGUESE -> "Audexa Radio Português"
            FRENCH -> "Audexa Radio Français"
            GERMAN -> "Audexa Radio Deutsch"
            JAPANESE -> "Audexa Radio 日本語"
            KOREAN -> "Audexa Radio 한국어"
            CHINESE -> "Audexa Radio 中文"
            ITALIAN -> "Audexa Radio Italiano"
            TAGALOG -> "Audexa Radio Tagalog"
        }

    /** Stream URL for this language's radio station */
    val radioStreamURL: String
        get() = when (this) {
            ENGLISH -> "https://radio.audexa.app/stream"
            else -> "https://radio.audexa.app/stream-$code"
        }

    companion object {
        fun fromCode(code: String): SupportedLanguage {
            return entries.find { it.code == code } ?: ENGLISH
        }

        /** Languages that have radio streams available */
        val radioAvailable: List<SupportedLanguage>
            get() = listOf(ENGLISH, SPANISH, HINDI, PORTUGUESE, FRENCH, GERMAN, JAPANESE, KOREAN, CHINESE, ITALIAN, TAGALOG)
    }
}
