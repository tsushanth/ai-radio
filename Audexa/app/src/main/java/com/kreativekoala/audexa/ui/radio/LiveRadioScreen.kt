package com.kreativekoala.audexa.ui.radio

import android.content.Intent
import android.net.Uri
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowUpward
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.ui.components.LiveReactionOverlay
import com.kreativekoala.audexa.ui.theme.AccentOrange

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

    LaunchedEffect(Unit) {
        viewModel.startStream()
        viewModel.connectChat()
        viewModel.startQueuePolling()
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
        // Live reaction floating emojis
        LiveReactionOverlay(
            supabase = viewModel.supabase,
            modifier = Modifier.fillMaxSize()
        )

        Column(
            modifier = Modifier
                .fillMaxSize()
        ) {
            // Scrollable content
            Column(
                modifier = Modifier
                    .weight(1f)
                    .verticalScroll(rememberScrollState()),
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

                // Emoji hint
                Text(
                    text = "Tap an emoji to react live",
                    color = Color.White.copy(alpha = 0.4f),
                    fontSize = 13.sp
                )

                Spacer(modifier = Modifier.height(12.dp))
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
                        text = "Type",
                        color = Color.White.copy(alpha = 0.35f),
                        fontSize = 10.sp
                    )
                    Text(
                        text = "@audexa",
                        color = AccentOrange.copy(alpha = 0.7f),
                        fontSize = 10.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = "+ topic to add to the live queue",
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
                    OutlinedTextField(
                        value = chatText,
                        onValueChange = {
                            chatText = it
                            viewModel.clearModerationError()
                        },
                        modifier = Modifier.weight(1f),
                        placeholder = {
                            Text(
                                "Chat or @audexa climate change...",
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
