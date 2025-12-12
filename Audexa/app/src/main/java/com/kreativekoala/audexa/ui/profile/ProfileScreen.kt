package com.kreativekoala.audexa.ui.profile

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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ProfileScreen(
    onNavigateBack: () -> Unit,
    onNavigateToLinkedAccounts: () -> Unit,
    onNavigateToHiddenTopics: () -> Unit,
    onNavigateToLanguageSettings: () -> Unit,
    onSignOut: () -> Unit,
    viewModel: ProfileViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()
    var showSignOutDialog by remember { mutableStateOf(false) }
    var showDeleteDialog by remember { mutableStateOf(false) }

    LaunchedEffect(uiState.isSignedOut) {
        if (uiState.isSignedOut) {
            onSignOut()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Profile",
                        color = PrimaryText,
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = "Back",
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

            // Linked Accounts Section
            SettingsSection(title = "Linked Accounts") {
                SettingsRow(
                    icon = Icons.Default.Link,
                    title = "Email Accounts",
                    subtitle = if (uiState.hasLinkedGoogle) "Connected" else "Not Connected",
                    onClick = onNavigateToLinkedAccounts
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Preferences Section
            SettingsSection(title = "Preferences") {
                SettingsRow(
                    icon = Icons.Default.Language,
                    title = "Podcast Language",
                    subtitle = uiState.preferredLanguage,
                    onClick = onNavigateToLanguageSettings
                )
                HorizontalDivider(color = CardBackgroundLight)
                SettingsRow(
                    icon = Icons.Default.VisibilityOff,
                    title = "Hidden Topics",
                    subtitle = "${uiState.hiddenTopicsCount} hidden",
                    onClick = onNavigateToHiddenTopics
                )
            }

            Spacer(modifier = Modifier.height(24.dp))

            // About Section
            SettingsSection(title = "About") {
                SettingsRow(
                    icon = Icons.Default.Info,
                    title = "Version",
                    subtitle = "1.0.0",
                    showChevron = false,
                    onClick = { }
                )
                HorizontalDivider(color = CardBackgroundLight)
                SettingsRow(
                    icon = Icons.Default.Description,
                    title = "Terms of Service",
                    onClick = { /* TODO: Open URL */ }
                )
                HorizontalDivider(color = CardBackgroundLight)
                SettingsRow(
                    icon = Icons.Default.Security,
                    title = "Privacy Policy",
                    onClick = { /* TODO: Open URL */ }
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
                    text = "Sign Out",
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
                    text = "Delete Account",
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
            title = { Text("Sign Out", color = PrimaryText) },
            text = { Text("Are you sure you want to sign out?", color = SecondaryText) },
            confirmButton = {
                TextButton(onClick = {
                    showSignOutDialog = false
                    viewModel.signOut()
                }) {
                    Text("Sign Out", color = Error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showSignOutDialog = false }) {
                    Text("Cancel", color = SecondaryText)
                }
            },
            containerColor = CardBackground
        )
    }

    // Delete Account Dialog
    if (showDeleteDialog) {
        AlertDialog(
            onDismissRequest = { showDeleteDialog = false },
            title = { Text("Delete Account", color = PrimaryText) },
            text = {
                Text(
                    "Are you sure you want to delete your account? This will permanently delete all your data including podcasts, preferences, and linked accounts. This action cannot be undone.",
                    color = SecondaryText
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    showDeleteDialog = false
                    viewModel.deleteAccount()
                }) {
                    Text("Delete", color = Error)
                }
            },
            dismissButton = {
                TextButton(onClick = { showDeleteDialog = false }) {
                    Text("Cancel", color = SecondaryText)
                }
            },
            containerColor = CardBackground
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
                color = PrimaryText,
                fontWeight = FontWeight.Bold
            )
        }

        Spacer(modifier = Modifier.height(16.dp))

        Text(
            text = name,
            style = MaterialTheme.typography.headlineSmall,
            color = PrimaryText,
            fontWeight = FontWeight.Bold
        )

        Text(
            text = email,
            style = MaterialTheme.typography.bodyMedium,
            color = SecondaryText
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
            color = PrimaryText,
            fontWeight = FontWeight.Bold
        )

        Spacer(modifier = Modifier.height(12.dp))

        Surface(
            shape = RoundedCornerShape(12.dp),
            color = CardBackground
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
        color = CardBackground
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
                    color = PrimaryText
                )
                if (subtitle != null) {
                    Text(
                        text = subtitle,
                        style = MaterialTheme.typography.bodySmall,
                        color = SecondaryText
                    )
                }
            }

            if (showChevron) {
                Icon(
                    imageVector = Icons.Default.ChevronRight,
                    contentDescription = null,
                    tint = SecondaryText
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
