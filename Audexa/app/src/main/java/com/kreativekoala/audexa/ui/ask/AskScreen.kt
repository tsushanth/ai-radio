package com.kreativekoala.audexa.ui.ask

import android.content.ActivityNotFoundException
import android.content.Intent
import android.widget.Toast
import androidx.compose.foundation.BorderStroke
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.WindowInsets
import androidx.compose.foundation.layout.WindowInsetsSides
import androidx.compose.foundation.layout.consumeWindowInsets
import androidx.compose.foundation.layout.displayCutout
import androidx.compose.foundation.layout.exclude
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.ime
import androidx.compose.foundation.layout.imePadding
import androidx.compose.foundation.layout.navigationBars
import androidx.compose.foundation.layout.only
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.systemBars
import androidx.compose.foundation.layout.union
import androidx.compose.foundation.layout.windowInsetsBottomHeight
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Share
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.DropdownMenuItem
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.ExposedDropdownMenuBox
import androidx.compose.material3.ExposedDropdownMenuDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.material3.TopAppBarDefaults
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.platform.LocalUriHandler
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.LiveRegionMode
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.liveRegion
import androidx.compose.ui.semantics.role
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardCapitalization
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.Lifecycle
import androidx.lifecycle.compose.LifecycleEventEffect
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.ask.AskEpisode
import com.kreativekoala.audexa.ask.AskFailure
import com.kreativekoala.audexa.ask.AskFailureKind
import com.kreativekoala.audexa.ask.AskParsing
import com.kreativekoala.audexa.ask.AskStatus
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.ui.theme.AccentOrange
import kotlinx.coroutines.delay

