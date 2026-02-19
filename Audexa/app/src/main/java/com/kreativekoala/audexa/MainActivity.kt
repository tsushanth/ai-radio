package com.kreativekoala.audexa

import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.core.content.ContextCompat
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.lifecycleScope
import androidx.navigation.compose.rememberNavController
import com.kreativekoala.audexa.billing.BillingManager
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.service.AudioManager
import com.kreativekoala.audexa.service.NotificationService
import com.kreativekoala.audexa.ui.components.MiniPlayer
import com.kreativekoala.audexa.ui.components.SplashScreen
import com.kreativekoala.audexa.ui.navigation.AudexaNavGraph
import com.kreativekoala.audexa.ui.navigation.Screen
import com.kreativekoala.audexa.ui.theme.AppTheme
import com.kreativekoala.audexa.ui.theme.AudexaTheme
import com.kreativekoala.audexa.ui.topic.TopicDetailScreen
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : ComponentActivity() {

    @Inject
    lateinit var audioManager: AudioManager

    @Inject
    lateinit var preferencesManager: PreferencesManager

    @Inject
    lateinit var notificationService: NotificationService

    @Inject
    lateinit var billingManager: BillingManager

    // Permission launcher for notification permission (Android 13+)
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            // Permission granted, restore notification schedule if needed
            lifecycleScope.launch {
                notificationService.restoreScheduledNotificationIfNeeded()
            }
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Initialize the audio manager to connect to the playback service
        audioManager.initialize()

        // Request notification permission on Android 13+ and restore scheduled notifications
        requestNotificationPermissionIfNeeded()

        setContent {
            val appTheme by preferencesManager.appTheme
                .map { AppTheme.fromValue(it) }
                .collectAsState(initial = AppTheme.SYSTEM)

            AudexaTheme(appTheme = appTheme) {
                AudexaApp(audioManager = audioManager, billingManager = billingManager, appTheme = appTheme)
            }
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        audioManager.release()
    }

    private fun requestNotificationPermissionIfNeeded() {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            when {
                ContextCompat.checkSelfPermission(
                    this,
                    Manifest.permission.POST_NOTIFICATIONS
                ) == PackageManager.PERMISSION_GRANTED -> {
                    // Permission already granted, restore notification schedule
                    lifecycleScope.launch {
                        notificationService.restoreScheduledNotificationIfNeeded()
                    }
                }
                else -> {
                    // Request permission
                    notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                }
            }
        } else {
            // Android 12 and below - no runtime permission needed
            lifecycleScope.launch {
                notificationService.restoreScheduledNotificationIfNeeded()
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AudexaApp(
    audioManager: AudioManager,
    billingManager: BillingManager,
    appTheme: AppTheme = AppTheme.SYSTEM,
    mainViewModel: MainViewModel = hiltViewModel()
) {
    val navController = rememberNavController()
    val uiState by mainViewModel.uiState.collectAsState()
    val audioState by audioManager.isPlaying.collectAsState()
    val currentEpisodeTitle by audioManager.currentEpisodeTitle.collectAsState()
    val currentPosition by audioManager.currentPosition.collectAsState()
    val duration by audioManager.duration.collectAsState()
    val isBuffering by audioManager.isBuffering.collectAsState()

    // Topic detail sheet state
    var selectedTopic by remember { mutableStateOf<Topic?>(null) }

    // Splash screen state - show for at least 1.8 seconds like iOS
    var showSplash by remember { mutableStateOf(true) }

    // Determine start destination only once when loading completes
    // Using a mutable state that's set once prevents NavHost recreation during auth flow
    var startDestinationDetermined by remember { mutableStateOf(false) }
    var startDestination by remember { mutableStateOf(Screen.Auth.route) }

    // Dismiss splash after minimum time and when loading is complete
    LaunchedEffect(uiState.isLoading) {
        if (!uiState.isLoading && !startDestinationDetermined) {
            startDestination = when {
                !uiState.isLoggedIn -> Screen.Auth.route
                !uiState.hasCompletedOnboarding -> Screen.Onboarding.route
                else -> Screen.Home.route
            }
            startDestinationDetermined = true
        }
    }

    // Splash screen timer - show for at least 1.8 seconds
    LaunchedEffect(Unit) {
        delay(1800)
        showSplash = false
    }

    // Show splash screen overlay during loading or minimum splash time
    Box(modifier = Modifier.fillMaxSize()) {
        // Main content (only show when ready)
        if (startDestinationDetermined) {
            MainContent(
                navController = navController,
                startDestination = startDestination,
                audioManager = audioManager,
                billingManager = billingManager,
                audioState = audioState,
                currentEpisodeTitle = currentEpisodeTitle,
                currentPosition = currentPosition,
                duration = duration,
                isBuffering = isBuffering,
                selectedTopic = selectedTopic,
                onSelectedTopicChange = { selectedTopic = it },
                mainViewModel = mainViewModel
            )
        }

        // Splash screen overlay with fade out animation
        AnimatedVisibility(
            visible = showSplash || !startDestinationDetermined,
            enter = fadeIn(),
            exit = fadeOut(animationSpec = tween(400))
        ) {
            SplashScreen()
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun MainContent(
    navController: androidx.navigation.NavHostController,
    startDestination: String,
    audioManager: AudioManager,
    billingManager: BillingManager,
    audioState: Boolean,
    currentEpisodeTitle: String?,
    currentPosition: Long,
    duration: Long,
    isBuffering: Boolean,
    selectedTopic: Topic?,
    onSelectedTopicChange: (Topic?) -> Unit,
    mainViewModel: MainViewModel
) {

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            // Mini player shown when audio is available
            if (currentEpisodeTitle != null) {
                val progress = if (duration > 0) currentPosition.toFloat() / duration.toFloat() else 0f
                MiniPlayer(
                    title = currentEpisodeTitle,
                    isPlaying = audioState,
                    isBuffering = isBuffering,
                    progress = progress,
                    onPlayPause = {
                        if (audioState) audioManager.pause() else audioManager.resume()
                    },
                    onSkipForward = { audioManager.skipForward(15) },
                    onSkipBack = { audioManager.skipBackward(15) },
                    onClick = {
                        // Could navigate to full player or show topic detail
                    }
                )
            }
        }
    ) { padding ->
        Box(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding)
        ) {
            AudexaNavGraph(
                navController = navController,
                startDestination = startDestination,
                billingManager = billingManager,
                onShowTopicDetail = { topic ->
                    onSelectedTopicChange(topic)
                }
            )
        }
    }

    // Topic Detail Bottom Sheet
    if (selectedTopic != null) {
        val sheetState = rememberModalBottomSheetState(skipPartiallyExpanded = true)
        ModalBottomSheet(
            onDismissRequest = { onSelectedTopicChange(null) },
            sheetState = sheetState,
            containerColor = MaterialTheme.colorScheme.background,
            windowInsets = WindowInsets(0)
        ) {
            TopicDetailScreen(
                topic = selectedTopic!!,
                onDismiss = { onSelectedTopicChange(null) },
                onHide = {
                    mainViewModel.hideTopic(selectedTopic!!.id)
                    onSelectedTopicChange(null)
                }
            )
        }
    }
}
