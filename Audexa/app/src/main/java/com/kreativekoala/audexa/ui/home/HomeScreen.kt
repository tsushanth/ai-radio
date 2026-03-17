package com.kreativekoala.audexa.ui.home

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.model.DiscoverCategory
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.ui.components.*
import com.kreativekoala.audexa.ui.theme.*
import java.util.*

@Composable
fun HomeScreen(
    onNavigateToProfile: () -> Unit,
    onNavigateToLinkedAccounts: () -> Unit,
    onTopicClick: (Topic) -> Unit,
    viewModel: HomeViewModel = hiltViewModel()
) {
    val selectedTab by viewModel.selectedTab.collectAsState()
    val userName by viewModel.userName.collectAsState()
    val dailyBriefState by viewModel.dailyBriefState.collectAsState()
    val hasCachedEpisode by viewModel.hasCachedEpisodeForToday.collectAsState()
    val keepListening by viewModel.keepListening.collectAsState()
    val bookmarkedTopics by viewModel.bookmarkedTopics.collectAsState(initial = emptyList())
    val visibleTopics by viewModel.visibleTopics.collectAsState(initial = emptyList())
    val bookmarkedIds by viewModel.bookmarkedTopicIds.collectAsState(initial = emptySet())
    val playingTopicId by viewModel.playingTopicId.collectAsState(initial = null)
    val discoverCategories by viewModel.discoverCategories.collectAsState()

    // Search state for Discover tab
    var searchText by remember { mutableStateOf("") }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .background(MaterialTheme.colorScheme.background)
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
                subtitle = stringResource(R.string.daily_brief_subtitle, viewModel.dailyBriefDate),
                briefState = dailyBriefState,
                hasCachedEpisode = hasCachedEpisode,
                onPlayTapped = { viewModel.playDailyBrief() },
                onPauseTapped = { viewModel.pauseDailyBrief() },
                onProfileTapped = onNavigateToProfile,
                onRetryTapped = { viewModel.playDailyBrief() },
                onRegenerateTapped = { viewModel.regenerateDailyBrief() },
                onRelinkTapped = onNavigateToLinkedAccounts,  // Navigate directly to linked accounts
                onCancelTapped = { viewModel.cancelGeneration() }
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Tab Selector
            TabSelector(
                selectedIndex = selectedTab,
                tabs = listOf(stringResource(R.string.tab_for_you), stringResource(R.string.tab_discover)),
                onTabSelected = { viewModel.selectTab(it) }
            )

            Spacer(modifier = Modifier.height(24.dp))

            // Tab Content
            if (selectedTab == 0) {
                ForYouTabContent(
                    keepListening = keepListening,
                    bookmarkedTopics = bookmarkedTopics,
                    visibleTopics = visibleTopics,
                    bookmarkedIds = bookmarkedIds,
                    playingTopicId = playingTopicId,
                    onTopicClick = onTopicClick,
                    onBookmarkToggle = { viewModel.toggleBookmark(it) },
                    onHideTopic = { viewModel.hideTopic(it) },
                    onEpisodeClick = { viewModel.playEpisode(it) }
                )
            } else {
                DiscoverTabContent(
                    searchText = searchText,
                    onSearchTextChange = { searchText = it },
                    discoverCategories = discoverCategories,
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
            Column {
                Text(
                    text = stringResource(R.string.keep_listening),
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                LazyRow(
                    contentPadding = PaddingValues(horizontal = Spacing.screenPadding.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(keepListening) { episode ->
                        EpisodeShowCard(
                            episode = episode,
                            onClick = { onEpisodeClick(episode) }
                        )
                    }
                }
            }
        }

        // Bookmarked Topics (Your Topics)
        if (bookmarkedTopics.isNotEmpty()) {
            Column {
                Text(
                    text = stringResource(R.string.your_topics),
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                LazyRow(
                    contentPadding = PaddingValues(horizontal = Spacing.screenPadding.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(bookmarkedTopics, key = { it.id }) { topic ->
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
        }

        // Topic Podcasts
        if (visibleTopics.isNotEmpty()) {
            Column {
                Text(
                    text = stringResource(R.string.topic_podcasts),
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
                )
                Text(
                    text = stringResource(R.string.tap_to_explore),
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))

                LazyRow(
                    contentPadding = PaddingValues(horizontal = Spacing.screenPadding.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(visibleTopics.take(6), key = { it.id }) { topic ->
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

        // Recommended for you - show topics 7-10 from visible topics
        val recommendedTopics = visibleTopics.drop(6).take(4)
        if (recommendedTopics.isNotEmpty()) {
            Column {
                Text(
                    text = stringResource(R.string.recommended_for_you),
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                LazyRow(
                    contentPadding = PaddingValues(horizontal = Spacing.screenPadding.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(recommendedTopics, key = { it.id }) { topic ->
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

        // More for you - show topics 11+ from visible topics
        val moreForYouTopics = visibleTopics.drop(10)
        if (moreForYouTopics.isNotEmpty()) {
            Column {
                Text(
                    text = stringResource(R.string.more_for_you),
                    style = MaterialTheme.typography.headlineLarge,
                    color = MaterialTheme.colorScheme.onBackground,
                    modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
                )
                Spacer(modifier = Modifier.height(16.dp))
                LazyRow(
                    contentPadding = PaddingValues(horizontal = Spacing.screenPadding.dp),
                    horizontalArrangement = Arrangement.spacedBy(16.dp)
                ) {
                    items(moreForYouTopics, key = { it.id }) { topic ->
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
    searchText: String,
    onSearchTextChange: (String) -> Unit,
    discoverCategories: List<DiscoverCategory>,
    visibleTopics: List<Topic>,
    bookmarkedIds: Set<String>,
    playingTopicId: String?,
    onTopicClick: (Topic) -> Unit,
    onBookmarkToggle: (String) -> Unit,
    onHideTopic: (String) -> Unit
) {
    // Filter categories and topics based on search
    val filteredCategories = remember(searchText, discoverCategories) {
        if (searchText.isEmpty()) {
            discoverCategories
        } else {
            val lowercasedSearch = searchText.lowercase()
            discoverCategories.mapNotNull { category ->
                val filteredShows = category.shows.filter { show ->
                    show.title.lowercase().contains(lowercasedSearch) ||
                    show.description.lowercase().contains(lowercasedSearch) ||
                    category.title.lowercase().contains(lowercasedSearch)
                }
                if (filteredShows.isNotEmpty()) {
                    DiscoverCategory(title = category.title, shows = filteredShows)
                } else {
                    null
                }
            }
        }
    }

    val filteredTopics = remember(searchText, visibleTopics) {
        if (searchText.isEmpty()) {
            visibleTopics
        } else {
            val lowercasedSearch = searchText.lowercase()
            visibleTopics.filter { topic ->
                topic.name.lowercase().contains(lowercasedSearch) ||
                topic.description.lowercase().contains(lowercasedSearch) ||
                topic.category.lowercase().contains(lowercasedSearch)
            }
        }
    }

    Column(verticalArrangement = Arrangement.spacedBy(24.dp)) {
        // Search Bar
        SearchBar(
            searchText = searchText,
            onSearchTextChange = onSearchTextChange,
            modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
        )

        // Show "No results" if search returns empty
        if (searchText.isNotEmpty() && filteredCategories.isEmpty() && filteredTopics.isEmpty()) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(top = 40.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Icon(
                    imageVector = Icons.Default.Search,
                    contentDescription = null,
                    modifier = Modifier.size(40.dp),
                    tint = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(12.dp))
                Text(
                    text = stringResource(R.string.no_results_for, searchText),
                    style = MaterialTheme.typography.bodyLarge,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        } else {
            // Category sections - use visibleTopics so hidden topics are filtered out
            filteredCategories.forEach { category ->
                CategorySection(
                    title = category.title,
                    shows = category.shows,
                    topics = visibleTopics,
                    bookmarkedIds = bookmarkedIds,
                    playingTopicId = playingTopicId,
                    onTopicClick = onTopicClick,
                    onBookmarkToggle = onBookmarkToggle,
                    onHideTopic = onHideTopic
                )
            }

            // All Topics section
            if (filteredTopics.isNotEmpty()) {
                Column {
                    Text(
                        text = if (searchText.isEmpty()) stringResource(R.string.all_topics) else stringResource(R.string.matching_topics),
                        style = MaterialTheme.typography.headlineLarge,
                        color = MaterialTheme.colorScheme.onBackground,
                        modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
                    )

                    Spacer(modifier = Modifier.height(16.dp))

                    LazyRow(
                        contentPadding = PaddingValues(horizontal = Spacing.screenPadding.dp),
                        horizontalArrangement = Arrangement.spacedBy(16.dp)
                    ) {
                        items(filteredTopics, key = { it.id }) { topic ->
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
}

@Composable
private fun SearchBar(
    searchText: String,
    onSearchTextChange: (String) -> Unit,
    modifier: Modifier = Modifier
) {
    OutlinedTextField(
        value = searchText,
        onValueChange = onSearchTextChange,
        modifier = modifier.fillMaxWidth(),
        placeholder = {
            Text(
                stringResource(R.string.find_new_shows),
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        leadingIcon = {
            Icon(
                imageVector = Icons.Default.Search,
                contentDescription = stringResource(R.string.search),
                tint = if (searchText.isNotEmpty()) AccentOrange else MaterialTheme.colorScheme.onSurfaceVariant
            )
        },
        trailingIcon = {
            if (searchText.isNotEmpty()) {
                IconButton(onClick = { onSearchTextChange("") }) {
                    Icon(
                        imageVector = Icons.Default.Close,
                        contentDescription = stringResource(R.string.clear),
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        },
        singleLine = true,
        shape = androidx.compose.foundation.shape.RoundedCornerShape(12.dp),
        colors = OutlinedTextFieldDefaults.colors(
            focusedContainerColor = MaterialTheme.colorScheme.surface,
            unfocusedContainerColor = MaterialTheme.colorScheme.surface,
            focusedBorderColor = AccentOrange.copy(alpha = 0.5f),
            unfocusedBorderColor = MaterialTheme.colorScheme.surface,
            cursorColor = AccentOrange
        )
    )
}

@Composable
private fun CategorySection(
    title: String,
    shows: List<com.kreativekoala.audexa.data.model.Show>,
    topics: List<Topic>,
    bookmarkedIds: Set<String>,
    playingTopicId: String?,
    onTopicClick: (Topic) -> Unit,
    onBookmarkToggle: (String) -> Unit,
    onHideTopic: (String) -> Unit
) {
    // Pre-compute the list of shows with matching topics
    val showsWithTopics = remember(shows, topics) {
        shows.mapNotNull { show ->
            topics.find { it.id == show.id }?.let { topic -> show to topic }
        }
    }

    // Don't render section if no matching topics
    if (showsWithTopics.isEmpty()) return

    Column {
        Text(
            text = title,
            style = MaterialTheme.typography.headlineLarge,
            color = MaterialTheme.colorScheme.onBackground,
            modifier = Modifier.padding(horizontal = Spacing.screenPadding.dp)
        )

        Spacer(modifier = Modifier.height(16.dp))

        LazyRow(
            contentPadding = PaddingValues(horizontal = Spacing.screenPadding.dp),
            horizontalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            items(showsWithTopics, key = { it.first.id }) { (_, topic) ->
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

@Composable
private fun getGreeting(): String {
    val hour = Calendar.getInstance().get(Calendar.HOUR_OF_DAY)
    return when (hour) {
        in 0..11 -> stringResource(R.string.good_morning)
        in 12..16 -> stringResource(R.string.good_afternoon)
        else -> stringResource(R.string.good_evening)
    }
}
