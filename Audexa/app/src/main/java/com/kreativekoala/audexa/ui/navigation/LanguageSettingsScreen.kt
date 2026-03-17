package com.kreativekoala.audexa.ui.navigation

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.Check
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun LanguageSettingsScreen(
    onNavigateBack: () -> Unit,
    viewModel: LanguageSettingsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(R.string.language),
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
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(horizontal = 16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(vertical = 16.dp)
        ) {
            item {
                Text(
                    text = stringResource(R.string.language_description),
                    style = MaterialTheme.typography.bodyMedium,
                    color = SecondaryText,
                    modifier = Modifier.padding(bottom = 16.dp)
                )
            }

            items(SupportedLanguage.entries) { language ->
                LanguageRow(
                    language = language,
                    isSelected = language == uiState.selectedLanguage,
                    onClick = { viewModel.setLanguage(language) }
                )
            }

            item {
                Spacer(modifier = Modifier.height(16.dp))
                Text(
                    text = stringResource(R.string.language_note),
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText.copy(alpha = 0.7f)
                )
            }
        }
    }
}

@Composable
private fun LanguageRow(
    language: SupportedLanguage,
    isSelected: Boolean,
    onClick: () -> Unit
) {
    Surface(
        onClick = onClick,
        shape = RoundedCornerShape(12.dp),
        color = if (isSelected) AccentOrange.copy(alpha = 0.15f) else CardBackground
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Text(
                text = language.flagEmoji,
                style = MaterialTheme.typography.headlineSmall
            )

            Spacer(modifier = Modifier.width(16.dp))

            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = language.displayName,
                    style = MaterialTheme.typography.bodyLarge,
                    color = if (isSelected) AccentOrange else PrimaryText,
                    fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium
                )
                Text(
                    text = language.nativeName,
                    style = MaterialTheme.typography.bodySmall,
                    color = SecondaryText
                )
            }

            if (isSelected) {
                Icon(
                    Icons.Default.Check,
                    contentDescription = stringResource(R.string.selected),
                    tint = AccentOrange
                )
            }
        }
    }
}
