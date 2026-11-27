package com.kreativekoala.audexa

import com.kreativekoala.audexa.data.model.TopicEpisode
import com.kreativekoala.audexa.data.repository.ReadyEpisode
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

class ReadyEpisodeTest {
    private fun episode(id: String, status: String, url: String?) =
        TopicEpisode(id = id, topicId = "t", date = "2026-11-26", status = status, audioUrl = url)

    @Test fun savedTopicsComeFirstThenTheNewestWithoutRepeats() {
        assertEquals(
            listOf("ai-ml", "science", "world-update", "daily-news", "sports"),
            ReadyEpisode.candidates(
                saved = setOf("science", "ai-ml"),
                newest = listOf("world-update", "ai-ml", "daily-news"),
                others = listOf("sports", "health", "music")
            )
        )
    }

    @Test fun onlyAFinishedEpisodeWithAudioIsPlayable() {
        val list = listOf(
            episode("a", "generating", null),
            episode("b", "completed", ""),
            episode("c", "completed", "https://example.org/c.mp3"),
            episode("d", "completed", "https://example.org/d.mp3")
        )
        assertEquals("c", ReadyEpisode.firstPlayable(list)?.id)
        assertNull(ReadyEpisode.firstPlayable(list.take(2)))
    }

    @Test fun theBriefingAnswerGivesTopicIds() {
        val body = """{"success":true,"data":{"date":"2026-11-26","count":35,"headlines":[{"topic_id":"world-update","name":"World Update"},{"topic_id":"daily-news","name":"Daily News Brief"}]}}"""
        assertEquals(listOf("world-update", "daily-news"), ReadyEpisode.briefingTopicIds(body))
        assertEquals(emptyList<String>(), ReadyEpisode.briefingTopicIds("<html>502</html>"))
        assertEquals(emptyList<String>(), ReadyEpisode.briefingTopicIds("""{"success":false}"""))
    }
}
