package com.kreativekoala.audexa.ui.home

import android.widget.Toast
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.outlined.Lightbulb
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.hilt.navigation.compose.hiltViewModel
import com.kreativekoala.audexa.R
import com.kreativekoala.audexa.data.model.DiscoverCategory
import com.kreativekoala.audexa.data.model.SupportedLanguage
import com.kreativekoala.audexa.data.model.Topic
import com.kreativekoala.audexa.ui.components.*
import com.kreativekoala.audexa.ui.theme.*
import java.util.*

@Composable
fun HomeScreen(
    onNavigateToProfile: () -> Unit,
    onNavigateToLinkedAccounts: () -> Unit,
    onTopicClick: (Topic) -> Unit,
    onNavigateToLiveRadio: (streamUrl: String, stationName: String) -> Unit = { _, _ -> },
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
    val radioLanguages by viewModel.radioLanguages.collectAsState(initial = emptySet())

    // Search state for Discover tab
    var searchText by remember { mutableStateOf("") }

    // Suggest topic state
    var showSuggestTopicSheet by remember { mutableStateOf(false) }
    val suggestTopicResult by viewModel.suggestTopicResult.collectAsState()
    val context = LocalContext.current

    // Handle suggest topic result
    LaunchedEffect(suggestTopicResult) {
        when (suggestTopicResult) {
            is SuggestTopicResult.Success -> {
                showSuggestTopicSheet = false
                Toast.makeText(context, "Topic suggested! We'll add it soon.", Toast.LENGTH_LONG).show()
                viewModel.resetSuggestTopicResult()
            }
            is SuggestTopicResult.Error -> {
                Toast.makeText(context, (suggestTopicResult as SuggestTopicResult.Error).message, Toast.LENGTH_LONG).show()
                viewModel.resetSuggestTopicResult()
            }
            else -> {}
        }
    }

    // Suggest Topic Bottom Sheet
    if (showSuggestTopicSheet) {
        SuggestTopicBottomSheet(
            isLoading = suggestTopicResult is SuggestTopicResult.Loading,
            onDismiss = {
                showSuggestTopicSheet = false
                viewModel.resetSuggestTopicResult()
            },
            onSubmit = { topicName, description ->
                viewModel.suggestTopic(topicName, description)
            }
        )
    }

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

            Spacer(modifier = Modifier.height(16.dp))

            // Audexa Radio live banners (multilingual)
            RadioStationBanners(
                radioLanguages = radioLanguages,
                onStationClick = { streamUrl, stationName ->
                    onNavigateToLiveRadio(streamUrl, stationName)
                }
            )

            Spacer(modifier = Modifier.height(16.dp))

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
                    onHideTopic = { viewModel.hideTopic(it) },
                    onSuggestTopic = { showSuggestTopicSheet = true }
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
    onHideTopic: (String) -> Unit,
    onSuggestTopic: () -> Unit = {}
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

            // Suggest a Topic button
            OutlinedButton(
                onClick = onSuggestTopic,
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = Spacing.screenPadding.dp),
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.outlinedButtonColors(
                    contentColor = AccentOrange
                ),
                border = androidx.compose.foundation.BorderStroke(1.dp, AccentOrange.copy(alpha = 0.5f))
            ) {
                Icon(
                    imageVector = Icons.Outlined.Lightbulb,
                    contentDescription = null,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "Suggest a Topic",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.Medium
                )
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

@Composable
private fun RadioStationBanners(
    radioLanguages: Set<String>,
    onStationClick: (streamUrl: String, stationName: String) -> Unit
) {
    val stations = remember(radioLanguages) {
        val availableCodes = SupportedLanguage.radioAvailable.map { it.code }.toSet()
        radioLanguages
            .filter { it in availableCodes }
            .map { SupportedLanguage.fromCode(it) }
            .ifEmpty { listOf(SupportedLanguage.ENGLISH) }
    }

    if (stations.size == 1) {
        // Single station — full-width banner
        val lang = stations.first()
        RadioBannerItem(
            language = lang,
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = Spacing.screenPadding.dp),
            onClick = { onStationClick(lang.radioStreamURL, lang.radioStationName) }
        )
    } else {
        // Multiple stations — horizontal scroll
        LazyRow(
            contentPadding = PaddingValues(horizontal = Spacing.screenPadding.dp),
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            items(stations, key = { it.code }) { lang ->
                RadioBannerItem(
                    language = lang,
                    modifier = Modifier.width(260.dp),
                    onClick = { onStationClick(lang.radioStreamURL, lang.radioStationName) }
                )
            }
        }
    }
}

