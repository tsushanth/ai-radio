package com.kreativekoala.audexa.ui.profile

import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.outlined.Circle
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.ui.theme.AccentOrange

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun RadioLanguagesScreen(
    onNavigateBack: () -> Unit,
    viewModel: RadioLanguagesViewModel = hiltViewModel()
) {
    val enabledLanguages by viewModel.enabledLanguages.collectAsState(initial = emptySet())

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        "Radio Languages",
                        color = MaterialTheme.colorScheme.onBackground,
                        fontWeight = FontWeight.Bold
                    )
                },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.Default.ArrowBack,
                            contentDescription = "Back",
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
        LazyColumn(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(2.dp)
        ) {
            item {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = MaterialTheme.colorScheme.surface
                ) {
                    Column {
                        SupportedLanguage.radioAvailable.forEachIndexed { index, language ->
                            val isEnabled = enabledLanguages.contains(language.code)
                            val isLastEnabled = isEnabled && enabledLanguages.size == 1

                            Surface(
                                onClick = {
                                    if (!isLastEnabled) {
                                        viewModel.toggleLanguage(language.code)
                                    }
                                },
                                color = MaterialTheme.colorScheme.surface,
                                enabled = !isLastEnabled
                            ) {
                                Row(
                                    modifier = Modifier
                                        .fillMaxWidth()
                                        .padding(16.dp),
                                    verticalAlignment = Alignment.CenterVertically
                                ) {
                                    Text(
                                        text = language.flagEmoji,
                                        fontSize = 24.sp
                                    )

                                    Spacer(modifier = Modifier.width(12.dp))

                                    Column(modifier = Modifier.weight(1f)) {
                                        Text(
                                            text = language.radioStationName,
                                            style = MaterialTheme.typography.bodyLarge,
                                            color = MaterialTheme.colorScheme.onSurface,
                                            fontWeight = FontWeight.Medium
                                        )
                                        Text(
                                            text = language.nativeName,
                                            style = MaterialTheme.typography.bodySmall,
                                            color = MaterialTheme.colorScheme.onSurfaceVariant
                                        )
                                    }

                                    Icon(
                                        imageVector = if (isEnabled) Icons.Default.CheckCircle else Icons.Outlined.Circle,
                                        contentDescription = if (isEnabled) "Enabled" else "Disabled",
                                        tint = if (isEnabled) AccentOrange else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.4f),
                                        modifier = Modifier.size(22.dp)
                                    )
                                }
                            }

                            if (index < SupportedLanguage.radioAvailable.size - 1) {
                                HorizontalDivider(color = MaterialTheme.colorScheme.surfaceVariant)
                            }
                        }
                    }
                }
            }

            item {
                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Selected stations will appear on your home screen. At least one language must be enabled.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = 4.dp)
                )
            }
        }
    }
}
