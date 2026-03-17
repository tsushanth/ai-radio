package com.kreativekoala.audexa.ui.navigation

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.common.api.ApiException
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LinkedAccountsScreen(
    onNavigateBack: () -> Unit,
    viewModel: LinkedAccountsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    // Gmail OAuth launcher
    val gmailLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            viewModel.handleGmailLinkResult(account)
        } catch (e: ApiException) {
            if (e.statusCode == 12501) {
                viewModel.handleLinkError("Gmail linking cancelled")
            } else {
                viewModel.handleLinkError("Gmail linking failed: ${e.statusCode} - ${e.message}")
            }
        }
    }

    // Calendar OAuth launcher (separate from Gmail)
    val calendarLauncher = rememberLauncherForActivityResult(
        contract = ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
        try {
            val account = task.getResult(ApiException::class.java)
            viewModel.handleCalendarLinkResult(account)
        } catch (e: ApiException) {
            if (e.statusCode == 12501) {
                viewModel.handleLinkError("Calendar linking cancelled")
            } else {
                viewModel.handleLinkError("Calendar linking failed: ${e.statusCode} - ${e.message}")
            }
        }
    }

    // Launch Gmail sign-in when intent is ready
    LaunchedEffect(uiState.gmailLinkIntent) {
        uiState.gmailLinkIntent?.let { intent ->
            gmailLauncher.launch(intent)
            viewModel.clearGmailLinkIntent()
        }
    }

    // Launch Calendar sign-in when intent is ready
    LaunchedEffect(uiState.calendarLinkIntent) {
        uiState.calendarLinkIntent?.let { intent ->
            calendarLauncher.launch(intent)
            viewModel.clearCalendarLinkIntent()
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(R.string.linked_accounts),
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp)
        ) {
            Spacer(modifier = Modifier.height(16.dp))

            // Explanation card
            Surface(
                color = AccentOrange.copy(alpha = 0.1f),
                shape = RoundedCornerShape(12.dp)
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = stringResource(R.string.enable_daily_brief),
                        style = MaterialTheme.typography.titleMedium,
                        color = PrimaryText,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = stringResource(R.string.enable_daily_brief_description),
                        style = MaterialTheme.typography.bodyMedium,
                        color = SecondaryText
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Gmail Account
            AccountRow(
                icon = { GoogleIcon() },
                title = stringResource(R.string.gmail),
                subtitle = uiState.linkedGoogleEmail ?: stringResource(R.string.not_connected_lower),
                isConnected = uiState.hasLinkedGoogle,
                isLoading = uiState.isLinkingGoogle,
                onConnect = {
                    viewModel.prepareGmailLinking()
                },
                onDisconnect = { viewModel.unlinkGoogle() }
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Google Calendar (separate permission)
            AccountRow(
                icon = { CalendarIcon() },
                title = stringResource(R.string.google_calendar),
                subtitle = if (uiState.hasLinkedCalendar) stringResource(R.string.connected) else stringResource(R.string.not_connected_lower),
                isConnected = uiState.hasLinkedCalendar,
                isLoading = uiState.isLinkingCalendar,
                onConnect = {
                    viewModel.prepareCalendarLinking()
                },
                onDisconnect = { viewModel.unlinkCalendar() }
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Microsoft Account
            AccountRow(
                icon = { MicrosoftIcon() },
                title = stringResource(R.string.outlook),
                subtitle = uiState.linkedMicrosoftEmail ?: stringResource(R.string.coming_soon),
                isConnected = uiState.hasLinkedMicrosoft,
                isLoading = uiState.isLinkingMicrosoft,
                onConnect = { viewModel.showMicrosoftComingSoon() },
                onDisconnect = { },
                isComingSoon = true
            )

            // Email toggle (shown when Gmail is linked)
            if (uiState.hasLinkedGoogle) {
                Spacer(modifier = Modifier.height(24.dp))

                Text(
                    text = stringResource(R.string.daily_brief_sources),
                    style = MaterialTheme.typography.titleMedium,
                    color = PrimaryText,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(bottom = 12.dp)
                )

                IntegrationToggleRow(
                    icon = Icons.Default.Email,
                    title = stringResource(R.string.email_summaries),
                    subtitle = stringResource(R.string.include_email_in_brief),
                    isEnabled = uiState.emailEnabled,
                    onToggle = { viewModel.setEmailEnabled(it) }
                )

                // Calendar toggle (only shown if calendar is connected)
                if (uiState.hasLinkedCalendar) {
                    Spacer(modifier = Modifier.height(8.dp))

                    IntegrationToggleRow(
                        iconText = "\uD83D\uDCC5",
                        title = stringResource(R.string.calendar_events),
                        subtitle = stringResource(R.string.include_calendar_in_brief),
                        isEnabled = uiState.calendarEnabled,
                        onToggle = { viewModel.setCalendarEnabled(it) }
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Success message
            if (uiState.successMessage != null) {
                Surface(
                    color = Color(0xFF4CAF50).copy(alpha = 0.1f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = uiState.successMessage!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = Color(0xFF4CAF50),
                        modifier = Modifier.padding(12.dp)
                    )
                }
                Spacer(modifier = Modifier.height(12.dp))
            }

            // Error message
            if (uiState.error != null) {
                Surface(
                    color = Error.copy(alpha = 0.1f),
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(
                        text = uiState.error!!,
                        style = MaterialTheme.typography.bodySmall,
                        color = Error,
                        modifier = Modifier.padding(12.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.weight(1f))

            // Privacy note
            Surface(
                color = CardBackground,
                shape = RoundedCornerShape(8.dp)
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(
                        text = stringResource(R.string.your_privacy),
                        style = MaterialTheme.typography.labelLarge,
                        color = PrimaryText,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = stringResource(R.string.privacy_note),
                        style = MaterialTheme.typography.bodySmall,
                        color = SecondaryText.copy(alpha = 0.7f)
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))
        }
    }

    // Coming Soon Dialog
    if (uiState.showComingSoonDialog) {
        AlertDialog(
            onDismissRequest = { viewModel.dismissComingSoon() },
            title = { Text(stringResource(R.string.coming_soon), color = PrimaryText) },
            text = {
                Text(
                    stringResource(R.string.microsoft_outlook_coming_soon),
                    color = SecondaryText
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.dismissComingSoon() }) {
                    Text(stringResource(R.string.ok), color = AccentOrange)
                }
            },
            containerColor = CardBackground
        )
    }
}

@Composable
private fun AccountRow(
    icon: @Composable () -> Unit,
    title: String,
    subtitle: String,
    isConnected: Boolean,
    isLoading: Boolean,
    onConnect: () -> Unit,
    onDisconnect: () -> Unit,
    isComingSoon: Boolean = false
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = CardBackground
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(
                        color = Color.White.copy(alpha = 0.1f),
                        shape = RoundedCornerShape(8.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                icon()
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = PrimaryText,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = if (isComingSoon) SecondaryText.copy(alpha = 0.5f) else SecondaryText
                )
            }

            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = AccentOrange,
                    strokeWidth = 2.dp
                )
            } else if (isConnected) {
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = stringResource(R.string.connected),
                        tint = Color(0xFF4CAF50),
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    TextButton(onClick = onDisconnect) {
                        Text(stringResource(R.string.unlink), color = Error)
                    }
                }
            } else {
                Button(
                    onClick = onConnect,
                    colors = ButtonDefaults.buttonColors(
                        containerColor = if (isComingSoon) CardBackground else AccentOrange,
                        contentColor = if (isComingSoon) SecondaryText else PrimaryText
                    ),
                    enabled = !isComingSoon,
                    shape = RoundedCornerShape(8.dp)
                ) {
                    Text(if (isComingSoon) stringResource(R.string.soon) else stringResource(R.string.connect))
                }
            }
        }
    }
}

@Composable
private fun GoogleIcon() {
    Text(
        text = "G",
        style = MaterialTheme.typography.titleLarge,
        color = Color(0xFF4285F4),
        fontWeight = FontWeight.Bold
    )
}

@Composable
private fun MicrosoftIcon() {
    Text(
        text = "\u229E",
        style = MaterialTheme.typography.titleLarge,
        color = Color(0xFF00A4EF)
    )
}

@Composable
private fun CalendarIcon() {
    Text(
        text = "\uD83D\uDCC5",
        style = MaterialTheme.typography.titleLarge
    )
}

@Composable
private fun IntegrationToggleRow(
    icon: androidx.compose.ui.graphics.vector.ImageVector? = null,
    iconText: String? = null,
    title: String,
    subtitle: String,
    isEnabled: Boolean,
    onToggle: (Boolean) -> Unit
) {
    Surface(
        shape = RoundedCornerShape(12.dp),
        color = CardBackground
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(40.dp)
                    .background(
                        color = if (isEnabled) AccentOrange.copy(alpha = 0.1f) else Color.White.copy(alpha = 0.05f),
                        shape = RoundedCornerShape(8.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                if (iconText != null) {
                    Text(
                        text = iconText,
                        style = MaterialTheme.typography.titleMedium
                    )
                } else if (icon != null) {
                    Icon(
                        imageVector = icon,
                        contentDescription = null,
                        tint = if (isEnabled) AccentOrange else SecondaryText,
                        modifier = Modifier.size(20.dp)
                    )
                }
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyLarge,
                    color = PrimaryText,
                    fontWeight = FontWeight.Medium
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText
                )
            }

            Switch(
                checked = isEnabled,
                onCheckedChange = onToggle,
                colors = SwitchDefaults.colors(
                    checkedThumbColor = PrimaryText,
                    checkedTrackColor = AccentOrange,
                    uncheckedThumbColor = SecondaryText,
                    uncheckedTrackColor = CardBackground
                )
            )
        }
    }
}
