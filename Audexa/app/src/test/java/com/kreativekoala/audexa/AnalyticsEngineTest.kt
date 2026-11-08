package com.kreativekoala.audexa

import com.kreativekoala.audexa.analytics.AnalyticsEngine
import com.kreativekoala.audexa.analytics.AnalyticsStore
import com.kreativekoala.audexa.analytics.AnalyticsTransport
import com.kreativekoala.audexa.analytics.ListenContext
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.int
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertTrue
import org.junit.Test

class AnalyticsEngineTest {
    private class MemStore : AnalyticsStore {
        val m = HashMap<String, String>()
        override fun get(key: String) = m[key]
        override fun put(key: String, value: String) { m[key] = value }
        override fun remove(key: String) { m.remove(key) }
    }

    private class Rig(val store: MemStore = MemStore(), var status: Int = 202) {
        var t = 1_000_000_000_000L
        var ids = 0
        val sent = ArrayList<JsonObject>()
        val engine = AnalyticsEngine(
            store = store,
            transport = AnalyticsTransport { body ->
                sent.add(Json.parseToJsonElement(body).jsonObject)
                if (status == 0) throw java.io.IOException("offline")
                status
            },
            now = { t },
            newId = { "00000000-0000-4000-8000-" + (++ids).toString().padStart(12, '0') },
            appVersion = "12.9.2"
        )
        fun events(i: Int = 0): JsonArray = sent[i]["events"]!!.jsonArray
        fun listenSeconds(): Int = sent.flatMap { it["events"]!!.jsonArray }
            .map { it.jsonObject }.filter { it["name"]!!.jsonPrimitive.content == "listen_progress" }
            .sumOf { it["props"]!!.jsonObject["seconds"]!!.jsonPrimitive.int }
    }

    @Test fun batchesIntoOneRequestWithTheAgreedEnvelope() {
        val r = Rig()
        r.engine.track("app_open", mapOf("locale" to "en-US"))
        r.t += 5000
        r.engine.track("topic_open", mapOf("topic_id" to "ai-ml"))
        r.t += 5000
        r.engine.flush()
        assertEquals(1, r.sent.size)
        val b = r.sent[0]
        assertEquals(setOf("install_id", "platform", "app_version", "events"), b.keys)
        assertEquals("android", b["platform"]!!.jsonPrimitive.content)
        assertEquals("12.9.2", b["app_version"]!!.jsonPrimitive.content)
        assertEquals(2, r.events().size)
        assertEquals(10, r.events()[0].jsonObject["ago_s"]!!.jsonPrimitive.int)
        assertEquals("en-US", r.events()[0].jsonObject["props"]!!.jsonObject["locale"]!!.jsonPrimitive.content)
        assertEquals(0, r.engine.pending())
    }

    @Test fun neverMoreThan25EventsPerRequestAndAtMost4RequestsPerFlush() {
        val r = Rig()
        repeat(60) { r.engine.track("topic_open", mapOf("topic_id" to "ai-ml")) }
        r.engine.flush(force = true)
        assertTrue(r.sent.all { it["events"]!!.jsonArray.size <= 25 })
        assertTrue(r.sent.size <= 4)
        assertEquals(0, r.engine.pending())
    }

    @Test fun queueIsBounded() {
        val r = Rig(status = 0)
        repeat(250) { r.engine.track("error_shown", mapOf("code" to "x")) }
        assertEquals(AnalyticsEngine.MAX_QUEUE, r.engine.pending())
    }

    @Test fun flushAt20QueuedEvents() {
        val r = Rig()
        repeat(19) { r.engine.track("topic_open", mapOf("topic_id" to "a")) }
        assertFalse(r.engine.shouldFlushNow())
        r.engine.track("topic_open", mapOf("topic_id" to "a"))
        assertTrue(r.engine.shouldFlushNow())
    }

    @Test fun offlineKeepsEventsPersistsThemAndBacksOff() {
        val r = Rig(status = 0)
        r.engine.track("app_open", mapOf("locale" to "en"))
        r.engine.flush(force = true)
        assertEquals(1, r.sent.size)
        assertEquals(1, r.engine.pending())
        assertTrue(r.store.get(AnalyticsEngine.KEY_QUEUE) != null)
        r.engine.flush(force = true) // inside the backoff
        assertEquals(1, r.sent.size)
        r.status = 503
        r.t += 61_000
        r.engine.flush(force = true)
        assertEquals(2, r.sent.size)
        assertEquals(1, r.engine.pending())
        r.status = 202
        r.t += 3 * 60_000
        r.engine.flush(force = true)
        assertEquals(0, r.engine.pending())
        assertNull(r.store.get(AnalyticsEngine.KEY_QUEUE))
    }

