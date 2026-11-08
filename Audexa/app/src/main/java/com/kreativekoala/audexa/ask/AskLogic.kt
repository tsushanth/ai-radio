package com.kreativekoala.audexa.ask

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.contentOrNull
import kotlinx.serialization.json.doubleOrNull
import kotlinx.serialization.json.jsonObject
import kotlin.math.roundToLong

/**
 * Pure logic for "Ask the hosts" (no Android classes, unit-tested in AskLogicTest): reading the server's answers, mapping failures,
 * the poll state machine, duration / share helpers. The HTTP calls live in AskRepository; the screen state in AskViewModel.
 */
object AskParsing {
    const val MIN_CHARS = 8
    const val DEFAULT_MAX_CHARS = 200
    private const val MAX_CHARS_CEILING = 1000

    private val json = Json { ignoreUnknownKeys = true; isLenient = true }
    private val LANG = Regex("^[a-z]{2}$")

    /** An integer from a JSON number, a float ("187.4" becomes 187) or a numeric string; null for anything else. */
    fun wholeNumber(el: JsonElement?): Long? {
        val p = el as? JsonPrimitive ?: return null
        if (p is kotlinx.serialization.json.JsonNull) return null
        val d = p.doubleOrNull ?: p.contentOrNull?.trim()?.toDoubleOrNull() ?: return null
        if (d.isNaN() || d.isInfinite() || d < 0 || d > 1.0e12) return null
        return d.roundToLong()
    }

    /** Whole seconds of an episode: null when missing, negative or not a number. */
    fun durationSeconds(el: JsonElement?): Int? = wholeNumber(el)?.takeIf { it <= 24 * 3600 }?.toInt()

    /** "3:07" for a whole number of seconds; empty when unknown. */
    fun formatDuration(seconds: Int?): String {
        if (seconds == null || seconds < 0) return ""
        return "${seconds / 60}:${(seconds % 60).toString().padStart(2, '0')}"
    }

    /** Only https links are opened or played. */
    fun safeHttps(url: String?): String? = url?.trim()?.takeIf { it.startsWith("https://", ignoreCase = true) && it.length > 8 }

    // ---- config ----

    /**
     * The feature is shown only for a 200 whose body says enabled with at least one usable language. Everything else (404
     * ask_disabled, other statuses, no body, junk) returns null: fail closed.
     */
    fun parseConfig(httpCode: Int, body: String?): AskConfig? {
        if (httpCode != 200 || body.isNullOrBlank()) return null
        val parsed = try { json.decodeFromString(AskConfigResponse.serializer(), body) } catch (_: Exception) { return null }
        val data = parsed.data ?: return null
        if (!parsed.success || !data.enabled) return null
        val languages = data.languages.map { it.trim().lowercase() }.filter { LANG.matches(it) }.distinct()
        if (languages.isEmpty()) return null
        val max = wholeNumber(data.maxChars)?.toInt()?.takeIf { it in MIN_CHARS..MAX_CHARS_CEILING } ?: DEFAULT_MAX_CHARS
        return AskConfig(languages, max)
    }

    // ---- submit / poll ----

    fun parseSubmit(httpCode: Int, body: String?): SubmitOutcome {
        if (httpCode in 200..299) {
            val id = try { json.decodeFromString(AskSubmitResponse.serializer(), body.orEmpty()).data?.id } catch (_: Exception) { null }
            return if (isRequestId(id)) SubmitOutcome.Accepted(id!!) else SubmitOutcome.Rejected(AskFailure(AskFailureKind.SERVER))
        }
        return SubmitOutcome.Rejected(failureFromHttp(httpCode, body))
    }

    fun parsePoll(httpCode: Int, body: String?, retryAfterHeader: String? = null): PollResult {
        if (httpCode in 200..299) {
            val dto = try { json.decodeFromString(AskStatusResponse.serializer(), body.orEmpty()).data } catch (_: Exception) { null }
            val episode = dto?.let { toEpisode(it) } ?: return PollResult.Transient(AskFailure(AskFailureKind.SERVER))
            return PollResult.Seen(episode)
        }
        if (httpCode == 404) return PollResult.Missing
        return PollResult.Transient(failureFromHttp(httpCode, body), retryAfterMs(retryAfterHeader))
    }

