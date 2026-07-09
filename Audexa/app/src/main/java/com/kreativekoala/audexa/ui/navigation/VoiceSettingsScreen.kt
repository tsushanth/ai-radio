package com.kreativekoala.audexa.ui.navigation

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.grid.GridCells
import androidx.compose.foundation.lazy.grid.LazyVerticalGrid
import androidx.compose.foundation.lazy.grid.items
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.model.*
import com.kreativekoala.audexa.tts.TtsVoice
import com.kreativekoala.audexa.tts.kokoro.KokoroModelDownloader
import com.kreativekoala.audexa.ui.theme.*

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun VoiceSettingsScreen(
    onNavigateBack: () -> Unit,
    onOpenKokoroTest: () -> Unit = {},
    viewModel: VoiceSettingsViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        stringResource(R.string.voice_settings),
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
                actions = {
                    // Debug entry point for the on-device Kokoro TTS pipeline.
                    // Surfaced here while we validate model download + ONNX
                    // session + synth + playback before wiring it into deep
                    // dives / topic podcasts.
                    TextButton(onClick = onOpenKokoroTest) {
                        Text("On-device", color = PrimaryText)
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
        ) {
            // Provider selector chips
            ProviderSelector(
                selectedProvider = uiState.selectedProvider,
                onProviderSelected = { viewModel.setProvider(it) }
            )

            // On-device (Kokoro) voice section — beta. Appears above the tabs so
            // users see it immediately, but is collapsed to a single toggle row
            // when off so it doesn't dominate the screen.
            OnDeviceVoiceSection(
                enabled = uiState.useKokoroEngine,
                voices = uiState.kokoroVoices,
                selectedVoiceId = uiState.selectedKokoroVoiceId,
                downloadState = uiState.kokoroDownloadState,
                onEnabledChange = { viewModel.setUseKokoroEngine(it) },
                onVoiceSelected = { viewModel.selectKokoroVoice(it) },
                onPreviewVoice = { viewModel.previewKokoroVoice(it) }
            )

            // Tab selector
            TabSelector(
                selectedTab = uiState.selectedTab,
                onTabSelected = { viewModel.setTab(it) }
            )

            // Content
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        CircularProgressIndicator(color = AccentOrange)
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = stringResource(R.string.loading_voices),
                            style = MaterialTheme.typography.bodyMedium,
                            color = SecondaryText
                        )
                    }
                }
            } else if (uiState.error != null) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center
                ) {
                    Column(horizontalAlignment = Alignment.CenterHorizontally) {
                        Icon(
                            Icons.Default.Error,
                            contentDescription = null,
                            tint = Error,
                            modifier = Modifier.size(48.dp)
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Text(
                            text = uiState.error!!,
                            style = MaterialTheme.typography.bodyMedium,
                            color = Error
                        )
                        Spacer(modifier = Modifier.height(16.dp))
                        Button(
                            onClick = { viewModel.loadVoices() },
                            colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
                        ) {
                            Text(stringResource(R.string.retry))
                        }
                    }
                }
            } else {
                when (uiState.selectedTab) {
                    VoiceTab.PAIRS -> VoicePairsContent(
                        pairs = viewModel.getVoicePairsForProvider(),
                        selectedHost1 = uiState.selectedHost1VoiceId,
                        selectedHost2 = uiState.selectedHost2VoiceId,
                        onPairSelected = { viewModel.selectVoicePair(it) }
                    )
                    VoiceTab.INDIVIDUAL -> IndividualVoicesContent(
                        voices = viewModel.getVoicesForProvider(),
                        selectedHost1 = uiState.selectedHost1VoiceId,
                        selectedHost2 = uiState.selectedHost2VoiceId,
                        onHost1Selected = { viewModel.selectHost1Voice(it) },
                        onHost2Selected = { viewModel.selectHost2Voice(it) }
                    )
                }
            }
        }
    }
}

