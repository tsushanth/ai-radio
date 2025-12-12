package com.kreativekoala.audexa.ui.topic

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.ui.components.NowPlayingIndicator
import com.kreativekoala.audexa.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TopicDetailScreen(
    topic: Topic,
    onDismiss: () -> Unit,
    onHide: () -> Unit,
    viewModel: TopicDetailViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    LaunchedEffect(topic) {
        viewModel.loadTopic(topic)
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        // Top Bar
        TopAppBar(
            title = { },
            navigationIcon = {
                IconButton(onClick = onDismiss) {
                    Icon(
                        Icons.Default.Close,
                        contentDescription = "Close",
                        tint = PrimaryText
                    )
                }
            },
            actions = {
                IconButton(onClick = { viewModel.toggleBookmark() }) {
                    Icon(
                        imageVector = if (uiState.isBookmarked) Icons.Default.Bookmark else Icons.Default.BookmarkBorder,
                        contentDescription = "Bookmark",
                        tint = if (uiState.isBookmarked) AccentOrange else PrimaryText
                    )
                }
                
                var showMenu by remember { mutableStateOf(false) }
                IconButton(onClick = { showMenu = true }) {
                    Icon(Icons.Default.MoreVert, contentDescription = "More", tint = PrimaryText)
                }
                DropdownMenu(
                    expanded = showMenu,
                    onDismissRequest = { showMenu = false }
                ) {
                    DropdownMenuItem(
                        text = { Text("Hide Topic") },
                        onClick = {
                            showMenu = false
                            onHide()
                            onDismiss()
                        },
                        leadingIcon = { Icon(Icons.Default.VisibilityOff, null) }
                    )
                }
            },
            colors = TopAppBarDefaults.topAppBarColors(
                containerColor = Background
            )
        )

        // Content
        Column(
            modifier = Modifier
                .fillMaxSize()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 24.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            Spacer(modifier = Modifier.height(16.dp))

            // Topic Icon
            Box(
                modifier = Modifier
                    .size(160.dp)
                    .clip(RoundedCornerShape(24.dp))
                    .background(topic.composableColor),
                contentAlignment = Alignment.Center
            ) {
                if (uiState.isLoading) {
                    CircularProgressIndicator(
                        color = PrimaryText,
                        modifier = Modifier.size(48.dp)
                    )
                } else {
                    Icon(
                        imageVector = getTopicIcon(topic.icon),
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = PrimaryText.copy(alpha = 0.9f)
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Episode Title
            Text(
                text = uiState.currentEpisode?.title ?: topic.name,
                style = MaterialTheme.typography.headlineSmall,
                color = PrimaryText,
                fontWeight = FontWeight.Bold,
                textAlign = TextAlign.Center
            )

            // Date
            Text(
                text = uiState.currentEpisode?.date ?: "Today",
                style = MaterialTheme.typography.bodyMedium,
                color = SecondaryText
            )

            // Duration
            if (uiState.currentEpisode?.durationSeconds != null) {
                Text(
                    text = "${uiState.currentEpisode!!.durationSeconds!! / 60} min",
                    style = MaterialTheme.typography.bodyMedium,
                    color = AccentOrange
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Language Selector
            LanguageSelector(
                selectedLanguage = uiState.selectedLanguage,
                onLanguageSelected = { viewModel.setLanguage(it) }
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Player Controls
            PlayerControls(
                isPlaying = uiState.isPlaying,
                isLoading = uiState.isLoading || uiState.isGenerating,
                currentTime = uiState.currentTime,
                duration = uiState.duration,
                onPlayPause = { viewModel.togglePlayPause() },
                onSkipBack = { viewModel.skipBackward() },
                onSkipForward = { viewModel.skipForward() },
                onSeek = { viewModel.seekTo(it) }
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Generate/Regenerate Button
            if (uiState.currentEpisode == null && !uiState.isLoading && !uiState.isGenerating) {
                Button(
                    onClick = { viewModel.generateEpisode() },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
                ) {
                    Text("Generate Episode")
                }
            } else if (uiState.currentEpisode != null) {
                OutlinedButton(
                    onClick = { viewModel.regenerateEpisode() },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp)
                ) {
                    Icon(Icons.Default.Refresh, contentDescription = null)
                    Spacer(modifier = Modifier.width(8.dp))
                    Text("Regenerate")
                }
            }

            // Error
            if (uiState.error != null) {
                Spacer(modifier = Modifier.height(16.dp))
                Surface(
                    color = Error.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = uiState.error!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = Error,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Episode History
            if (uiState.episodeHistory.isNotEmpty()) {
                Text(
                    text = "Episode History",
                    style = MaterialTheme.typography.titleMedium,
                    color = PrimaryText,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.fillMaxWidth()
                )
                
                Spacer(modifier = Modifier.height(12.dp))
                
                uiState.episodeHistory.forEach { episode ->
                    EpisodeHistoryRow(
                        title = episode.title,
                        date = episode.date,
                        duration = episode.durationFormatted,
                        isPlaying = episode.id == uiState.currentEpisode?.id && uiState.isPlaying,
                        onClick = { viewModel.playEpisode(episode) }
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                }
            }

            Spacer(modifier = Modifier.height(Sizing.miniPlayerHeight.dp))
        }
    }
}

@Composable
private fun LanguageSelector(
    selectedLanguage: SupportedLanguage,
    onLanguageSelected: (SupportedLanguage) -> Unit
) {
    var expanded by remember { mutableStateOf(false) }
    
    Surface(
        onClick = { expanded = true },
        shape = RoundedCornerShape(8.dp),
        color = CardBackground
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = selectedLanguage.displayWithFlag,
                style = MaterialTheme.typography.bodyMedium,
                color = PrimaryText
            )
            Spacer(modifier = Modifier.width(8.dp))
            Icon(
                Icons.Default.ArrowDropDown,
                contentDescription = null,
                tint = SecondaryText
            )
        }
        
        DropdownMenu(
            expanded = expanded,
            onDismissRequest = { expanded = false }
        ) {
            SupportedLanguage.entries.forEach { language ->
                DropdownMenuItem(
                    text = { Text(language.displayWithFlag) },
                    onClick = {
                        onLanguageSelected(language)
                        expanded = false
                    }
                )
            }
        }
    }
}

@Composable
private fun PlayerControls(
    isPlaying: Boolean,
    isLoading: Boolean,
    currentTime: Long,
    duration: Long,
    onPlayPause: () -> Unit,
    onSkipBack: () -> Unit,
    onSkipForward: () -> Unit,
    onSeek: (Long) -> Unit
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Progress Slider
        if (duration > 0) {
            Slider(
                value = currentTime.toFloat(),
                onValueChange = { onSeek(it.toLong()) },
                valueRange = 0f..duration.toFloat(),
                modifier = Modifier.fillMaxWidth(),
                colors = SliderDefaults.colors(
                    thumbColor = AccentOrange,
                    activeTrackColor = AccentOrange
                )
            )
            
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                Text(
                    text = formatTime(currentTime),
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText
                )
                Text(
                    text = formatTime(duration),
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText
                )
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Control Buttons
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(24.dp)
        ) {
            // Skip Back
            IconButton(onClick = onSkipBack) {
                Icon(
                    Icons.Default.Replay10,
                    contentDescription = "Skip back 15 seconds",
                    tint = PrimaryText,
                    modifier = Modifier.size(32.dp)
                )
            }

            // Play/Pause
            Surface(
                onClick = onPlayPause,
                shape = CircleShape,
                color = AccentOrange,
                modifier = Modifier.size(64.dp)
            ) {
                Box(contentAlignment = Alignment.Center) {
                    if (isLoading) {
                        CircularProgressIndicator(
                            color = PrimaryText,
                            modifier = Modifier.size(28.dp),
                            strokeWidth = 3.dp
                        )
                    } else {
                        Icon(
                            imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
                            contentDescription = if (isPlaying) "Pause" else "Play",
                            tint = PrimaryText,
                            modifier = Modifier.size(32.dp)
                        )
                    }
                }
            }

            // Skip Forward
            IconButton(onClick = onSkipForward) {
                Icon(
                    Icons.Default.Forward10,
                    contentDescription = "Skip forward 15 seconds",
                    tint = PrimaryText,
                    modifier = Modifier.size(32.dp)
                )
            }
        }
    }
}

@Composable
private fun EpisodeHistoryRow(
    title: String,
    date: String,
    duration: String,
    isPlaying: Boolean,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(8.dp),
        color = CardBackground
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = PrimaryText,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = "$date • $duration",
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText
                )
            }
            
            if (isPlaying) {
                NowPlayingIndicator()
            } else {
                Icon(
                    Icons.Default.PlayArrow,
                    contentDescription = "Play",
                    tint = AccentOrange
                )
            }
        }
    }
}

private fun formatTime(millis: Long): String {
    val totalSeconds = millis / 1000
    val minutes = totalSeconds / 60
    val seconds = totalSeconds % 60
    return String.format("%d:%02d", minutes, seconds)
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
