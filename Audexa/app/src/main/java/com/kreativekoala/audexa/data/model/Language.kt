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
    /** Filipino/Tagalog. The standard tag (Android, Play, ISO 639-2) is "fil"; older app versions stored the ISO 639-1 "tl". */
    TAGALOG("fil", "Tagalog", "Tagalog", "🇵🇭");

    /** Podcast episodes can be generated in this language (Piper voices exist). Radio is English only. */
    val podcastAvailable: Boolean
        get() = this in PODCAST_LANGUAGES

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
            // The server mount for Tagalog was always named stream-tl; only the app-side tag changed to fil.
            TAGALOG -> "https://radio.audexa.app/stream-tl"
            else -> "https://radio.audexa.app/stream-$code"
        }

    companion object {
        val PODCAST_LANGUAGES = setOf(ENGLISH, SPANISH, FRENCH, GERMAN, PORTUGUESE, ITALIAN)

        /** Old stored or linked codes that now have a different standard tag: Tagalog "tl" -> "fil". */
        fun canonicalCode(code: String): String = LEGACY_CODES[code.lowercase()] ?: code

        private val LEGACY_CODES = mapOf("tl" to "fil")

        fun fromCode(code: String): SupportedLanguage {
            val c = canonicalCode(code)
            return entries.find { it.code == c } ?: ENGLISH
        }

        /**
         * Languages that have radio streams available. Only English is live; the
         * non-English streams (/stream-<code>) were removed server-side because
         * nobody listened, so offering them would just yield a dead player.
         */
        val radioAvailable: List<SupportedLanguage>
            get() = listOf(ENGLISH)
    }
}