@Composable
private fun ProviderSelector(
    selectedProvider: TTSProvider,
    onProviderSelected: (TTSProvider) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .horizontalScroll(rememberScrollState())
            .padding(horizontal = 16.dp, vertical = 12.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        TTSProvider.entries.forEach { provider ->
            FilterChip(
                selected = selectedProvider == provider,
                onClick = { onProviderSelected(provider) },
                label = {
                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Icon(
                            imageVector = if (provider == TTSProvider.OPENAI)
                                Icons.Default.GraphicEq
                            else
                                Icons.Default.RecordVoiceOver,
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(provider.displayName)
                    }
                },
                colors = FilterChipDefaults.filterChipColors(
                    selectedContainerColor = AccentOrange,
                    selectedLabelColor = PrimaryText
                )
            )
        }
    }
}

@Composable
private fun TabSelector(
    selectedTab: VoiceTab,
    onTabSelected: (VoiceTab) -> Unit
) {
    Row(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        horizontalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        VoiceTab.entries.forEach { tab ->
            Surface(
                onClick = { onTabSelected(tab) },
                shape = RoundedCornerShape(8.dp),
                color = if (selectedTab == tab) AccentOrange else CardBackground,
                modifier = Modifier.weight(1f)
            ) {
                Text(
                    text = tab.title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = if (selectedTab == tab) PrimaryText else SecondaryText,
                    fontWeight = if (selectedTab == tab) FontWeight.Bold else FontWeight.Normal,
                    modifier = Modifier.padding(vertical = 12.dp),
                    textAlign = androidx.compose.ui.text.style.TextAlign.Center
                )
            }
        }
    }
}

@Composable
private fun VoicePairsContent(
    pairs: List<VoicePair>,
    selectedHost1: String?,
    selectedHost2: String?,
    onPairSelected: (VoicePair) -> Unit
) {
    if (pairs.isEmpty()) {
        EmptyState(message = stringResource(R.string.no_voice_pairs))
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            item {
                Text(
                    text = stringResource(R.string.voice_pairs_description),
                    style = MaterialTheme.typography.bodyMedium,
                    color = SecondaryText,
                    modifier = Modifier.padding(bottom = 8.dp)
                )
            }

            items(pairs) { pair ->
                VoicePairCard(
                    pair = pair,
                    isSelected = selectedHost1 == pair.host1.id && selectedHost2 == pair.host2.id,
                    onSelect = { onPairSelected(pair) }
                )
            }
        }
    }
}

@Composable
private fun VoicePairCard(
    pair: VoicePair,
    isSelected: Boolean,
    onSelect: () -> Unit
) {
    Surface(
        onClick = onSelect,
        shape = RoundedCornerShape(12.dp),
        color = if (isSelected) AccentOrange.copy(alpha = 0.15f) else CardBackground,
        border = if (isSelected) {
            androidx.compose.foundation.BorderStroke(2.dp, AccentOrange)
        } else null
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = pair.name,
                    style = MaterialTheme.typography.titleMedium,
                    color = if (isSelected) AccentOrange else PrimaryText,
                    fontWeight = FontWeight.Bold
                )

                if (isSelected) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = stringResource(R.string.selected),
                        tint = AccentOrange
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = pair.description,
                style = MaterialTheme.typography.bodySmall,
                color = SecondaryText,
                maxLines = 2,
                overflow = TextOverflow.Ellipsis
            )

            Spacer(modifier = Modifier.height(12.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                VoiceBadge(
                    voice = pair.host1,
                    label = stringResource(R.string.host_1),
                    modifier = Modifier.weight(1f)
                )
                VoiceBadge(
                    voice = pair.host2,
                    label = stringResource(R.string.host_2),
                    modifier = Modifier.weight(1f)
                )
            }
        }
    }
}

@Composable
private fun VoiceBadge(
    voice: Voice,
    label: String,
    modifier: Modifier = Modifier
) {
    Column(modifier = modifier) {
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = SecondaryText.copy(alpha = 0.7f)
        )
        Row(verticalAlignment = Alignment.CenterVertically) {
            Icon(
                imageVector = Icons.Default.Person,
                contentDescription = null,
                modifier = Modifier.size(14.dp),
                tint = SecondaryText
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = voice.name,
                style = MaterialTheme.typography.bodySmall,
                color = PrimaryText,
                fontWeight = FontWeight.Medium
            )
        }
    }
}