    @Test fun aQueueFromAnEarlierRunIsSentByTheNextOne() {
        val store = MemStore()
        val first = Rig(store, status = 0)
        first.engine.track("app_open", mapOf("locale" to "en"))
        first.engine.track("listen_progress", mapOf("source" to "topic", "language" to "en", "seconds" to 60, "topic_id" to "123"))
        first.engine.flush(force = true)
        val second = Rig(store, status = 202)
        second.t = first.t + 600_000
        second.engine.flush(force = true)
        assertEquals(1, second.sent.size)
        val ev = second.events()
        assertEquals(2, ev.size)
        assertEquals(600, ev[0].jsonObject["ago_s"]!!.jsonPrimitive.int)
        // a numeric-looking topic id must come back as a string, a count as a number
        val p = ev[1].jsonObject["props"]!!.jsonObject
        assertTrue(p["topic_id"]!!.jsonPrimitive.isString)
        assertFalse(p["seconds"]!!.jsonPrimitive.isString)
    }

    @Test fun badRequestDropsTheBatchInsteadOfRetryingForever() {
        val r = Rig(status = 400)
        r.engine.track("app_open", mapOf("locale" to "en"))
        r.engine.flush(force = true)
        assertEquals(0, r.engine.pending())
    }

    @Test fun minimumGapBetweenSendsUnlessForced() {
        val r = Rig()
        r.engine.track("app_open", mapOf("locale" to "en"))
        r.engine.flush()
        r.engine.track("topic_open", mapOf("topic_id" to "a"))
        r.engine.flush()
        assertEquals(1, r.sent.size)
        r.engine.flush(force = true)
        assertEquals(2, r.sent.size)
    }

    @Test fun optOutStopsEverythingAndDeletesTheIdQueueAndFlags() {
        val r = Rig()
        r.engine.track("app_open", mapOf("locale" to "en"))
        r.engine.flush(force = true)
        val firstId = r.sent[0]["install_id"]!!.jsonPrimitive.content
        assertEquals(firstId, r.store.get(AnalyticsEngine.KEY_ID))
        r.engine.track("topic_open", mapOf("topic_id" to "a"))
        r.engine.setEnabled(false)
        assertFalse(r.engine.isEnabled())
        assertEquals("1", r.store.get(AnalyticsEngine.KEY_DO_NOT_TRACK))
        assertNull(r.store.get(AnalyticsEngine.KEY_ID))
        assertNull(r.store.get(AnalyticsEngine.KEY_QUEUE))
        assertNull(r.store.get(AnalyticsEngine.KEY_FIRST_PLAY))
        assertEquals(0, r.engine.pending())
        r.engine.track("app_open", mapOf("locale" to "en"))
        r.engine.listenStart(ListenContext("radio", "en"))
        r.t += 120_000
        r.engine.listenStop()
        r.engine.flush(force = true)
        assertEquals(1, r.sent.size)
        r.engine.setEnabled(true)
        r.engine.track("app_open", mapOf("locale" to "en"))
        r.t += 60_000
        r.engine.flush(force = true)
        assertEquals(2, r.sent.size)
        assertNotEquals(firstId, r.sent[1]["install_id"]!!.jsonPrimitive.content)
    }

    @Test fun optOutFlagSurvivesARestart() {
        val store = MemStore()
        Rig(store).engine.setEnabled(false)
        val again = Rig(store)
        again.engine.track("app_open", mapOf("locale" to "en"))
        assertEquals(0, again.engine.pending())
    }

    @Test fun listeningIsReportedInThirtySecondBucketsWithTheRemainderCarried() {
        val r = Rig()
        val ctx = ListenContext("topic", "en", "ai-ml")
        r.engine.listenStart(ctx)
        r.t += 20_000
        r.engine.listenStop()
        assertEquals(1, r.engine.pending()) // only first_play_start
        r.engine.listenStart(ctx)
        r.t += 50_000
        r.engine.listenStop() // 20 + 50 = 70 s -> a 60 s event, 10 s carried
        assertEquals(2, r.engine.pending())
        r.engine.flush(force = true)
        assertEquals(60, r.listenSeconds())
    }

