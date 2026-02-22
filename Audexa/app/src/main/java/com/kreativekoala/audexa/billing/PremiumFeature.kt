package com.kreativekoala.audexa.billing

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Language
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Speed
import androidx.compose.material.icons.filled.RecordVoiceOver
import androidx.compose.material.icons.filled.Topic
import androidx.compose.ui.graphics.vector.ImageVector

enum class PremiumFeature(
    val paywallTitle: String,
    val paywallSubtitle: String,
    val icon: ImageVector
) {
    UNLIMITED_TOPICS(
        "Unlock Unlimited Topics",
        "Bookmark more than 5 topics and explore all categories",
        Icons.Default.Topic
    ),
    PLAYBACK_SPEEDS(
        "Unlock Playback Speeds",
        "Listen at 0.5x to 2.0x speed",
        Icons.Default.Speed
    ),
    ALL_LANGUAGES(
        "Unlock All Languages",
        "Generate podcasts in 10+ languages",
        Icons.Default.Language
    ),
    PREMIUM_VOICES(
        "Unlock Premium Voices",
        "Ultra-realistic ElevenLabs voices",
        Icons.Default.RecordVoiceOver
    ),
    UNLIMITED_REGENERATIONS(
        "Unlock Unlimited Regenerations",
        "Regenerate your Daily Brief without limits",
        Icons.Default.Refresh
    )
}
