package com.kreativekoala.audexa.ui.navigation

import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.navigation.NavHostController
import androidx.navigation.NavType
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.navArgument
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.ui.auth.AuthScreen
import com.kreativekoala.audexa.ui.home.HomeScreen
import com.kreativekoala.audexa.ui.profile.ProfileScreen
import kotlinx.serialization.json.Json

sealed class Screen(val route: String) {
    data object Auth : Screen("auth")
    data object Home : Screen("home")
    data object Profile : Screen("profile")
    data object TopicDetail : Screen("topic/{topicJson}") {
        fun createRoute(topic: Topic): String {
            val json = Json.encodeToString(Topic.serializer(), topic)
            return "topic/${java.net.URLEncoder.encode(json, "UTF-8")}"
        }
    }
    data object LinkedAccounts : Screen("linked_accounts")
    data object HiddenTopics : Screen("hidden_topics")
    data object LanguageSettings : Screen("language_settings")
}

@Composable
fun AudexaNavGraph(
    navController: NavHostController,
    startDestination: String,
    modifier: Modifier = Modifier,
    onShowTopicDetail: (Topic) -> Unit
) {
    NavHost(
        navController = navController,
        startDestination = startDestination,
        modifier = modifier
    ) {
        composable(Screen.Auth.route) {
            AuthScreen(
                onAuthSuccess = {
                    navController.navigate(Screen.Home.route) {
                        popUpTo(Screen.Auth.route) { inclusive = true }
                    }
                }
            )
        }

        composable(Screen.Home.route) {
            HomeScreen(
                onNavigateToProfile = {
                    navController.navigate(Screen.Profile.route)
                },
                onTopicClick = { topic ->
                    onShowTopicDetail(topic)
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
                onSignOut = {
                    navController.navigate(Screen.Auth.route) {
                        popUpTo(0) { inclusive = true }
                    }
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
    }
}
