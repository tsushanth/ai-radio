package com.kreativekoala.audexa

import com.kreativekoala.audexa.service.SlowStreamFallback
import com.kreativekoala.audexa.service.SlowStreamFallback.Reason
import com.kreativekoala.audexa.service.StartStatus
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.async
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.test.advanceTimeBy
import kotlinx.coroutines.test.currentTime
import kotlinx.coroutines.test.runCurrent
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

@OptIn(ExperimentalCoroutinesApi::class)
class SlowStreamFallbackTest {
    private val status = MutableStateFlow(StartStatus.WAITING)
    private var searches = 0

    private fun finder(takesMs: Long = 500, result: String? = "ready"): suspend () -> String? = {
        searches++
        delay(takesMs)
        result
    }

    @Test fun aNormalStartDoesNotEvenLook() = runTest {
        val watch = async { SlowStreamFallback.watch(status, finder()) }
        advanceTimeBy(1_900)
        status.value = StartStatus.PLAYING
        assertNull(watch.await())
        assertEquals(0, searches)
    }

    @Test fun aSlowStreamIsReplacedAtTheLimit() = runTest {
        val decision = SlowStreamFallback.watch(status, finder())
        assertEquals(SlowStreamFallback.Decision(Reason.SLOW, "ready"), decision)
        assertEquals(SlowStreamFallback.SLOW_AFTER_MS, currentTime)
        assertEquals(1, searches)
    }

    @Test fun theStreamIsKeptWhenItArrivesBeforeTheLimit() = runTest {
        val watch = async { SlowStreamFallback.watch(status, finder()) }
        advanceTimeBy(7_000)
        status.value = StartStatus.PLAYING
        assertNull(watch.await())
    }

    @Test fun theStreamIsKeptWhenItArrivesWhileStillLooking() = runTest {
        val watch = async { SlowStreamFallback.watch(status, finder(takesMs = 10_000)) }
        advanceTimeBy(9_000)
        runCurrent()
        status.value = StartStatus.PLAYING
        assertNull(watch.await())
    }

    @Test fun pausingOrLeavingStopsIt() = runTest {
        val watch = async { SlowStreamFallback.watch(status, finder()) }
        advanceTimeBy(5_000)
        status.value = StartStatus.GONE
        assertNull(watch.await())
    }

    @Test fun aStreamThatFailsGetsAnEpisodeAtOnce() = runTest {
        val watch = async { SlowStreamFallback.watch(status, finder()) }
        advanceTimeBy(1_000)
        status.value = StartStatus.FAILED
        assertEquals(SlowStreamFallback.Decision(Reason.ERROR, "ready"), watch.await())
        assertEquals(1_500, currentTime)
    }

    @Test fun nothingReadyLeavesTheStreamAlone() = runTest {
        assertEquals(SlowStreamFallback.Decision<String>(Reason.SLOW, null), SlowStreamFallback.watch(status, finder(result = null)))
    }

    @Test fun aSearchThatFailsOrNeverEndsCountsAsNothingReady() = runTest {
        assertNull(SlowStreamFallback.watch<String>(status) { error("offline") }!!.episode)
        assertNull(SlowStreamFallback.watch(status, finder(takesMs = 600_000))!!.episode)
    }
}