    @Test fun firstPlayStartOncePerInstallAndListenEventContent() {
        val r = Rig()
        repeat(3) {
            r.engine.listenStart(ListenContext("topic", "FR", "bad topic id!"))
            r.t += 95_000
            r.engine.listenStop()
        }
        r.engine.flush(force = true)
        val names = r.events().map { it.jsonObject["name"]!!.jsonPrimitive.content }
        assertEquals(1, names.count { it == "first_play_start" })
        val listen = r.events().map { it.jsonObject }.first { it["name"]!!.jsonPrimitive.content == "listen_progress" }["props"]!!.jsonObject
        assertEquals(setOf("source", "language", "seconds"), listen.keys) // invalid topic id dropped
        assertEquals("fr", listen["language"]!!.jsonPrimitive.content)
        assertEquals(90, listen["seconds"]!!.jsonPrimitive.int)
    }

    @Test fun radioReportsNoTopicId() {
        val r = Rig()
        r.engine.listenStart(ListenContext("radio", "en"))
        r.t += 60_000
        r.engine.listenStop()
        r.engine.flush(force = true)
        val p = r.events().map { it.jsonObject }.first { it["name"]!!.jsonPrimitive.content == "listen_progress" }["props"]!!.jsonObject
        assertFalse(p.containsKey("topic_id"))
    }

    @Test fun backgroundRadioIsCheckpointedEveryFiveMinutes() {
        val r = Rig()
        r.engine.listenStart(ListenContext("radio", "en"))
        val before = r.engine.pending()
        repeat(4) { r.t += 60_000; r.engine.checkpoint() }
        assertEquals(before, r.engine.pending())
        r.t += 60_000; r.engine.checkpoint()
        assertEquals(before + 1, r.engine.pending())
    }

    @Test fun aSuspendedDeviceCannotBecomeHoursOfListening() {
        val r = Rig()
        r.engine.listenStart(ListenContext("radio", "en"))
        r.t += 6 * 3600_000L
        r.engine.listenStop()
        r.engine.flush(force = true)
        assertEquals(900, r.listenSeconds())
    }

    @Test fun oneReportNeverExceedsAnHourAndIsAMultipleOf30() {
        val r = Rig()
        r.engine.listenStart(ListenContext("radio", "en"))
        repeat(6) { r.t += 15 * 60_000L; r.engine.checkpoint() }
        r.engine.listenStop()
        r.engine.flush(force = true)
        for (b in r.sent) for (e in b["events"]!!.jsonArray) {
            val o = e.jsonObject
            if (o["name"]!!.jsonPrimitive.content == "listen_progress") {
                val s = o["props"]!!.jsonObject["seconds"]!!.jsonPrimitive.int
                assertTrue(s <= 3600 && s % 30 == 0)
            }
        }
    }

    @Test fun sanitisers() {
        assertEquals("en-US", AnalyticsEngine.cleanLocale("en_US"))
        assertEquals("und", AnalyticsEngine.cleanLocale("<script>"))
        assertEquals("und", AnalyticsEngine.cleanLocale(null))
        assertEquals("fr", AnalyticsEngine.cleanLang("FR"))
        assertEquals("zh", AnalyticsEngine.cleanLang("zh-CN"))
        assertEquals("en", AnalyticsEngine.cleanLang(""))
        assertEquals("ai-ml", AnalyticsEngine.cleanTopicId("ai-ml"))
        assertNull(AnalyticsEngine.cleanTopicId("a b"))
        assertNull(AnalyticsEngine.cleanTopicId("x".repeat(65)))
        assertEquals("ERROR_CODE_IO_BAD_HTTP_STATUS", AnalyticsEngine.cleanCode("ERROR_CODE_IO_BAD_HTTP_STATUS"))
        assertEquals("a_b_c", AnalyticsEngine.cleanCode("a b c"))
        assertEquals(40, AnalyticsEngine.cleanCode("x".repeat(100)).length)
        assertEquals("unknown", AnalyticsEngine.cleanCode(""))
    }
    @Test fun askInstallIdIsOnlyEverReadNeverCreatedAndHonoursOptOut() {
        val r = Rig()
        assertNull(r.engine.existingInstallId()) // nothing uploaded yet: no id, and asking does not make one
        assertNull(r.store.get(AnalyticsEngine.KEY_ID))
        r.engine.track("app_open", mapOf("locale" to "en-US"))
        r.t += 5000
        r.engine.flush()
        val id = r.sent[0]["install_id"]!!.jsonPrimitive.content
        assertEquals(id, r.engine.existingInstallId())
        assertTrue(Regex("^[A-Za-z0-9_-]{8,64}$").matches(id)) // what POST /api/ask accepts
        r.engine.setEnabled(false)
        assertNull(r.engine.existingInstallId())
        r.engine.setEnabled(true)
        assertNull(r.engine.existingInstallId()) // opting out deleted it; turning back on does not resurrect it
    }
}
