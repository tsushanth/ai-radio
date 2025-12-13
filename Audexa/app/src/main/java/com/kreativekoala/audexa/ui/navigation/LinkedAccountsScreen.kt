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
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.common.api.ApiException
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
        if (result.resultCode == Activity.RESULT_OK) {
            val task = GoogleSignIn.getSignedInAccountFromIntent(result.data)
            try {
                val account = task.getResult(ApiException::class.java)
                viewModel.handleGmailLinkResult(account)
            } catch (e: ApiException) {
                viewModel.handleLinkError("Gmail linking failed: ${e.message}")
            }
        } else {
            viewModel.handleLinkError("Gmail linking was cancelled")
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Linked Accounts",
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
                        text = "Enable Daily Brief",
                        style = MaterialTheme.typography.titleMedium,
                        color = PrimaryText,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Connect your Gmail to get personalized daily briefings based on your emails. We'll summarize important updates so you can start your day informed.",
                        style = MaterialTheme.typography.bodyMedium,
                        color = SecondaryText
                    )
                }
            }

            Spacer(modifier = Modifier.height(24.dp))

            // Google Account
            AccountRow(
                icon = { GoogleIcon() },
                title = "Gmail",
                subtitle = uiState.linkedGoogleEmail ?: "Not connected",
                isConnected = uiState.hasLinkedGoogle,
                isLoading = uiState.isLinkingGoogle,
                onConnect = {
                    viewModel.startGoogleLinking()
                    gmailLauncher.launch(viewModel.getGmailLinkIntent())
                },
                onDisconnect = { viewModel.unlinkGoogle() }
            )

            Spacer(modifier = Modifier.height(12.dp))

            // Microsoft Account
            AccountRow(
                icon = { MicrosoftIcon() },
                title = "Outlook",
                subtitle = uiState.linkedMicrosoftEmail ?: "Coming Soon",
                isConnected = uiState.hasLinkedMicrosoft,
                isLoading = uiState.isLinkingMicrosoft,
                onConnect = { viewModel.showMicrosoftComingSoon() },
                onDisconnect = { },
                isComingSoon = true
            )

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
                        text = "🔒 Your Privacy",
                        style = MaterialTheme.typography.labelLarge,
                        color = PrimaryText,
                        fontWeight = FontWeight.Medium
                    )
                    Spacer(modifier = Modifier.height(4.dp))
                    Text(
                        text = "We only read email subjects and senders to create summaries. We never store your email content or share your data with third parties.",
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
            title = { Text("Coming Soon", color = PrimaryText) },
            text = {
                Text(
                    "Microsoft Outlook linking will be available in a future update.",
                    color = SecondaryText
                )
            },
            confirmButton = {
                TextButton(onClick = { viewModel.dismissComingSoon() }) {
                    Text("OK", color = AccentOrange)
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
                        contentDescription = "Connected",
                        tint = Color(0xFF4CAF50),
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                    TextButton(onClick = onDisconnect) {
                        Text("Unlink", color = Error)
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
                    Text(if (isComingSoon) "Soon" else "Connect")
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
        text = "⊞",
        style = MaterialTheme.typography.titleLarge,
        color = Color(0xFF00A4EF)
    )
}