    fun toEpisode(dto: AskPublicDto): AskEpisode? {
        val id = dto.id ?: return null
        return AskEpisode(
            id = id,
            status = AskStatus.fromWire(dto.status),
            progress = (wholeNumber(dto.progress) ?: 0L).coerceIn(0, 100).toInt(),
            language = dto.language?.takeIf { LANG.matches(it) } ?: "en",
            title = dto.title?.trim()?.takeIf { it.isNotEmpty() },
            description = dto.description?.trim()?.takeIf { it.isNotEmpty() },
            audioUrl = safeHttps(dto.audioUrl),
            durationSeconds = durationSeconds(dto.durationSeconds),
            sources = dto.sources.mapNotNull { s ->
                val title = s.title?.trim().orEmpty()
                if (title.isEmpty()) null else AskSource(title, s.publisher?.trim().orEmpty(), safeHttps(s.url))
            },
            message = dto.message?.trim()?.takeIf { it.isNotEmpty() }
        )
    }

    private val REQUEST_ID = Regex("^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$")
    fun isRequestId(id: String?): Boolean = id != null && REQUEST_ID.matches(id)

    /** Retry-After in seconds (the HTTP-date form is ignored), capped at 2 minutes. */
    fun retryAfterMs(header: String?): Long? =
        header?.trim()?.toLongOrNull()?.takeIf { it in 0..3600 }?.let { minOf(it, 120L) * 1000 }

    // ---- failures ----

    /**
     * The server's message for an error body. Ask routes answer { success:false, error:<code>, message:<sentence> }; the shared
     * API limiter answers { error:{ status, message } }. A bare error code such as "advice" is never shown to people.
     */
    fun serverMessage(body: String?): String? {
        if (body.isNullOrBlank()) return null
        val obj = try { json.parseToJsonElement(body) as? JsonObject } catch (_: Exception) { null } ?: return null
        val top = (obj["message"] as? JsonPrimitive)?.takeIf { it.isString }?.content
        if (!top.isNullOrBlank()) return top.trim()
        val nested = (obj["error"] as? JsonObject)?.get("message") as? JsonPrimitive
        return nested?.takeIf { it.isString }?.content?.trim()?.takeIf { it.isNotEmpty() }
    }

    fun failureFromHttp(httpCode: Int, body: String?): AskFailure {
        val message = serverMessage(body)
        val kind = when (httpCode) {
            400, 413, 422 -> AskFailureKind.INPUT
            404 -> AskFailureKind.UNAVAILABLE
            429, 503 -> AskFailureKind.LIMITED
            else -> AskFailureKind.SERVER
        }
        return AskFailure(kind, message)
    }

    /** A failure for a request that never got an HTTP answer. */
    fun failureFromException(e: Throwable): AskFailure =
        if (e is java.io.IOException) AskFailure(AskFailureKind.OFFLINE) else AskFailure(AskFailureKind.SERVER)

    // ---- the request text ----

    /** Same normalisation the server applies before it counts characters. */
    fun normalizeText(raw: String): String = raw.replace(Regex("\\s+"), " ").trim()

    fun canSubmit(raw: String, maxChars: Int): Boolean = normalizeText(raw).length in MIN_CHARS..maxChars

    /** The language to preselect: the app's content language when the server offers it, else English, else the first offered. */
    fun defaultLanguage(preferred: String?, offered: List<String>): String = when {
        preferred != null && preferred in offered -> preferred
        "en" in offered -> "en"
        else -> offered.firstOrNull() ?: "en"
    }

    // ---- sharing ----

    const val SHARE_HOST = "https://audexa.app"

    /** The public page the web uses for a shared episode (https://audexa.app/ask/<id>); null for an id that is not a UUID. */
    fun shareUrl(id: String): String? = if (isRequestId(id)) "$SHARE_HOST/ask/$id" else null

    fun shareText(title: String?, url: String): String {
        val lead = if (title.isNullOrBlank()) "Two AI hosts discuss a news story." else "Two AI hosts discuss: ${title.trim()}."
        return "$lead It is an AI-generated episode based on recent headlines. $url"
    }
}

/** How long to wait between polls, and when to give up. */
data class PollPolicy(
    val timeoutMs: Long = 8 * 60_000L,
    val maxConsecutiveErrors: Int = 6
) {
    /**
     * Gentle on the shared per-IP API limiter (about 100 requests per 15 minutes for everything the app does): 3 s for the first
     * minute, 5 s until minute 3, then 10 s. A full 8 minute wait is about 75 requests.
     */
    fun delayMs(elapsedMs: Long): Long = when {
        elapsedMs < 60_000 -> 3_000
        elapsedMs < 180_000 -> 5_000
        else -> 10_000
    }

    /** 3 s, 6 s, 12 s ... capped at 30 s, for consecutive errors. */
    fun backoffMs(consecutiveErrors: Int): Long =
        minOf(30_000L, 3_000L shl (consecutiveErrors - 1).coerceIn(0, 4))
}

