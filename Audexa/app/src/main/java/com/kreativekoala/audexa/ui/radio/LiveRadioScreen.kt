package com.kreativekoala.audexa.ui.radio

import android.content.Intent
import android.net.Uri
import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.ui.theme.AccentOrange
import io.github.jan.supabase.realtime.broadcastFlow
import kotlinx.coroutines.launch
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive

private val REACTION_EMOJIS = listOf("🔥", "❤️", "😂", "🎵", "👏", "🤯")

// Badge colors for segment types
private val HeadlinesBadgeColor = Color(0xFF3B82F6)  // blue
private val DeepDiveBadgeColor = Color(0xFF9333EA)   // purple
private val RequestBadgeColor = Color(0xFFEA580C)    // orange
private val DefaultBadgeColor = Color(0xFF6B7280)    // gray

private fun segmentBadgeColor(segmentType: String): Color = when (segmentType) {
    "headlines" -> HeadlinesBadgeColor
    "deep_dive" -> DeepDiveBadgeColor
    "listener_request" -> RequestBadgeColor
    else -> DefaultBadgeColor
}

@Composable
fun LiveRadioScreen(
    onDismiss: () -> Unit,
    viewModel: LiveRadioViewModel = hiltViewModel()
) {
    val context = androidx.compose.ui.platform.LocalContext.current
    val isPlaying by viewModel.isPlaying.collectAsState()
    val isBuffering by viewModel.isBuffering.collectAsState()
    val chatMessages by viewModel.chatMessages.collectAsState()
    val moderationError by viewModel.moderationError.collectAsState()
    val nowPlaying by viewModel.nowPlaying.collectAsState()
    val upNextSegments by viewModel.upNextSegments.collectAsState()
    val requestSegments by viewModel.requestSegments.collectAsState()
    val pendingRequests by viewModel.pendingRequests.collectAsState()

    var chatText by remember { mutableStateOf("") }
    var lastReactionMs by remember { mutableLongStateOf(0L) }
    val floatingReactions = remember { mutableStateListOf<Pair<String, String>>() } // id, emoji
    val scope = rememberCoroutineScope()

    // Request Topic sheet
    var showRequestSheet by remember { mutableStateOf(false) }
    var requestTopicText by remember { mutableStateOf("") }
    var isSubmittingRequest by remember { mutableStateOf(false) }

    // Premium-required dialog (shown when non-premium users try to submit a topic)
    var showPremiumDialog by remember { mutableStateOf(false) }

    LaunchedEffect(viewModel) {
        viewModel.paywallRequested.collect {
            showRequestSheet = false
            showPremiumDialog = true
        }
    }

    fun sendReaction(emoji: String) {
        val now = System.currentTimeMillis()
        if (now - lastReactionMs < 333L) return
        lastReactionMs = now
        // Add locally immediately (broadcast doesn't echo to sender)
        val id = java.util.UUID.randomUUID().toString()
        floatingReactions.add(id to emoji)
        scope.launch {
            kotlinx.coroutines.delay(3000)
            floatingReactions.removeIf { it.first == id }
        }
        scope.launch {
            try {
                viewModel.channel.broadcast(
                    event = "reaction",
                    message = kotlinx.serialization.json.buildJsonObject {
                        put("emoji", kotlinx.serialization.json.JsonPrimitive(emoji))
                    }
                )
            } catch (_: Exception) {}
        }
    }

    LaunchedEffect(Unit) {
        viewModel.startStream()
        viewModel.connectChat()
        viewModel.startQueuePolling()
    }

    // Collect incoming emoji reactions from other listeners
    LaunchedEffect(viewModel.channel) {
        viewModel.channel.broadcastFlow<JsonObject>(event = "reaction")
            .collect { payload ->
                val emoji = payload["emoji"]?.jsonPrimitive?.content ?: return@collect
                val id = java.util.UUID.randomUUID().toString()
                floatingReactions.add(id to emoji)
                kotlinx.coroutines.delay(3000)
                floatingReactions.removeIf { it.first == id }
            }
    }

    DisposableEffect(Unit) {
        onDispose {
            viewModel.stopStream()
            viewModel.disconnectChat()
            viewModel.stopQueuePolling()
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(
                Brush.verticalGradient(
                    colors = listOf(Color(0xFF1A0A0A), Color(0xFF0D0D0D))
                )
            )
    ) {
        Column(
            modifier = Modifier
                .fillMaxSize()
        ) {
            // Scrollable content
            val scrollState = rememberScrollState()
            LaunchedEffect(chatMessages.size) {
                if (chatMessages.isNotEmpty()) scrollState.animateScrollTo(scrollState.maxValue)
            }
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(scrollState),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Top bar
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .statusBarsPadding()
                        .padding(horizontal = 24.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Surface(
                        shape = MaterialTheme.shapes.small,
                        color = Color(0xFFEF4444)
                    ) {
                        Text(
                            text = "● LIVE",
                            modifier = Modifier.padding(horizontal = 10.dp, vertical = 4.dp),
                            color = Color.White,
                            fontWeight = FontWeight.Bold,
                            fontSize = 12.sp
                        )
                    }

                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close",
                            tint = Color.White
                        )
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Station info
                Text(text = "📻", fontSize = 64.sp)

                Spacer(modifier = Modifier.height(12.dp))

                Text(
                    text = viewModel.stationName,
                    color = Color.White,
                    fontSize = 24.sp,
                    fontWeight = FontWeight.Bold
                )

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = "AI-powered 24/7 news and talk",
                    color = Color.White.copy(alpha = 0.5f),
                    fontSize = 13.sp
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Play/Pause button
                Box(
                    modifier = Modifier
                        .size(64.dp)
                        .clip(CircleShape)
                        .background(Color(0xFFEF4444)),
                    contentAlignment = Alignment.Center
                ) {
                    if (isBuffering) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(24.dp),
                            color = Color.White,
                            strokeWidth = 2.dp
                        )
                    } else {
                        IconButton(onClick = { viewModel.togglePlayback() }) {
                            Icon(
                                imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                                contentDescription = if (isPlaying) "Pause" else "Play",
                                tint = Color.White,
                                modifier = Modifier.size(32.dp)
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Now Playing bar
                nowPlaying?.let { np ->
                    NowPlayingBar(np)
                    Spacer(modifier = Modifier.height(8.dp))
                }

                // Up Next section
                if (upNextSegments.isNotEmpty()) {
                    QueueSection(
                        title = "Up Next",
                        segments = upNextSegments
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }

                // Requests section
                if (requestSegments.isNotEmpty()) {
                    QueueSection(
                        title = "Requests",
                        segments = requestSegments
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }

                // Pending listener requests (being generated)
                if (pendingRequests.isNotEmpty()) {
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 24.dp),
                        verticalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(6.dp)
                        ) {
                            Text("🎙️", fontSize = 12.sp)
                            Text(
                                text = "Generating",
                                color = Color(0xFFFB923C).copy(alpha = 0.7f),
                                fontSize = 12.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                        pendingRequests.forEach { topic ->
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                verticalAlignment = Alignment.CenterVertically,
                                horizontalArrangement = Arrangement.spacedBy(8.dp)
                            ) {
                                Text(
                                    text = topic,
                                    color = Color(0xFFFB923C),
                                    fontSize = 12.sp,
                                    maxLines = 1,
                                    overflow = TextOverflow.Ellipsis,
                                    modifier = Modifier.weight(1f)
                                )
                                Surface(
                                    shape = RoundedCornerShape(3.dp),
                                    color = Color(0xFFFB923C).copy(alpha = 0.3f)
                                ) {
                                    Text(
                                        text = "generating",
                                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                                        color = Color(0xFFFB923C),
                                        fontSize = 9.sp,
                                        fontWeight = FontWeight.SemiBold
                                    )
                                }
                            }
                        }
                    }
                    Spacer(modifier = Modifier.height(8.dp))
                }

                // Chat messages
                if (chatMessages.isNotEmpty()) {
                    ChatSection(messages = chatMessages)
                    Spacer(modifier = Modifier.height(8.dp))
                }

                // Emoji reaction row
                Row(
                    modifier = Modifier.padding(horizontal = 24.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp),
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    REACTION_EMOJIS.forEach { emoji ->
                        Text(
                            text = emoji,
                            fontSize = 28.sp,
                            modifier = Modifier.clickable(
                                interactionSource = remember { MutableInteractionSource() },
                                indication = null
                            ) { sendReaction(emoji) }
                        )
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
            }

            // ── Pinned chat input at bottom ──────────────────────────
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .background(Color(0xFF0D0D0D))
                    .navigationBarsPadding()
                    .padding(horizontal = 24.dp)
                    .padding(top = 8.dp, bottom = 8.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                // Phone call-in banner
                Surface(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clickable {
                            val intent = Intent(Intent.ACTION_DIAL, Uri.parse("tel:+18333981230"))
                            context.startActivity(intent)
                        },
                    shape = RoundedCornerShape(12.dp),
                    color = AccentOrange.copy(alpha = 0.15f)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 12.dp, vertical = 8.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(8.dp)
                    ) {
                        Text("📞", fontSize = 16.sp)
                        Column(modifier = Modifier.weight(1f)) {
                            Text(
                                text = "Call to request a topic",
                                color = Color.White,
                                fontSize = 12.sp,
                                fontWeight = FontWeight.SemiBold
                            )
                            Text(
                                text = "+1 (833) 398-1230",
                                color = AccentOrange,
                                fontSize = 13.sp,
                                fontWeight = FontWeight.Bold
                            )
                        }
                    }
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Request hint
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp)
                ) {
                    Text("🎙️", fontSize = 9.sp)
                    Text(
                        text = "Tap the",
                        color = Color.White.copy(alpha = 0.35f),
                        fontSize = 10.sp
                    )
                    Text(
                        text = "mic",
                        color = AccentOrange.copy(alpha = 0.7f),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "to request a topic for the live queue",
                        color = Color.White.copy(alpha = 0.35f),
                        fontSize = 10.sp
                    )
                }

                Spacer(modifier = Modifier.height(6.dp))

                // Chat input
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    // Request Topic button (opens dedicated sheet)
                    Box(
                        modifier = Modifier
                            .size(36.dp)
                            .clip(CircleShape)
                            .background(AccentOrange.copy(alpha = 0.15f))
                            .clickable {
                                requestTopicText = ""
                                showRequestSheet = true
                            },
                        contentAlignment = Alignment.Center
                    ) {
                        Icon(
                            imageVector = Icons.Default.Mic,
                            contentDescription = "Request Topic",
                            tint = AccentOrange,
                            modifier = Modifier.size(18.dp)
                        )
                    }

                    OutlinedTextField(
                        value = chatText,
                        onValueChange = {
                            chatText = it
                            viewModel.clearModerationError()
                        },
                        modifier = Modifier.weight(1f),
                        placeholder = {
                            Text(
                                "Chat with listeners...",
                                color = Color.White.copy(alpha = 0.4f),
                                fontSize = 13.sp
                            )
                        },
                        singleLine = true,
                        textStyle = LocalTextStyle.current.copy(
                            color = Color.White,
                            fontSize = 13.sp
                        ),
                        shape = RoundedCornerShape(18.dp),
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedContainerColor = Color.White.copy(alpha = 0.12f),
                            unfocusedContainerColor = Color.White.copy(alpha = 0.12f),
                            focusedBorderColor = Color.Transparent,
                            unfocusedBorderColor = Color.Transparent,
                            cursorColor = AccentOrange
                        )
                    )

                    IconButton(
                        onClick = {
                            viewModel.sendChat(chatText)
                            if (viewModel.moderationError.value == null) {
                                chatText = ""
                            }
                        },
                        enabled = chatText.trim().isNotEmpty()
                    ) {
                        Icon(
                            imageVector = Icons.Default.ArrowUpward,
                            contentDescription = "Send",
                            tint = if (chatText.trim().isNotEmpty()) AccentOrange else Color.White.copy(alpha = 0.2f),
                            modifier = Modifier.size(28.dp)
                        )
                    }
                }

                // Moderation error
                moderationError?.let { error ->
                    Text(
                        text = error,
                        color = Color(0xFFEF4444),
                        fontSize = 11.sp,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }
            }
        }

        // Floating emoji animations — local + incoming from others
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val containerWidthDp = maxWidth
            val containerHeightDp = maxHeight
            floatingReactions.forEach { (id, emoji) ->
                key(id) {
                    FloatingEmojiItem(
                        emoji = emoji,
                        startXDp = containerWidthDp * (0.1f + (id.hashCode().and(0xFF).toFloat() / 255f) * 0.8f),
                        startYDp = containerHeightDp * 0.75f,
                    )
                }
            }
        }

        // Request Topic bottom sheet
        if (showRequestSheet) {
            RequestTopicSheet(
                topicText = requestTopicText,
                onTopicChange = { requestTopicText = it },
                isSubmitting = isSubmittingRequest,
                onDismiss = { showRequestSheet = false },
                onSubmit = {
                    val topic = requestTopicText.trim()
                    if (topic.length >= 5 && !isSubmittingRequest) {
                        isSubmittingRequest = true
                        viewModel.submitTopicRequest(topic) { success ->
                            isSubmittingRequest = false
                            if (success) {
                                requestTopicText = ""
                                showRequestSheet = false
                            }
                            // On failure (incl. paywall trigger), leave text intact
                            // so the user can retry after upgrading.
                        }
                    }
                }
            )
        }

        // Premium-required dialog — shown when a non-premium user tries to submit
        if (showPremiumDialog) {
            AlertDialog(
                onDismissRequest = { showPremiumDialog = false },
                title = { Text("Premium feature") },
                text = {
                    Text(
                        "Topic requests are available to Audexa Premium subscribers. " +
                                "Upgrade to submit requests and hear them on the live radio."
                    )
                },
                confirmButton = {
                    TextButton(onClick = { showPremiumDialog = false }) {
                        Text("Learn more")
                    }
                },
                dismissButton = {
                    TextButton(onClick = { showPremiumDialog = false }) {
                        Text("Not now")
                    }
                }
            )
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun RequestTopicSheet(
    topicText: String,
    onTopicChange: (String) -> Unit,
    isSubmitting: Boolean,
    onDismiss: () -> Unit,
    onSubmit: () -> Unit
) {
    val sheetState = rememberModalBottomSheetState()
    val canSubmit = topicText.trim().length >= 3 && !isSubmitting

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        sheetState = sheetState,
        containerColor = Color(0xFF120606),
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp, vertical = 8.dp)
                .padding(bottom = 24.dp)
        ) {
            Text(
                text = "Request a Topic",
                color = Color.White,
                fontSize = 20.sp,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = "Tell Audexa Radio what you'd like to hear. It will be added to the live queue.",
                color = Color.White.copy(alpha = 0.6f),
                fontSize = 13.sp
            )

            Spacer(modifier = Modifier.height(16.dp))

            OutlinedTextField(
                value = topicText,
                onValueChange = onTopicChange,
                modifier = Modifier.fillMaxWidth(),
                placeholder = {
                    Text(
                        "e.g. climate change, Lakers news, Hollywood gossip…",
                        color = Color.White.copy(alpha = 0.4f),
                        fontSize = 14.sp
                    )
                },
                singleLine = true,
                textStyle = LocalTextStyle.current.copy(
                    color = Color.White,
                    fontSize = 15.sp
                ),
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedContainerColor = Color.White.copy(alpha = 0.12f),
                    unfocusedContainerColor = Color.White.copy(alpha = 0.12f),
                    focusedBorderColor = Color.Transparent,
                    unfocusedBorderColor = Color.Transparent,
                    cursorColor = AccentOrange
                )
            )

            Spacer(modifier = Modifier.height(16.dp))

            Button(
                onClick = onSubmit,
                enabled = canSubmit,
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AccentOrange,
                    disabledContainerColor = AccentOrange.copy(alpha = 0.3f),
                    contentColor = Color.White,
                    disabledContentColor = Color.White
                )
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp),
                    modifier = Modifier.padding(vertical = 6.dp)
                ) {
                    if (isSubmitting) {
                        CircularProgressIndicator(
                            modifier = Modifier.size(16.dp),
                            color = Color.White,
                            strokeWidth = 2.dp
                        )
                    } else {
                        Icon(
                            imageVector = Icons.Default.Mic,
                            contentDescription = null,
                            modifier = Modifier.size(18.dp)
                        )
                    }
                    Text(
                        text = if (isSubmitting) "Submitting…" else "Add to Live Queue",
                        fontSize = 15.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

@Composable
private fun NowPlayingBar(np: NowPlayingInfo) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp)
            .background(
                Color.White.copy(alpha = 0.06f),
                RoundedCornerShape(8.dp)
            )
            .padding(horizontal = 12.dp, vertical = 6.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        // NOW badge
        Surface(
            shape = RoundedCornerShape(3.dp),
            color = Color(0xFFEF4444).copy(alpha = 0.8f)
        ) {
            Text(
                text = "NOW",
                modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                color = Color.White,
                fontSize = 9.sp,
                fontWeight = FontWeight.ExtraBold
            )
        }

        if (np.source == "music") {
            Text("🎵", fontSize = 12.sp)
            Text(
                text = "Music",
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold
            )
        } else if (!np.topicName.isNullOrBlank()) {
            Text(
                text = np.topicName,
                color = Color.White,
                fontSize = 13.sp,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.weight(1f)
            )
        }

        Spacer(modifier = Modifier.weight(1f))

        np.remainingSeconds?.let { remaining ->
            if (remaining > 0) {
                val minutes = (remaining / 60).toInt()
                val seconds = (remaining.toInt() % 60)
                Text(
                    text = "$minutes:${"%02d".format(seconds)}",
                    color = Color.White.copy(alpha = 0.4f),
                    fontSize = 11.sp
                )
            }
        }
    }
}

