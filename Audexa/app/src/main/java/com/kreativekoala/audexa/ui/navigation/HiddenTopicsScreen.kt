package com.kreativekoala.audexa.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HiddenTopicsScreen(
    onNavigateBack: () -> Unit,
    viewModel: HiddenTopicsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(R.string.hidden_topics),
                        color = PrimaryText,
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                            tint = PrimaryText
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = Background
                )
            )
        },
        containerColor = Background
    ) { padding ->
        if (uiState.hiddenTopics.isEmpty()) {
            // Empty state
            Box(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding),
                contentAlignment = Alignment.Center
            ) {
                Column(
                    horizontalAlignment = Alignment.CenterHorizontally,
                    modifier = Modifier.padding(32.dp)
                ) {
                    Icon(
                        Icons.Default.VisibilityOff,
                        contentDescription = null,
                        tint = SecondaryText.copy(alpha = 0.5f),
                        modifier = Modifier.size(64.dp)
                    )
                    Spacer(modifier = Modifier.height(16.dp))
                    Text(
                        text = stringResource(R.string.no_hidden_topics),
                        style = MaterialTheme.typography.titleMedium,
                        color = PrimaryText,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.no_hidden_topics_description),
                        style = MaterialTheme.typography.bodyMedium,
                        color = SecondaryText,
                        textAlign = TextAlign.Center
                    )
                }
            }
        } else {
            LazyColumn(
                modifier = Modifier
                    .fillMaxSize()
                    .padding(padding)
                    .padding(horizontal = 16.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
                contentPadding = PaddingValues(vertical = 16.dp)
            ) {
                item {
                    Text(
                        text = stringResource(R.string.unhide_hint),
                        style = MaterialTheme.typography.bodyMedium,
                        color = SecondaryText,
                        modifier = Modifier.padding(bottom = 8.dp)
                    )
                }

                items(uiState.hiddenTopics) { topic ->
                    HiddenTopicRow(
                        topic = topic,
                        onUnhide = { viewModel.unhideTopic(topic.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun HiddenTopicRow(
    topic: Topic,
    onUnhide: () -> Unit
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = CardBackground
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            // Topic icon
            Box(
                modifier = Modifier
                    .size(48.dp)
                    .clip(RoundedCornerShape(8.dp))
                    .background(topic.composableColor),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = getTopicIcon(topic.icon),
                    contentDescription = null,
                    tint = PrimaryText.copy(alpha = 0.9f),
                    modifier = Modifier.size(24.dp)
                )
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = topic.name,
                    style = MaterialTheme.typography.bodyLarge,
                    color = PrimaryText,
                    fontWeight = FontWeight.Medium
                )
                if (topic.description.isNotEmpty()) {
                    Text(
                        text = topic.description,
                        style = MaterialTheme.typography.bodySmall,
                        color = SecondaryText,
                        maxLines = 1
                    )
                }
            }

            IconButton(onClick = onUnhide) {
                Icon(
                    Icons.Default.Visibility,
                    contentDescription = stringResource(R.string.unhide),
                    tint = AccentOrange
                )
            }
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
