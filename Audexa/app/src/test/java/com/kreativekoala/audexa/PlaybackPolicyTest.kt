package com.kreativekoala.audexa

import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import com.kreativekoala.audexa.service.PlaybackPolicy
import com.kreativekoala.audexa.service.PlaybackRetryTracker
import com.kreativekoala.audexa.service.RetryDecision
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class PlaybackPolicyTest {
    @Test fun timeoutsAreAtLeastTwiceExoPlayerDefaults() {
        // ExoPlayer defaults are 8 s connect / 8 s read.
        assertTrue(PlaybackPolicy.CONNECT_TIMEOUT_MS in 16_000..30_000)
        assertTrue(PlaybackPolicy.READ_TIMEOUT_MS in 16_000..30_000)
    }

    @Test fun networkErrorsAreTransient() {
        assertTrue(PlaybackPolicy.isTransient(PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT))
        assertTrue(PlaybackPolicy.isTransient(PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED))
        assertTrue(PlaybackPolicy.isTransient(PlaybackException.ERROR_CODE_IO_UNSPECIFIED))
    }

    @Test fun contentErrorsAreNotTransient() {
        assertFalse(PlaybackPolicy.isTransient(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS))
        assertFalse(PlaybackPolicy.isTransient(PlaybackException.ERROR_CODE_IO_FILE_NOT_FOUND))
        assertFalse(PlaybackPolicy.isTransient(PlaybackException.ERROR_CODE_PARSING_CONTAINER_MALFORMED))
        assertFalse(PlaybackPolicy.isTransient(PlaybackException.ERROR_CODE_DECODING_FAILED))
    }

    @Test fun backoffDoublesAndIsCapped() {
        assertEquals(0L, PlaybackPolicy.backoffMs(0))
        assertEquals(1_000L, PlaybackPolicy.backoffMs(1))
        assertEquals(2_000L, PlaybackPolicy.backoffMs(2))
        assertEquals(4_000L, PlaybackPolicy.backoffMs(3))
        assertEquals(8_000L, PlaybackPolicy.backoffMs(4))
        assertEquals(8_000L, PlaybackPolicy.backoffMs(5))
        assertEquals(8_000L, PlaybackPolicy.backoffMs(500)) // no overflow on a huge count
    }

    @Test fun retryDelayKeepsTheDefaultsDoNotRetryAnswer() {
        assertEquals(C.TIME_UNSET, PlaybackPolicy.retryDelayMs(C.TIME_UNSET, 1))
        assertEquals(1_000L, PlaybackPolicy.retryDelayMs(0L, 1)) // default would retry immediately; we back off
        assertEquals(4_000L, PlaybackPolicy.retryDelayMs(2_000L, 3))
    }

    @Test fun loaderRetriesAreMoreThanTheDefaultOfThree() {
        assertTrue(PlaybackPolicy.MIN_LOAD_RETRIES > 3)
    }

    @Test fun radioIsAStreamEverythingElseAnEpisode() {
        assertEquals("stream", PlaybackPolicy.errorSource("radio"))
        assertEquals("episode", PlaybackPolicy.errorSource("topic"))
        assertEquals("episode", PlaybackPolicy.errorSource("brief"))
        assertEquals("episode", PlaybackPolicy.errorSource(null))
    }

    @Test fun trackerRetriesATimeoutOnceThenShowsTheError() {
        val t = PlaybackRetryTracker()
        val timeout = PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT
        assertEquals(RetryDecision.AutoRetry(PlaybackPolicy.AUTO_RETRY_DELAY_MS), t.onError(timeout))
        assertEquals(RetryDecision.ShowError, t.onError(timeout))
        assertEquals(RetryDecision.ShowError, t.onError(timeout))
    }

    @Test fun trackerShowsNonTransientErrorsImmediately() {
        val t = PlaybackRetryTracker()
        assertEquals(RetryDecision.ShowError, t.onError(PlaybackException.ERROR_CODE_IO_BAD_HTTP_STATUS))
        assertEquals(0, t.attempts)
    }

    @Test fun trackerResetGivesANewAllowance() {
        val t = PlaybackRetryTracker()
        val failed = PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED
        assertTrue(t.onError(failed) is RetryDecision.AutoRetry)
        assertEquals(RetryDecision.ShowError, t.onError(failed))
        t.reset() // playback worked, or the user tapped Retry
        assertTrue(t.onError(failed) is RetryDecision.AutoRetry)
    }

    @Test fun trackerHonoursAConfiguredMaximum() {
        val t = PlaybackRetryTracker(maxAutoRetries = 0)
        assertEquals(RetryDecision.ShowError, t.onError(PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT))
    }
}
