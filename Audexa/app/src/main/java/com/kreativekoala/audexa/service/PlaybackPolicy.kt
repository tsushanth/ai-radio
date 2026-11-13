package com.kreativekoala.audexa.service

import androidx.media3.common.C
import androidx.media3.common.PlaybackException
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.upstream.DefaultLoadErrorHandlingPolicy
import androidx.media3.exoplayer.upstream.LoadErrorHandlingPolicy

/**
 * Network tolerance for playback. Pure values and functions, so they run in plain JVM unit tests.
 *
 * Why: first-party analytics showed 39 of 41 player errors were ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT, mostly on weak mobile
 * networks. ExoPlayer's HTTP defaults are an 8 s connect and 8 s read timeout with 3 quick retries, which a slow network exceeds.
 *
 * Worst case before the user sees an error: (1 + MIN_LOAD_RETRIES) attempts of up to CONNECT_TIMEOUT_MS each plus backoff inside the
 * loader, then one automatic retry of the whole prepare (AUTO_RETRY_DELAY_MS later), so a dead network shows the spinner for a
 * couple of minutes at most and never loops forever.
 */
object PlaybackPolicy {
    const val CONNECT_TIMEOUT_MS = 20_000
    const val READ_TIMEOUT_MS = 30_000

    /** Retries inside the loader for one failed load (ExoPlayer's default is 3). */
    const val MIN_LOAD_RETRIES = 4
    const val BACKOFF_BASE_MS = 1_000L
    const val BACKOFF_MAX_MS = 8_000L

    /** Whole-prepare retries done silently by AudioManager before an error is shown. */
    const val MAX_AUTO_RETRIES = 1
    const val AUTO_RETRY_DELAY_MS = 1_500L

    const val SOURCE_STREAM = "stream"
    const val SOURCE_EPISODE = "episode"

    /** Network-level failures worth another try: connection failed, connection timed out, unspecified IO. */
    fun isTransient(errorCode: Int): Boolean = when (errorCode) {
        PlaybackException.ERROR_CODE_IO_UNSPECIFIED,
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_FAILED,
        PlaybackException.ERROR_CODE_IO_NETWORK_CONNECTION_TIMEOUT -> true
        else -> false
    }

    /** 1 s, 2 s, 4 s, 8 s, then 8 s. [errorCount] starts at 1 for the first failure. */
    fun backoffMs(errorCount: Int): Long {
        if (errorCount < 1) return 0L
        val shift = (errorCount - 1).coerceAtMost(10)
        return (BACKOFF_BASE_MS shl shift).coerceAtMost(BACKOFF_MAX_MS)
    }

    /** Keeps ExoPlayer's "do not retry" answer (corrupt data, missing file) and replaces only the delay for retryable errors. */
    fun retryDelayMs(defaultDelayMs: Long, errorCount: Int): Long =
        if (defaultDelayMs == C.TIME_UNSET) C.TIME_UNSET else backoffMs(errorCount)

    /** Analytics `source` of a playback error: the live radio is a stream, everything else is an episode. */
    fun errorSource(listenSource: String?): String =
        if (listenSource == "radio") SOURCE_STREAM else SOURCE_EPISODE
}

/** What to do after a player error. */
sealed interface RetryDecision {
    data class AutoRetry(val delayMs: Long) : RetryDecision
    data object ShowError : RetryDecision
}

/**
 * Decides, per playback attempt, whether a player error is retried silently or shown. At most [maxAutoRetries] silent retries
 * for transient network errors; [reset] when playback works or the user starts or retries playback.
 */
class PlaybackRetryTracker(private val maxAutoRetries: Int = PlaybackPolicy.MAX_AUTO_RETRIES) {
    var attempts: Int = 0
        private set

    fun onError(errorCode: Int): RetryDecision {
        if (PlaybackPolicy.isTransient(errorCode) && attempts < maxAutoRetries) {
            attempts++
            return RetryDecision.AutoRetry(PlaybackPolicy.AUTO_RETRY_DELAY_MS)
        }
        return RetryDecision.ShowError
    }

    fun reset() {
        attempts = 0
    }
}

/** A player error the user can see: shown with a Retry button. [episodeId] is the item that failed. */
data class PlaybackError(val source: String, val code: String, val episodeId: String?)

/** Loader-level retries: more of them than the default, with exponential backoff instead of 0 s, 1 s, 2 s. */
@UnstableApi
class BoundedRetryLoadErrorHandlingPolicy : DefaultLoadErrorHandlingPolicy() {
    override fun getMinimumLoadableRetryCount(dataType: Int): Int =
        maxOf(super.getMinimumLoadableRetryCount(dataType), PlaybackPolicy.MIN_LOAD_RETRIES)

    override fun getRetryDelayMsFor(loadErrorInfo: LoadErrorHandlingPolicy.LoadErrorInfo): Long =
        PlaybackPolicy.retryDelayMs(super.getRetryDelayMsFor(loadErrorInfo), loadErrorInfo.errorCount)
}
