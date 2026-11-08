package com.kreativekoala.audexa

import com.kreativekoala.audexa.ask.AskConfig
import com.kreativekoala.audexa.ask.AskConfigCache
import com.kreativekoala.audexa.ask.AskEpisode
import com.kreativekoala.audexa.ask.AskFailureKind
import com.kreativekoala.audexa.ask.AskParsing
import com.kreativekoala.audexa.ask.AskPollMachine
import com.kreativekoala.audexa.ask.AskStatus
import com.kreativekoala.audexa.ask.PendingAsk
import com.kreativekoala.audexa.ask.PollDecision
import com.kreativekoala.audexa.ask.PollPolicy
import com.kreativekoala.audexa.ask.PollResult
import com.kreativekoala.audexa.ask.SubmitOutcome
import kotlinx.serialization.json.JsonNull
import kotlinx.serialization.json.JsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AskLogicTest {
    private val id = "3f2b8c1e-5a47-4d0e-9b6a-1c2d3e4f5a6b"

    private fun episode(status: AskStatus, audio: String? = null, message: String? = null, progress: Int = 30) = AskEpisode(
        id = id, status = status, progress = progress, language = "en", title = "T", description = "D",
        audioUrl = audio, durationSeconds = 187, sources = emptyList(), message = message
    )

    // ---- config: shown only for an explicit "on", hidden for everything else ----

    @Test fun configOnIsParsedWithLanguagesAndMax() {
        val c = AskParsing.parseConfig(200, """{"success":true,"data":{"enabled":true,"languages":["en","de","es","fr","it","pt"],"maxChars":200}}""")
        assertEquals(AskConfig(listOf("en", "de", "es", "fr", "it", "pt"), 200), c)
    }

    @Test fun configHiddenOn404AndEveryOtherFailure() {
        assertNull(AskParsing.parseConfig(404, """{"success":false,"error":"ask_disabled"}"""))
        assertNull(AskParsing.parseConfig(500, null))
        assertNull(AskParsing.parseConfig(429, """{"error":{"status":"error","message":"Too many requests"}}"""))
        assertNull(AskParsing.parseConfig(200, null))
        assertNull(AskParsing.parseConfig(200, ""))
        assertNull(AskParsing.parseConfig(200, "<html>proxy error</html>"))
        assertNull(AskParsing.parseConfig(200, """{"success":true,"data":{"enabled":false,"languages":["en"],"maxChars":200}}"""))
        assertNull(AskParsing.parseConfig(200, """{"success":false,"data":{"enabled":true,"languages":["en"]}}"""))
        assertNull(AskParsing.parseConfig(200, """{"success":true}"""))
    }

    @Test fun configWithNoUsableLanguageIsHidden() {
        assertNull(AskParsing.parseConfig(200, """{"success":true,"data":{"enabled":true,"languages":[],"maxChars":200}}"""))
        assertNull(AskParsing.parseConfig(200, """{"success":true,"data":{"enabled":true,"languages":["english","x"],"maxChars":200}}"""))
    }

    @Test fun configDropsBadLanguagesAndDefaultsMaxChars() {
        val c = AskParsing.parseConfig(200, """{"success":true,"data":{"enabled":true,"languages":["EN","en","xx1","fr"],"maxChars":"junk"}}""")
        assertEquals(AskConfig(listOf("en", "fr"), 200), c)
        // out of range or float values
        assertEquals(200, AskParsing.parseConfig(200, """{"success":true,"data":{"enabled":true,"languages":["en"],"maxChars":3}}""")!!.maxChars)
        assertEquals(150, AskParsing.parseConfig(200, """{"success":true,"data":{"enabled":true,"languages":["en"],"maxChars":150.0}}""")!!.maxChars)
    }

    @Test fun configCacheRemembersBriefly() {
        var t = 1_000L
        val cache = AskConfigCache(now = { t }, okTtlMs = 10_000, failTtlMs = 2_000)
        assertTrue(cache.cached() is AskConfigCache.Cached.Stale)
        val on = AskConfig(listOf("en"), 200)
        cache.store(on)
        t += 9_999
        assertEquals(AskConfigCache.Cached.Fresh(on), cache.cached())
        t += 2
        assertTrue(cache.cached() is AskConfigCache.Cached.Stale)

        cache.store(null) // a failed check is remembered as "hidden", but only for the short time
        assertEquals(AskConfigCache.Cached.Fresh(null), cache.cached())
        t += 2_001
        assertTrue(cache.cached() is AskConfigCache.Cached.Stale)

        cache.store(on)
        cache.invalidateToHidden() // the server said 404 mid-session
        assertEquals(AskConfigCache.Cached.Fresh(null), cache.cached())
    }

    // ---- duration: the generate endpoint once returned a float and crashed the Android parser ----

    @Test fun durationAcceptsIntegersFloatsAndNumericStrings() {
        assertEquals(187, AskParsing.durationSeconds(JsonPrimitive(187)))
        assertEquals(187, AskParsing.durationSeconds(JsonPrimitive(186.6)))
        assertEquals(188, AskParsing.durationSeconds(JsonPrimitive(187.5)))
        assertEquals(187, AskParsing.durationSeconds(JsonPrimitive("187")))
        assertEquals(187, AskParsing.durationSeconds(JsonPrimitive("187.4")))
        assertEquals(0, AskParsing.durationSeconds(JsonPrimitive(0)))
    }

    @Test fun durationRejectsJunk() {
        assertNull(AskParsing.durationSeconds(null))
        assertNull(AskParsing.durationSeconds(JsonNull))
        assertNull(AskParsing.durationSeconds(JsonPrimitive(-5)))
        assertNull(AskParsing.durationSeconds(JsonPrimitive("soon")))
        assertNull(AskParsing.durationSeconds(JsonPrimitive(true)))
        assertNull(AskParsing.durationSeconds(JsonPrimitive(Double.NaN)))
        assertNull(AskParsing.durationSeconds(JsonPrimitive(99_999_999)))
    }

    @Test fun floatDurationInAnEpisodeBodyDoesNotBreakParsing() {
        val body = """{"success":true,"data":{"id":"$id","status":"completed","progress":100.0,"language":"en","title":"T",
            "description":"D","audioUrl":"https://cdn.example/a.mp3","durationSeconds":187.4,"sources":[],"reason":null,"message":null}}"""
        val r = AskParsing.parsePoll(200, body) as PollResult.Seen
        assertEquals(187, r.episode.durationSeconds)
        assertEquals(100, r.episode.progress)
    }

    @Test fun formatDuration() {
        assertEquals("3:07", AskParsing.formatDuration(187))
        assertEquals("0:05", AskParsing.formatDuration(5))
        assertEquals("61:00", AskParsing.formatDuration(3660))
        assertEquals("", AskParsing.formatDuration(null))
        assertEquals("", AskParsing.formatDuration(-1))
    }

    // ---- error mapping ----

    @Test fun serverMessageIsUsedVerbatimAndBareCodesNever() {
        assertEquals(
            "The hosts talk about news and events. They cannot give medical, legal, financial or personal advice.",
            AskParsing.serverMessage("""{"success":false,"error":"advice","message":"The hosts talk about news and events. They cannot give medical, legal, financial or personal advice."}""")
        )
        assertNull(AskParsing.serverMessage("""{"success":false,"error":"ask_disabled"}"""))
        // the shared API limiter nests its sentence
        assertEquals("Too many requests from this IP, please try again later.",
            AskParsing.serverMessage("""{"error":{"status":"error","message":"Too many requests from this IP, please try again later."}}"""))
        assertNull(AskParsing.serverMessage(null))
        assertNull(AskParsing.serverMessage("not json"))
        assertNull(AskParsing.serverMessage("[1,2]"))
    }

    @Test fun submitStatusCodesMapToKinds() {
        fun kind(code: Int, body: String? = null) = (AskParsing.parseSubmit(code, body) as SubmitOutcome.Rejected).failure.kind
        assertEquals(AskFailureKind.INPUT, kind(400, """{"error":"too_short","message":"Please describe the event"}"""))
        assertEquals(AskFailureKind.LIMITED, kind(429, """{"error":"install_limit","message":"You have asked enough for today. Please try again tomorrow."}"""))
        assertEquals(AskFailureKind.LIMITED, kind(503, """{"error":"paused","message":"Ask the hosts is taking a short break."}"""))
        assertEquals(AskFailureKind.UNAVAILABLE, kind(404, """{"success":false,"error":"ask_disabled"}"""))
        assertEquals(AskFailureKind.SERVER, kind(500, """{"error":"server_error","message":"Something went wrong while making this episode. Please try again."}"""))
        assertEquals(AskFailureKind.SERVER, kind(502, "<html>"))
        val f = (AskParsing.parseSubmit(429, """{"error":"busy","message":"The studio is busy right now. Please try again in a few minutes."}""") as SubmitOutcome.Rejected).failure
        assertEquals("The studio is busy right now. Please try again in a few minutes.", f.message)
    }

    @Test fun acceptedNeedsARealRequestId() {
        val ok = AskParsing.parseSubmit(202, """{"success":true,"data":{"id":"$id","status":"queued","pollAfterMs":3000}}""")
        assertEquals(SubmitOutcome.Accepted(id), ok)
        assertTrue(AskParsing.parseSubmit(202, """{"success":true,"data":{"status":"queued"}}""") is SubmitOutcome.Rejected)
        assertTrue(AskParsing.parseSubmit(202, """{"success":true,"data":{"id":"../../admin"}}""") is SubmitOutcome.Rejected)
        assertTrue(AskParsing.parseSubmit(202, "garbage") is SubmitOutcome.Rejected)
    }

    @Test fun networkErrorsAreOfflineOthersAreServer() {
        assertEquals(AskFailureKind.OFFLINE, AskParsing.failureFromException(java.net.UnknownHostException("x")).kind)
        assertEquals(AskFailureKind.OFFLINE, AskParsing.failureFromException(java.net.SocketTimeoutException()).kind)
        assertEquals(AskFailureKind.SERVER, AskParsing.failureFromException(IllegalStateException()).kind)
    }

    @Test fun onlyBreakageIsCountedAsAnError() {
        assertNotNull(com.kreativekoala.audexa.ask.AskFailure(AskFailureKind.OFFLINE).analyticsCode)
        assertNotNull(com.kreativekoala.audexa.ask.AskFailure(AskFailureKind.TIMEOUT).analyticsCode)
        assertNull(com.kreativekoala.audexa.ask.AskFailure(AskFailureKind.REFUSED).analyticsCode)
        assertNull(com.kreativekoala.audexa.ask.AskFailure(AskFailureKind.NO_COVERAGE).analyticsCode)
        assertNull(com.kreativekoala.audexa.ask.AskFailure(AskFailureKind.LIMITED).analyticsCode)
        assertNull(com.kreativekoala.audexa.ask.AskFailure(AskFailureKind.INPUT).analyticsCode)
    }

    @Test fun retryAfterHeader() {
        assertEquals(120_000L, AskParsing.retryAfterMs("120"))
        assertEquals(120_000L, AskParsing.retryAfterMs("900")) // capped
        assertNull(AskParsing.retryAfterMs("Wed, 21 Oct 2026 07:28:00 GMT"))
        assertNull(AskParsing.retryAfterMs(null))
    }

    // ---- reading a poll answer ----

    @Test fun episodeKeepsOnlyHttpsLinksAndNamedSources() {
        val body = """{"success":true,"data":{"id":"$id","status":"completed","progress":100,"language":"es","title":" Hola ","description":"D",
            "audioUrl":"http://insecure.example/a.mp3","durationSeconds":60,
            "sources":[{"title":"A","publisher":"P","url":"https://a.example/x"},{"title":"B","publisher":"Q","url":"javascript:alert(1)"},{"title":"","publisher":"Z","url":"https://z.example"}]}}"""
        val ep = (AskParsing.parsePoll(200, body) as PollResult.Seen).episode
        assertNull(ep.audioUrl)
        assertEquals("Hola", ep.title)
        assertEquals("es", ep.language)
        assertEquals(2, ep.sources.size)
        assertEquals("https://a.example/x", ep.sources[0].url)
        assertNull(ep.sources[1].url)
    }

    @Test fun pollStatusCodes() {
        assertEquals(PollResult.Missing, AskParsing.parsePoll(404, """{"success":false,"error":"not_found"}"""))
        val t = AskParsing.parsePoll(429, """{"error":{"message":"Too many requests"}}""", "30") as PollResult.Transient
        assertEquals(30_000L, t.retryAfterMs)
        assertEquals(AskFailureKind.LIMITED, t.failure.kind)
        assertTrue(AskParsing.parsePoll(502, "<html>") is PollResult.Transient)
        assertTrue(AskParsing.parsePoll(200, "garbage") is PollResult.Transient)
        assertTrue(AskParsing.parsePoll(200, """{"success":true,"data":{}}""") is PollResult.Transient)
    }

    @Test fun unknownStatusIsTreatedAsWorking() {
        assertEquals(AskStatus.UNKNOWN, AskStatus.fromWire("paused"))
        assertEquals(AskStatus.UNKNOWN, AskStatus.fromWire(null))
        assertEquals(AskStatus.NO_COVERAGE, AskStatus.fromWire("no_coverage"))
    }

    // ---- the poll state machine ----

    private val start = 1_000_000L

    @Test fun progressKeepsWaiting() {
        val m = AskPollMachine(startedAtMs = start)
        val d = m.onResult(PollResult.Seen(episode(AskStatus.SEARCHING)), start + 5_000) as PollDecision.Wait
        assertEquals(3_000L, d.delayMs)
        assertEquals(AskStatus.SEARCHING, d.episode!!.status)
    }

    @Test fun delayGrowsWithElapsedTime() {
        val p = PollPolicy()
        assertEquals(3_000L, p.delayMs(0))
        assertEquals(3_000L, p.delayMs(59_999))
        assertEquals(5_000L, p.delayMs(60_000))
        assertEquals(10_000L, p.delayMs(180_000))
        // a full wait stays well inside the shared per-IP limit
        var t = 0L
        var polls = 0
        while (t < p.timeoutMs) { polls++; t += p.delayMs(t) }
        assertTrue("polls=$polls", polls < 90)
    }

    @Test fun completedWithAudioFinishes() {
        val m = AskPollMachine(startedAtMs = start)
        val d = m.onResult(PollResult.Seen(episode(AskStatus.COMPLETED, audio = "https://cdn.example/a.mp3")), start + 90_000)
        assertTrue(d is PollDecision.Complete)
    }

    @Test fun completedWithoutAudioIsAFailure() {
        val d = AskPollMachine(startedAtMs = start).onResult(PollResult.Seen(episode(AskStatus.COMPLETED)), start + 1_000) as PollDecision.Failed
        assertEquals(AskFailureKind.FAILED, d.failure.kind)
    }

    @Test fun refusalsKeepTheServersWords() {
        val msg = "The hosts do not discuss private individuals or personal details. Try a public event or news story."
        val r = AskPollMachine(startedAtMs = start).onResult(PollResult.Seen(episode(AskStatus.REJECTED, message = msg)), start + 4_000) as PollDecision.Failed
        assertEquals(AskFailureKind.REFUSED, r.failure.kind)
        assertEquals(msg, r.failure.message)

        val n = AskPollMachine(startedAtMs = start).onResult(PollResult.Seen(episode(AskStatus.NO_COVERAGE, message = "We could not find enough recent news coverage")), start + 4_000) as PollDecision.Failed
        assertEquals(AskFailureKind.NO_COVERAGE, n.failure.kind)
        assertEquals("We could not find enough recent news coverage", n.failure.message)

        val f = AskPollMachine(startedAtMs = start).onResult(PollResult.Seen(episode(AskStatus.FAILED)), start + 4_000) as PollDecision.Failed
        assertEquals(AskFailureKind.FAILED, f.failure.kind)
        assertNull(f.failure.message)
    }

    @Test fun hardTimeoutWhileStillWorking() {
        val m = AskPollMachine(PollPolicy(timeoutMs = 480_000), start)
        assertTrue(m.onResult(PollResult.Seen(episode(AskStatus.WRITING)), start + 479_999) is PollDecision.Wait)
        val d = m.onResult(PollResult.Seen(episode(AskStatus.WRITING)), start + 480_000) as PollDecision.Failed
        assertEquals(AskFailureKind.TIMEOUT, d.failure.kind)
    }

    @Test fun aFinishedAnswerBeatsTheTimeout() {
        // the app was in the background for an hour; the first poll after that decides, not the clock
        val m = AskPollMachine(PollPolicy(timeoutMs = 480_000), start)
        val d = m.onResult(PollResult.Seen(episode(AskStatus.COMPLETED, audio = "https://cdn.example/a.mp3")), start + 3_600_000)
        assertTrue(d is PollDecision.Complete)
    }

    @Test fun missingRequestStopsAtOnce() {
        val d = AskPollMachine(startedAtMs = start).onResult(PollResult.Missing, start + 1_000) as PollDecision.Failed
        assertEquals(AskFailureKind.NOT_FOUND, d.failure.kind)
    }

    @Test fun transientErrorsBackOffThenGiveUp() {
        val offline = PollResult.Transient(com.kreativekoala.audexa.ask.AskFailure(AskFailureKind.OFFLINE))
        val m = AskPollMachine(PollPolicy(timeoutMs = 480_000, maxConsecutiveErrors = 4), start)
        assertEquals(3_000L, (m.onResult(offline, start + 3_000) as PollDecision.Wait).delayMs)
        assertEquals(6_000L, (m.onResult(offline, start + 9_000) as PollDecision.Wait).delayMs)
        assertEquals(12_000L, (m.onResult(offline, start + 20_000) as PollDecision.Wait).delayMs)
        val last = m.onResult(offline, start + 40_000) as PollDecision.Failed
        assertEquals(AskFailureKind.OFFLINE, last.failure.kind)
    }

    @Test fun aGoodAnswerResetsTheErrorCount() {
        val err = PollResult.Transient(com.kreativekoala.audexa.ask.AskFailure(AskFailureKind.SERVER))
        val m = AskPollMachine(PollPolicy(maxConsecutiveErrors = 3), start)
        m.onResult(err, start + 3_000)
        m.onResult(err, start + 6_000)
        m.onResult(PollResult.Seen(episode(AskStatus.WRITING)), start + 9_000)
        assertTrue(m.onResult(err, start + 12_000) is PollDecision.Wait)
        assertTrue(m.onResult(err, start + 15_000) is PollDecision.Wait)
        assertTrue(m.onResult(err, start + 18_000) is PollDecision.Failed)
    }

    @Test fun serverRetryAfterWinsOverShorterBackoff() {
        val limited = PollResult.Transient(com.kreativekoala.audexa.ask.AskFailure(AskFailureKind.LIMITED), retryAfterMs = 45_000)
        val d = AskPollMachine(startedAtMs = start).onResult(limited, start + 3_000) as PollDecision.Wait
        assertEquals(45_000L, d.delayMs)
    }

    // ---- the request text, language, sharing, resuming ----

    @Test fun submitNeedsEightToMaxCharsAfterNormalising() {
        assertFalse(AskParsing.canSubmit("", 200))
        assertFalse(AskParsing.canSubmit("   short  ", 200))
        assertFalse(AskParsing.canSubmit("1234567", 200))
        assertTrue(AskParsing.canSubmit("12345678", 200))
        assertTrue(AskParsing.canSubmit("a".repeat(200), 200))
        assertFalse(AskParsing.canSubmit("a".repeat(201), 200))
        // runs of spaces are collapsed before counting, like the server does
        assertEquals("Who won the game tonight?", AskParsing.normalizeText("  Who  won\n the   game tonight? "))
        assertFalse(AskParsing.canSubmit("a       b", 200))
    }

    @Test fun defaultLanguage() {
        val offered = listOf("en", "de", "es")
        assertEquals("es", AskParsing.defaultLanguage("es", offered))
        assertEquals("en", AskParsing.defaultLanguage("ja", offered))
        assertEquals("en", AskParsing.defaultLanguage(null, offered))
        assertEquals("de", AskParsing.defaultLanguage("ja", listOf("de", "fr")))
        assertEquals("en", AskParsing.defaultLanguage("ja", emptyList()))
    }

    @Test fun shareLinkMatchesTheWebPage() {
        assertEquals("https://audexa.app/ask/$id", AskParsing.shareUrl(id))
        assertNull(AskParsing.shareUrl("not-an-id"))
        assertNull(AskParsing.shareUrl("$id/../x"))
        val text = AskParsing.shareText("City council votes on bike lanes", "https://audexa.app/ask/$id")
        assertTrue(text.startsWith("Two AI hosts discuss: City council votes on bike lanes."))
        assertTrue(text.contains("AI-generated"))
        assertTrue(text.endsWith("https://audexa.app/ask/$id"))
        assertTrue(AskParsing.shareText(null, "https://audexa.app/ask/$id").startsWith("Two AI hosts discuss a news story."))
    }

    @Test fun pendingRequestIsResumableForThirtyMinutes() {
        val p = PendingAsk(id, startedAtMs = 1_000_000, language = "en")
        assertTrue(p.resumable(1_000_000))
        assertTrue(p.resumable(1_000_000 + PendingAsk.MAX_AGE_MS))
        assertFalse(p.resumable(1_000_000 + PendingAsk.MAX_AGE_MS + 1))
        assertFalse(p.resumable(999_999)) // clock went backwards
        assertFalse(PendingAsk("junk", 1_000_000, "en").resumable(1_000_001))
    }
}