@Composable
private fun RadioBannerItem(
    language: SupportedLanguage,
    modifier: Modifier = Modifier,
    onClick: () -> Unit
) {
    Surface(
        modifier = modifier.clickable { onClick() },
        shape = RoundedCornerShape(12.dp),
        color = Color(0xFF1A0A0A)
    ) {
        Row(
            modifier = Modifier.padding(horizontal = 16.dp, vertical = 14.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
            Text(text = language.flagEmoji, fontSize = 28.sp)
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = language.radioStationName,
                    style = MaterialTheme.typography.titleMedium,
                    color = Color.White,
                    fontWeight = FontWeight.Bold,
                    maxLines = 1
                )
                Text(
                    text = "AI-powered 24/7 news · LIVE",
                    style = MaterialTheme.typography.bodySmall,
                    color = Color(0xFFEF4444)
                )
            }
            Surface(
                shape = RoundedCornerShape(4.dp),
                color = Color(0xFFEF4444)
            ) {
                Text(
                    text = "● LIVE",
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 3.dp),
                    color = Color.White,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
private fun SuggestTopicBottomSheet(
    isLoading: Boolean,
    onDismiss: () -> Unit,
    onSubmit: (topicName: String, description: String?) -> Unit
) {
    var topicName by remember { mutableStateOf("") }
    var description by remember { mutableStateOf("") }

    ModalBottomSheet(
        onDismissRequest = onDismiss,
        containerColor = MaterialTheme.colorScheme.surface,
        shape = RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 24.dp)
                .padding(bottom = 32.dp),
            verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
            Text(
                text = "Suggest a Topic",
                style = MaterialTheme.typography.headlineSmall,
                color = MaterialTheme.colorScheme.onSurface,
                fontWeight = FontWeight.Bold
            )

            Text(
                text = "Tell us what you'd like to listen to and we'll consider adding it.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            OutlinedTextField(
                value = topicName,
                onValueChange = { topicName = it },
                label = { Text("Topic name") },
                placeholder = { Text("e.g. Quantum Computing") },
                modifier = Modifier.fillMaxWidth(),
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = AccentOrange,
                    focusedLabelColor = AccentOrange,
                    cursorColor = AccentOrange
                )
            )

            OutlinedTextField(
                value = description,
                onValueChange = { description = it },
                label = { Text("Description (optional)") },
                placeholder = { Text("What should this topic cover?") },
                modifier = Modifier.fillMaxWidth(),
                minLines = 2,
                maxLines = 4,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = AccentOrange,
                    focusedLabelColor = AccentOrange,
                    cursorColor = AccentOrange
                )
            )

            Spacer(modifier = Modifier.height(8.dp))

            Button(
                onClick = { onSubmit(topicName, description) },
                modifier = Modifier.fillMaxWidth(),
                enabled = topicName.isNotBlank() && !isLoading,
                shape = RoundedCornerShape(12.dp),
                colors = ButtonDefaults.buttonColors(
                    containerColor = AccentOrange
                )
            ) {
                if (isLoading) {
                    CircularProgressIndicator(
                        modifier = Modifier.size(20.dp),
                        color = Color.White,
                        strokeWidth = 2.dp
                    )
                    Spacer(modifier = Modifier.width(8.dp))
                }
                Text(
                    text = if (isLoading) "Submitting..." else "Submit",
                    style = MaterialTheme.typography.bodyLarge,
                    fontWeight = FontWeight.SemiBold,
                    modifier = Modifier.padding(vertical = 4.dp)
                )
            }
        }
    }
}