@Composable
private fun IndividualVoicesContent(
    voices: List<Voice>,
    selectedHost1: String?,
    selectedHost2: String?,
    onHost1Selected: (Voice) -> Unit,
    onHost2Selected: (Voice) -> Unit
) {
    if (voices.isEmpty()) {
        EmptyState(message = stringResource(R.string.no_voices))
    } else {
        LazyColumn(
            modifier = Modifier.fillMaxSize(),
            contentPadding = PaddingValues(16.dp),
            verticalArrangement = Arrangement.spacedBy(20.dp)
        ) {
            // Host 1 Section
            item {
                Text(
                    text = stringResource(R.string.host_1_voice),
                    style = MaterialTheme.typography.titleMedium,
                    color = PrimaryText,
                    fontWeight = FontWeight.Bold
                )
            }

            item {
                VoiceGrid(
                    voices = voices,
                    selectedVoiceId = selectedHost1,
                    onVoiceSelected = onHost1Selected
                )
            }

            item {
                HorizontalDivider(color = CardBackground)
            }

            // Host 2 Section
            item {
                Text(
                    text = stringResource(R.string.host_2_voice),
                    style = MaterialTheme.typography.titleMedium,
                    color = PrimaryText,
                    fontWeight = FontWeight.Bold
                )
            }

            item {
                VoiceGrid(
                    voices = voices,
                    selectedVoiceId = selectedHost2,
                    onVoiceSelected = onHost2Selected
                )
            }
        }
    }
}

