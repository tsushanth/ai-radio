package com.kreativekoala.audexa.ui.radio

import android.util.Log
import androidx.lifecycle.SavedStateHandle
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.billing.BillingManager
import com.kreativekoala.audexa.service.AudioManager
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
    val segmentLabel: String
        get() = when (segmentType) {
            "headlines" -> "Headlines"
            "deep_dive" -> "Deep Dive"
            "listener_request" -> "Request"
            else -> segmentType.replace("_", " ")
                .replaceFirstChar { it.uppercase() }
        }

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
    private val audioManager: AudioManager,
    private val billingManager: BillingManager,
    val supabase: SupabaseClient,
    savedStateHandle: SavedStateHandle
) : ViewModel() {

    // Emits when a non-premium user tries to submit — Screen collects to show paywall.
    private val _paywallRequested = Channel<Unit>(Channel.BUFFERED)
    val paywallRequested = _paywallRequested.receiveAsFlow()


    companion object {
        private const val TAG = "LiveRadioVM"
        private const val DEFAULT_STREAM_URL = "https://radio.audexa.app/stream"
        private const val DEFAULT_STATION_NAME = "Audexa Radio"
        private const val STATUS_URL = "http://178.156.192.31:8081/api/status"
        private const val REQUEST_TOPIC_URL = "http://178.156.192.31:8081/api/request-topic"
        private const val MAX_CHAT_MESSAGES = 50
    }

    val streamUrl: String = savedStateHandle.get<String>("streamUrl") ?: DEFAULT_STREAM_URL
    val stationName: String = savedStateHandle.get<String>("stationName") ?: DEFAULT_STATION_NAME

    val isPlaying: StateFlow<Boolean> = audioManager.isPlaying
    val isBuffering: StateFlow<Boolean> = audioManager.isBuffering

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

    fun startStream() {
        audioManager.play(
            id = "audexa-radio-${streamUrl.hashCode()}",
            title = stationName,
            description = "AI-powered 24/7 news and talk radio",
            audioUrl = streamUrl
        )
    }

    fun togglePlayback() {
        if (audioManager.isPlaying.value) {
            audioManager.pause()
        } else {
            startStream()
        }
    }

    fun stopStream() {
        audioManager.pause()
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
                            val username = payload["username"]?.jsonPrimitive?.content ?: "Listener"
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
            username = "You",
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
                        put("username", JsonPrimitive("Listener"))
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
                return "Message blocked: inappropriate language"
            }
        }

        // Phone number (7+ consecutive digits)
        if (Regex("""\b\d[\d\s\-()]{6,}\d\b""").containsMatchIn(lower)) {
            return "Message blocked: please don't share phone numbers"
        }

        // Email address
        if (Regex("""[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}""").containsMatchIn(lower)) {
            return "Message blocked: please don't share email addresses"
        }

        // SSN
        if (Regex("""\b\d{3}-\d{2}-\d{4}\b""").containsMatchIn(lower)) {
            return "Message blocked: please don't share personal ID numbers"
        }

        // Credit card (16 digits)
        if (Regex("""\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b""").containsMatchIn(lower)) {
            return "Message blocked: please don't share card numbers"
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
                                put("text", JsonPrimitive("🎙️ Request queued: \"$topic\" — position #$position, ~${waitMinutes.toInt()} min wait"))
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
