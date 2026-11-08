package com.kreativekoala.audexa.analytics

import kotlinx.serialization.json.Json
import kotlinx.serialization.json.JsonArray
import kotlinx.serialization.json.JsonElement
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.JsonPrimitive
import kotlinx.serialization.json.buildJsonObject
import kotlinx.serialization.json.intOrNull
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive
import kotlinx.serialization.json.put

/** Where the engine keeps its few values (SharedPreferences in the app, a map in tests). */
interface AnalyticsStore {
    fun get(key: String): String?
    fun put(key: String, value: String)
    fun remove(key: String)
}

/** Sends one JSON body to POST /api/events and returns the HTTP status; throws on a network failure. */
fun interface AnalyticsTransport {
    fun post(body: String): Int
}

/** What is being listened to. Radio has no topic id. */
data class ListenContext(val source: String, val language: String, val topicId: String? = null) {
    val key: String get() = "$source|$language|${topicId.orEmpty()}"
}

/**
 * First-party product analytics core. No Android classes, so it runs in plain JVM unit tests. Same contract as the web client
 * (web-app/src/lib/analytics.ts) and the server (ai-radio-backend/src/lib/analytics.ts); what is collected is listed in
 * docs/DATA-COLLECTION.md.
 *
 *  - one random install id; no account id, email, IP address, device id or advertising id is ever added;
 *  - events are queued and sent in batches, never one request per event;
 *  - listening time is reported in 30 second buckets;
 *  - once the user opts out nothing is queued or sent, and the id, queue and flags are deleted.
 */
