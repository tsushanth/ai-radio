package com.kreativekoala.audexa.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Radio
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import com.kreativekoala.audexa.ui.theme.*

enum class ShowCardSize {
    SMALL,
    LARGE
}

@Composable
fun ShowCard(
    title: String,
    description: String,
    imageColor: String,
    episodeInfo: String,
    size: ShowCardSize = ShowCardSize.SMALL,
    isBookmarked: Boolean = false,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    val color = try {
        Color(android.graphics.Color.parseColor(imageColor))
    } catch (e: Exception) {
        AccentOrange
    }
    
    when (size) {
        ShowCardSize.SMALL -> SmallShowCard(
            title = title,
            description = description,
            color = color,
            episodeInfo = episodeInfo,
            onClick = onClick,
            modifier = modifier
        )
        ShowCardSize.LARGE -> LargeShowCard(
            title = title,
            description = description,
            color = color,
            episodeInfo = episodeInfo,
            onClick = onClick,
            modifier = modifier
        )
    }
}

@Composable
private fun SmallShowCard(
    title: String,
    description: String,
    color: Color,
    episodeInfo: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .width(160.dp)
            .clickable(onClick = onClick)
    ) {
        // Thumbnail
        Box(
            modifier = Modifier
                .size(160.dp, 120.dp)
                .clip(RoundedCornerShape(12.dp))
                .background(color),
            contentAlignment = Alignment.Center
        ) {
            Icon(
                imageVector = Icons.Default.Radio,
                contentDescription = null,
                modifier = Modifier.size(40.dp),
                tint = PrimaryText.copy(alpha = 0.7f)
            )
        }
        
        Spacer(modifier = Modifier.height(8.dp))
        
        // Title
        Text(
            text = title,
            style = MaterialTheme.typography.titleSmall,
            color = PrimaryText,
            maxLines = 2,
            overflow = TextOverflow.Ellipsis
        )
        
        // Episode info
        Text(
            text = episodeInfo,
            style = MaterialTheme.typography.bodySmall,
            color = SecondaryText
        )
    }
}

@Composable
private fun LargeShowCard(
    title: String,
    description: String,
    color: Color,
    episodeInfo: String,
    onClick: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        modifier = modifier
            .fillMaxWidth()
            .clickable(onClick = onClick),
        shape = RoundedCornerShape(16.dp),
        color = CardBackground
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.Top
        ) {
            // Thumbnail
            Box(
                modifier = Modifier
                    .size(80.dp)
                    .clip(RoundedCornerShape(12.dp))
                    .background(color),
                contentAlignment = Alignment.Center
            ) {
                Icon(
                    imageVector = Icons.Default.Radio,
                    contentDescription = null,
                    modifier = Modifier.size(32.dp),
                    tint = PrimaryText.copy(alpha = 0.7f)
                )
            }
            
            Spacer(modifier = Modifier.width(12.dp))
            
            // Content
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleMedium,
                    color = PrimaryText,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                
                Spacer(modifier = Modifier.height(4.dp))
                
                Text(
                    text = description,
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
                
                Spacer(modifier = Modifier.height(8.dp))
                
                Text(
                    text = episodeInfo,
                    style = MaterialTheme.typography.labelMedium,
                    color = AccentOrange
                )
            }
        }
    }
}

