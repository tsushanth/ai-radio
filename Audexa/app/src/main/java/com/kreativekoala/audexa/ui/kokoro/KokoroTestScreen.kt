package com.kreativekoala.audexa.ui.kokoro

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ArrowBack
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.tts.TtsState
import com.kreativekoala.audexa.tts.kokoro.KokoroModelDownloader

/**
 * Minimal end-to-end test screen for the on-device Kokoro 82M pipeline.
 *
 * Not for production users — exposed via Voice Settings as a debug entry
 * point so we can validate the model download + ONNX session + synth +
 * MediaPlayer flow before wiring Kokoro into deep dives or topic podcasts.
 */
@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun KokoroTestScreen(
    onNavigateBack: () -> Unit,
    viewModel: KokoroTestViewModel = hiltViewModel(),
) {
    val ui by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text("Kokoro on-device test", fontWeight = FontWeight.SemiBold) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(Icons.Default.ArrowBack, contentDescription = "Back")
                    }
                },
            )
        }
    ) { padding ->
        Column(
            modifier = Modifier
                .padding(padding)
                .padding(16.dp)
                .verticalScroll(rememberScrollState()),
            verticalArrangement = Arrangement.spacedBy(16.dp),
        ) {
            // ---- Download status -------------------------------------------
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Model", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    DownloadStatusLine(ui.downloadState)

                    when (val s = ui.downloadState) {
                        is KokoroModelDownloader.State.Downloading -> {
                            LinearProgressIndicator(
                                progress = { s.percent / 100f },
                                modifier = Modifier.fillMaxWidth(),
                            )
                            Text(
                                "${s.downloadedMb} / ${s.totalMb} MB",
                                style = MaterialTheme.typography.bodySmall,
                            )
                        }
                        else -> Unit
                    }

                    Row(verticalAlignment = Alignment.CenterVertically) {
                        Checkbox(
                            checked = ui.allowCellular,
                            onCheckedChange = viewModel::onToggleAllowCellular,
                        )
                        Text("Allow cellular download", style = MaterialTheme.typography.bodyMedium)
                    }

                    Button(
                        onClick = viewModel::onDownloadTapped,
                        enabled = !ui.downloadIsReady && ui.downloadState !is KokoroModelDownloader.State.Downloading,
                        modifier = Modifier.fillMaxWidth(),
                    ) {
                        Text(if (ui.downloadIsReady) "Ready" else "Download model (~80 MB)")
                    }
                }
            }

            // ---- Voice picker ---------------------------------------------
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Voice", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    ui.voices.forEach { voice ->
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth(),
                        ) {
                            RadioButton(
                                selected = voice.id == ui.selectedVoiceId,
                                onClick = { viewModel.onSelectVoice(voice.id) },
                            )
                            Spacer(Modifier.width(4.dp))
                            Column {
                                Text(voice.displayName, style = MaterialTheme.typography.bodyLarge)
                                Text(voice.locale, style = MaterialTheme.typography.bodySmall)
                            }
                        }
                    }
                }
            }

            // ---- Text + speak controls -------------------------------------
            ElevatedCard(modifier = Modifier.fillMaxWidth()) {
                Column(Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text("Sample text", style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.SemiBold)
                    OutlinedTextField(
                        value = ui.sampleText,
                        onValueChange = viewModel::onSampleTextChange,
                        modifier = Modifier
                            .fillMaxWidth()
                            .heightIn(min = 120.dp),
                        minLines = 4,
                    )

                    TtsStatusLine(ui.ttsState)

                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        Button(
                            onClick = viewModel::onSpeakTapped,
                            enabled = ui.downloadIsReady && !ui.isSpeaking && ui.sampleText.isNotBlank(),
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null)
                            Spacer(Modifier.width(4.dp))
                            Text("Speak")
                        }
                        OutlinedButton(
                            onClick = viewModel::onStopTapped,
                            enabled = ui.isSpeaking,
                            modifier = Modifier.weight(1f),
                        ) {
                            Icon(Icons.Default.Stop, contentDescription = null)
                            Spacer(Modifier.width(4.dp))
                            Text("Stop")
                        }
                    }
                }
            }

            Spacer(Modifier.height(8.dp))
        }
    }
}

@Composable
private fun DownloadStatusLine(state: KokoroModelDownloader.State) {
    val text = when (state) {
        KokoroModelDownloader.State.Idle -> "Not downloaded"
        KokoroModelDownloader.State.WaitingForWifi -> "Waiting for WiFi"
        is KokoroModelDownloader.State.Downloading -> "Downloading (${state.percent}%)"
        KokoroModelDownloader.State.Ready -> "Ready"
        is KokoroModelDownloader.State.Failed -> "Failed: ${state.message}"
    }
    Text(text, style = MaterialTheme.typography.bodyMedium)
}

@Composable
private fun TtsStatusLine(state: TtsState) {
    val text = when (state) {
        TtsState.Idle -> "Idle"
        TtsState.Preparing -> "Loading model…"
        TtsState.Ready -> "Ready"
        is TtsState.Speaking -> "Speaking…"
        TtsState.Paused -> "Paused"
        is TtsState.Failed -> "Failed: ${state.message}"
    }
    Text(text, style = MaterialTheme.typography.bodyMedium)
}
