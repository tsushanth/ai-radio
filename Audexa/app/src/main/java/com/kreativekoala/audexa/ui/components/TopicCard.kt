package com.kreativekoala.audexa.ui.components

import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.ui.theme.*

@Composable
fun TopicCard(
    topic: Topic,
    isLoading: Boolean = false,
    isBookmarked: Boolean = false,
    isPlaying: Boolean = false,
    onClick: () -> Unit,
    onBookmarkToggle: (() -> Unit)? = null,
    onHide: (() -> Unit)? = null,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .width(Sizing.topicCardWidth.dp)
            .clickable(enabled = !isLoading, onClick = onClick)
    ) {
        // Icon area
        Box(
            modifier = Modifier
                .size(Sizing.topicCardWidth.dp, Sizing.topicCardIconHeight.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(topic.composableColor),
            contentAlignment = Alignment.Center
        ) {
            // Content
            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(32.dp),
                    color = PrimaryTextDark, // Always white on colored background
                    strokeWidth = 3.dp
                )
            } else {
                Icon(
                    imageVector = getTopicIcon(topic.icon),
                    contentDescription = topic.name,
                    modifier = Modifier.size(32.dp),
                    tint = PrimaryTextDark.copy(alpha = 0.9f) // Always white on colored background
                )
            }
            
            // Top right buttons
            Row(
                modifier = Modifier
                    .align(Alignment.TopEnd)
                    .padding(6.dp),
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                // Bookmark button
                if (onBookmarkToggle != null) {
                    SmallIconButton(
                        icon = if (isBookmarked) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                        tint = if (isBookmarked) AccentOrange else PrimaryTextDark, // Always white on colored background
                        onClick = onBookmarkToggle
                    )
                }

                // Menu button
                if (onHide != null) {
                    var expanded by remember { mutableStateOf(false) }
                    Box {
                        SmallIconButton(
                            icon = Icons.Default.MoreVert,
                            tint = PrimaryTextDark, // Always white on colored background
                            onClick = { expanded = true }
                        )
                        DropdownMenu(
                            expanded = expanded,
                            onDismissRequest = { expanded = false }
                        ) {
                            DropdownMenuItem(
                                text = { Text("Hide") },
                                onClick = {
                                    expanded = false
                                    onHide()
                                },
                                leadingIcon = {
                                    Icon(Icons.Default.VisibilityOff, contentDescription = null)
                                }
                            )
                        }
                    }
                }
            }
            
            // Now Playing indicator
            if (isPlaying) {
                Surface(
                    modifier = Modifier
                        .align(Alignment.BottomStart)
                        .padding(6.dp),
                    color = AccentOrange.copy(alpha = 0.9f),
                    shape = RoundedCornerShape(6.dp)
                ) {
                    Row(
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                        verticalAlignment = Alignment.CenterVertically,
                        horizontalArrangement = Arrangement.spacedBy(4.dp)
                    ) {
                        NowPlayingIndicator()
                        Text(
                            text = "Playing",
                            style = MaterialTheme.typography.labelSmall,
                            color = PrimaryTextDark, // Always white on orange background
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }

        Spacer(modifier = Modifier.height(8.dp))

        // Title
        Text(
            text = topic.name,
            style = MaterialTheme.typography.titleSmall,
            color = MaterialTheme.colorScheme.onBackground,
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
        )

        // Duration
        Text(
            text = "${topic.targetDurationMinutes} min daily",
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun SmallIconButton(
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    tint: Color,
    onClick: () -> Unit
) {
    Surface(
        modifier = Modifier.size(28.dp),
        shape = RoundedCornerShape(8.dp),
        color = Color.Black.copy(alpha = 0.3f)
    ) {
        IconButton(
            onClick = onClick,
            modifier = Modifier.size(28.dp)
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = tint
            )
        }
    }
}

@Composable
private fun getTopicIcon(icon: String): androidx.compose.ui.graphics.vector.ImageVector {
    return when (icon.lowercase()) {
        "laptopcomputer", "laptop", "computer" -> Icons.Default.Computer
        "cpu", "memory" -> Icons.Default.Memory
        "chart.line.uptrend.xyaxis", "chart", "trending_up" -> Icons.Default.TrendingUp
        "newspaper" -> Icons.Default.Newspaper
        "dollarsign.circle", "dollar", "attach_money" -> Icons.Default.AttachMoney
        "sportscourt", "sports", "sports_basketball" -> Icons.Default.SportsSoccer
        "film", "movie" -> Icons.Default.Movie
        "atom", "science" -> Icons.Default.Science
        "heart", "favorite" -> Icons.Default.Favorite
        "building.columns", "building", "account_balance" -> Icons.Default.AccountBalance
        else -> Icons.Default.Radio
    }
}
