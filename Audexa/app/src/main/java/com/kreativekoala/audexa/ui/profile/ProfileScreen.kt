package com.kreativekoala.audexa.ui.profile

import android.content.Intent
import android.net.Uri
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
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.compose.ui.graphics.Color
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.ui.theme.*
import com.kreativekoala.paywallkit.models.PaywallFeature
import com.kreativekoala.paywallkit.models.PaywallTheme
import com.kreativekoala.paywallkit.view.PaywallPreview

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onNavigateBack: () -> Unit,
    onNavigateToLinkedAccounts: () -> Unit,
    onNavigateToHiddenTopics: () -> Unit,
    onNavigateToLanguageSettings: () -> Unit,
    onNavigateToThemeSettings: () -> Unit,
    onNavigateToVoiceSettings: () -> Unit = {},
    onNavigateToNotificationSettings: () -> Unit = {},
    onNavigateToSubscription: () -> Unit = {},
    onNavigateToRadioLanguages: () -> Unit = {},
    onSignOut: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    val context = LocalContext.current
    var showSignOutDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }
    var tapCount by remember { mutableIntStateOf(0) }
    var showPaywallPreview by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.isSignedOut) {
        if (uiState.isSignedOut) {
            onSignOut()
        }
    }

    if (showPaywallPreview) {
        PaywallPreview(
            appId = "audexa",
            appName = "Audexa",
            features = listOf(
                PaywallFeature("\uD83C\uDFB5", "Unlimited Streaming"),
                PaywallFeature("\uD83D\uDEAB", "No Ads"),
                PaywallFeature("\uD83D\uDCE5", "Offline Mode"),
                PaywallFeature("\uD83C\uDFA7", "HD Audio"),
                PaywallFeature("\uD83D\uDCFB", "All Stations")
            ),
            theme = PaywallTheme(accent = Color(0xFFFF6D00), accent2 = Color(0xFFFF9100)),
            onDone = { showPaywallPreview = false }
        )
        return
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(R.string.profile),
                        color = MaterialTheme.colorScheme.onBackground,
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                            tint = MaterialTheme.colorScheme.onBackground
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background
                )
            )
        },
        containerColor = MaterialTheme.colorScheme.background
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .verticalScroll(rememberScrollState())
                .padding(16.dp)
        ) {
            // Profile Header
            ProfileHeader(
                name = uiState.userName,
                email = uiState.userEmail
            )

            Spacer(modifier = Modifier.height(32.dp))

            // Premium Section
            SettingsSection(title = stringResource(R.string.premium)) {
                SettingsRow(
                    icon = Icons.Default.Star,
                    title = if (uiState.isSubscribed) stringResource(R.string.ad_free) else stringResource(R.string.go_ad_free),
                    subtitle = if (uiState.isSubscribed) stringResource(R.string.active_subscription) else stringResource(R.string.remove_all_ads),
                    onClick = onNavigateToSubscription
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Linked Accounts Section
            SettingsSection(title = stringResource(R.string.linked_accounts)) {
                SettingsRow(
                    icon = Icons.Default.Link,
                    title = stringResource(R.string.email_accounts),
                    subtitle = if (uiState.hasLinkedGoogle) stringResource(R.string.connected) else stringResource(R.string.not_connected),
                    onClick = onNavigateToLinkedAccounts
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Preferences Section
            SettingsSection(title = stringResource(R.string.preferences)) {
                SettingsRow(
                    icon = Icons.Default.Palette,
                    title = stringResource(R.string.app_theme),
                    subtitle = uiState.appTheme,
                    onClick = onNavigateToThemeSettings
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                SettingsRow(
                    icon = Icons.Default.Language,
                    title = stringResource(R.string.podcast_language),
                    subtitle = uiState.preferredLanguage,
                    onClick = onNavigateToLanguageSettings
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                SettingsRow(
                    icon = Icons.Default.Radio,
                    title = "Radio Languages",
                    subtitle = uiState.radioLanguagesSummary,
                    onClick = onNavigateToRadioLanguages
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                SettingsRow(
                    icon = Icons.Default.RecordVoiceOver,
                    title = stringResource(R.string.voice_settings),
                    subtitle = stringResource(R.string.choose_podcast_voices),
                    onClick = onNavigateToVoiceSettings
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                SettingsRow(
                    icon = Icons.Default.VisibilityOff,
                    title = stringResource(R.string.hidden_topics),
                    subtitle = stringResource(R.string.hidden_count, uiState.hiddenTopicsCount),
                    onClick = onNavigateToHiddenTopics
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                SettingsRow(
                    icon = Icons.Default.Notifications,
                    title = stringResource(R.string.notifications),
                    subtitle = stringResource(R.string.daily_brief_reminders),
                    onClick = onNavigateToNotificationSettings
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // About Section
            SettingsSection(title = stringResource(R.string.about)) {
                SettingsRow(
                    icon = Icons.Default.Info,
                    title = stringResource(R.string.version),
                    subtitle = "1.0.0",
                    showChevron = false,
                    onClick = { tapCount++ }
                )
                if (tapCount >= 5) {
                    Button(
                        onClick = { showPaywallPreview = true },
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 8.dp)
                    ) {
                        Text("Preview Paywalls")
                    }
                }
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                SettingsRow(
                    icon = Icons.Default.Description,
                    title = stringResource(R.string.terms_of_service),
                    onClick = {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://kreativekoala.llc/terms"))
                        context.startActivity(intent)
                    }
                )
                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                SettingsRow(
                    icon = Icons.Default.Security,
                    title = stringResource(R.string.privacy_policy),
                    onClick = {
                        val intent = Intent(Intent.ACTION_VIEW, Uri.parse("https://kreativekoala.llc/privacy"))
                        context.startActivity(intent)
                    }
                )
            }

            Spacer(modifier = Modifier.height(32.dp))

            // Sign Out Button
            Button(
                onClick = { showSignOutDialog = true },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = Error.copy(alpha = 0.1f),
                    contentColor = Error
                )
            ) {
                Icon(Icons.Default.Logout, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.sign_out),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(12.dp))

            // Delete Account Button
            OutlinedButton(
                onClick = { showDeleteDialog = true },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = Error
                )
            ) {
                Icon(Icons.Default.Delete, contentDescription = null)
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.delete_account),
                    style = MaterialTheme.typography.titleMedium,
                    fontWeight = FontWeight.SemiBold
                )
            }

            Spacer(modifier = Modifier.height(Sizing.miniPlayerHeight.dp + Sizing.tabBarHeight.dp))
        }
    }

    // Sign Out Dialog
    if (showSignOutDialog) {
        AlertDialog(
            onDismissRequest = { showSignOutDialog = false },
            title = { Text(stringResource(R.string.sign_out), color = MaterialTheme.colorScheme.onBackground) },
            text = { Text(stringResource(R.string.sign_out_confirm), color = MaterialTheme.colorScheme.onSurfaceVariant) },
            confirmButton = {
                TextButton(onClick = {
                    showSignOutDialog = false
                    viewModel.signOut()
                }) {
                    Text(stringResource(R.string.sign_out), color = Error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showSignOutDialog = false }) {
                    Text(stringResource(R.string.cancel), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            containerColor = MaterialTheme.colorScheme.surface
        )
    }

    // Delete Account Dialog
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text(stringResource(R.string.delete_account), color = MaterialTheme.colorScheme.onBackground) },
            text = {
                Text(
                    stringResource(R.string.delete_account_confirm),
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteDialog = false
                    viewModel.deleteAccount()
                }) {
                    Text(stringResource(R.string.delete), color = Error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text(stringResource(R.string.cancel), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
            },
            containerColor = MaterialTheme.colorScheme.surface
        )
    }
}

@Composable
private fun ProfileHeader(
    name: String,
    email: String
) {
    Column(
        modifier = Modifier.fillMaxWidth(),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Avatar
        Box(
            modifier = Modifier
                .size(80.dp)
                .clip(CircleShape)
                .background(
                    brush = Brush.linearGradient(
                        colors = listOf(AccentOrange, AccentOrangeLight)
                    )
                ),
            contentAlignment = Alignment.Center
        ) {
            Text(
                text = getInitials(name),
                style = MaterialTheme.typography.headlineMedium,
                color = PrimaryTextDark, // Always white on orange gradient
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = name,
            style = MaterialTheme.typography.headlineSmall,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = email,
            style = MaterialTheme.typography.bodyMedium,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun SettingsSection(
    title: String,
    content: @Composable ColumnScope.() -> Unit
) {
    Column {
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(12.dp))

        Surface(
            shape = RoundedCornerShape(12.dp),
            color = MaterialTheme.colorScheme.surface
        ) {
            Column(
                modifier = Modifier.padding(4.dp),
                content = content
            )
        }
    }
}

@Composable
private fun SettingsRow(
    icon: ImageVector,
    title: String,
    subtitle: String? = null,
    showChevron: Boolean = true,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        color = MaterialTheme.colorScheme.surface
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = AccentOrange,
                modifier = Modifier.size(24.dp)
            )

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            if (showChevron) {
                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }
    }
}

private fun getInitials(name: String): String {
    val parts = name.split(" ")
    return if (parts.size >= 2) {
        "${parts[0].firstOrNull() ?: ""}${parts[1].firstOrNull() ?: ""}".uppercase()
    } else {
        name.take(1).uppercase()
    }
}
