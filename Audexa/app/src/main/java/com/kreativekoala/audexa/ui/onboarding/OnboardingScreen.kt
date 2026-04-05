package com.kreativekoala.audexa.ui.onboarding

import androidx.compose.animation.AnimatedContent
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.animation.slideInHorizontally
import androidx.compose.animation.slideOutHorizontally
import androidx.compose.animation.togetherWith
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.ui.onboarding.pages.LanguageSelectionPage
import com.kreativekoala.audexa.ui.onboarding.pages.LinkAccountPage
import com.kreativekoala.audexa.ui.onboarding.pages.TopicSelectionPage
import com.kreativekoala.audexa.ui.onboarding.pages.WelcomePage
import com.kreativekoala.audexa.ui.theme.AccentOrange

@Composable
fun OnboardingScreen(
    onOnboardingComplete: () -> Unit,
    viewModel: OnboardingViewModel = hiltViewModel()
) {
    val uiState by viewModel.uiState.collectAsState()

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
    ) {
        AnimatedContent(
            targetState = uiState.currentPage,
            transitionSpec = {
                val direction = if (targetState > initialState) 1 else -1
                (slideInHorizontally { fullWidth -> direction * fullWidth } + fadeIn())
                    .togetherWith(slideOutHorizontally { fullWidth -> -direction * fullWidth } + fadeOut())
            },
            label = "onboardingPage"
        ) { page ->
            when (page) {
                0 -> WelcomePage(
                    onGetStarted = { viewModel.nextPage() }
                )
                1 -> LanguageSelectionPage(
                    selectedLanguage = uiState.selectedLanguage,
                    onLanguageSelected = { viewModel.selectLanguage(it) },
                    onContinue = { viewModel.nextPage() }
                )
                2 -> LinkAccountPage(
                    uiState = uiState,
                    viewModel = viewModel,
                    onContinue = { viewModel.nextPage() }
                )
                3 -> TopicSelectionPage(
                    uiState = uiState,
                    onToggleTopic = { viewModel.toggleTopic(it) },
                    onComplete = { viewModel.completeOnboarding(onOnboardingComplete) },
                    onSuggestTopic = { topicName, language ->
                        viewModel.suggestTopic(topicName, language)
                    }
                )
            }
        }

        // Page indicator dots
        Row(
            modifier = Modifier
                .align(Alignment.BottomCenter)
                .padding(bottom = 16.dp),
            horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            repeat(4) { index ->
                Box(
                    modifier = Modifier
                        .size(if (index == uiState.currentPage) 10.dp else 8.dp)
                        .clip(CircleShape)
                        .background(
                            if (index == uiState.currentPage) AccentOrange
                            else MaterialTheme.colorScheme.onBackground.copy(alpha = 0.3f)
                        )
                )
            }
        }
    }
}
