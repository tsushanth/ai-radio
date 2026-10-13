package com.kreativekoala.audexa

import android.app.Activity
import android.Manifest
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import android.os.Bundle
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.appcompat.app.AlertDialog
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
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.kreativekoala.audexa.billing.BillingManager
import com.kreativekoala.audexa.data.local.PreferencesManager
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.service.AudioManager
import com.kreativekoala.audexa.service.BriefingManager
import com.kreativekoala.audexa.service.NotificationService
import com.kreativekoala.audexa.service.RadioReminderManager
import com.kreativekoala.audexa.ui.components.MiniPlayer
import com.kreativekoala.audexa.ui.components.SplashScreen
import com.kreativekoala.audexa.ui.navigation.AudexaNavGraph
import com.kreativekoala.audexa.ui.navigation.Screen
import com.kreativekoala.audexa.ui.theme.AppTheme
import com.kreativekoala.audexa.ui.theme.AudexaTheme
import com.kreativekoala.audexa.util.LiveShare
import com.kreativekoala.audexa.ui.topic.TopicDetailScreen
import com.kreativekoala.paywallkit.manager.PromoCodeManager
import com.kreativekoala.paywallkit.models.PaywallFeature
import com.kreativekoala.paywallkit.models.PaywallProduct
import com.kreativekoala.paywallkit.models.PaywallTheme
import com.kreativekoala.paywallkit.view.PaywallView
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.launch
import java.util.Calendar
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

    @Inject
    lateinit var radioReminderManager: RadioReminderManager

    // Language of a tapped https://audexa.app/live link, until the app can act on it (it has to be past login/onboarding).
    private var pendingLiveLang by mutableStateOf<String?>(null)

    @Inject
    lateinit var briefingManager: BriefingManager

    // True only while the system permission prompt was launched from the
    // morning-briefing opt-in dialog (so a denial is attributed correctly).
    private var briefingPermissionPending = false

    // Permission launcher for notification permission (Android 13+)
    private val notificationPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { isGranted ->
        if (isGranted) {
            // Permission granted, restore notification schedule if needed
            lifecycleScope.launch {
                notificationService.restoreScheduledNotificationIfNeeded()
            }
        } else if (briefingPermissionPending) {
            logBriefingEvent(BriefingManager.EVENT_PERMISSION_DENIED)
        }
        briefingPermissionPending = false
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()

        // Initialize the audio manager to connect to the playback service
        audioManager.initialize()

        // Do NOT prompt for notifications on cold start: the system dialog would sit
        // between the user and first audio. Ask once audio is actually playing.
        // Where permission is already granted (or not needed) restore the schedule now.
        restoreNotificationsIfPermitted()
        lifecycleScope.launch {
            audioManager.isPlaying.first { it }
            requestNotificationPermissionIfNeeded()
        }

        // Extract promo code from deep link intent
        PromoCodeManager.handleIntent(intent)

        // Shared live link: only on a fresh start, so rotation does not replay it
        if (savedInstanceState == null) {
            pendingLiveLang = LiveShare.parseLiveLink(intent?.dataString)
        }

        // Increment app open count once per session (only on fresh create, not config changes)
        if (savedInstanceState == null) {
            lifecycleScope.launch {
                preferencesManager.incrementAppOpenCount()
            }
        }

        // Morning briefing: ask for the daily reminder once, right after the
        // first successful play (not at cold start), and record notification opens.
        observeFirstPlayForBriefingOptIn()
        if (savedInstanceState == null &&
            intent?.getStringExtra("notification_type") == BriefingManager.NOTIFICATION_TYPE
        ) {
            logBriefingEvent(BriefingManager.EVENT_OPENED)
        }

        // Pull predicted radio-topic plays and arm local-notification alarms
        // for any bookmarked topic queued up next. Re-runs on every onResume
        // to catch new bookmarks + queue drift.
        lifecycleScope.launch {
            radioReminderManager.refresh()
        }

        setContent {
            val appTheme by preferencesManager.appTheme
                .map { AppTheme.fromValue(it) }
                .collectAsState(initial = AppTheme.SYSTEM)

            AudexaTheme(appTheme = appTheme) {
                AudexaApp(
                    audioManager = audioManager,
                    billingManager = billingManager,
                    preferencesManager = preferencesManager,
                    appTheme = appTheme,
                    pendingLiveLang = pendingLiveLang,
                    onLiveLinkHandled = { pendingLiveLang = null }
                )
            }
        }
    }

    // singleTop: a live link tapped while the app is already open arrives here instead of a second Activity
    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        PromoCodeManager.handleIntent(intent)
        pendingLiveLang = LiveShare.parseLiveLink(intent.dataString)
    }

    override fun onResume() {
        super.onResume()
        // Re-poll the orchestrator's upcoming queue on every foreground so
        // freshly-bookmarked topics arm immediately and stale predictions
        // (queue churn during the session) get cleaned up.
        lifecycleScope.launch {
            radioReminderManager.refresh()
        }
    }

    override fun onDestroy() {
        super.onDestroy()
        audioManager.release()
    }

    private fun restoreNotificationsIfPermitted() {
        val granted = Build.VERSION.SDK_INT < Build.VERSION_CODES.TIRAMISU ||
            ContextCompat.checkSelfPermission(
                this,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        if (granted) {
            lifecycleScope.launch {
                notificationService.restoreScheduledNotificationIfNeeded()
            }
        }
    }

    private fun logBriefingEvent(event: String, hour: Int? = null) {
        lifecycleScope.launch { briefingManager.logEvent(event, hour = hour) }
    }

    /**
     * Waits for the first successful playback, then (once per install) offers
     * the daily reminder. Skipped when notifications are already allowed
     * (existing users keep their current reminder; Android 12 and below).
     */
    private fun observeFirstPlayForBriefingOptIn() {
        lifecycleScope.launch {
            if (preferencesManager.briefingOptInShown.first()) return@launch
            if (notificationService.hasNotificationPermission()) return@launch
            audioManager.isPlaying.first { it }
            if (preferencesManager.briefingOptInShown.first()) return@launch
            showBriefingOptInDialog()
        }
    }

    private fun showBriefingOptInDialog() {
        if (isFinishing || isDestroyed) return
        lifecycleScope.launch { preferencesManager.setBriefingOptInShown() }
        logBriefingEvent(BriefingManager.EVENT_OPTIN_SHOWN)

        val hours = BriefingManager.OPT_IN_HOURS
        val timeFormat = android.text.format.DateFormat.getTimeFormat(this)
        val labels = hours.map { h ->
            val cal = Calendar.getInstance().apply {
                set(Calendar.HOUR_OF_DAY, h)
                set(Calendar.MINUTE, 0)
            }
            timeFormat.format(cal.time)
        }.toTypedArray()
        var selected = BriefingManager.DEFAULT_OPT_IN_INDEX

        val decline = {
            lifecycleScope.launch {
                // Explicit "no": keep the default-on daily alarm from arming later
                // if the permission is granted through another path.
                preferencesManager.setNotificationsEnabled(false)
            }
            logBriefingEvent(BriefingManager.EVENT_OPTIN_DECLINED)
        }

        AlertDialog.Builder(this)
            .setTitle(R.string.briefing_optin_title)
            .setSingleChoiceItems(labels, selected) { _, which -> selected = which }
            .setPositiveButton(R.string.briefing_optin_accept) { _, _ ->
                val hour = hours[selected]
                logBriefingEvent(BriefingManager.EVENT_OPTIN_ACCEPTED, hour)
                lifecycleScope.launch {
                    preferencesManager.setBriefingTime(hour, 0)
                    preferencesManager.setNotificationsEnabled(true)
                    if (notificationService.hasNotificationPermission()) {
                        notificationService.restoreScheduledNotificationIfNeeded()
                    } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
                        briefingPermissionPending = true
                        notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                    }
                }
            }
            .setNegativeButton(R.string.briefing_optin_decline) { _, _ -> decline() }
            .setOnCancelListener { decline() }
            .show()
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
                    // Not asked at cold start any more: the morning-briefing
                    // opt-in asks after the first play. Users who already have
                    // bookmarked topics still get the launch prompt because
                    // radio-topic reminders need the permission.
                    lifecycleScope.launch {
                        if (preferencesManager.bookmarkedTopics.first().isNotEmpty()) {
                            notificationPermissionLauncher.launch(Manifest.permission.POST_NOTIFICATIONS)
                        }
                    }
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
    pendingLiveLang: String? = null,
    onLiveLinkHandled: () -> Unit = {},
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

    // Splash screen timer - minimum display time (was 1800ms; trimmed so it is not
    // dead time in front of first audio)
    LaunchedEffect(Unit) {
        delay(600)
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
                pendingLiveLang = pendingLiveLang,
                onLiveLinkHandled = onLiveLinkHandled,
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
                    placement = if (PromoCodeManager.activeCode != null) "promo_code_onboarding" else "onboarding",
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
    pendingLiveLang: String?,
    onLiveLinkHandled: () -> Unit,
    mainViewModel: MainViewModel
) {
    // A shared live link opens the live radio (which starts the stream) once the user is on Home.
    // Not logged in / still onboarding: the link waits and is applied when Home is reached.
    val backStackEntry by navController.currentBackStackEntryAsState()
    val route = backStackEntry?.destination?.route
    LaunchedEffect(pendingLiveLang, route) {
        if (pendingLiveLang == null || route == null) return@LaunchedEffect
        if (route.startsWith("live_radio")) {
            onLiveLinkHandled() // already listening to the radio
        } else if (route == Screen.Home.route) {
            val language = SupportedLanguage.fromCode(pendingLiveLang)
            onLiveLinkHandled()
            navController.navigate(Screen.LiveRadio.createRoute(language.radioStreamURL, language.radioStationName))
        }
    }

    Scaffold(
        containerColor = MaterialTheme.colorScheme.background,
        contentWindowInsets = WindowInsets(0),
        bottomBar = {
            // Mini player shown when audio is available
            val currentRoute = navController.currentBackStackEntryAsState().value?.destination?.route
            val onLiveRadio = currentRoute?.startsWith("live_radio") == true
            if (currentEpisodeTitle != null && !onLiveRadio) {
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

