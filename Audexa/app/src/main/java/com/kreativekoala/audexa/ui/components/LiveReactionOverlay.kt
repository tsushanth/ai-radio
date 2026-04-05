package com.kreativekoala.audexa.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import io.github.jan.supabase.SupabaseClient
import io.github.jan.supabase.realtime.channel
import io.github.jan.supabase.realtime.broadcastFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
import kotlinx.serialization.Serializable
import kotlinx.serialization.json.JsonObject
import kotlinx.serialization.json.jsonPrimitive
import java.util.UUID
import kotlin.random.Random

// ---------------------------------------------------------------------------
// Data
// ---------------------------------------------------------------------------

private data class FloatingEmoji(
    val id: String = UUID.randomUUID().toString(),
    val emoji: String,
    /** 0.1 … 0.9 fraction of container width */
    val xFraction: Float = Random.nextFloat() * 0.8f + 0.1f,
)

private val REACTION_EMOJIS = listOf("🔥", "❤️", "😂", "🎵", "👏", "🤯")
private const val RATE_LIMIT_MS = 333L   // ~3 per second
private const val REACTION_TTL_MS = 3000L

// ---------------------------------------------------------------------------
// Overlay Composable
// ---------------------------------------------------------------------------

/**
 * Full-screen live reaction overlay.
 * Place inside a [Box] (or any layout that acts as a container).
 * Requires a Hilt-injected [SupabaseClient] that has Realtime installed.
 *
 * Usage:
 * ```
 * Box(Modifier.fillMaxSize()) {
 *     // … your player content …
 *     LiveReactionOverlay(supabase = supabase)
 * }
 * ```
 */
@Composable
fun LiveReactionOverlay(
    supabase: SupabaseClient,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val floatingEmojis = remember { mutableStateListOf<FloatingEmoji>() }
    var lastSendMs by remember { mutableLongStateOf(0L) }

    val channel = remember(supabase) { supabase.channel("radio:live") }

    // Subscribe + listen
    LaunchedEffect(channel) {
        channel.broadcastFlow<JsonObject>(event = "reaction")
            .collect { payload ->
                val emoji = payload["emoji"]?.jsonPrimitive?.content ?: return@collect
                val item = FloatingEmoji(emoji = emoji)
                floatingEmojis.add(item)
                delay(REACTION_TTL_MS)
                floatingEmojis.remove(item)
            }
    }

    LaunchedEffect(channel) {
        channel.subscribe()
    }

    DisposableEffect(channel) {
        onDispose {
            scope.launch { channel.unsubscribe() }
        }
    }

    // ---------------------------------------------------------------------------
    // UI
    // ---------------------------------------------------------------------------

    Box(modifier = modifier.fillMaxSize()) {
        // Floating emoji layer
        BoxWithConstraints(modifier = Modifier.fillMaxSize()) {
            val density = LocalDensity.current
            val containerWidthDp = maxWidth
            val containerHeightDp = maxHeight

            floatingEmojis.forEach { item ->
                key(item.id) {
                    FloatingEmojiItem(
                        emoji = item.emoji,
                        startXDp = containerWidthDp * item.xFraction,
                        startYDp = containerHeightDp * 0.75f,
                    )
                }
            }
        }

        // Emoji picker pill — anchored to bottom center
        Surface(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 20.dp),
            shape = RoundedCornerShape(50),
            color = Color.Black.copy(alpha = 0.40f),
            tonalElevation = 0.dp,
        ) {
            Row(
                modifier = Modifier.padding(horizontal = 18.dp, vertical = 10.dp),
                horizontalArrangement = Arrangement.spacedBy(14.dp),
                verticalAlignment = Alignment.CenterVertically,
            ) {
                REACTION_EMOJIS.forEach { emoji ->
                    Text(
                        text = emoji,
                        fontSize = 26.sp,
                        modifier = Modifier.clickable {
                            val now = System.currentTimeMillis()
                            if (now - lastSendMs >= RATE_LIMIT_MS) {
                                lastSendMs = now
                                scope.launch {
                                    channel.broadcast(
                                        event = "reaction",
                                        message = kotlinx.serialization.json.buildJsonObject {
                                            put("emoji", kotlinx.serialization.json.JsonPrimitive(emoji))
                                        },
                                    )
                                }
                            }
                        },
                    )
                }
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Floating Emoji Item
// ---------------------------------------------------------------------------

@Composable
private fun FloatingEmojiItem(
    emoji: String,
    startXDp: androidx.compose.ui.unit.Dp,
    startYDp: androidx.compose.ui.unit.Dp,
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
            delay(1500)
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