@Composable
private fun QueueSection(
    title: String,
    segments: List<RadioQueueSegment>
) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        // Header
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = title,
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
            Surface(
                shape = RoundedCornerShape(4.dp),
                color = Color.White.copy(alpha = 0.1f)
            ) {
                Text(
                    text = "${segments.size}",
                    modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
                    color = Color.White.copy(alpha = 0.4f),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.Bold
                )
            }
        }

        // Items
        segments.forEachIndexed { index, segment ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Text(
                    text = "${index + 1}",
                    color = Color.White.copy(alpha = 0.35f),
                    fontSize = 10.sp,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.width(20.dp)
                )
                Text(
                    text = segment.topicName,
                    color = Color.White.copy(alpha = 0.6f),
                    fontSize = 12.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.weight(1f)
                )
                Surface(
                    shape = RoundedCornerShape(3.dp),
                    color = segmentBadgeColor(segment.segmentType).copy(alpha = 0.5f)
                ) {
                    Text(
                        text = segment.segmentLabel,
                        modifier = Modifier.padding(horizontal = 5.dp, vertical = 2.dp),
                        color = Color.White.copy(alpha = 0.9f),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}

@Composable
private fun ChatSection(messages: List<ChatMessage>) {
    Column(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 24.dp),
        verticalArrangement = Arrangement.spacedBy(4.dp)
    ) {
        // Header
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            Text(
                text = "💬",
                fontSize = 12.sp
            )
            Text(
                text = "Chat",
                color = Color.White.copy(alpha = 0.7f),
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold
            )
        }

        // Messages (show last 8)
        messages.takeLast(8).forEach { msg ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = msg.username,
                    color = Color.White.copy(alpha = 0.7f),
                    fontSize = 11.sp,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = msg.text,
                    color = if (msg.isRequest) AccentOrange else Color.White.copy(alpha = 0.5f),
                    fontSize = 11.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun FloatingEmojiItem(
    emoji: String,
    startXDp: Dp,
    startYDp: Dp,
) {
    val density = LocalDensity.current
    val startYPx = with(density) { startYDp.toPx() }

    val offsetY = remember { Animatable(startYPx) }
    val alpha = remember { Animatable(1f) }

    LaunchedEffect(Unit) {
        launch {
            offsetY.animateTo(
                targetValue = startYPx - with(density) { 200.dp.toPx() },
                animationSpec = tween(durationMillis = 2500),
            )
        }
        launch {
            kotlinx.coroutines.delay(1500)
            alpha.animateTo(
                targetValue = 0f,
                animationSpec = tween(durationMillis = 1000),
            )
        }
    }

    val currentYDp = with(density) { offsetY.value.toDp() }

    Text(
        text = emoji,
        fontSize = 32.sp,
        modifier = Modifier
            .absoluteOffset(x = startXDp, y = currentYDp)
            .alpha(alpha.value),
    )
}
