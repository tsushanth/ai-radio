package com.kreativekoala.audexa.data.repository

import com.kreativekoala.audexa.data.model.TopicEpisode
import kotlinx.serialization.json.Json
import kotlinx.serialization.json.jsonArray
import kotlinx.serialization.json.jsonObject
import kotlinx.serialization.json.jsonPrimitive

/** The choices behind "play an episode that is already ready". Pure, so they run in JVM tests. */
object ReadyEpisode {
    /** Each candidate costs one request, so only a few are tried. */
    const val MAX_TOPICS = 5

    fun candidates(saved: Set<String>, newest: List<String>, others: List<String>): List<String> =
        (saved.sorted().take(2) + newest + others).distinct().take(MAX_TOPICS)

    /** The server lists newest first. */
    fun firstPlayable(episodes: List<TopicEpisode>): TopicEpisode? =
        episodes.firstOrNull { it.status == "completed" && !it.audioUrl.isNullOrBlank() }

    /** `data.headlines[].topic_id` of GET /topics/briefing; empty for anything else. */
    fun briefingTopicIds(body: String): List<String> = try {
        Json.parseToJsonElement(body).jsonObject["data"]!!.jsonObject["headlines"]!!.jsonArray
            .mapNotNull { it.jsonObject["topic_id"]?.jsonPrimitive?.content }
    } catch (e: Exception) {
        emptyList()
    }
}