class AnalyticsEngine(
    private val store: AnalyticsStore,
    private val transport: AnalyticsTransport,
    private val now: () -> Long,
    private val newId: () -> String,
    private val appVersion: String,
    private val platform: String = "android"
) {
    companion object {
        const val LISTEN_BUCKET_S = 30
        const val LISTEN_MAX_S = 3600
        const val CHECKPOINT_MS = 5 * 60_000L
        const val MAX_QUEUE = 100
        const val MAX_BATCH = 25
        const val FLUSH_AT = 20
        const val MIN_GAP_MS = 30_000L
        const val MAX_BACKOFF_MS = 30 * 60_000L
        const val MAX_AGO_S = 7 * 24 * 3600L
        private const val MAX_ACCRUE_MS = 15 * 60_000L

        const val KEY_DO_NOT_TRACK = "do_not_track"
        const val KEY_ID = "install_id"
        const val KEY_QUEUE = "queue"
        const val KEY_FIRST_PLAY = "first_play_sent"

        private val INSTALL_ID = Regex("^[0-9a-fA-F-]{36}$")
        private val TOPIC_ID = Regex("^[A-Za-z0-9_-]{1,64}$")
        private val LANG = Regex("^[a-z]{2,3}(?![a-z])")
        private val LOCALE = Regex("^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$")
        private val CODE = Regex("[^A-Za-z0-9_.:-]")

        /** "fr-CA" or "fr_CA" -> "fr-CA"; junk -> "und". */
        fun cleanLocale(raw: String?): String {
            val v = raw?.replace('_', '-').orEmpty()
            return if (LOCALE.matches(v)) v else "und"
        }

        /** Two or three letter lowercase language; English when missing or malformed. */
        fun cleanLang(raw: String?): String = LANG.find(raw.orEmpty().lowercase())?.value ?: "en"

        fun cleanTopicId(raw: String?): String? = raw?.takeIf { TOPIC_ID.matches(it) }

        /** Error codes are short constant names (for example a Media3 error code name), never messages. */
        fun cleanCode(raw: String?): String {
            val c = raw.orEmpty().replace(CODE, "_").take(40)
            return c.ifEmpty { "unknown" }
        }
    }

    private class Queued(val name: String, val props: Map<String, Any>, val at: Long)
    private class Listening(val ctx: ListenContext, var since: Long)
    private class Carry(val key: String, var ms: Long, val ctx: ListenContext)

    private var queue = ArrayList<Queued>()
    private var loaded = false
    private var inFlight = false
    private var lastSend = 0L
    private var backoffMs = 0L
    private var listening: Listening? = null
    private var carry: Carry? = null
    private var sinceCheckpoint = 0L

    // ---- opt-out ----

    @Synchronized fun isEnabled(): Boolean = store.get(KEY_DO_NOT_TRACK) != "1"

    /** Turning it off deletes the install id, the queue and the first-play flag; turning it on later starts a new, unrelated id. */
    @Synchronized fun setEnabled(on: Boolean) {
        if (on) {
            store.remove(KEY_DO_NOT_TRACK)
            return
        }
        store.put(KEY_DO_NOT_TRACK, "1")
        queue = ArrayList()
        loaded = true
        listening = null
        carry = null
        store.remove(KEY_QUEUE)
        store.remove(KEY_ID)
        store.remove(KEY_FIRST_PLAY)
    }

    // ---- events ----

    @Synchronized fun track(name: String, props: Map<String, Any> = emptyMap()) {
        if (!isEnabled()) return
        load()
        queue.add(Queued(name, props, now()))
        while (queue.size > MAX_QUEUE) queue.removeAt(0)
    }

    @Synchronized fun pending(): Int { load(); return queue.size }

    /** True when enough is queued to send without waiting for the timer. */
    @Synchronized fun shouldFlushNow(): Boolean { load(); return queue.size >= FLUSH_AT }

    /**
     * Sends up to 4 batches of at most 25 events. [force] (the app is going to the background) ignores the minimum gap between
     * sends but never the backoff after a failure. Blocking: call it from a background thread.
     */
    fun flush(force: Boolean = false) {
        for (i in 0 until 4) {
            val body: String
            val count: Int
            synchronized(this) {
                if (!isEnabled()) return
                load()
                if (inFlight || queue.isEmpty()) return
                val t = now()
                if (t - lastSend < maxOf(backoffMs, if (force) 0L else MIN_GAP_MS)) return
                queue.removeAll { (t - it.at) / 1000 > MAX_AGO_S } // older than the server accepts
                val batch = queue.take(MAX_BATCH)
                if (batch.isEmpty()) return
                body = buildBody(batch, t)
                count = batch.size
                inFlight = true
                lastSend = t
            }
            val status = try { transport.post(body) } catch (_: Exception) { 0 }
            val keepGoing = synchronized(this) {
                inFlight = false
                val ok = status in 200..299
                val dropped = status in 400..499 && status != 429 && status != 408
                if (ok || dropped) { // delivered, or the server will never accept these (bad data): do not retry
                    repeat(minOf(count, queue.size)) { queue.removeAt(0) }
                    backoffMs = 0
                } else { // offline, 5xx, 429: keep them and slow down
                    backoffMs = minOf(MAX_BACKOFF_MS, maxOf(60_000L, backoffMs * 2))
                }
                persist()
                ok || dropped
            }
            if (!keepGoing) return
        }
    }

    @Synchronized fun persist() {
        load()
        if (queue.isEmpty()) { store.remove(KEY_QUEUE); return }
        val arr = JsonArray(queue.takeLast(MAX_QUEUE).map { q ->
            buildJsonObject {
                put("n", q.name)
                put("t", q.at)
                put("p", propsJson(q.props))
            }
        })
        store.put(KEY_QUEUE, arr.toString())
    }

    private fun load() {
        if (loaded) return
        loaded = true
        val raw = store.get(KEY_QUEUE) ?: return
        try {
            for (el in Json.parseToJsonElement(raw).jsonArray) {
                val o = el.jsonObject
                val props = HashMap<String, Any>()
                for ((k, v) in o["p"]?.jsonObject.orEmpty()) {
                    val prim = v.jsonPrimitive
                    props[k] = (if (prim.isString) prim.content else prim.intOrNull) ?: continue
                }
                queue.add(Queued(o["n"]!!.jsonPrimitive.content, props, o["t"]!!.jsonPrimitive.content.toLong()))
            }
            while (queue.size > MAX_QUEUE) queue.removeAt(0)
        } catch (_: Exception) {
            queue = ArrayList()
        }
    }

    /**
     * The install id if analytics is on and one already exists; never creates one. "Ask the hosts" sends it so the server can count
     * requests per install; with analytics switched off (which deletes the id) nothing is sent.
     */
    @Synchronized fun existingInstallId(): String? {
        if (!isEnabled()) return null
        return store.get(KEY_ID)?.takeIf { INSTALL_ID.matches(it) }
    }

    private fun installId(): String {
        val existing = store.get(KEY_ID)
        if (existing != null && INSTALL_ID.matches(existing)) return existing
        return newId().also { store.put(KEY_ID, it) }
    }

    private fun propsJson(props: Map<String, Any>): JsonObject = buildJsonObject {
        for ((k, v) in props) when (v) {
            is Int -> put(k, v)
            is Long -> put(k, v)
            else -> put(k, v.toString())
        }
    }

    private fun buildBody(batch: List<Queued>, t: Long): String = buildJsonObject {
        put("install_id", installId())
        put("platform", platform)
        put("app_version", appVersion)
        put("events", JsonArray(batch.map { q ->
            buildJsonObject {
                put("name", q.name)
                put("props", propsJson(q.props))
                put("ago_s", ((t - q.at) / 1000).coerceIn(0, MAX_AGO_S))
            }
        } as List<JsonElement>))
    }.toString()

    // ---- listening ----

    /** Call when audio really starts playing (not on tap). Emits first_play_start once per install. */
    @Synchronized fun listenStart(ctx: ListenContext) {
        if (!isEnabled()) return
        if (listening?.ctx?.key == ctx.key) return
        listenStop()
        if (carry != null && carry!!.key != ctx.key) carry = null
        listening = Listening(ctx, now())
        sinceCheckpoint = 0
        if (store.get(KEY_FIRST_PLAY) != "1") {
            store.put(KEY_FIRST_PLAY, "1")
            track("first_play_start", mapOf("source" to ctx.source, "language" to cleanLang(ctx.language)))
        }
    }

    /** Call on pause, end, buffering, error and when the item changes. */
    @Synchronized fun listenStop() {
        if (listening == null) return
        accrue()
        listening = null
        emitCarry()
    }

    /** Called about once a minute: reports long uninterrupted listening (background radio) without waiting for the pause. */
    @Synchronized fun checkpoint() {
        if (listening == null) return
        accrue()
        if (sinceCheckpoint >= CHECKPOINT_MS) {
            sinceCheckpoint = 0
            emitCarry()
        }
    }

    @Synchronized fun isListening(): Boolean = listening != null

    private fun accrue() {
        val l = listening ?: return
        val t = now()
        val delta = (t - l.since).coerceIn(0, MAX_ACCRUE_MS) // a suspended device must not become hours of listening
        l.since = t
        if (carry?.key != l.ctx.key) carry = Carry(l.ctx.key, 0, l.ctx)
        carry!!.ms += delta
        sinceCheckpoint += delta
    }

    private fun emitCarry() {
        val c = carry ?: return
        val bucketMs = LISTEN_BUCKET_S * 1000L
        while (c.ms >= bucketMs) {
            val seconds = minOf(LISTEN_MAX_S.toLong(), (c.ms / bucketMs) * LISTEN_BUCKET_S).toInt()
            val props = HashMap<String, Any>()
            props["source"] = c.ctx.source
            props["language"] = cleanLang(c.ctx.language)
            props["seconds"] = seconds
            cleanTopicId(c.ctx.topicId)?.let { props["topic_id"] = it }
            track("listen_progress", props)
            c.ms -= seconds * 1000L
        }
    }
}
