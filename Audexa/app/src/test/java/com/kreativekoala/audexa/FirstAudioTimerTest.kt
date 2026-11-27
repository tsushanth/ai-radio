package com.kreativekoala.audexa

import com.kreativekoala.audexa.analytics.FirstAudioTimer
import com.kreativekoala.audexa.analytics.ListenContext
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.io.File

class FirstAudioTimerTest {
    private var clock = 1_000L
    private val sent = ArrayList<Map<String, Any>>()
    private val timer = FirstAudioTimer({ clock }) { sent += it }
    private val radio = ListenContext(source = "radio", language = "en", topicId = null)

    @Test fun theWaitIsReportedOnceInTenthsOfASecond() {
        timer.start(radio)
        clock += 1_949
        timer.started()
        timer.started() // resuming later is not another first audio
        timer.abandoned()
        assertEquals(
            listOf(mapOf("source" to "radio", "language" to "en", "outcome" to "ok", "ms" to 1_900, "origin" to "user")),
            sent
        )
    }

    @Test fun errorsAndGivingUpAreCountedToo() {
        timer.start(radio)
        clock += 20_000
        timer.failed()
        timer.start(radio)
        clock += 500
        timer.abandoned()
        assertEquals(listOf("error", "abandoned"), sent.map { it["outcome"] })
        assertEquals(listOf(20_000, 500), sent.map { it["ms"] })
    }

    @Test fun aNewRequestEndsTheOldWaitAndAFallbackSaysSo() {
        timer.start(radio)
        clock += 8_000
        timer.start(ListenContext(source = "topic", language = "en", topicId = "ai-ml"), fallback = true)
        clock += 700
        timer.started()
        assertEquals("abandoned", sent[0]["outcome"])
        assertEquals("fallback", sent[1]["origin"])
        assertEquals("ai-ml", sent[1]["topic_id"])
        assertEquals(700, sent[1]["ms"])
    }

    @Test fun aSleepingPhoneCannotReportHours() {
        timer.start(radio)
        clock += 3_600_000
        timer.started()
        assertEquals(600_000, sent.single()["ms"])
    }

    @Test fun theServerAcceptsBothNewEvents() {
        val server = File("../../ai-radio-backend/src/lib/analytics.ts").readText()
        assertTrue(server.contains("first_audio:"))
        assertTrue(server.contains("stream_fallback:"))
    }
}
