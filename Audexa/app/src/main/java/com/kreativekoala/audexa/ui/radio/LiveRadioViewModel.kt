package com.kreativekoala.audexa.ui.radio

import dagger.hilt.android.qualifiers.ApplicationContext
import com.kreativekoala.audexa.R
import androidx.annotation.StringRes
import android.content.Context
import android.util.Log
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.analytics.Analytics
import com.kreativekoala.audexa.analytics.AnalyticsEngine
import com.kreativekoala.audexa.billing.BillingManager
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.TopicEpisode
import com.kreativekoala.audexa.data.repository.TopicRepository
import com.kreativekoala.audexa.service.AudioManager
import com.kreativekoala.audexa.service.SlowStreamFallback
import com.kreativekoala.audexa.service.StartStatus
import com.kreativekoala.audexa.util.LiveShare
import com.kreativekoala.audexa.util.TextLanguageSource
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.channels.Channel
import kotlinx.coroutines.flow.receiveAsFlow
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.broadcastFlow
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.isActive
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.*
import java.net.HttpURLConnection
import java.net.URL
import java.net.URLEncoder
import javax.inject.Inject

// ----------- Data Models -----------

data class ChatMessage(
    val id: String = java.util.UUID.randomUUID().toString(),
    val username: String,
    val text: String,
    val isRequest: Boolean = false,
    val timestamp: Long = System.currentTimeMillis()
)

data class RadioQueueSegment(
    val filename: String,
    val segmentType: String,
    val topicName: String,
    val createdAt: String
) {
    /** Known server segment types have a translated label; an unknown type falls back to [segmentLabelFallback]. */
    @get:StringRes
    val segmentLabelRes: Int?
        get() = when (segmentType) {
            "headlines" -> R.string.radio_segment_headlines
            "deep_dive" -> R.string.radio_segment_deep_dive
            "listener_request" -> R.string.radio_segment_request
            else -> null
        }

    val segmentLabelFallback: String
        get() = segmentType.replace("_", " ")
            .replaceFirstChar { it.uppercase() }

    val badgeColorType: String
        get() = segmentType // Used in composable for color mapping
}

data class NowPlayingInfo(
    val source: String?,
    val topicName: String?,
    val segmentType: String?,
    val track: String?,
    val remainingSeconds: Double?
)

// ----------- ViewModel -----------

