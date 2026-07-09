package com.kreativekoala.audexa.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.ui.auth.AuthScreen
import com.kreativekoala.audexa.ui.home.HomeScreen
import com.kreativekoala.audexa.ui.home.HomeViewModel
import com.kreativekoala.audexa.billing.BillingManager
import com.kreativekoala.audexa.ui.radio.LiveRadioScreen
import com.kreativekoala.audexa.ui.profile.ProfileScreen
import com.kreativekoala.audexa.ui.profile.RadioLanguagesScreen
import com.kreativekoala.audexa.ui.profile.ThemeSettingsScreen
import com.kreativekoala.audexa.ui.onboarding.OnboardingScreen
import com.kreativekoala.audexa.ui.subscription.PaywallScreen
import kotlinx.serialization.json.Json

sealed class Screen(val route: String) {
    data object Auth : Screen("auth")
    data object Home : Screen("home")
    data object Profile : Screen("profile")
    data object RadioLanguages : Screen("radio_languages")
    data object TopicDetail : Screen("topic/{topicJson}") {
        fun createRoute(topic: Topic): String {
            val json = Json.encodeToString(Topic.serializer(), topic)
            return "topic/${java.net.URLEncoder.encode(json, "UTF-8")}"
        }
    }
    data object Onboarding : Screen("onboarding")
    data object LinkedAccounts : Screen("linked_accounts")
    data object HiddenTopics : Screen("hidden_topics")
    data object LanguageSettings : Screen("language_settings")
    data object ThemeSettings : Screen("theme_settings")
    data object VoiceSettings : Screen("voice_settings")
    data object KokoroTest : Screen("kokoro_test")
    data object NotificationSettings : Screen("notification_settings")
    data object Subscription : Screen("subscription")
    data object LiveRadio : Screen("live_radio/{streamUrl}/{stationName}") {
        fun createRoute(streamUrl: String, stationName: String): String {
            val encodedUrl = java.net.URLEncoder.encode(streamUrl, "UTF-8")
            val encodedName = java.net.URLEncoder.encode(stationName, "UTF-8")
            return "live_radio/$encodedUrl/$encodedName"
        }
    }
}

@Composable
fun AudexaNavGraph(
    navController: NavHostController,
    startDestination: String,
    modifier: Modifier = Modifier,
    billingManager: BillingManager,
    onShowTopicDetail: (Topic) -> Unit
) {
    // Create HomeViewModel at NavGraph level so it survives navigation
    // This ensures generation progress is preserved when navigating to Profile and back
    val homeViewModel: HomeViewModel = hiltViewModel()

    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier
    ) {
        composable(Screen.Auth.route) {
            AuthScreen(
                onAuthSuccess = {
                    navController.navigate(Screen.Onboarding.route) {
                        popUpTo(Screen.Auth.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Onboarding.route) {
            OnboardingScreen(
                onOnboardingComplete = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Onboarding.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Home.route) {
            HomeScreen(
                onNavigateToProfile = {
                    navController.navigate(Screen.Profile.route)
                },
                onNavigateToLinkedAccounts = {
                    navController.navigate(Screen.LinkedAccounts.route)
                },
                onTopicClick = { topic ->
                    onShowTopicDetail(topic)
                },
                onNavigateToLiveRadio = { streamUrl, stationName ->
                    navController.navigate(Screen.LiveRadio.createRoute(streamUrl, stationName))
                },
                viewModel = homeViewModel  // Pass the shared ViewModel
            )
        }

        composable(
            route = Screen.LiveRadio.route,
            arguments = listOf(
                navArgument("streamUrl") { type = NavType.StringType },
                navArgument("stationName") { type = NavType.StringType }
            )
        ) {
            LiveRadioScreen(
                onDismiss = {
                    navController.popBackStack()
                }
            )
        }

        composable(Screen.Profile.route) {
            ProfileScreen(
                onNavigateBack = {
                    navController.popBackStack()
                },
                onNavigateToLinkedAccounts = {
                    navController.navigate(Screen.LinkedAccounts.route)
                },
                onNavigateToHiddenTopics = {
                    navController.navigate(Screen.HiddenTopics.route)
                },
                onNavigateToLanguageSettings = {
                    navController.navigate(Screen.LanguageSettings.route)
                },
                onNavigateToThemeSettings = {
                    navController.navigate(Screen.ThemeSettings.route)
                },
                onNavigateToVoiceSettings = {
                    navController.navigate(Screen.VoiceSettings.route)
                },
                onNavigateToNotificationSettings = {
                    navController.navigate(Screen.NotificationSettings.route)
                },
                onNavigateToSubscription = {
                    navController.navigate(Screen.Subscription.route)
                },
                onNavigateToRadioLanguages = {
                    navController.navigate(Screen.RadioLanguages.route)
                },
                onSignOut = {
                    navController.navigate(Screen.Auth.route) {
                        popUpTo(0) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.RadioLanguages.route) {
            RadioLanguagesScreen(
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable(Screen.LinkedAccounts.route) {
            LinkedAccountsScreen(
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable(Screen.HiddenTopics.route) {
            HiddenTopicsScreen(
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable(Screen.LanguageSettings.route) {
            LanguageSettingsScreen(
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable(Screen.ThemeSettings.route) {
            ThemeSettingsScreen(
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable(Screen.VoiceSettings.route) {
            VoiceSettingsScreen(
                onNavigateBack = {
                    navController.popBackStack()
                },
                onOpenKokoroTest = {
                    navController.navigate(Screen.KokoroTest.route)
                },
            )
        }

        composable(Screen.KokoroTest.route) {
            com.kreativekoala.audexa.ui.kokoro.KokoroTestScreen(
                onNavigateBack = { navController.popBackStack() }
            )
        }

        composable(Screen.NotificationSettings.route) {
            NotificationSettingsScreen(
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }

        composable(Screen.Subscription.route) {
            PaywallScreen(
                billingManager = billingManager,
                onNavigateBack = {
                    navController.popBackStack()
                }
            )
        }
    }
}
