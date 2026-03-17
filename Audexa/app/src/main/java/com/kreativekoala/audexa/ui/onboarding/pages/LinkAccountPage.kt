package com.kreativekoala.audexa.ui.onboarding.pages

import android.app.Activity
import androidx.activity.compose.rememberLauncherForActivityResult
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Check
import androidx.compose.material.icons.filled.Email
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import com.google.android.gms.auth.api.signin.GoogleSignIn
import com.google.android.gms.common.api.ApiException
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.ui.onboarding.OnboardingUiState
import com.kreativekoala.audexa.ui.onboarding.OnboardingViewModel
import com.kreativekoala.audexa.ui.theme.*

@Composable
fun LinkAccountPage(
    uiState: OnboardingUiState,
    viewModel: OnboardingViewModel,
    onContinue: () -> Unit
) {
    val gmailLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            try {
                val account = GoogleSignIn.getSignedInAccountFromIntent(result.data)
                    .getResult(ApiException::class.java)
                viewModel.handleGmailLinkResult(account)
            } catch (e: ApiException) {
                viewModel.handleLinkError("Google sign-in failed: ${e.statusCode}")
            }
        }
    }

    val calendarLauncher = rememberLauncherForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        if (result.resultCode == Activity.RESULT_OK) {
            try {
                val account = GoogleSignIn.getSignedInAccountFromIntent(result.data)
                    .getResult(ApiException::class.java)
                viewModel.handleCalendarLinkResult(account)
            } catch (e: ApiException) {
                viewModel.handleLinkError("Calendar link failed: ${e.statusCode}")
            }
        }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(32.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Spacer(modifier = Modifier.height(48.dp))

        Text(
            text = stringResource(R.string.connect_your_account),
            style = MaterialTheme.typography.headlineMedium,
            color = MaterialTheme.colorScheme.onBackground,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center
        )

        Spacer(modifier = Modifier.height(8.dp))

        Text(
            text = stringResource(R.string.connect_account_description),
            style = MaterialTheme.typography.bodyLarge,
            color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.7f),
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 8.dp)
        )

        Spacer(modifier = Modifier.height(40.dp))

        // Gmail connect card
        AccountLinkCard(
            icon = { Icon(Icons.Default.Email, contentDescription = null, tint = AccentOrange) },
            title = stringResource(R.string.gmail),
            subtitle = if (uiState.googleLinked) {
                uiState.linkedEmail ?: stringResource(R.string.connected)
            } else {
                stringResource(R.string.include_email_highlights)
            },
            isLinked = uiState.googleLinked,
            isLoading = uiState.isLinkingGoogle,
            onConnect = {
                gmailLauncher.launch(viewModel.getGmailLinkIntent())
            }
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Calendar connect card (only show after Gmail is linked)
        if (uiState.googleLinked) {
            AccountLinkCard(
                icon = { Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = AccentOrange) },
                title = stringResource(R.string.calendar),
                subtitle = if (uiState.calendarEnabled) {
                    stringResource(R.string.connected)
                } else {
                    stringResource(R.string.include_calendar_events)
                },
                isLinked = uiState.calendarEnabled,
                isLoading = uiState.isLinkingCalendar,
                onConnect = {
                    calendarLauncher.launch(viewModel.getCalendarLinkIntent())
                }
            )

            Spacer(modifier = Modifier.height(16.dp))
        }

        // Error
        if (uiState.error != null) {
            Text(
                text = uiState.error,
                style = MaterialTheme.typography.bodySmall,
                color = Error,
                textAlign = TextAlign.Center,
                modifier = Modifier.padding(horizontal = 8.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
        }

        Spacer(modifier = Modifier.weight(1f))

        // Continue button
        Button(
            onClick = onContinue,
            modifier = Modifier
                .fillMaxWidth()
                .height(56.dp),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
                containerColor = AccentOrange,
                contentColor = PrimaryTextDark
            )
        ) {
            Text(
                text = if (uiState.googleLinked) stringResource(R.string.continue_button) else stringResource(R.string.skip_for_now),
                style = MaterialTheme.typography.titleMedium,
                fontWeight = FontWeight.SemiBold
            )
        }

        if (!uiState.googleLinked) {
            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = stringResource(R.string.connect_later_hint),
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onBackground.copy(alpha = 0.5f),
                textAlign = TextAlign.Center
            )
        }

        Spacer(modifier = Modifier.height(32.dp))
    }
}

@Composable
private fun AccountLinkCard(
    icon: @Composable () -> Unit,
    title: String,
    subtitle: String,
    isLinked: Boolean,
    isLoading: Boolean,
    onConnect: () -> Unit
) {
    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant
        )
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .size(44.dp)
                    .background(
                        AccentOrange.copy(alpha = 0.1f),
                        shape = RoundedCornerShape(10.dp)
                    ),
                contentAlignment = Alignment.Center
            ) {
                icon()
            }

            Spacer(modifier = Modifier.width(12.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.titleSmall,
                    color = MaterialTheme.colorScheme.onSurface,
                    fontWeight = FontWeight.SemiBold
                )
                Text(
                    text = subtitle,
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurface.copy(alpha = 0.6f)
                )
            }

            if (isLoading) {
                CircularProgressIndicator(
                    modifier = Modifier.size(24.dp),
                    color = AccentOrange,
                    strokeWidth = 2.dp
                )
            } else if (isLinked) {
                Icon(
                    imageVector = Icons.Default.Check,
                    contentDescription = stringResource(R.string.connected),
                    tint = Success,
                    modifier = Modifier.size(24.dp)
                )
            } else {
                TextButton(onClick = onConnect) {
                    Text(
                        text = stringResource(R.string.connect),
                        color = AccentOrange,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        }
    }
}
