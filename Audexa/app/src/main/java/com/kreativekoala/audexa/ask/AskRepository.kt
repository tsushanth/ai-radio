package com.kreativekoala.audexa.ask

import android.content.Context
import com.kreativekoala.audexa.data.remote.ApiService
import dagger.hilt.android.qualifiers.ApplicationContext
import kotlinx.coroutines.CancellationException
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withTimeoutOrNull
import retrofit2.Response
import okhttp3.ResponseBody
import javax.inject.Inject
import javax.inject.Singleton

/** Network side of "Ask the hosts". Every method returns a value; nothing here throws (except cancellation). */
@Singleton
class AskRepository @Inject constructor(private val api: ApiService) {
    private val cache = AskConfigCache(now = { System.currentTimeMillis() })
    private val configLock = Mutex()

    /**
     * The server's settings, or null when the feature must stay hidden (flag off, offline, any error). Asked once and remembered
     * for a few minutes, so opening Home repeatedly does not hit the server each time.
     */
    suspend fun config(): AskConfig? = configLock.withLock {
        when (val c = cache.cached()) {
            is AskConfigCache.Cached.Fresh -> c.config
            AskConfigCache.Cached.Stale -> {
                val result = call { api.getAskConfig() }
                val parsed = if (result == null) null else AskParsing.parseConfig(result.code, result.body)
                cache.store(parsed)
                parsed
            }
        }
    }

    /** The server said the feature is off (or we saw it fail): hide the entry point until the next check. */
    fun hide() = cache.invalidateToHidden()

    suspend fun submit(text: String, language: String, installId: String?): SubmitOutcome {
        val result = call { api.submitAsk(AskSubmitRequest(text = text, language = language, installId = installId)) }
            ?: return SubmitOutcome.Rejected(AskFailure(AskFailureKind.OFFLINE))
        if (result.failure != null) return SubmitOutcome.Rejected(result.failure)
        return AskParsing.parseSubmit(result.code, result.body).also {
            if (it is SubmitOutcome.Rejected && it.failure.kind == AskFailureKind.UNAVAILABLE) hide()
        }
    }

    suspend fun fetch(id: String): PollResult {
        val result = call { api.getAsk(id) } ?: return PollResult.Transient(AskFailure(AskFailureKind.OFFLINE))
        if (result.failure != null) return PollResult.Transient(result.failure)
        return AskParsing.parsePoll(result.code, result.body, result.retryAfter)
    }

    private class Raw(val code: Int, val body: String?, val retryAfter: String?, val failure: AskFailure? = null)

    /** Runs one call with a 25 s ceiling. Null = no answer in time or no connection. */
    private suspend fun call(block: suspend () -> Response<ResponseBody>): Raw? {
        return try {
            withTimeoutOrNull(CALL_TIMEOUT_MS) {
                val r = block()
                val body = try {
                    (if (r.isSuccessful) r.body() else r.errorBody())?.use { it.string() }
                } catch (_: java.io.IOException) {
                    null
                }
                Raw(r.code(), body, r.headers()["Retry-After"])
            }
        } catch (e: CancellationException) {
            throw e
        } catch (e: Exception) {
            Raw(0, null, null, AskParsing.failureFromException(e))
        }
    }

    private companion object {
        const val CALL_TIMEOUT_MS = 25_000L
    }
}

/** The one request kept across rotation, process death and leaving the screen. Only the request id, start time and language. */
@Singleton
class AskPendingStore @Inject constructor(@ApplicationContext context: Context) {
    private val prefs = context.getSharedPreferences("audexa_ask", Context.MODE_PRIVATE)

    fun get(): PendingAsk? {
        val id = prefs.getString(KEY_ID, null) ?: return null
        val pending = PendingAsk(id, prefs.getLong(KEY_STARTED, 0L), prefs.getString(KEY_LANG, null) ?: "en")
        if (pending.resumable(System.currentTimeMillis())) return pending
        clear()
        return null
    }

    fun put(p: PendingAsk) {
        prefs.edit().putString(KEY_ID, p.id).putLong(KEY_STARTED, p.startedAtMs).putString(KEY_LANG, p.language).apply()
    }

    /** Restarts the timeout clock for the same request ("Keep waiting"). */
    fun restart(p: PendingAsk, nowMs: Long) = put(p.copy(startedAtMs = nowMs))

    fun clear() {
        prefs.edit().remove(KEY_ID).remove(KEY_STARTED).remove(KEY_LANG).apply()
    }

    /**
     * A random id used only for "Ask the hosts" (the server's per-install daily limit). It is separate from the analytics install id,
     * so a question is never stored next to the id that usage statistics use, and the Profile analytics switch does not affect it.
     * Created on first use; kept when a pending request is cleared.
     */
    @Synchronized fun askInstallId(): String {
        prefs.getString(KEY_INSTALL, null)?.takeIf { INSTALL_ID.matches(it) }?.let { return it }
        return java.util.UUID.randomUUID().toString().also { prefs.edit().putString(KEY_INSTALL, it).apply() }
    }

    private companion object {
        const val KEY_ID = "pending_id"
        const val KEY_STARTED = "pending_started_ms"
        const val KEY_LANG = "pending_language"
        const val KEY_INSTALL = "ask_install_id"
        val INSTALL_ID = Regex("^[A-Za-z0-9_-]{8,64}$") // what POST /api/ask accepts
    }
}
