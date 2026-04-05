package com.kreativekoala.audexa

import android.app.Activity
import android.Manifest
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AppCompatActivity
import androidx.activity.result.contract.ActivityResultContracts
import androidx.compose.animation.*
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.LocalContext
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
import com.kreativekoala.paywallkit.models.PaywallFeature
import com.kreativekoala.paywallkit.models.PaywallProduct
import com.kreativekoala.paywallkit.models.PaywallTheme
import com.kreativekoala.paywallkit.view.PaywallView
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import javax.inject.Inject

@AndroidEntryPoint
class MainActivity : AppCompatActivity() {

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

        // Increment app open count once per session (only on fresh create, not config changes)
        if (savedInstanceState == null) {
            lifecycleScope.launch {
                preferencesManager.incrementAppOpenCount()
            }
        }

        setContent {
            val appTheme by preferencesManager.appTheme
                .map { AppTheme.fromValue(it) }
                .collectAsState(initial = AppTheme.SYSTEM)

            AudexaTheme(appTheme = appTheme) {
                AudexaApp(audioManager = audioManager, billingManager = billingManager, preferencesManager = preferencesManager, appTheme = appTheme)
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
    preferencesManager: PreferencesManager,
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

    // Paywall gate: track app opens and subscription status
    val appOpenCount by preferencesManager.appOpenCount.collectAsState(initial = 0)
    val isSubscribed by billingManager.isSubscribed.collectAsState()
    var paywallDismissed by remember { mutableStateOf(false) }
    val shouldShowPaywall = appOpenCount > BillingManager.FREE_OPEN_LIMIT && !isSubscribed && !paywallDismissed

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

        // Soft paywall gate - shown after FREE_OPEN_LIMIT opens for non-subscribers
        if (shouldShowPaywall && !showSplash && startDestinationDetermined) {
            val packages by billingManager.packages.collectAsState()
            val activity = LocalContext.current as? Activity

            if (packages.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize().background(androidx.compose.ui.graphics.Color(0xFF0A0A0F)),
                    contentAlignment = androidx.compose.ui.Alignment.Center
                ) {
                    CircularProgressIndicator(color = androidx.compose.ui.graphics.Color(0xFFFF6D00))
                }
            } else {
                val paywallProducts = packages.map { pkg ->
                    val product = pkg.product
                    PaywallProduct(
                        id = product.id,
                        localizedPrice = product.price.formatted,
                        price = product.price.amountMicros.let { it / 1_000_000.0 },
                        currencyCode = product.price.currencyCode,
                        trialDays = 3,
                        period = when (pkg.packageType) {
                            com.revenuecat.purchases.PackageType.WEEKLY -> PaywallProduct.Period.WEEKLY
                            com.revenuecat.purchases.PackageType.MONTHLY -> PaywallProduct.Period.MONTHLY
                            com.revenuecat.purchases.PackageType.ANNUAL -> PaywallProduct.Period.YEARLY
                            else -> PaywallProduct.Period.MONTHLY
                        }
                    )
                }

                val features = listOf(
                    PaywallFeature("\uD83C\uDFB5", "Unlimited Streaming", "Stream without limits"),
                    PaywallFeature("\uD83D\uDEAB", "No Ads", "Ad-free experience"),
                    PaywallFeature("\uD83D\uDCE5", "Offline Mode", "Download for offline"),
                    PaywallFeature("\uD83C\uDFA7", "HD Audio", "Premium sound quality"),
                    PaywallFeature("\uD83D\uDCFB", "All Stations", "Access every station")
                )

                PaywallView(
                    appId = "audexa",
                    appName = "Audexa",
                    features = features,
                    products = paywallProducts,
                    theme = PaywallTheme(
                        accent = androidx.compose.ui.graphics.Color(0xFFFF6D00),
                        accent2 = androidx.compose.ui.graphics.Color(0xFFFF9100)
                    ),
                    showWinback = true,
                    isDismissible = true,
                    onPurchase = { productId ->
                        val pkg = packages.firstOrNull { it.product.id == productId }
                        if (pkg != null && activity != null) {
                            billingManager.launchPurchaseFlow(activity, pkg)
                        }
                    },
                    onRestore = { billingManager.restorePurchases() },
                    onDismiss = { paywallDismissed = true }
                )
            }
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
            containerColor = MaterialTheme.colorScheme.background
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