/** The whole screen sits clear of the status bar, side navigation bar and display cutout (same rule as Home and Live Radio). */
private val SideInsets: WindowInsets
    @Composable get() = WindowInsets.systemBars.union(WindowInsets.displayCutout).only(WindowInsetsSides.Top + WindowInsetsSides.Horizontal)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AskScreen(
    onNavigateBack: () -> Unit,
    viewModel: AskViewModel = hiltViewModel()
) {
    val state by viewModel.state.collectAsState()
    val currentEpisodeId by viewModel.currentEpisodeId.collectAsState()
    val isPlaying by viewModel.isPlaying.collectAsState()

    LifecycleEventEffect(Lifecycle.Event.ON_START) { viewModel.onScreenStarted() }
    LifecycleEventEffect(Lifecycle.Event.ON_STOP) { viewModel.onScreenStopped() }

    // Keeps the mini player's progress moving while this episode plays (the same loop the topic screen uses).
    val doneEpisode = (state.phase as? AskPhase.Done)?.episode
    val playingThis = doneEpisode != null && currentEpisodeId == doneEpisode.id && isPlaying
    LaunchedEffect(playingThis) {
        while (playingThis) {
            viewModel.updatePosition()
            delay(500L)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = { Text(stringResource(R.string.ask_title), fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.onBackground) },
                navigationIcon = {
                    IconButton(onClick = onNavigateBack) {
                        Icon(
                            Icons.AutoMirrored.Filled.ArrowBack,
                            contentDescription = stringResource(R.string.back),
                            tint = MaterialTheme.colorScheme.onBackground
                        )
                    }
                },
                windowInsets = SideInsets,
                colors = TopAppBarDefaults.topAppBarColors(containerColor = MaterialTheme.colorScheme.background)
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = SideInsets
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
                .consumeWindowInsets(padding)
                .imePadding()
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 16.dp, vertical = 8.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            when {
                state.loading -> Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    CircularProgressIndicator(modifier = Modifier.size(20.dp), strokeWidth = 2.dp, color = AccentOrange)
                    Text(stringResource(R.string.ask_loading), color = MaterialTheme.colorScheme.onSurfaceVariant)
                }
                state.config == null -> Text(
                    stringResource(R.string.ask_unavailable),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                else -> when (val phase = state.phase) {
                    AskPhase.Form, AskPhase.Submitting -> AskForm(state, viewModel)
                    is AskPhase.Working -> WorkingPanel(phase)
                    is AskPhase.Done -> DonePanel(
                        episode = phase.episode,
                        isPlayingThis = currentEpisodeId == phase.episode.id && isPlaying,
                        viewModel = viewModel
                    )
                    is AskPhase.Failed -> FailedPanel(phase, viewModel)
                }
            }
            // Clear the navigation bar when the keyboard is closed (the keyboard's own inset covers it when open)
            Spacer(Modifier.windowInsetsBottomHeight(WindowInsets.navigationBars.exclude(WindowInsets.ime)))
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun AskForm(state: AskUiState, viewModel: AskViewModel) {
    val config = state.config ?: return
    val sending = state.phase == AskPhase.Submitting

    Text(stringResource(R.string.ask_intro), style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant)

    OutlinedTextField(
        value = state.text,
        onValueChange = viewModel::onTextChange,
        modifier = Modifier.fillMaxWidth(),
        enabled = !sending,
        label = { Text(stringResource(R.string.ask_field_label)) },
        placeholder = { Text(stringResource(R.string.ask_field_placeholder)) },
        supportingText = {
            Text(
                stringResource(R.string.ask_counter, state.text.length, config.maxChars),
                modifier = Modifier.fillMaxWidth(),
                textAlign = TextAlign.End
            )
        },
        minLines = 2,
        maxLines = 5,
        keyboardOptions = KeyboardOptions(capitalization = KeyboardCapitalization.Sentences),
        shape = RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(focusedBorderColor = AccentOrange, focusedLabelColor = AccentOrange, cursorColor = AccentOrange)
    )

    var menuOpen by remember { mutableStateOf(false) }
    ExposedDropdownMenuBox(expanded = menuOpen && !sending, onExpandedChange = { menuOpen = it && !sending }) {
        OutlinedTextField(
            value = languageLabel(state.language),
            onValueChange = {},
            readOnly = true,
            enabled = !sending,
            label = { Text(stringResource(R.string.ask_language_label)) },
            trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = menuOpen) },
            modifier = Modifier
                .menuAnchor(androidx.compose.material3.MenuAnchorType.PrimaryNotEditable)
                .fillMaxWidth(),
            shape = RoundedCornerShape(12.dp)
        )
        ExposedDropdownMenu(expanded = menuOpen && !sending, onDismissRequest = { menuOpen = false }) {
            config.languages.forEach { code ->
                DropdownMenuItem(
                    text = { Text(languageLabel(code)) },
                    onClick = {
                        viewModel.onLanguageChange(code)
                        menuOpen = false
                    }
                )
            }
        }
    }

    state.formError?.let { ErrorText(it) }

    Button(
        onClick = viewModel::submit,
        enabled = !sending && AskParsing.canSubmit(state.text, config.maxChars),
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
    ) {
        if (sending) {
            CircularProgressIndicator(modifier = Modifier.size(20.dp), color = androidx.compose.ui.graphics.Color.White, strokeWidth = 2.dp)
            Spacer(Modifier.size(8.dp))
        }
        Text(
            stringResource(if (sending) R.string.ask_sending else R.string.ask_submit),
            fontWeight = FontWeight.SemiBold,
            modifier = Modifier.padding(vertical = 4.dp)
        )
    }
}

@Composable
private fun WorkingPanel(phase: AskPhase.Working) {
    val stage = stringResource(stageRes(phase.status))
    val description = stringResource(R.string.ask_progress_description, phase.progress)
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        LinearProgressIndicator(
            progress = { phase.progress.coerceIn(3, 100) / 100f },
            modifier = Modifier
                .fillMaxWidth()
                .semantics { contentDescription = description },
            color = AccentOrange
        )
        Text(
            stage,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
        )
        Text(
            stringResource(R.string.ask_leave_hint),
            style = MaterialTheme.typography.bodySmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun FailedPanel(phase: AskPhase.Failed, viewModel: AskViewModel) {
    ErrorText(phase.failure)
    if (phase.canKeepWaiting) {
        Button(
            onClick = viewModel::keepWaiting,
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
        ) { Text(stringResource(R.string.ask_check_again)) }
    }
    OutlinedButton(
        onClick = { viewModel.backToForm(clearText = false) },
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp)
    ) { Text(stringResource(R.string.ask_edit_question)) }
}

@Composable
private fun DonePanel(episode: AskEpisode, isPlayingThis: Boolean, viewModel: AskViewModel) {
    val context = LocalContext.current
    val uriHandler = LocalUriHandler.current
    val fallbackTitle = stringResource(R.string.ask_title)
    val position by viewModel.positionMs.collectAsState()
    val duration by viewModel.durationMs.collectAsState()
    val currentId by viewModel.currentEpisodeId.collectAsState()
    val thisIsLoaded = currentId == episode.id
    val shareFailed = stringResource(R.string.ask_share_failed)
    val chooserTitle = stringResource(R.string.ask_share_chooser)

    Card(
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface)
    ) {
        Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(
                episode.title ?: fallbackTitle,
                style = MaterialTheme.typography.titleLarge,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.semantics { liveRegion = LiveRegionMode.Polite }
            )
            episode.description?.let { Text(it, style = MaterialTheme.typography.bodyMedium, color = MaterialTheme.colorScheme.onSurfaceVariant) }
            val length = AskParsing.formatDuration(episode.durationSeconds)
            if (length.isNotEmpty()) {
                Text(stringResource(R.string.ask_length, length), style = MaterialTheme.typography.labelLarge, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
            Text(stringResource(R.string.ask_ai_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)

            Button(
                onClick = { viewModel.togglePlay(episode, fallbackTitle) },
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(containerColor = AccentOrange)
            ) {
                Icon(if (isPlayingThis) Icons.Default.Pause else Icons.Default.PlayArrow, contentDescription = null)
                Spacer(Modifier.size(8.dp))
                Text(stringResource(if (isPlayingThis) R.string.ask_pause else R.string.ask_play))
            }
            if (thisIsLoaded && duration > 0) {
                LinearProgressIndicator(
                    progress = { (position.toFloat() / duration.toFloat()).coerceIn(0f, 1f) },
                    modifier = Modifier.fillMaxWidth(),
                    color = AccentOrange
                )
            }

            val shareUrl = AskParsing.shareUrl(episode.id)
            if (shareUrl != null) {
                OutlinedButton(
                    onClick = {
                        viewModel.trackShare(episode)
                        val send = Intent(Intent.ACTION_SEND).apply {
                            type = "text/plain"
                            putExtra(Intent.EXTRA_SUBJECT, episode.title ?: fallbackTitle)
                            putExtra(Intent.EXTRA_TEXT, AskParsing.shareText(episode.title, shareUrl))
                        }
                        try {
                            context.startActivity(Intent.createChooser(send, chooserTitle))
                        } catch (_: ActivityNotFoundException) {
                            Toast.makeText(context, shareFailed, Toast.LENGTH_SHORT).show()
                        }
                    },
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    border = BorderStroke(1.dp, AccentOrange.copy(alpha = 0.5f))
                ) {
                    Icon(Icons.Default.Share, contentDescription = null, tint = AccentOrange, modifier = Modifier.size(18.dp))
                    Spacer(Modifier.size(8.dp))
                    Text(stringResource(R.string.ask_share), color = AccentOrange)
                }
            }
        }
    }

    if (episode.sources.isNotEmpty()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(stringResource(R.string.ask_sources_title), style = MaterialTheme.typography.titleMedium, fontWeight = FontWeight.SemiBold)
            episode.sources.forEach { source ->
                Column(
                    modifier = if (source.url != null) {
                        Modifier
                            .fillMaxWidth()
                            .clickable(role = androidx.compose.ui.semantics.Role.Button) {
                                try { uriHandler.openUri(source.url) } catch (_: Exception) {}
                            }
                    } else {
                        Modifier.fillMaxWidth()
                    }
                ) {
                    Text(
                        source.title,
                        style = MaterialTheme.typography.bodyMedium,
                        color = if (source.url != null) AccentOrange else MaterialTheme.colorScheme.onBackground
                    )
                    if (source.publisher.isNotEmpty()) {
                        Text(source.publisher, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
                    }
                }
            }
            Text(stringResource(R.string.ask_sources_note), style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
        }
    }

    OutlinedButton(
        onClick = { viewModel.backToForm(clearText = true) },
        modifier = Modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp)
    ) { Text(stringResource(R.string.ask_ask_another)) }
}

/** The server's own sentence when it sent one (refusals, limits, "no coverage"); otherwise our wording for the kind of failure. */
@Composable
private fun ErrorText(failure: AskFailure) {
    Text(
        text = failure.message ?: stringResource(fallbackRes(failure.kind)),
        style = MaterialTheme.typography.bodyMedium,
        color = MaterialTheme.colorScheme.error,
        modifier = Modifier
            .fillMaxWidth()
            .semantics { liveRegion = LiveRegionMode.Assertive }
    )
}

private fun fallbackRes(kind: AskFailureKind): Int = when (kind) {
    AskFailureKind.INPUT -> R.string.ask_err_input
    AskFailureKind.LIMITED -> R.string.ask_err_limited
    AskFailureKind.UNAVAILABLE -> R.string.ask_unavailable
    AskFailureKind.NOT_FOUND -> R.string.ask_err_not_found
    AskFailureKind.OFFLINE -> R.string.ask_err_offline
    AskFailureKind.TIMEOUT -> R.string.ask_err_timeout
    AskFailureKind.SERVER -> R.string.ask_err_server
    AskFailureKind.REFUSED -> R.string.ask_err_refused
    AskFailureKind.NO_COVERAGE -> R.string.ask_err_no_coverage
    AskFailureKind.FAILED -> R.string.ask_err_failed
}

private fun stageRes(status: AskStatus): Int = when (status) {
    AskStatus.QUEUED -> R.string.ask_stage_queued
    AskStatus.REVIEWING -> R.string.ask_stage_reviewing
    AskStatus.SEARCHING -> R.string.ask_stage_searching
    AskStatus.WRITING -> R.string.ask_stage_writing
    AskStatus.RECORDING -> R.string.ask_stage_recording
    else -> R.string.ask_stage_working
}

/** "flag name" for a language the app knows; the bare code for one it does not. */
private fun languageLabel(code: String): String =
    SupportedLanguage.entries.firstOrNull { it.code == code }?.displayWithFlag ?: code.uppercase()
