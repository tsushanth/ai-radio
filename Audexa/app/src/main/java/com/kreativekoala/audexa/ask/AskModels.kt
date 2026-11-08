package com.kreativekoala.audexa.ask

import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonElement

/*
 * "Ask the hosts" wire format (ai-radio-backend/src/services/ask) and the plain Kotlin types the screen works with.
 *
 * Numbers arrive as JsonElement and are read by AskParsing.wholeNumber: the generate endpoint once returned a float where an
 * integer was expected and that crashed the Android parser, so nothing numeric here is declared as Int.
 */

@Serializable
data class AskSubmitRequest(
    val text: String,
    val language: String,
    val installId: String? = null
)

@Serializable
data class AskConfigResponse(val success: Boolean = false, val data: AskConfigData? = null)

@Serializable
data class AskConfigData(
    val enabled: Boolean = false,
    val languages: List<String> = emptyList(),
    val maxChars: JsonElement? = null
)

@Serializable
data class AskSubmitResponse(val success: Boolean = false, val data: AskSubmitData? = null)

@Serializable
data class AskSubmitData(val id: String? = null, val status: String? = null, val pollAfterMs: JsonElement? = null)

@Serializable
data class AskStatusResponse(val success: Boolean = false, val data: AskPublicDto? = null)

@Serializable
data class AskPublicDto(
    val id: String? = null,
    val status: String? = null,
    val progress: JsonElement? = null,
    val language: String? = null,
    val title: String? = null,
    val description: String? = null,
    val audioUrl: String? = null,
    val durationSeconds: JsonElement? = null,
    val sources: List<AskSourceDto> = emptyList(),
    val reason: String? = null,
    val message: String? = null
)

@Serializable
data class AskSourceDto(
    val title: String? = null,
    val publisher: String? = null,
    val url: String? = null
)

// ---- What the screen works with ----

/** The server's settings when the feature is on. Null (feature hidden) in every other case. */
data class AskConfig(val languages: List<String>, val maxChars: Int)

enum class AskStatus(val wire: String, val terminal: Boolean) {
    QUEUED("queued", false),
    REVIEWING("reviewing", false),
    SEARCHING("searching", false),
    WRITING("writing", false),
    RECORDING("recording", false),
    COMPLETED("completed", true),
    REJECTED("rejected", true),
    NO_COVERAGE("no_coverage", true),
    FAILED("failed", true),

    /** A status this build does not know: treated as "still working" and bounded by the poll timeout. */
    UNKNOWN("", false);

    companion object {
        fun fromWire(raw: String?): AskStatus = entries.firstOrNull { it.wire.isNotEmpty() && it.wire == raw } ?: UNKNOWN
    }
}

data class AskSource(val title: String, val publisher: String, val url: String?)

data class AskEpisode(
    val id: String,
    val status: AskStatus,
    val progress: Int,
    val language: String,
    val title: String?,
    val description: String?,
    val audioUrl: String?,
    val durationSeconds: Int?,
    val sources: List<AskSource>,
    /** The server's own wording for a refusal / no coverage / failure; shown as is. */
    val message: String?
)

enum class AskFailureKind {
    /** 400: the text was not acceptable (too short, advice question, links ...). Stays on the form. */
    INPUT,

    /** 429 / 503: a daily limit, the studio is busy, or a pause after a provider failure. */
    LIMITED,

    /** 404 ask_disabled: the server switched the feature off. */
    UNAVAILABLE,

    /** The request id is unknown to the server (expired or never stored). */
    NOT_FOUND,
    OFFLINE,
    TIMEOUT,
    SERVER,

    /** The review step refused the request. */
    REFUSED,
    NO_COVERAGE,

    /** The episode could not be made (or finished without audio). */
    FAILED
}

/** [message] is the server's text, shown verbatim when present; otherwise the screen uses its own string for [kind]. */
data class AskFailure(val kind: AskFailureKind, val message: String? = null) {
    /** Failures worth an anonymous `error_shown` count: breakage, not the server saying no. */
    val analyticsCode: String?
        get() = when (kind) {
            AskFailureKind.OFFLINE -> "ask_offline"
            AskFailureKind.TIMEOUT -> "ask_timeout"
            AskFailureKind.SERVER -> "ask_server"
            AskFailureKind.FAILED -> "ask_failed"
            else -> null
        }
}

sealed interface SubmitOutcome {
    data class Accepted(val id: String) : SubmitOutcome
    data class Rejected(val failure: AskFailure) : SubmitOutcome
}

/** One poll of GET /api/ask/:id, before the state machine decides what it means. */
sealed interface PollResult {
    data class Seen(val episode: AskEpisode) : PollResult
    data object Missing : PollResult

    /** Network error, 429 from the shared limiter, 5xx, unreadable body: try again later. */
    data class Transient(val failure: AskFailure, val retryAfterMs: Long? = null) : PollResult
}
