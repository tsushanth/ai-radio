package com.kreativekoala.audexa.data.model

/**
 * Which language podcast CONTENT can be generated in. Pure Kotlin (no Android classes), so it runs in JVM unit tests.
 *
 * The device language and the saved content language are different things: a phone set to Japanese, Korean, Hindi, Chinese or
 * Tagalog has no podcast voice behind it (only [SupportedLanguage.PODCAST_LANGUAGES] do), and saving such a code made Generate
 * fail with "not available yet". Everything that reads or writes the content language goes through [resolve].
 */
object ContentLanguage {
    /** Content languages the server can generate: en es fr de pt it. */
    val SUPPORTED: Set<SupportedLanguage> get() = SupportedLanguage.PODCAST_LANGUAGES

    /**
     * Unsupported languages that have a clearly closer supported one (the speakers read it): Catalan, Galician and Asturian ->
     * Spanish; Luxembourgish and Swiss German -> German; Occitan -> French. Everything else falls back to English.
     */
    private val CLOSEST = mapOf(
        "ca" to SupportedLanguage.SPANISH,
        "gl" to SupportedLanguage.SPANISH,
        "ast" to SupportedLanguage.SPANISH,
        "lb" to SupportedLanguage.GERMAN,
        "gsw" to SupportedLanguage.GERMAN,
        "oc" to SupportedLanguage.FRENCH
    )

    /**
     * @param language the content language to use, always one of [SUPPORTED]
     * @param requested the normalised language that was asked for ("" when none)
     * @param substituted true when [requested] is a real language we do not support, so the user should be told
     */
    data class Resolved(val language: SupportedLanguage, val requested: String, val substituted: Boolean)

    /** "ja_JP" / "ja-JP" / "JA" -> "ja"; "fil-PH" and the old "tl" -> "fil"; null or junk -> "". */
    fun normalize(raw: String?): String {
        val head = raw.orEmpty().trim().lowercase().split('-', '_').firstOrNull().orEmpty()
        // Tagalog "tl" (saved by older versions) and "fil" are the same language; the standard tag is "fil".
        return if (head.length in 2..3 && head.all { it in 'a'..'z' }) SupportedLanguage.canonicalCode(head) else ""
    }

    fun resolve(raw: String?): Resolved {
        val code = normalize(raw)
        if (code.isEmpty()) return Resolved(SupportedLanguage.ENGLISH, "", substituted = false)
        SUPPORTED.firstOrNull { it.code == code }?.let { return Resolved(it, code, substituted = false) }
        return Resolved(CLOSEST[code] ?: SupportedLanguage.ENGLISH, code, substituted = true)
    }

    fun isSupported(raw: String?): Boolean = !resolve(raw).substituted

    /** The stored value to write instead of [stored], and the language it replaced. Null when nothing needs to change. */
    data class Migration(val newCode: String, val from: String)

    fun migrationFor(stored: String?): Migration? {
        if (stored == null) return null
        val r = resolve(stored)
        return if (r.substituted) Migration(r.language.code, r.requested) else null
    }
}
