package com.kreativekoala.audexa.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.Person
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.kreativekoala.audexa.ui.theme.*

sealed class DailyBriefState {
    data object NotLinked : DailyBriefState()
    data object Ready : DailyBriefState()
    data class Generating(val progress: Int) : DailyBriefState()
    data class Completed(val audioUrl: String) : DailyBriefState()
    data class Playing(val audioUrl: String) : DailyBriefState()
    data class Error(val message: String) : DailyBriefState()
}

@Composable
fun GradientHeader(
    greeting: String,
    userName: String,
    subtitle: String,
    briefState: DailyBriefState,
    onPlayTapped: () -> Unit,
    onPauseTapped: () -> Unit,
    onProfileTapped: () -> Unit,
    onRetryTapped: () -> Unit = {},
    modifier: Modifier = Modifier
) {
    Box(
        modifier = modifier
            .fillMaxWidth()
            .background(
                brush = Brush.verticalGradient(
                    colors = listOf(
                        GradientSaddleBrown,
                        GradientChocolate,
                        GradientDarkOrange,
                        GradientGold.copy(alpha = 0.3f)
                    )
                )
            )
            .statusBarsPadding()
            .padding(horizontal = 16.dp, vertical = 24.dp)
    ) {
        // Profile icon in top right
        IconButton(
            onClick = onProfileTapped,
            modifier = Modifier
                .align(Alignment.TopEnd)
                .size(48.dp)
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(PrimaryText.copy(alpha = 0.2f)),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = "Profile",
                    tint = PrimaryText,
                    modifier = Modifier.size(24.dp)
                )
            }
        }

        Column {
            // Greeting
            Text(
                text = greeting,
                style = MaterialTheme.typography.bodyLarge,
                color = PrimaryText.copy(alpha = 0.8f)
            )

            // User name
            Text(
                text = userName,
                style = MaterialTheme.typography.displaySmall,
                color = PrimaryText,
                fontWeight = FontWeight.Bold
            )

            Spacer(modifier = Modifier.height(8.dp))

            // Subtitle
            Text(
                text = subtitle,
                style = MaterialTheme.typography.bodyMedium,
                color = PrimaryText.copy(alpha = 0.7f)
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Action button based on state
            when (briefState) {
                is DailyBriefState.NotLinked -> {
                    LinkAccountButton(onClick = onProfileTapped)
                }
                is DailyBriefState.Ready -> {
                    PlayButton(
                        isPlaying = false,
                        onClick = onPlayTapped
                    )
                }
                is DailyBriefState.Generating -> {
                    GeneratingIndicator(progress = briefState.progress)
                }
                is DailyBriefState.Completed -> {
                    PlayButton(
                        isPlaying = false,
                        onClick = onPlayTapped
                    )
                }
                is DailyBriefState.Playing -> {
                    PlayButton(
                        isPlaying = true,
                        onClick = onPauseTapped
                    )
                }
                is DailyBriefState.Error -> {
                    ErrorBanner(
                        message = briefState.message,
                        onRetry = onRetryTapped
                    )
                }
            }
        }
    }
}

@Composable
private fun PlayButton(
    isPlaying: Boolean,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Button(
        onClick = onClick,
        modifier = modifier.height(56.dp),
        shape = RoundedCornerShape(28.dp),
        colors = ButtonDefaults.buttonColors(
            containerColor = PrimaryText,
            contentColor = Background
        )
    ) {
        Icon(
            imageVector = if (isPlaying) Icons.Default.Pause else Icons.Default.PlayArrow,
            contentDescription = if (isPlaying) "Pause" else "Play",
            modifier = Modifier.size(24.dp)
        )
        Spacer(modifier = Modifier.width(8.dp))
        Text(
            text = if (isPlaying) "Pause" else "Play",
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun LinkAccountButton(
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Text(
            text = "Link your email to generate personalized briefings",
            style = MaterialTheme.typography.bodyMedium,
            color = PrimaryText.copy(alpha = 0.8f)
        )
        
        Spacer(modifier = Modifier.height(12.dp))
        
        OutlinedButton(
            onClick = onClick,
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.outlinedButtonColors(
                contentColor = PrimaryText
            )
        ) {
            Icon(
                imageVector = Icons.Default.Link,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Link Account")
        }
    }
}

@Composable
private fun GeneratingIndicator(
    progress: Int,
    modifier: Modifier = Modifier
) {
    Row(
        modifier = modifier,
        verticalAlignment = Alignment.CenterVertically
    ) {
        CircularProgressIndicator(
            modifier = Modifier.size(24.dp),
            color = PrimaryText,
            strokeWidth = 2.dp
        )
        Spacer(modifier = Modifier.width(12.dp))
        Text(
            text = "Generating... $progress%",
            style = MaterialTheme.typography.bodyMedium,
            color = PrimaryText
        )
    }
}

@Composable
private fun ErrorBanner(
    message: String,
    onRetry: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Surface(
            modifier = Modifier.fillMaxWidth(),
            color = Error.copy(alpha = 0.2f),
            shape = RoundedCornerShape(8.dp)
        ) {
            Text(
                text = message,
                style = MaterialTheme.typography.bodySmall,
                color = PrimaryText,
                modifier = Modifier.padding(12.dp)
            )
        }

        Spacer(modifier = Modifier.height(12.dp))

        Button(
            onClick = onRetry,
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = PrimaryText,
                contentColor = Background
            )
        ) {
            Icon(
                imageVector = Icons.Default.Refresh,
                contentDescription = null,
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(8.dp))
            Text("Retry")
        }
    }
}
