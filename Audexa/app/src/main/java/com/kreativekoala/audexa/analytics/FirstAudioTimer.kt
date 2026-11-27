package com.kreativekoala.audexa.analytics

/**
 * How long the listener waited between asking for audio and hearing it (`first_audio`). One wait at a time and each is
 * reported exactly once: `ok` (it played), `error` (the player gave up) or `abandoned` (paused, stopped or replaced
 * before any sound). `origin` is `fallback` for an episode the app started because the live stream was slow.
 */
class FirstAudioTimer(
    private val now: () -> Long,
    private val report: (Map<String, Any>) -> Unit
) {
    private class Wait(val ctx: ListenContext, val fallback: Boolean, val since: Long)

    private var waiting: Wait? = null

    fun start(ctx: ListenContext, fallback: Boolean = false) {
        abandoned()
        waiting = Wait(ctx, fallback, now())
    }

    fun started() = end("ok")
    fun failed() = end("error")
    fun abandoned() = end("abandoned")

    private fun end(outcome: String) {
        val wait = waiting ?: return
        waiting = null
        // Whole tenths of a second, as the server expects.
        val ms = ((now() - wait.since).coerceIn(0L, MAX_MS) + 50) / 100 * 100
        val props = HashMap<String, Any>()
        props["source"] = wait.ctx.source
        props["language"] = AnalyticsEngine.cleanLang(wait.ctx.language)
        props["outcome"] = outcome
        props["ms"] = ms.toInt()
        props["origin"] = if (wait.fallback) "fallback" else "user"
        AnalyticsEngine.cleanTopicId(wait.ctx.topicId)?.let { props["topic_id"] = it }
        report(props)
    }

    companion object {
        const val MAX_MS = 600_000L
    }
}
