package com.kreativekoala.audexa.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.ui.components.*
import com.kreativekoala.audexa.ui.theme.*
import java.util.*

@Composable
fun HomeScreen(
    onNavigateToProfile: () -> Unit,
    onTopicClick: (Topic) -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val selectedTab by viewModel.selectedTab.collectAsState()
    val userName by viewModel.userName.collectAsState()
    val dailyBriefState by viewModel.dailyBriefState.collectAsState()
    val topics by viewModel.topics.collectAsState()
    val forYouEpisodes by viewModel.forYouEpisodes.collectAsState()
    val keepListening by viewModel.keepListening.collectAsState()
    val bookmarkedTopics by viewModel.bookmarkedTopics.collectAsState(initial = emptyList())
    val visibleTopics by viewModel.visibleTopics.collectAsState(initial = emptyList())
    val bookmarkedIds by viewModel.bookmarkedTopicIds.collectAsState(initial = emptySet())
    val playingTopicId by viewModel.playingTopicId.collectAsState(initial = null)

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(Background)
    ) {
        // Scrollable content
        Column(
            modifier = Modifier
                .weight(1f)
                .verticalScroll(rememberScrollState())
        ) {
            // Gradient Header
            GradientHeader(
                greeting = getGreeting(),
                userName = userName,
                subtitle = "Daily Brief • ${viewModel.dailyBriefDate}",
                briefState = dailyBriefState,
                onPlayTapped = { viewModel.playDailyBrief() },
                onPauseTapped = { viewModel.pauseDailyBrief() },
                onProfileTapped = onNavigateToProfile,
                onRetryTapped = { viewModel.playDailyBrief() }
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Tab Selector
            TabSelector(
                selectedIndex = selectedTab,
                tabs = listOf("For You", "Discover"),
                onTabSelected = { viewModel.selectTab(it) }
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Tab Content
            if (selectedTab == 0) {
                ForYouTabContent(
                    keepListening = keepListening,
                    bookmarkedTopics = bookmarkedTopics,
                    visibleTopics = visibleTopics,
                    forYouEpisodes = forYouEpisodes,
                    topics = topics,
                    bookmarkedIds = bookmarkedIds,
                    playingTopicId = playingTopicId,
                    onTopicClick = onTopicClick,
                    onBookmarkToggle = { viewModel.toggleBookmark(it) },
                    onHideTopic = { viewModel.hideTopic(it) },
                    onEpisodeClick = { viewModel.playEpisode(it) }
                )
            } else {
                DiscoverTabContent(
                    visibleTopics = visibleTopics,
                    bookmarkedIds = bookmarkedIds,
                    playingTopicId = playingTopicId,
                    onTopicClick = onTopicClick,
                    onBookmarkToggle = { viewModel.toggleBookmark(it) },
                    onHideTopic = { viewModel.hideTopic(it) }
                )
            }

            // Bottom padding for mini player
            Spacer(modifier = Modifier.height(Sizing.miniPlayerHeight.dp + Sizing.tabBarHeight.dp))
        }
    }
}

@Composable
private fun ForYouTabContent(
    keepListening: List<com.kreativekoala.audexa.data.model.Episode>,
    bookmarkedTopics: List<Topic>,
    visibleTopics: List<Topic>,
    forYouEpisodes: List<com.kreativekoala.audexa.data.model.Episode>,
    topics: List<Topic>,
    bookmarkedIds: Set<String>,
    playingTopicId: String?,
    onTopicClick: (Topic) -> Unit,
    onBookmarkToggle: (String) -> Unit,
    onHideTopic: (String) -> Unit,
    onEpisodeClick: (com.kreativekoala.audexa.data.model.Episode) -> Unit
) {
    Column(verticalArrangement = Arrangement.spacedBy(32.dp)) {
        // Keep Listening
        if (keepListening.isNotEmpty()) {
            SectionWithHorizontalScroll(title = "Keep listening") {
                keepListening.forEach { episode ->
                    EpisodeShowCard(
                        episode = episode,
                        onClick = { onEpisodeClick(episode) }
                    )
                }
            }
        }

        // Bookmarked Topics (Your Topics)
        if (bookmarkedTopics.isNotEmpty()) {
            SectionWithHorizontalScroll(title = "Your Topics") {
                bookmarkedTopics.forEach { topic ->
                    TopicCard(
                        topic = topic,
                        isBookmarked = true,
                        isPlaying = topic.id == playingTopicId,
                        onClick = { onTopicClick(topic) },
                        onBookmarkToggle = { onBookmarkToggle(topic.id) },
                        onHide = { onHideTopic(topic.id) }
                    )
                }
            }
        }

        // Topic Podcasts
        if (visibleTopics.isNotEmpty()) {
            Column {
                Text(
                    text = "Topic Podcasts",
                    style = MaterialTheme.typography.headlineLarge,
                    color = PrimaryText,
                    modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
                )
                Text(
                    text = "Tap to explore and play",
                    style = MaterialTheme.typography.bodyMedium,
                    color = SecondaryText,
                    modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                
                LazyRow(
                    contentPadding = PaddingValues(horizontal = Spacing.screenPadding.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(visibleTopics.take(6)) { topic ->
                        TopicCard(
                            topic = topic,
                            isBookmarked = topic.id in bookmarkedIds,
                            isPlaying = topic.id == playingTopicId,
                            onClick = { onTopicClick(topic) },
                            onBookmarkToggle = { onBookmarkToggle(topic.id) },
                            onHide = { onHideTopic(topic.id) }
                        )
                    }
                }
            }
        }

        // Recommended for you
        if (forYouEpisodes.isNotEmpty()) {
            SectionWithHorizontalScroll(title = "Recommended for you") {
                forYouEpisodes.take(3).forEach { episode ->
                    val topic = topics.find { it.id == episode.showId }
                    if (topic != null) {
                        TopicCard(
                            topic = topic,
                            isBookmarked = topic.id in bookmarkedIds,
                            isPlaying = topic.id == playingTopicId,
                            onClick = { onTopicClick(topic) },
                            onBookmarkToggle = { onBookmarkToggle(topic.id) },
                            onHide = { onHideTopic(topic.id) }
                        )
                    }
                }
            }
        }

        // More for you
        if (forYouEpisodes.size > 3) {
            SectionWithHorizontalScroll(title = "More for you") {
                forYouEpisodes.drop(3).forEach { episode ->
                    val topic = topics.find { it.id == episode.showId }
                    if (topic != null) {
                        TopicCard(
                            topic = topic,
                            isBookmarked = topic.id in bookmarkedIds,
                            isPlaying = topic.id == playingTopicId,
                            onClick = { onTopicClick(topic) },
                            onBookmarkToggle = { onBookmarkToggle(topic.id) },
                            onHide = { onHideTopic(topic.id) }
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun DiscoverTabContent(
    visibleTopics: List<Topic>,
    bookmarkedIds: Set<String>,
    playingTopicId: String?,
    onTopicClick: (Topic) -> Unit,
    onBookmarkToggle: (String) -> Unit,
    onHideTopic: (String) -> Unit
) {
    Column {
        // All Topics
        if (visibleTopics.isNotEmpty()) {
            Text(
                text = "All Topics",
                style = MaterialTheme.typography.headlineLarge,
                color = PrimaryText,
                modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
            )

            Spacer(modifier = Modifier.height(16.dp))

            LazyRow(
                contentPadding = PaddingValues(horizontal = Spacing.screenPadding.dp),
                horizontalArrangement = Arrangement.spacedBy(16.dp)
            ) {
                items(visibleTopics) { topic ->
                    TopicCard(
                        topic = topic,
                        isBookmarked = topic.id in bookmarkedIds,
                        isPlaying = topic.id == playingTopicId,
                        onClick = { onTopicClick(topic) },
                        onBookmarkToggle = { onBookmarkToggle(topic.id) },
                        onHide = { onHideTopic(topic.id) }
                    )
                }
            }
        }
    }
}

@Composable
private fun SectionWithHorizontalScroll(
    title: String,
    content: @Composable () -> Unit
) {
    Column {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineLarge,
            color = PrimaryText,
            modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
        )
        
        Spacer(modifier = Modifier.height(16.dp))
        
        LazyRow(
            contentPadding = PaddingValues(horizontal = Spacing.screenPadding.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            item { content() }
        }
    }
}

private fun getGreeting(): String {
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return when (hour) {
        in 0..11 -> "Good Morning"
        in 12..16 -> "Good Afternoon"
        else -> "Good Evening"
    }
}
