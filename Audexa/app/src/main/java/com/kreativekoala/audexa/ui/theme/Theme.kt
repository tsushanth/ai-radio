package com.kreativekoala.audexa.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

private val DarkColorScheme = darkColorScheme(
    primary = AccentOrange,
    onPrimary = PrimaryText,
    secondary = AccentOrangeLight,
    onSecondary = PrimaryText,
    tertiary = GradientDarkOrange,
    background = Background,
    onBackground = PrimaryText,
    surface = CardBackground,
    onSurface = PrimaryText,
    surfaceVariant = CardBackgroundLight,
    onSurfaceVariant = SecondaryText,
    error = Error,
    onError = PrimaryText
)

@Composable
fun AudexaTheme(
    darkTheme: Boolean = true, // Always dark theme
    content: @Composable () -> Unit
) {
    val colorScheme = DarkColorScheme
    
    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            window.statusBarColor = Background.toArgb()
            window.navigationBarColor = Background.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = false
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = false
        }
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}

// Spacing constants
object Spacing {
    const val screenPadding = 16
    const val cardCornerRadius = 16
    const val cardSpacing = 12
    const val sectionSpacing = 24
}

// Sizing constants
object Sizing {
    const val miniPlayerHeight = 60
    const val tabBarHeight = 80
    const val cardImageHeight = 120
    const val topicCardWidth = 140
    const val topicCardIconHeight = 100
}