sealed interface PollDecision {
    /** Poll again after [delayMs]; [episode] is the latest progress when the server answered. */
    data class Wait(val delayMs: Long, val episode: AskEpisode? = null) : PollDecision
    data class Complete(val episode: AskEpisode) : PollDecision
    data class Failed(val failure: AskFailure) : PollDecision
}

/**
 * The poll loop's brain. Feed it each [PollResult] with the current time (wall clock, so the timeout also counts time spent in the
 * background or after the process was recreated). A finished answer always wins over the timeout: after a long pause the first
 * poll decides, not the clock.
 */
class AskPollMachine(private val policy: PollPolicy = PollPolicy(), private val startedAtMs: Long) {
    private var consecutiveErrors = 0

    fun onResult(result: PollResult, nowMs: Long): PollDecision {
        val elapsed = (nowMs - startedAtMs).coerceAtLeast(0)
        return when (result) {
            is PollResult.Missing -> PollDecision.Failed(AskFailure(AskFailureKind.NOT_FOUND))
            is PollResult.Transient -> {
                consecutiveErrors++
                when {
                    elapsed >= policy.timeoutMs -> PollDecision.Failed(AskFailure(AskFailureKind.TIMEOUT))
                    consecutiveErrors >= policy.maxConsecutiveErrors -> PollDecision.Failed(
                        if (result.failure.kind == AskFailureKind.OFFLINE) result.failure else AskFailure(AskFailureKind.SERVER, result.failure.message)
                    )
                    else -> PollDecision.Wait(maxOf(policy.backoffMs(consecutiveErrors), result.retryAfterMs ?: 0L))
                }
            }
            is PollResult.Seen -> {
                consecutiveErrors = 0
                val ep = result.episode
                when (ep.status) {
                    AskStatus.COMPLETED ->
                        if (ep.audioUrl != null) PollDecision.Complete(ep) else PollDecision.Failed(AskFailure(AskFailureKind.FAILED))
                    AskStatus.REJECTED -> PollDecision.Failed(AskFailure(AskFailureKind.REFUSED, ep.message))
                    AskStatus.NO_COVERAGE -> PollDecision.Failed(AskFailure(AskFailureKind.NO_COVERAGE, ep.message))
                    AskStatus.FAILED -> PollDecision.Failed(AskFailure(AskFailureKind.FAILED, ep.message))
                    else ->
                        if (elapsed >= policy.timeoutMs) PollDecision.Failed(AskFailure(AskFailureKind.TIMEOUT))
                        else PollDecision.Wait(policy.delayMs(elapsed), ep)
                }
            }
        }
    }
}

/** Remembers the last config answer for a while so Home does not ask the server on every visit. A failed check is remembered briefly. */
class AskConfigCache(
    private val now: () -> Long,
    private val okTtlMs: Long = 10 * 60_000L,
    private val failTtlMs: Long = 2 * 60_000L
) {
    private var config: AskConfig? = null
    private var checkedAt: Long = Long.MIN_VALUE
    private var have = false

    /** [fresh] is the cached answer (possibly null = hidden) or the sentinel for "ask the server". */
    @Synchronized fun cached(): Cached {
        if (!have) return Cached.Stale
        val ttl = if (config != null) okTtlMs else failTtlMs
        return if (now() - checkedAt < ttl) Cached.Fresh(config) else Cached.Stale
    }

    @Synchronized fun store(value: AskConfig?) {
        config = value
        checkedAt = now()
        have = true
    }

    /** The server said the feature is off (404 mid-session): hide it now. */
    @Synchronized fun invalidateToHidden() = store(null)

    sealed interface Cached {
        data object Stale : Cached
        data class Fresh(val config: AskConfig?) : Cached
    }
}

/** The one request that may be in flight or recently finished, kept across rotation, process death and leaving the screen. */
data class PendingAsk(val id: String, val startedAtMs: Long, val language: String) {
    /** The server fails a stuck request after 20 minutes, so anything older than 30 is not worth resuming. */
    fun resumable(nowMs: Long): Boolean = AskParsing.isRequestId(id) && nowMs - startedAtMs in 0..MAX_AGE_MS

    companion object {
        const val MAX_AGE_MS = 30 * 60_000L
    }
}
