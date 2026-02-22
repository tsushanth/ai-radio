package com.kreativekoala.audexa.ui.queue

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.local.PreferencesManager.QueuedTopic
import com.kreativekoala.audexa.ui.theme.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

// --- ViewModel ---

@HiltViewModel
class QueueViewModel @Inject constructor(
    private val preferencesManager: PreferencesManager
) : ViewModel() {

    private val _queuedTopics = MutableStateFlow<List<QueuedTopic>>(emptyList())
    val queuedTopics = _queuedTopics.asStateFlow()

    init {
        loadQueue()
    }

    fun loadQueue() {
        viewModelScope.launch {
            _queuedTopics.value = preferencesManager.getQueuedTopics()
        }
    }

    fun removeFromQueue(topicId: String) {
        viewModelScope.launch {
            preferencesManager.removeTopicFromQueue(topicId)
            loadQueue()
        }
    }

    fun clearQueue() {
        viewModelScope.launch {
            preferencesManager.clearTopicQueue()
            _queuedTopics.value = emptyList()
        }
    }

    fun moveItem(from: Int, to: Int) {
        val current = _queuedTopics.value.toMutableList()
        if (from in current.indices && to in current.indices) {
            val item = current.removeAt(from)
            current.add(to, item)
            _queuedTopics.value = current
            viewModelScope.launch {
                preferencesManager.reorderTopicQueue(current)
            }
        }
    }
}

// --- Screen ---

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun QueueScreen(
    onPlayTopic: (QueuedTopic) -> Unit,
    onPlayAll: (List<QueuedTopic>) -> Unit,
    onNavigateBack: () -> Unit,
    viewModel: QueueViewModel = hiltViewModel()
) {
    val queuedTopics by viewModel.queuedTopics.collectAsState()

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Your Queue",
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            imageVector = Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = "Back"
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                    titleContentColor = MaterialTheme.colorScheme.onBackground,
                    navigationIconContentColor = MaterialTheme.colorScheme.onBackground
                )
            )
        }
    ) { paddingValues ->
        if (queuedTopics.isEmpty()) {
            // Empty state
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues),
                contentAlignment = Alignment.Center
            ) {
                Column(horizontalAlignment = Alignment.CenterHorizontally) {
                    Icon(
                        imageVector = Icons.Default.QueueMusic,
                        contentDescription = null,
                        modifier = Modifier.size(64.dp),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = "Your queue is empty",
                        style = MaterialTheme.typography.titleMedium,
                        color = MaterialTheme.colorScheme.onBackground,
                        fontWeight = FontWeight.SemiBold
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "Add topics from the home screen",
                        style = MaterialTheme.typography.bodyMedium,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            // Queue list
            Column(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(paddingValues)
            ) {
                Column(
                    modifier = Modifier
                        .weight(1f)
                        .verticalScroll(rememberScrollState())
                        .padding(horizontal = Spacing.screenPadding.dp)
                ) {
                    queuedTopics.forEachIndexed { index, topic ->
                        QueueItem(
                            index = index + 1,
                            topic = topic,
                            onPlay = { onPlayTopic(topic) },
                            onRemove = { viewModel.removeFromQueue(topic.topicId) }
                        )
                        if (index < queuedTopics.lastIndex) {
                            HorizontalDivider(
                                color = MaterialTheme.colorScheme.surfaceVariant,
                                thickness = 0.5.dp
                            )
                        }
                    }
                }

                // Bottom actions
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = Spacing.screenPadding.dp)
                        .padding(bottom = 24.dp, top = 8.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    TextButton(onClick = { viewModel.clearQueue() }) {
                        Text(
                            text = "Clear Queue",
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    Spacer(modifier = Modifier.height(8.dp))

                    Button(
                        onClick = { onPlayAll(queuedTopics) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(52.dp),
                        shape = RoundedCornerShape(12.dp),
                        colors = ButtonDefaults.buttonColors(
                            containerColor = AccentOrange,
                            contentColor = Color.White
                        )
                    ) {
                        Icon(
                            imageVector = Icons.Default.PlayArrow,
                            contentDescription = null,
                            modifier = Modifier.size(24.dp)
                        )
                        Spacer(modifier = Modifier.width(8.dp))
                        Text(
                            text = "Play All",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold
                        )
                    }
                }
            }
        }
    }
}

// --- Queue Item ---

@Composable
private fun QueueItem(
    index: Int,
    topic: QueuedTopic,
    onPlay: () -> Unit,
    onRemove: () -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(vertical = 12.dp),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // Index number
        Text(
            text = "$index",
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            fontWeight = FontWeight.Medium,
            modifier = Modifier.width(24.dp)
        )

        // Topic icon box
        val topicColor = try {
            Color(android.graphics.Color.parseColor(topic.topicColor))
        } catch (_: Exception) {
            AccentOrange
        }
        Box(
            modifier = Modifier
                .size(48.dp)
                .clip(RoundedCornerShape(10.dp))
                .background(topicColor),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = getTopicIcon(topic.topicIcon),
                contentDescription = topic.topicName,
                modifier = Modifier.size(24.dp),
                tint = Color.White.copy(alpha = 0.9f)
            )
        }

        Spacer(modifier = Modifier.width(12.dp))

        // Topic info
        Column(modifier = Modifier.weight(1f)) {
            Text(
                text = topic.topicName,
                style = MaterialTheme.typography.bodyLarge,
                color = MaterialTheme.colorScheme.onBackground,
                fontWeight = FontWeight.Medium,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )
            Text(
                text = "${topic.targetDurationMinutes} min",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        // Play button
        IconButton(onClick = onPlay) {
            Icon(
                imageVector = Icons.Default.PlayCircle,
                contentDescription = "Play ${topic.topicName}",
                modifier = Modifier.size(32.dp),
                tint = AccentOrange
            )
        }

        // Remove button
        IconButton(onClick = onRemove) {
            Icon(
                imageVector = Icons.Default.Close,
                contentDescription = "Remove ${topic.topicName}",
                modifier = Modifier.size(20.dp),
                tint = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }
    }
}

// --- Icon Resolver ---

private fun getTopicIcon(icon: String): ImageVector {
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
