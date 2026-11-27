package com.kreativekoala.audexa.service

import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.async
import kotlinx.coroutines.coroutineScope
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.selects.select
import kotlinx.coroutines.withTimeoutOrNull

/** Where one request to play audio stands. GONE: paused, stopped or replaced; nothing to wait for. */
enum class StartStatus { WAITING, PLAYING, FAILED, GONE }

/** Each play() gets a new [token], so a watcher can tell its own request from a later one. */
data class StartAttempt(val token: Long, val status: StartStatus)

/**
 * When the live stream makes the listener wait, play an episode that is already generated instead. Nothing is generated
 * and the stream is left alone if it arrives first.
 */
object SlowStreamFallback {
    /** Start looking for an episode, so it is in hand when the wait becomes too long. A normal start takes under this. */
    const val LOOK_AFTER_MS = 3_000L
    /** No sound by now: the stream is slow. */
    const val SLOW_AFTER_MS = 8_000L
    const val SEARCH_LIMIT_MS = 20_000L

    enum class Reason(val code: String) { SLOW("slow"), ERROR("error") }

    /** [episode] null: nothing was ready, so the stream just carries on. */
    data class Decision<E>(val reason: Reason, val episode: E?)

    /** Watches one start of the stream. Returns null when the stream needs no help. */
    suspend fun <E : Any> watch(status: Flow<StartStatus>, findReady: suspend () -> E?): Decision<E>? = coroutineScope {
        val search = async(start = CoroutineStart.LAZY) {
            withTimeoutOrNull(SEARCH_LIMIT_MS) {
                try {
                    findReady()
                } catch (e: CancellationException) {
                    throw e
                } catch (e: Exception) {
                    null
                }
            }
        }
        var settled = withTimeoutOrNull(LOOK_AFTER_MS) { status.first { it != StartStatus.WAITING } }
        if (settled == null) {
            search.start()
            settled = withTimeoutOrNull(SLOW_AFTER_MS - LOOK_AFTER_MS) { status.first { it != StartStatus.WAITING } }
        }
        if (settled == StartStatus.PLAYING || settled == StartStatus.GONE) {
            search.cancel()
            return@coroutineScope null
        }
        val reason = if (settled == StartStatus.FAILED) Reason.ERROR else Reason.SLOW
        // The stream may still arrive, or the listener may give up, while the episode is being looked for.
        val moot = async { status.first { it == StartStatus.PLAYING || it == StartStatus.GONE } }
        val decision = select<Decision<E>?> {
            moot.onAwait { null }
            search.onAwait { Decision(reason, it) }
        }
        moot.cancel()
        search.cancel()
        decision
    }
}
