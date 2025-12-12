package com.kreativekoala.audexa.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kreativekoala.audexa.data.model.Episode
import com.kreativekoala.audexa.ui.theme.*

@Composable
fun EpisodeShowCard(
    episode: Episode,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = CardBackground,
        modifier = modifier.width(160.dp)
    ) {
        Column {
            // Episode artwork
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .aspectRatio(1f)
                    .clip(RoundedCornerShape(topStart = 12.dp, topEnd = 12.dp))
                    .background(
                        episode.imageColor?.let { parseColor(it) } ?: AccentOrange
                    ),
                contentAlignment = Alignment.Center
            ) {
                // Play button overlay
                Surface(
                    shape = RoundedCornerShape(50),
                    color = PrimaryText.copy(alpha = 0.9f),
                    modifier = Modifier.size(40.dp)
                ) {
                    Box(contentAlignment = Alignment.Center) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = "Play",
                            tint = Background,
                            modifier = Modifier.size(24.dp)
                        )
                    }
                }
            }

            // Episode info
            Column(
                modifier = Modifier.padding(12.dp)
            ) {
                Text(
                    text = episode.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = PrimaryText,
                    fontWeight = FontWeight.Medium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = episode.showName,
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )

                Spacer(modifier = Modifier.height(4.dp))

                Text(
                    text = episode.durationFormatted,
                    style = MaterialTheme.typography.bodySmall,
                    color = AccentOrange
                )
            }
        }
    }
}

private fun parseColor(hexColor: String): androidx.compose.ui.graphics.Color {
    return try {
        val color = hexColor.removePrefix("#")
        val colorLong = color.toLong(16)
        androidx.compose.ui.graphics.Color(
            if (color.length == 6) (0xFF000000 or colorLong) else colorLong
        )
    } catch (e: Exception) {
        AccentOrange
    }
}
