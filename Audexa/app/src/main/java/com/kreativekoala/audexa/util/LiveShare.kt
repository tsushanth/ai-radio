package com.kreativekoala.audexa.util

import java.net.URI

/**
 * "Share what's playing": builds the share text and link for the live radio, and parses the link
 * back when it opens the app (Android App Link for https://audexa.app/live).
 *
 * Pure Kotlin/JVM on purpose (java.net.URI, no android.net.Uri) so it can be unit-tested without a device.
 *
 * Honesty rules for the share text: it names the topic only when the radio really reported one, never
 * mentions listener counts, and says the station is AI-generated. The link opens the live stream (whatever
 * is on air when it is tapped), not a recording of the shared segment, and the text says "tune in live".
 */
object LiveShare {
    const val HOST = "audexa.app"
    const val PATH = "/live"

    private val KNOWN_LANGUAGES = setOf("en", "es", "hi", "pt", "fr", "de", "ja", "ko", "zh", "it", "tl")
    private val LANGUAGE_PREFIX = Regex("^\\[\\w+\\]\\s*")

    /** "https://radio.audexa.app/stream-fr" -> "fr"; the plain "/stream" mount is English. */
    fun languageFromStreamUrl(streamUrl: String): String {
        val code = Regex("/stream-([a-z]{2})(?:[/?#]|$)").find(streamUrl)?.groupValues?.get(1)
        return if (code != null && code in KNOWN_LANGUAGES) code else "en"
    }

    /** The link that goes into the share text. UTM params let us measure the loop later (web logs / Play referrer). */
    fun buildShareUrl(language: String): String {
        val lang = if (language in KNOWN_LANGUAGES) language else "en"
        return "https://$HOST$PATH?lang=$lang" +
            "&utm_source=audexa_android&utm_medium=share&utm_campaign=live_share&utm_content=$lang"
    }

    /** Topic as shown to people: radio queue names look like "[en] US Politics". Blank when there is nothing real to show. */
    fun cleanTopic(raw: String?): String? =
        raw?.replace(LANGUAGE_PREFIX, "")?.trim()?.takeIf { it.isNotEmpty() }

    fun buildShareText(stationName: String, topicName: String?, url: String): String {
        val topic = cleanTopic(topicName)
        return if (topic != null) {
            "$stationName is on air right now with: $topic. It is an AI-generated news and talk station. Tune in live: $url"
        } else {
            "I'm listening to $stationName, an AI-generated news and talk station. Tune in live: $url"
        }
    }

    /**
     * Returns the language code if [url] is an Audexa live link (https://audexa.app/live[?lang=xx]), else null.
     * Anything else (other host, other path, other scheme, garbage) is ignored so the app opens normally.
     */
    fun parseLiveLink(url: String?): String? {
        if (url.isNullOrBlank()) return null
        val uri = try { URI(url) } catch (_: Exception) { return null }
        if (uri.scheme != "https" || uri.host != HOST) return null
        if (uri.path != PATH) return null
        val lang = uri.rawQuery
            ?.split('&')
            ?.firstOrNull { it.startsWith("lang=") }
            ?.removePrefix("lang=")
        return if (lang != null && lang in KNOWN_LANGUAGES) lang else "en"
    }
}
