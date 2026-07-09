package com.kreativekoala.audexa.ui.components

import androidx.compose.animation.core.Animatable
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.alpha
import androidx.compose.ui.platform.LocalDensity
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.material3.Text
import io.github.jan.supabase.realtime.RealtimeChannel
import io.github.jan.supabase.realtime.broadcastFlow
import kotlinx.coroutines.delay
import kotlinx.coroutines.launch
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

val REACTION_EMOJIS = listOf("🔥", "❤️", "😂", "🎵", "👏", "🤯")
private const val RATE_LIMIT_MS = 333L   // ~3 per second
private const val REACTION_TTL_MS = 3000L

// ---------------------------------------------------------------------------
// Overlay Composable — floating emojis only, no built-in picker
// ---------------------------------------------------------------------------

/**
 * Floating emoji animation layer. Place as last child in a Box to render on top.
 * Does NOT include an emoji picker — add one separately in the screen.
 * Call [sendReaction] to trigger a local float + broadcast.
 */
@Composable
fun LiveReactionOverlay(
    channel: RealtimeChannel,
    modifier: Modifier = Modifier,
) {
    val scope = rememberCoroutineScope()
    val floatingEmojis = remember { mutableStateListOf<FloatingEmoji>() }

    // Helper exposed via composition local so the screen can trigger reactions
    val addEmoji: (String) -> Unit = { emoji ->
        val item = FloatingEmoji(emoji = emoji)
        floatingEmojis.add(item)
        scope.launch {
            delay(REACTION_TTL_MS)
            floatingEmojis.remove(item)
        }
    }

    // Listen for reactions from other users
    LaunchedEffect(channel) {
        channel.broadcastFlow<JsonObject>(event = "reaction")
            .collect { payload ->
                val emoji = payload["emoji"]?.jsonPrimitive?.content ?: return@collect
                addEmoji(emoji)
            }
    }

    // Expose addEmoji via CompositionLocal so the picker in the screen can use it
    CompositionLocalProvider(LocalReactionSender provides addEmoji) {
        BoxWithConstraints(modifier = modifier.fillMaxSize()) {
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
    }
}

// CompositionLocal so screens inside the overlay tree can trigger reactions
val LocalReactionSender = compositionLocalOf<((String) -> Unit)> { {} }

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
