package com.kreativekoala.audexa.ui.theme

import android.app.Activity
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.SideEffect
import androidx.compose.ui.graphics.toArgb
import androidx.compose.ui.platform.LocalView
import androidx.core.view.WindowCompat

// App Theme enum matching iOS
enum class AppTheme(val value: String, val displayName: String) {
    SYSTEM("system", "System"),
    DARK("dark", "Dark"),
    LIGHT("light", "Light");

    companion object {
        fun fromValue(value: String): AppTheme {
            return entries.find { it.value == value } ?: SYSTEM
        }
    }
}

private val DarkColorScheme = darkColorScheme(
    primary = AccentOrange,
    onPrimary = PrimaryTextDark,
    secondary = AccentOrangeLight,
    onSecondary = PrimaryTextDark,
    tertiary = GradientDarkOrange,
    background = BackgroundDark,
    onBackground = PrimaryTextDark,
    surface = CardBackgroundDark,
    onSurface = PrimaryTextDark,
    surfaceVariant = SurfaceVariantDark,
    onSurfaceVariant = SecondaryTextDark,
    error = Error,
    onError = PrimaryTextDark
)

private val LightColorScheme = lightColorScheme(
    primary = AccentOrange,
    onPrimary = PrimaryTextLight,
    secondary = AccentOrangeLight,
    onSecondary = PrimaryTextLight,
    tertiary = GradientDarkOrange,
    background = BackgroundLight,
    onBackground = PrimaryTextLight,
    surface = CardBackgroundLight,
    onSurface = PrimaryTextLight,
    surfaceVariant = SurfaceVariantLight,
    onSurfaceVariant = SecondaryTextLight,
    error = Error,
    onError = PrimaryTextDark
)

@Composable
fun AudexaTheme(
    appTheme: AppTheme = AppTheme.SYSTEM,
    content: @Composable () -> Unit
) {
    val useDarkTheme = when (appTheme) {
        AppTheme.SYSTEM -> isSystemInDarkTheme()
        AppTheme.DARK -> true
        AppTheme.LIGHT -> false
    }

    val colorScheme = if (useDarkTheme) DarkColorScheme else LightColorScheme

    val view = LocalView.current
    if (!view.isInEditMode) {
        SideEffect {
            val window = (view.context as Activity).window
            val backgroundColor = if (useDarkTheme) BackgroundDark else BackgroundLight
            window.statusBarColor = backgroundColor.toArgb()
            window.navigationBarColor = backgroundColor.toArgb()
            WindowCompat.getInsetsController(window, view).isAppearanceLightStatusBars = !useDarkTheme
            WindowCompat.getInsetsController(window, view).isAppearanceLightNavigationBars = !useDarkTheme
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