@HiltViewModel
class LiveRadioViewModel @Inject constructor(
    @ApplicationContext private val appContext: Context,
    private val audioManager: AudioManager,
    private val billingManager: BillingManager,
    val supabase: SupabaseClient,
    private val topicRepository: TopicRepository,
    private val preferencesManager: PreferencesManager,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    // Emits when a non-premium user tries to submit — Screen collects to show paywall.
    private val _paywallRequested = Channel<Unit>(Channel.BUFFERED)
    val paywallRequested = _paywallRequested.receiveAsFlow()


    companion object {
        private const val TAG = "LiveRadioVM"
        private const val DEFAULT_STREAM_URL = "https://radio.audexa.app/stream"
        private const val DEFAULT_STATION_NAME = "Audexa Radio"
        /** What every client sends as the chat name of an anonymous listener; receivers translate it for display. */
        private const val WIRE_ANONYMOUS_NAME = "Listener"
        private const val STATUS_URL = "https://radio.audexa.app/api/status"
        private const val REQUEST_TOPIC_URL = "https://radio.audexa.app/api/request-topic"
        private const val MAX_CHAT_MESSAGES = 50
    }

    val streamUrl: String = savedStateHandle.get<String>("streamUrl") ?: DEFAULT_STREAM_URL
    val stationName: String = savedStateHandle.get<String>("stationName") ?: DEFAULT_STATION_NAME

    val isPlaying: StateFlow<Boolean> = audioManager.isPlaying
    val isBuffering: StateFlow<Boolean> = audioManager.isBuffering
    val playbackError: StateFlow<com.kreativekoala.audexa.service.PlaybackError?> = audioManager.playbackError

    // Chat messages
    private val _chatMessages = MutableStateFlow<List<ChatMessage>>(emptyList())
    val chatMessages: StateFlow<List<ChatMessage>> = _chatMessages.asStateFlow()

    // Moderation error
    private val _moderationError = MutableStateFlow<String?>(null)
    val moderationError: StateFlow<String?> = _moderationError.asStateFlow()

    // Queue
    private val _nowPlaying = MutableStateFlow<NowPlayingInfo?>(null)
    val nowPlaying: StateFlow<NowPlayingInfo?> = _nowPlaying.asStateFlow()

    private val _upNextSegments = MutableStateFlow<List<RadioQueueSegment>>(emptyList())
    val upNextSegments: StateFlow<List<RadioQueueSegment>> = _upNextSegments.asStateFlow()

    private val _requestSegments = MutableStateFlow<List<RadioQueueSegment>>(emptyList())
    val requestSegments: StateFlow<List<RadioQueueSegment>> = _requestSegments.asStateFlow()

    private val _pendingRequests = MutableStateFlow<List<String>>(emptyList())
    val pendingRequests: StateFlow<List<String>> = _pendingRequests.asStateFlow()

    // Supabase channel — shared with LiveReactionOverlay so only one subscription exists
    val channel = supabase.channel("radio:live")
    private var chatListenerJob: Job? = null
    private var queuePollingJob: Job? = null

    // Profanity blocklist
    private val blockedWords = listOf(
        "fuck", "shit", "bitch", "ass hole", "asshole", "nigger", "nigga", "faggot",
        "cunt", "dick", "cock", "pussy", "slut", "whore", "retard", "kys",
        "kill yourself", "rape", "porn", "hentai", "nude"
    )

    // The episode started in place of a slow stream; it counts only while it is what the player holds.
    private val _fallback = MutableStateFlow<TopicEpisode?>(null)
    val fallbackEpisode: StateFlow<TopicEpisode?> =
        combine(_fallback, audioManager.currentEpisodeId) { episode, playingId -> episode?.takeIf { it.id == playingId } }
            .stateIn(viewModelScope, SharingStarted.Eagerly, null)
    private var fallbackJob: Job? = null

    private val onFallback: Boolean
        get() = _fallback.value?.let { it.id == audioManager.currentEpisodeId.value } == true

    /** The screen appeared. A fallback episode that is already on is not interrupted (the screen can be redrawn). */
    fun onScreenShown() {
        if (!onFallback) startStream()
    }

    fun startStream(allowFallback: Boolean = true) {
        fallbackJob?.cancel()
        _fallback.value = null
        audioManager.play(
            id = "audexa-radio-${streamUrl.hashCode()}",
            title = stationName,
            description = appContext.getString(R.string.radio_tagline),
            audioUrl = streamUrl
        )
        if (allowFallback) watchForSlowStream()
    }

    private fun watchForSlowStream() {
        val token = audioManager.startAttempt.value.token
        val radioLanguage = LiveShare.languageFromStreamUrl(streamUrl)
        fallbackJob = viewModelScope.launch {
            val decision = SlowStreamFallback.watch(
                audioManager.startAttempt.map { if (it.token == token) it.status else StartStatus.GONE }
            ) {
                topicRepository.findReadyEpisode(
                    TextLanguageSource.forRequest(radioLanguage),
                    preferencesManager.bookmarkedTopics.first()
                )
            } ?: return@launch
            // Never cut off audio that is playing.
            if (audioManager.isPlaying.value) return@launch

            val episode = decision.episode
            trackFallback(
                if (episode == null) "none_ready" else "episode_started",
                episode?.topicId,
                decision.reason.code
            )
            if (episode == null) return@launch
            _fallback.value = episode
            audioManager.play(episode, fallback = true)
        }
    }

    private fun trackFallback(outcome: String, topicId: String?, reason: String? = null) {
        val props = HashMap<String, Any>()
        props["outcome"] = outcome
        props["language"] = AnalyticsEngine.cleanLang(LiveShare.languageFromStreamUrl(streamUrl))
        reason?.let { props["reason"] = it }
        AnalyticsEngine.cleanTopicId(topicId)?.let { props["topic_id"] = it }
        Analytics.track("stream_fallback", props)
    }

    /** "Back to live radio": the listener's choice, so the stream is given all the time it needs. */
    fun backToLive() {
        trackFallback("user_back", _fallback.value?.topicId)
        startStream(allowFallback = false)
    }

    /** The Retry button under a playback error. */
    fun retry() {
        if (onFallback) audioManager.retry() else startStream()
    }

    fun togglePlayback() {
        when {
            onFallback -> audioManager.togglePlayPause()
            audioManager.isPlaying.value -> audioManager.pause()
            else -> startStream()
        }
    }

    /** Leaving the radio screen stops the radio. A fallback episode is an ordinary episode and keeps playing. */
    fun stopStream() {
        fallbackJob?.cancel()
        if (!onFallback) audioManager.pause()
    }

    // ----------- Chat -----------

    fun connectChat() {
        viewModelScope.launch {
            try {
                // Listen for chat broadcasts
                chatListenerJob = launch {
                    channel.broadcastFlow<JsonObject>(event = "chat")
                        .collect { payload ->
                            val text = payload["text"]?.jsonPrimitive?.content ?: return@collect
                            // "Listener" is the name every client sends for an anonymous listener (wire value); each device shows it in its own language.
                            val sentName = payload["username"]?.jsonPrimitive?.content
                            val username = if (sentName == null || sentName == WIRE_ANONYMOUS_NAME) appContext.getString(R.string.chat_listener) else sentName
                            if (text.isBlank()) return@collect

                            val isRequest = text.contains("@audexa", ignoreCase = true)
                            val msg = ChatMessage(
                                username = username,
                                text = text,
                                isRequest = isRequest
                            )
                            val updated = (_chatMessages.value + msg).takeLast(MAX_CHAT_MESSAGES)
                            _chatMessages.value = updated
                        }
                }

                channel.subscribe()
                Log.d(TAG, "Chat channel subscribed")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to subscribe chat channel: ${e.message}")
            }
        }
    }

    fun disconnectChat() {
        chatListenerJob?.cancel()
        viewModelScope.launch {
            try {
                channel.unsubscribe()
            } catch (_: Exception) {}
        }
    }

    fun sendChat(text: String) {
        val trimmed = text.trim()
        if (trimmed.isEmpty()) return

        // Content moderation
        val rejection = moderateMessage(trimmed)
        if (rejection != null) {
            _moderationError.value = rejection
            return
        }
        _moderationError.value = null

        // Add own message locally immediately (Supabase broadcast doesn't echo to sender)
        val ownMsg = ChatMessage(
            username = appContext.getString(R.string.chat_you),
            text = trimmed,
            isRequest = trimmed.contains("@audexa", ignoreCase = true)
        )
        _chatMessages.value = (_chatMessages.value + ownMsg).takeLast(MAX_CHAT_MESSAGES)

        viewModelScope.launch {
            try {
                channel.broadcast(
                    event = "chat",
                    message = buildJsonObject {
                        put("text", JsonPrimitive(trimmed))
                        put("username", JsonPrimitive(WIRE_ANONYMOUS_NAME))
                    }
                )
                Log.d(TAG, "Chat sent: $trimmed")
            } catch (e: Exception) {
                Log.e(TAG, "Failed to send chat: ${e.message}")
            }

            // If contains @audexa, POST the request topic
            val audexaIndex = trimmed.indexOf("@audexa", ignoreCase = true)
            if (audexaIndex >= 0) {
                val afterTag = trimmed.substring(audexaIndex + 7).trim()
                val topic = afterTag.ifEmpty { trimmed }
                postRequestTopic(topic)
            }
        }
    }

    fun clearModerationError() {
        _moderationError.value = null
    }

    private fun moderateMessage(text: String): String? {
        val lower = text.lowercase()

        // Profanity check
        for (word in blockedWords) {
            if (lower.contains(word)) {
                return appContext.getString(R.string.chat_blocked_language)
            }
        }

        // Phone number (7+ consecutive digits)
        if (Regex("""\b\d[\d\s\-()]{6,}\d\b""").containsMatchIn(lower)) {
            return appContext.getString(R.string.chat_blocked_phone)
        }

        // Email address
        if (Regex("""[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}""").containsMatchIn(lower)) {
            return appContext.getString(R.string.chat_blocked_email)
        }

        // SSN
        if (Regex("""\b\d{3}-\d{2}-\d{4}\b""").containsMatchIn(lower)) {
            return appContext.getString(R.string.chat_blocked_id)
        }

        // Credit card (16 digits)
        if (Regex("""\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b""").containsMatchIn(lower)) {
            return appContext.getString(R.string.chat_blocked_card)
        }

        return null
    }

    /**
     * Submit a topic to the live queue from the dedicated "Request Topic" sheet.
     * Same effect as `@audexa` in chat, but bypasses the chat broadcast.
     */
    fun submitTopicRequest(topic: String, onComplete: (Boolean) -> Unit = {}) {
        val cleaned = topic.trim()
        if (cleaned.length < 5) {
            onComplete(false)
            return
        }
        if (!billingManager.isSubscribed.value) {
            _paywallRequested.trySend(Unit)
            onComplete(false)
            return
        }
        viewModelScope.launch {
            postRequestTopic(cleaned)
            onComplete(true)
        }
    }

    private suspend fun postRequestTopic(topic: String) = withContext(Dispatchers.IO) {
        try {
            val encoded = URLEncoder.encode(topic, "UTF-8")
            val url = URL("$REQUEST_TOPIC_URL?topic=$encoded")
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "POST"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000

            val responseCode = connection.responseCode
            if (responseCode == 200) {
                val responseBody = connection.inputStream.bufferedReader().readText()
                try {
                    val json = Json.parseToJsonElement(responseBody).jsonObject
                    val position = json["position"]?.jsonPrimitive?.intOrNull
                    val waitMinutes = json["estimated_wait_minutes"]?.jsonPrimitive?.doubleOrNull
                    if (position != null && waitMinutes != null) {
                        // Broadcast acknowledgment
                        channel.broadcast(
                            event = "chat",
                            message = buildJsonObject {
                                put("text", JsonPrimitive(appContext.getString(R.string.radio_request_queued, topic, position, waitMinutes.toInt())))
                                put("username", JsonPrimitive("Audexa Radio"))
                            }
                        )
                    }
                } catch (_: Exception) {}
                Log.d(TAG, "Request topic posted successfully")
            }
            connection.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to post request topic: ${e.message}")
        }
    }

    // ----------- Queue Polling -----------

    fun startQueuePolling() {
        queuePollingJob?.cancel()
        queuePollingJob = viewModelScope.launch {
            while (isActive) {
                fetchQueueStatus()
                delay(10_000)
            }
        }
    }

    fun stopQueuePolling() {
        queuePollingJob?.cancel()
    }

    private suspend fun fetchQueueStatus() = withContext(Dispatchers.IO) {
        try {
            val url = URL(STATUS_URL)
            val connection = url.openConnection() as HttpURLConnection
            connection.requestMethod = "GET"
            connection.connectTimeout = 10000
            connection.readTimeout = 10000

            if (connection.responseCode == 200) {
                val body = connection.inputStream.bufferedReader().readText()
                val json = Json { ignoreUnknownKeys = true }.parseToJsonElement(body).jsonObject

                // Parse now_playing
                val npJson = json["now_playing"]?.jsonObject
                _nowPlaying.value = npJson?.let {
                    NowPlayingInfo(
                        source = it["source"]?.jsonPrimitive?.contentOrNull,
                        topicName = it["topic_name"]?.jsonPrimitive?.contentOrNull,
                        segmentType = it["segment_type"]?.jsonPrimitive?.contentOrNull,
                        track = it["track"]?.jsonPrimitive?.contentOrNull,
                        remainingSeconds = it["remaining_seconds"]?.jsonPrimitive?.doubleOrNull
                    )
                }

                // Parse ready_queue
                val queueArray = json["ready_queue"]?.jsonArray ?: JsonArray(emptyList())
                val segments = queueArray.mapNotNull { element ->
                    try {
                        val obj = element.jsonObject
                        RadioQueueSegment(
                            filename = obj["filename"]?.jsonPrimitive?.content ?: return@mapNotNull null,
                            segmentType = obj["segment_type"]?.jsonPrimitive?.content ?: "",
                            topicName = obj["topic_name"]?.jsonPrimitive?.content ?: "",
                            createdAt = obj["created_at"]?.jsonPrimitive?.content ?: ""
                        )
                    } catch (_: Exception) { null }
                }.map { it.copy(topicName = it.topicName.replace(Regex("^\\[\\w+\\]\\s*"), "")) } // Strip language prefix like [en]

                _upNextSegments.value = segments.filter { it.segmentType != "listener_request" }.take(5)
                _requestSegments.value = segments.filter { it.segmentType == "listener_request" }

                // Parse pending listener requests
                val pendingArray = json["pending_requests"]?.jsonArray ?: JsonArray(emptyList())
                _pendingRequests.value = pendingArray.mapNotNull { el ->
                    try { el.jsonObject["topic"]?.jsonPrimitive?.content } catch (_: Exception) { null }
                }
            }
            connection.disconnect()
        } catch (e: Exception) {
            Log.e(TAG, "Failed to fetch queue status: ${e::class.simpleName}: ${e.message}", e)
        }
    }
}
