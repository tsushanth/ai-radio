package com.kreativekoala.audexa.ui.onboarding.pages

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.ui.onboarding.OnboardingUiState
import com.kreativekoala.audexa.ui.theme.*

@Composable
fun TopicSelectionPage(
    uiState: OnboardingUiState,
    onToggleTopic: (String) -> Unit,
    onComplete: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(48.dp))

        Text(
            text = "Choose Your Interests",
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = "Select topics you'd like to hear about. We'll generate daily episodes just for you.",
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 8.dp)
        )

        Spacer(modifier = Modifier.height(24.dp))

        if (uiState.isLoadingTopics && uiState.topics.isEmpty()) {
            Box(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                contentAlignment = Alignment.Center
            ) {
                CircularProgressIndicator(color = AccentOrange)
            }
        } else {
            LazyVerticalGrid(
                columns = GridCells.Fixed(2),
                modifier = Modifier.weight(1f),
                contentPadding = PaddingValues(vertical = 8.dp),
                horizontalArrangement = Arrangement.spacedBy(12.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp)
            ) {
                items(uiState.topics, key = { it.id }) { topic ->
                    TopicChip(
                        topic = topic,
                        isSelected = uiState.selectedTopicIds.contains(topic.id),
                        onClick = { onToggleTopic(topic.id) }
                    )
                }
            }
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Selection count
        val selectedCount = uiState.selectedTopicIds.size
        if (selectedCount > 0) {
            Text(
                text = "$selectedCount topic${if (selectedCount != 1) "s" else ""} selected",
                style = MaterialTheme.typography.bodyMedium,
                color = AccentOrange,
                fontWeight = FontWeight.Medium
            )
            Spacer(modifier = Modifier.height(8.dp))
        }

        Button(
            onClick = onComplete,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp)
                .height(56.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = AccentOrange,
                contentColor = PrimaryTextDark
            ),
            enabled = selectedCount > 0 && !uiState.isCompleting
        ) {
            if (uiState.isCompleting) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = PrimaryTextDark,
                    strokeWidth = 2.dp
                )
            } else {
                Text(
                    text = "Complete Setup",
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun TopicChip(
    topic: Topic,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    val topicColor = topic.composableColor
    val backgroundColor by animateColorAsState(
        targetValue = if (isSelected) topicColor.copy(alpha = 0.15f)
        else MaterialTheme.colorScheme.surfaceVariant,
        label = "topicBg"
    )
    val borderColor by animateColorAsState(
        targetValue = if (isSelected) topicColor else Color.Transparent,
        label = "topicBorder"
    )

    Box(
        modifier = Modifier
            .fillMaxWidth()
            .height(80.dp)
            .clip(RoundedCornerShape(12.dp))
            .background(backgroundColor)
            .border(
                width = if (isSelected) 2.dp else 0.dp,
                color = borderColor,
                shape = RoundedCornerShape(12.dp)
            )
            .clickable(onClick = onClick)
            .padding(12.dp),
        contentAlignment = Alignment.Center
    ) {
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.Center
        ) {
            Text(
                text = topic.name,
                style = MaterialTheme.typography.titleSmall,
                color = if (isSelected) topicColor else MaterialTheme.colorScheme.onSurface,
                fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                textAlign = TextAlign.Center,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )
        }
    }
}