@Composable
private fun VoiceGrid(
    voices: List<Voice>,
    selectedVoiceId: String?,
    onVoiceSelected: (Voice) -> Unit
) {
    Column(
        verticalArrangement = Arrangement.spacedBy(8.dp)
    ) {
        voices.chunked(2).forEach { rowVoices ->
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                rowVoices.forEach { voice ->
                    VoiceCard(
                        voice = voice,
                        isSelected = selectedVoiceId == voice.id,
                        onSelect = { onVoiceSelected(voice) },
                        modifier = Modifier.weight(1f)
                    )
                }
                // Fill empty space if odd number of voices
                if (rowVoices.size == 1) {
                    Spacer(modifier = Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun VoiceCard(
    voice: Voice,
    isSelected: Boolean,
    onSelect: () -> Unit,
    modifier: Modifier = Modifier
) {
    Surface(
        onClick = onSelect,
        shape = RoundedCornerShape(10.dp),
        color = if (isSelected) AccentOrange else CardBackground,
        modifier = modifier
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Icon(
                    imageVector = Icons.Default.Person,
                    contentDescription = null,
                    modifier = Modifier.size(16.dp),
                    tint = if (isSelected) PrimaryText else SecondaryText
                )

                if (isSelected) {
                    Icon(
                        Icons.Default.Check,
                        contentDescription = stringResource(R.string.selected),
                        modifier = Modifier.size(16.dp),
                        tint = PrimaryText
                    )
                }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
                text = voice.name,
                style = MaterialTheme.typography.bodyMedium,
                color = if (isSelected) PrimaryText else PrimaryText,
                fontWeight = FontWeight.SemiBold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis
            )

            Text(
                text = voice.displayGender,
                style = MaterialTheme.typography.bodySmall,
                color = if (isSelected) PrimaryText.copy(alpha = 0.8f) else SecondaryText
            )

            if (voice.description != null) {
                Spacer(modifier = Modifier.height(4.dp))
                Text(
                    text = voice.description,
                    style = MaterialTheme.typography.labelSmall,
                    color = if (isSelected) PrimaryText.copy(alpha = 0.7f) else SecondaryText.copy(alpha = 0.7f),
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}

@Composable
private fun EmptyState(message: String) {
    Box(
        modifier = Modifier.fillMaxSize(),
        contentAlignment = Alignment.Center
    ) {
        Column(horizontalAlignment = Alignment.CenterHorizontally) {
            Icon(
                Icons.Default.MusicOff,
                contentDescription = null,
                tint = SecondaryText,
                modifier = Modifier.size(48.dp)
            )
            Spacer(modifier = Modifier.height(16.dp))
            Text(
                text = message,
                style = MaterialTheme.typography.bodyMedium,
                color = SecondaryText
            )
        }
    }
}

/**
 * Collapsible "On-device voice (beta)" section. When the toggle is off, only a
 * single row is visible. When on, shows a radio-list of the 5 bundled Kokoro
 * voices plus a download progress line when the model isn't yet on disk.
 */
@Composable
private fun OnDeviceVoiceSection(
    enabled: Boolean,
    voices: List<TtsVoice>,
    selectedVoiceId: String?,
    downloadState: KokoroModelDownloader.State,
    onEnabledChange: (Boolean) -> Unit,
    onVoiceSelected: (String?) -> Unit,
    onPreviewVoice: (TtsVoice) -> Unit,
) {
    val previewsReady = downloadState is KokoroModelDownloader.State.Ready
    Surface(
        modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 16.dp, vertical = 8.dp),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)
    ) {
        Column(modifier = Modifier.padding(16.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                modifier = Modifier.fillMaxWidth()
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "On-device voice (beta)",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.SemiBold,
                        color = PrimaryText
                    )
                    Text(
                        text = "Play deep dives and daily briefs on your device using Kokoro. Downloads a ~82 MB model on first use.",
                        style = MaterialTheme.typography.bodySmall,
                        color = SecondaryText
                    )
                }
                Spacer(modifier = Modifier.width(12.dp))
                Switch(
                    checked = enabled,
                    onCheckedChange = onEnabledChange
                )
            }

            if (enabled) {
                Spacer(modifier = Modifier.height(12.dp))
                when (val s = downloadState) {
                    is KokoroModelDownloader.State.Downloading -> {
                        LinearProgressIndicator(
                            progress = { s.percent / 100f },
                            modifier = Modifier.fillMaxWidth(),
                            color = AccentOrange
                        )
                        Text(
                            text = "Downloading model… ${s.downloadedMb}/${s.totalMb} MB (${s.percent}%)",
                            style = MaterialTheme.typography.bodySmall,
                            color = SecondaryText,
                            modifier = Modifier.padding(top = 6.dp)
                        )
                    }
                    is KokoroModelDownloader.State.WaitingForWifi -> {
                        Text(
                            text = "Waiting for WiFi to download voice model…",
                            style = MaterialTheme.typography.bodySmall,
                            color = SecondaryText
                        )
                    }
                    is KokoroModelDownloader.State.Failed -> {
                        Text(
                            text = "Download failed: ${s.message}. Toggle off and back on to retry.",
                            style = MaterialTheme.typography.bodySmall,
                            color = Error
                        )
                    }
                    else -> Unit
                }

                Spacer(modifier = Modifier.height(8.dp))
                Text(
                    text = "Voice",
                    style = MaterialTheme.typography.labelLarge,
                    color = SecondaryText,
                    modifier = Modifier.padding(bottom = 4.dp)
                )
                voices.forEach { voice ->
                    Row(
                        verticalAlignment = Alignment.CenterVertically,
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(vertical = 4.dp)
                    ) {
                        RadioButton(
                            selected = selectedVoiceId == voice.id,
                            onClick = { onVoiceSelected(voice.id) }
                        )
                        Column(
                            modifier = Modifier
                                .padding(start = 8.dp)
                                .weight(1f)
                        ) {
                            Text(
                                text = voice.displayName,
                                style = MaterialTheme.typography.bodyMedium,
                                color = PrimaryText
                            )
                            Text(
                                text = voice.locale,
                                style = MaterialTheme.typography.bodySmall,
                                color = SecondaryText
                            )
                        }
                        // Preview icon — only enabled once the Kokoro model is on disk.
                        // Before that a play tap would silently no-op (engine.prepare()
                        // in the ViewModel bails early), so we grey it out to match reality.
                        IconButton(
                            onClick = { onPreviewVoice(voice) },
                            enabled = previewsReady
                        ) {
                            Icon(
                                imageVector = Icons.Filled.PlayArrow,
                                contentDescription = "Preview ${voice.displayName}",
                                tint = if (previewsReady) AccentOrange else SecondaryText
                            )
                        }
                    }
                }
            }
        }
    }
}
