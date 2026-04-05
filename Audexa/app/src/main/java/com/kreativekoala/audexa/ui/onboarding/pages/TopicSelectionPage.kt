package com.kreativekoala.audexa.ui.onboarding.pages

import androidx.compose.animation.animateColorAsState
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.ui.onboarding.OnboardingUiState
import com.kreativekoala.audexa.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun TopicSelectionPage(
    uiState: OnboardingUiState,
    onToggleTopic: (String) -> Unit,
    onComplete: () -> Unit,
    onSuggestTopic: ((topicName: String, language: String) -> Unit)? = null
) {
    var showSuggestSheet by remember { mutableStateOf(false) }
    var suggestName by remember { mutableStateOf("") }
    var isSuggesting by remember { mutableStateOf(false) }
    val context = LocalContext.current

    // Suggest Topic Bottom Sheet
    if (showSuggestSheet) {
        ModalBottomSheet(
            onDismissRequest = { showSuggestSheet = false },
            containerColor = MaterialTheme.colorScheme.surface,
            shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 24.dp)
                    .padding(bottom = 32.dp),
                verticalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                Text(
                    text = "Suggest a Topic",
                    style = MaterialTheme.typography.headlineSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.Bold
                )

                Text(
                    text = "Tell us what you'd like to listen to and we'll consider adding it.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                OutlinedTextField(
                    value = suggestName,
                    onValueChange = { suggestName = it },
                    label = { Text("Topic name") },
                    placeholder = { Text("e.g. Quantum Computing") },
                    modifier = Modifier.fillMaxWidth(),
                    singleLine = true,
                    shape = RoundedCornerShape(12.dp),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = AccentOrange,
                        focusedLabelColor = AccentOrange,
                        cursorColor = AccentOrange
                    )
                )

                Spacer(modifier = Modifier.height(8.dp))

                Button(
                    onClick = {
                        isSuggesting = true
                        onSuggestTopic?.invoke(suggestName, uiState.selectedLanguage.code)
                        // Close and show toast after a brief delay
                        isSuggesting = false
                        showSuggestSheet = false
                        suggestName = ""
                        Toast.makeText(context, "Topic suggested! We'll add it soon.", Toast.LENGTH_LONG).show()
                    },
                    modifier = Modifier.fillMaxWidth(),
                    enabled = suggestName.isNotBlank() && !isSuggesting,
                    shape = RoundedCornerShape(12.dp),
                    colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
                ) {
                    Text(
                        text = if (isSuggesting) "Submitting..." else "Submit",
                        style = MaterialTheme.typography.bodyLarge,
                        fontWeight = FontWeight.SemiBold,
                        modifier = Modifier.padding(vertical = 4.dp)
                    )
                }
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(horizontal = 24.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(48.dp))

        Text(
            text = stringResource(R.string.choose_your_interests),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = stringResource(R.string.choose_interests_description),
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

        Spacer(modifier = Modifier.height(12.dp))

        // Suggest a Topic button
        OutlinedButton(
            onClick = { showSuggestSheet = true },
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 8.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = AccentOrange
            ),
            border = BorderStroke(1.dp, AccentOrange.copy(alpha = 0.5f))
        ) {
            Icon(
                imageVector = Icons.Outlined.Lightbulb,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text(
                text = "Don't see your topic? Suggest one",
                style = MaterialTheme.typography.bodyMedium,
                fontWeight = FontWeight.Medium
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        // Selection count
        val selectedCount = uiState.selectedTopicIds.size
        if (selectedCount > 0) {
            Text(
                text = stringResource(R.string.topics_selected, selectedCount, if (selectedCount != 1) stringResource(R.string.topics_selected_plural_suffix) else ""),
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
                    text = stringResource(R.string.complete_setup),
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
