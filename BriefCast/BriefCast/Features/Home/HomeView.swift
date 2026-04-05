//
//  HomeView.swift
//  BriefCast
//
//  Home screen with For You and Discover tabs
//

import SwiftUI
import GoogleSignIn

struct HomeView: View {
    @EnvironmentObject var authService: AuthService
    @Bindable var viewModel: HomeViewModel
    @State private var searchText = ""
    @State private var showLinkedAccounts = false
    @State private var selectedTopicForDetail: Topic?
    @State private var selectedDeepDiveForDetail: DeepDiveEpisode?
    @State private var selectedLiveStation: LiveStation?
    @State private var toastMessage: String?
    @State private var showToast = false
    @State private var showSuggestTopicConfirmation = false
    @State private var selectedRadioLanguage: SupportedLanguage?
    @State private var showBookmarkLimitPaywall = false
    @StateObject private var preferencesService = PreferencesService.shared

    var body: some View {
        ZStack(alignment: .top) {
            // Pure black background
            Theme.Colors.background
                .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 0) {
                    // Gradient header (fixed at top)
                    GradientHeader(
                        greeting: greeting,
                        userName: viewModel.userName,
                        subtitle: "Daily Brief • \(viewModel.dailyBriefDate)",
                        briefState: viewModel.dailyBriefState,
                        hasCachedEpisode: viewModel.hasCachedEpisodeForToday,
                        onPlayTapped: {
                            viewModel.playDailyBrief()
                        },
                        onPauseTapped: {
                            viewModel.pauseDailyBrief()
                        },
                        onLinkAccountTapped: {
                            showLinkedAccounts = true
                        },
                        onRegenerateTapped: {
                            Task {
                                await viewModel.regenerateDailyBrief()
                            }
                        },
                        onCancelTapped: {
                            viewModel.cancelGeneration()
                        }
                    )

                    // Audexa Radio banner(s)
                    radioStationBanners
                        .padding(.top, 16)

                    // Tab selector
                    TabSelector(selectedTab: $viewModel.selectedTab, tabs: ["For You", "Discover"])
                        .padding(.top, 16)
                        .padding(.bottom, 16)

                    // Content based on selected tab
                    if viewModel.selectedTab == 0 {
                        ForYouTabContent(
                            viewModel: viewModel,
                            onTopicTapped: { topic in
                                selectedTopicForDetail = topic
                            },
                            onBookmarkToggled: { topic, isNowBookmarked in
                                showBookmarkToast(topic: topic, isBookmarked: isNowBookmarked)
                            },
                            onDeepDiveTapped: { deepDive in
                                selectedDeepDiveForDetail = deepDive
                            },
                            onLiveStationTapped: { station in
                                selectedLiveStation = station
                            }
                        )
                    } else {
                        DiscoverTabContent(
                            viewModel: viewModel,
                            searchText: $searchText,
                            onTopicTapped: { topic in
                                selectedTopicForDetail = topic
                            },
                            onBookmarkToggled: { topic, isNowBookmarked in
                                showBookmarkToast(topic: topic, isBookmarked: isNowBookmarked)
                            },
                            onSuggestTopic: {
                                viewModel.showSuggestTopicSheet = true
                            }
                        )
                    }
                }
                .padding(.bottom, Theme.Sizing.miniPlayerHeight + Theme.Sizing.tabBarHeight)
            }
        }
        .task {
            // Set user info from auth service
            if let user = authService.currentUser {
                viewModel.setUser(name: user.name ?? "", email: user.email)
            }
            await viewModel.loadData()
        }
        .sheet(isPresented: $showLinkedAccounts) {
            NavigationStack {
                LinkedAccountsView()
            }
            .onOpenURL { url in
                // Handle Google OAuth callback when sheet is presented
                print("📱 Received URL in HomeView sheet: \(url)")
                GIDSignIn.sharedInstance.handle(url)
            }
        }
        .onChange(of: showLinkedAccounts) { _, isShowing in
            // Refresh linked account status when sheet is dismissed
            if !isShowing {
                Task {
                    await viewModel.checkLinkedAccounts()
                }
            }
        }
        .sheet(item: $selectedTopicForDetail) { topic in
            TopicDetailView(
                topic: topic,
                onDismiss: {
                    selectedTopicForDetail = nil
                },
                onHide: {
                    viewModel.hideTopic(topic.id)
                }
            )
        }
        .sheet(item: $selectedDeepDiveForDetail) { deepDive in
            DeepDiveDetailView(
                deepDive: deepDive,
                onDismiss: {
                    selectedDeepDiveForDetail = nil
                }
            )
        }
        .fullScreenCover(item: $selectedLiveStation) { station in
            LiveStationPlayerView(station: station)
                .environment(AudioService.shared)
        }
        .fullScreenCover(item: $selectedRadioLanguage) { lang in
            LiveRadioView(streamURL: lang.radioStreamURL, stationName: lang.radioStationName)
                .environment(AudioService.shared)
                .environmentObject(authService)
        }
        .sheet(isPresented: $viewModel.showSuggestTopicSheet) {
            SuggestTopicSheet(viewModel: viewModel) {
                showSuggestTopicConfirmation = true
            }
        }
        .alert("Topic Suggested!", isPresented: $showSuggestTopicConfirmation) {
            Button("OK") {
                viewModel.resetSuggestTopicState()
            }
        } message: {
            Text("Thanks for your suggestion! We'll review it and add it soon.")
        }
        .onChange(of: viewModel.suggestTopicSuccess) { _, success in
            if success {
                showSuggestTopicConfirmation = true
            }
        }
        .overlay(alignment: .top) {
            if showToast, let message = toastMessage {
                BookmarkToast(message: message)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(100)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showToast)
        .onReceive(NotificationCenter.default.publisher(for: .showBookmarkLimitPaywall)) { _ in
            showBookmarkLimitPaywall = true
        }
        .sheet(isPresented: $showBookmarkLimitPaywall) {
            RemotePaywallView(triggerSource: "bookmark_limit")
        }
    }

    // MARK: - Helpers

    private func showBookmarkToast(topic: Topic, isBookmarked: Bool) {
        if isBookmarked {
            toastMessage = "\(topic.name) added to For You"
        } else {
            toastMessage = "\(topic.name) removed from For You"
        }
        showToast = true

        // Auto-hide after 2 seconds
        DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
            showToast = false
        }
    }

    // MARK: - Radio Station Banners

    private var radioStations: [SupportedLanguage] {
        let preferred = preferencesService.preferredSupportedLanguage
        return preferred == .en ? [.en] : [preferred, .en]
    }

    @ViewBuilder
    private var radioStationBanners: some View {
        let stations = radioStations
        if stations.count == 1, let lang = stations.first {
            radioStationBanner(language: lang)
                .padding(.horizontal, Theme.Spacing.screenPadding)
        } else {
            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 12) {
                    ForEach(stations) { lang in
                        radioStationBanner(language: lang)
                            .frame(width: 260)
                    }
                }
                .padding(.horizontal, Theme.Spacing.screenPadding)
            }
        }
    }

    private func radioStationBanner(language: SupportedLanguage) -> some View {
        Button {
            selectedRadioLanguage = language
        } label: {
            HStack(spacing: 12) {
                Text(language.flagEmoji)
                    .font(.system(size: 28))
                VStack(alignment: .leading, spacing: 2) {
                    Text(language.radioStationName)
                        .font(.headline)
                        .foregroundColor(.white)
                        .lineLimit(1)
                    Text("AI-powered 24/7 news")
                        .font(.caption)
                        .foregroundColor(.red)
                    HStack(spacing: 4) {
                        Image(systemName: "phone.fill")
                            .font(.system(size: 9))
                            .foregroundColor(.green.opacity(0.8))
                        Text("Call in: (833) 398-1230")
                            .font(.system(size: 10))
                            .foregroundColor(.white.opacity(0.5))
                    }
                }
                Spacer()
                Text("● LIVE")
                    .font(.caption2.bold())
                    .foregroundColor(.white)
                    .padding(.horizontal, 8)
                    .padding(.vertical, 3)
                    .background(Color.red)
                    .cornerRadius(4)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 14)
            .background(Color(red: 0.1, green: 0.04, blue: 0.04))
            .cornerRadius(12)
        }
        .buttonStyle(.plain)
    }

    private var greeting: String {
        let hour = Calendar.current.component(.hour, from: Date())
        switch hour {
        case 0..<12: return "Good Morning"
        case 12..<17: return "Good Afternoon"
        default: return "Good Evening"
        }
    }
}

// MARK: - For You Tab Content

struct ForYouTabContent: View {
    @Bindable var viewModel: HomeViewModel
    let onTopicTapped: (Topic) -> Void
    var onBookmarkToggled: ((Topic, Bool) -> Void)? = nil
    var onDeepDiveTapped: ((DeepDiveEpisode) -> Void)? = nil
    var onLiveStationTapped: ((LiveStation) -> Void)? = nil

    // Observe AudioService for now playing indicator
    private let audioService = AudioService.shared

    var body: some View {
        VStack(spacing: 32) {
            // Live Stations — hidden until event-driven breaking news detection is built
            // Will resurface when orchestrator detects developing stories and creates
            // temporary live stations. The 24/7 radio banners above replace the static version.

            // Deep Dives history section
            if !viewModel.deepDiveHistory.isEmpty {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Your Deep Dives")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(Theme.Colors.primaryText)
                        .padding(.horizontal, Theme.Spacing.screenPadding)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 16) {
                            ForEach(viewModel.deepDiveHistory.prefix(5)) { deepDive in
                                DeepDiveCard(
                                    deepDive: deepDive,
                                    isPlaying: isPlayingDeepDive(deepDive.id),
                                    onTap: {
                                        onDeepDiveTapped?(deepDive)
                                    }
                                )
                            }
                        }
                        .padding(.horizontal, Theme.Spacing.screenPadding)
                    }
                }
            }

            // Keep listening section
            if !viewModel.keepListening.isEmpty {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Keep listening")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(Theme.Colors.primaryText)
                        .padding(.horizontal, Theme.Spacing.screenPadding)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 16) {
                            ForEach(viewModel.keepListening) { episode in
                                ShowCard(
                                    title: episode.title,
                                    description: episode.description,
                                    imageColor: Color(hex: episode.imageColor),
                                    episodeInfo: formatDate(episode.generatedAt),
                                    size: .small,
                                    onTap: {
                                        AudioService.shared.play(episode: episode)
                                    }
                                )
                            }
                        }
                        .padding(.horizontal, Theme.Spacing.screenPadding)
                    }
                }
            }

            // Bookmarked topics section (For You)
            if !viewModel.bookmarkedTopics.isEmpty {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Your Topics")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(Theme.Colors.primaryText)
                        .padding(.horizontal, Theme.Spacing.screenPadding)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 16) {
                            ForEach(viewModel.bookmarkedTopics) { topic in
                                TopicCard(
                                    topic: topic,
                                    isLoading: isLoadingTopic(topic.id),
                                    isBookmarked: true,
                                    isPlaying: isPlayingTopic(topic.id),
                                    onTap: { onTopicTapped(topic) },
                                    onBookmarkToggle: {
                                        viewModel.toggleBookmark(for: topic.id)
                                        onBookmarkToggled?(topic, false) // Now unbookmarked
                                    },
                                    onHide: {
                                        viewModel.hideTopic(topic.id)
                                    }
                                )
                            }
                        }
                        .padding(.horizontal, Theme.Spacing.screenPadding)
                    }
                }
            }

            // Topic podcasts section - show available topics
            if !viewModel.visibleTopics.isEmpty {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Topic Podcasts")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(Theme.Colors.primaryText)
                        .padding(.horizontal, Theme.Spacing.screenPadding)

                    Text("Tap to explore and play")
                        .font(.system(size: 14))
                        .foregroundColor(Theme.Colors.secondaryText)
                        .padding(.horizontal, Theme.Spacing.screenPadding)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 16) {
                            ForEach(viewModel.visibleTopics.prefix(6)) { topic in
                                let wasBookmarked = viewModel.isTopicBookmarked(topic.id)
                                TopicCard(
                                    topic: topic,
                                    isLoading: isLoadingTopic(topic.id),
                                    isBookmarked: wasBookmarked,
                                    isPlaying: isPlayingTopic(topic.id),
                                    onTap: { onTopicTapped(topic) },
                                    onBookmarkToggle: {
                                        viewModel.toggleBookmark(for: topic.id)
                                        onBookmarkToggled?(topic, !wasBookmarked)
                                    },
                                    onHide: {
                                        viewModel.hideTopic(topic.id)
                                    }
                                )
                            }
                        }
                        .padding(.horizontal, Theme.Spacing.screenPadding)
                    }
                }
            }

            // Recommended for you - horizontal scroll with topic cards
            if !viewModel.forYouEpisodes.isEmpty {
                VStack(alignment: .leading, spacing: 16) {
                    Text("Recommended for you")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(Theme.Colors.primaryText)
                        .padding(.horizontal, Theme.Spacing.screenPadding)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 16) {
                            ForEach(viewModel.forYouEpisodes.prefix(3)) { episode in
                                if let topic = viewModel.topics.first(where: { $0.id == episode.showId }) {
                                    let wasBookmarked = viewModel.isTopicBookmarked(topic.id)
                                    TopicCard(
                                        topic: topic,
                                        isLoading: isLoadingTopic(topic.id),
                                        isBookmarked: wasBookmarked,
                                        isPlaying: isPlayingTopic(topic.id),
                                        onTap: { onTopicTapped(topic) },
                                        onBookmarkToggle: {
                                            viewModel.toggleBookmark(for: topic.id)
                                            onBookmarkToggled?(topic, !wasBookmarked)
                                        },
                                        onHide: {
                                            viewModel.hideTopic(topic.id)
                                        }
                                    )
                                }
                            }
                        }
                        .padding(.horizontal, Theme.Spacing.screenPadding)
                    }
                }
            }

            // More for you - horizontal scroll with topic cards
            if viewModel.forYouEpisodes.count > 3 {
                VStack(alignment: .leading, spacing: 16) {
                    Text("More for you")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(Theme.Colors.primaryText)
                        .padding(.horizontal, Theme.Spacing.screenPadding)

                    ScrollView(.horizontal, showsIndicators: false) {
                        HStack(spacing: 16) {
                            ForEach(viewModel.forYouEpisodes.dropFirst(3)) { episode in
                                if let topic = viewModel.topics.first(where: { $0.id == episode.showId }) {
                                    let wasBookmarked = viewModel.isTopicBookmarked(topic.id)
                                    TopicCard(
                                        topic: topic,
                                        isLoading: isLoadingTopic(topic.id),
                                        isBookmarked: wasBookmarked,
                                        isPlaying: isPlayingTopic(topic.id),
                                        onTap: { onTopicTapped(topic) },
                                        onBookmarkToggle: {
                                            viewModel.toggleBookmark(for: topic.id)
                                            onBookmarkToggled?(topic, !wasBookmarked)
                                        },
                                        onHide: {
                                            viewModel.hideTopic(topic.id)
                                        }
                                    )
                                }
                            }
                        }
                        .padding(.horizontal, Theme.Spacing.screenPadding)
                    }
                }
            }
        }
        .padding(.top, 16)
    }

    private func isLoadingTopic(_ topicId: String) -> Bool {
        switch viewModel.topicPlaybackState {
        case .loading(let id), .generating(let id):
            return id == topicId
        default:
            return false
        }
    }

    private func isPlayingTopic(_ topicId: String) -> Bool {
        // Check if AudioService is currently playing this topic
        guard let currentEpisode = audioService.currentEpisode,
              audioService.isPlaying else {
            return false
        }
        return currentEpisode.showId == topicId
    }

    private func isPlayingDeepDive(_ deepDiveId: String) -> Bool {
        // Check if AudioService is currently playing this deep dive
        guard let currentEpisode = audioService.currentEpisode,
              audioService.isPlaying else {
            return false
        }
        return currentEpisode.id == deepDiveId
    }

    private func formatDate(_ date: Date) -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "MMM d"
        return formatter.string(from: date)
    }
}

// MARK: - Now Playing Indicator (Animated Equalizer)

struct NowPlayingIndicator: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<3) { index in
                RoundedRectangle(cornerRadius: 1)
                    .fill(Theme.Colors.accent)
                    .frame(width: 3, height: animating ? CGFloat.random(in: 8...16) : 4)
                    .animation(
                        Animation.easeInOut(duration: 0.4)
                            .repeatForever(autoreverses: true)
                            .delay(Double(index) * 0.1),
                        value: animating
                    )
            }
        }
        .onAppear {
            animating = true
        }
    }
}

// MARK: - Topic Card Component

struct TopicCard: View {
    let topic: Topic
    let isLoading: Bool
    var isBookmarked: Bool = false
    var isPlaying: Bool = false
    let onTap: () -> Void
    var onBookmarkToggle: (() -> Void)? = nil
    var onHide: (() -> Void)? = nil

    var body: some View {
        Button(action: onTap) {
            VStack(alignment: .leading, spacing: 8) {
                // Icon area with bookmark and menu overlay
                ZStack(alignment: .topTrailing) {
                    ZStack {
                        topic.swiftUIColor
                            .frame(width: 140, height: 100)
                            .cornerRadius(12)

                        if isLoading {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(1.2)
                        } else {
                            Image(systemName: topic.systemImage)
                                .font(.system(size: 32))
                                .foregroundColor(.white.opacity(0.9))
                        }
                    }

                    // Top right buttons overlay
                    HStack(spacing: 4) {
                        // Bookmark button
                        if let onBookmarkToggle = onBookmarkToggle {
                            Button(action: {
                                onBookmarkToggle()
                            }) {
                                Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(isBookmarked ? Theme.Colors.accent : .white)
                                    .padding(6)
                                    .background(.ultraThinMaterial)
                                    .cornerRadius(8)
                            }
                        }

                        // Menu button (three dots)
                        if let onHide = onHide {
                            Menu {
                                Button(role: .destructive, action: {
                                    onHide()
                                }) {
                                    Label("Hide", systemImage: "eye.slash")
                                }
                            } label: {
                                Image(systemName: "ellipsis")
                                    .font(.system(size: 14, weight: .medium))
                                    .foregroundColor(.white)
                                    .padding(6)
                                    .background(.ultraThinMaterial)
                                    .cornerRadius(8)
                            }
                        }
                    }
                    .padding(6)

                    // Now Playing indicator (bottom left)
                    if isPlaying {
                        VStack {
                            Spacer()
                            HStack {
                                HStack(spacing: 4) {
                                    NowPlayingIndicator()
                                    Text("Playing")
                                        .font(.system(size: 10, weight: .semibold))
                                        .foregroundColor(.white)
                                }
                                .padding(.horizontal, 8)
                                .padding(.vertical, 4)
                                .background(Theme.Colors.accent.opacity(0.9))
                                .cornerRadius(6)
                                .padding(6)
                                Spacer()
                            }
                        }
                        .frame(width: 140, height: 100)
                    }
                }

                // Title
                Text(topic.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(Theme.Colors.primaryText)
                    .lineLimit(1)

                // Duration
                Text("\(topic.targetDurationMinutes) min daily")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.Colors.secondaryText)
            }
            .frame(width: 140)
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(isLoading)
    }
}

// MARK: - Discover Tab Content

struct DiscoverTabContent: View {
    @Bindable var viewModel: HomeViewModel
    @Binding var searchText: String
    let onTopicTapped: (Topic) -> Void
    var onBookmarkToggled: ((Topic, Bool) -> Void)? = nil
    var onSuggestTopic: (() -> Void)? = nil

    // Observe AudioService for now playing indicator
    private let audioService = AudioService.shared

    // Filtered categories based on search text
    private var filteredCategories: [DiscoverCategory] {
        guard !searchText.isEmpty else { return viewModel.discoverCategories }
        let lowercasedSearch = searchText.lowercased()
        return viewModel.discoverCategories.compactMap { category in
            let filteredShows = category.shows.filter { show in
                show.title.lowercased().contains(lowercasedSearch) ||
                show.description.lowercased().contains(lowercasedSearch) ||
                category.title.lowercased().contains(lowercasedSearch)
            }
            guard !filteredShows.isEmpty else { return nil }
            return DiscoverCategory(title: category.title, shows: filteredShows)
        }
    }

    // Filtered topics based on search text
    private var filteredTopics: [Topic] {
        guard !searchText.isEmpty else { return viewModel.visibleTopics }
        let lowercasedSearch = searchText.lowercased()
        return viewModel.visibleTopics.filter { topic in
            topic.name.lowercased().contains(lowercasedSearch) ||
            topic.description.lowercased().contains(lowercasedSearch) ||
            topic.category.displayName.lowercased().contains(lowercasedSearch)
        }
    }

    var body: some View {
        VStack(spacing: 32) {
            // Search bar
            SearchBar(text: $searchText)
                .padding(.horizontal, Theme.Spacing.screenPadding)
                .padding(.top, 16)

            // Show "No results" if search returns empty
            if !searchText.isEmpty && filteredCategories.isEmpty && filteredTopics.isEmpty {
                VStack(spacing: 12) {
                    Image(systemName: "magnifyingglass")
                        .font(.system(size: 40))
                        .foregroundColor(Theme.Colors.secondaryText)
                    Text("No results for \"\(searchText)\"")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
                .frame(maxWidth: .infinity)
                .padding(.top, 40)
            } else {
                // Category rows with tappable shows
                ForEach(filteredCategories) { category in
                    CategoryRow(
                        title: category.title,
                        shows: category.shows,
                        onShowTap: { show in
                            // Find the topic and open detail view
                            if let topic = viewModel.topics.first(where: { $0.id == show.id }) {
                                onTopicTapped(topic)
                            }
                        },
                        isShowBookmarked: { show in
                            viewModel.isTopicBookmarked(show.id)
                        },
                        onBookmarkToggle: { show in
                            // Find the topic, toggle bookmark, and notify
                            if let topic = viewModel.topics.first(where: { $0.id == show.id }) {
                                let wasBookmarked = viewModel.isTopicBookmarked(topic.id)
                                viewModel.toggleBookmark(for: topic.id)
                                onBookmarkToggled?(topic, !wasBookmarked)
                            }
                        },
                        onHide: { show in
                            // Hide the topic
                            viewModel.hideTopic(show.id)
                        }
                    )
                }

                // All Topics section
                if !filteredTopics.isEmpty {
                    VStack(alignment: .leading, spacing: 16) {
                        Text(searchText.isEmpty ? "All Topics" : "Matching Topics")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(Theme.Colors.primaryText)
                            .padding(.horizontal, Theme.Spacing.screenPadding)

                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 16) {
                                ForEach(filteredTopics) { topic in
                                    let wasBookmarked = viewModel.isTopicBookmarked(topic.id)
                                    ShowCard(
                                        title: topic.name,
                                        description: topic.description,
                                        imageColor: topic.swiftUIColor,
                                        episodeInfo: "\(topic.targetDurationMinutes) min daily",
                                        size: .small,
                                        isBookmarked: wasBookmarked,
                                        onTap: { onTopicTapped(topic) },
                                        onBookmarkTap: {
                                            viewModel.toggleBookmark(for: topic.id)
                                            onBookmarkToggled?(topic, !wasBookmarked)
                                        },
                                        onHide: {
                                            viewModel.hideTopic(topic.id)
                                        }
                                    )
                                }
                            }
                            .padding(.horizontal, Theme.Spacing.screenPadding)
                        }
                    }
                }

                // Suggest a Topic button
                if let onSuggestTopic = onSuggestTopic {
                    Button(action: onSuggestTopic) {
                        HStack(spacing: 8) {
                            Image(systemName: "lightbulb")
                                .font(.system(size: 16, weight: .medium))
                            Text("Suggest a Topic")
                                .font(.system(size: 16, weight: .medium))
                        }
                        .foregroundColor(Theme.Colors.accent)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .overlay(
                            RoundedRectangle(cornerRadius: 12)
                                .stroke(Theme.Colors.accent.opacity(0.5), lineWidth: 1)
                        )
                    }
                    .padding(.horizontal, Theme.Spacing.screenPadding)
                }
            }
        }
    }

    private func isLoadingTopic(_ topicId: String) -> Bool {
        switch viewModel.topicPlaybackState {
        case .loading(let id), .generating(let id):
            return id == topicId
        default:
            return false
        }
    }

    private func isPlayingTopic(_ topicId: String) -> Bool {
        // Check if AudioService is currently playing this topic
        guard let currentEpisode = audioService.currentEpisode,
              audioService.isPlaying else {
            return false
        }
        return currentEpisode.showId == topicId
    }
}

// MARK: - Topic Grid Card for All Topics

struct TopicGridCard: View {
    let topic: Topic
    let isLoading: Bool
    var isBookmarked: Bool = false
    var isPlaying: Bool = false
    let onTap: () -> Void
    var onBookmarkToggle: (() -> Void)? = nil
    var onHide: (() -> Void)? = nil

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Icon with now playing indicator
                ZStack {
                    topic.swiftUIColor
                        .frame(width: 50, height: 50)
                        .cornerRadius(10)

                    if isLoading {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                    } else if isPlaying {
                        NowPlayingIndicator()
                    } else {
                        Image(systemName: topic.systemImage)
                            .font(.system(size: 20))
                            .foregroundColor(.white)
                    }
                }

                // Text
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(topic.name)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.Colors.primaryText)
                            .lineLimit(1)

                        if isPlaying {
                            Text("Playing")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(Theme.Colors.accent)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Theme.Colors.accent.opacity(0.2))
                                .cornerRadius(4)
                        }
                    }

                    Text("\(topic.targetDurationMinutes) min")
                        .font(.system(size: 12))
                        .foregroundColor(Theme.Colors.secondaryText)
                }

                Spacer()

                // Bookmark button
                if let onBookmarkToggle = onBookmarkToggle {
                    Button(action: {
                        onBookmarkToggle()
                    }) {
                        Image(systemName: isBookmarked ? "bookmark.fill" : "bookmark")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(isBookmarked ? Theme.Colors.accent : Theme.Colors.secondaryText)
                    }
                }

                // Menu button (three dots)
                if let onHide = onHide {
                    Menu {
                        Button(role: .destructive, action: {
                            onHide()
                        }) {
                            Label("Hide", systemImage: "eye.slash")
                        }
                    } label: {
                        Image(systemName: "ellipsis")
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(Theme.Colors.secondaryText)
                    }
                }

                // Chevron to indicate detail view
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.Colors.secondaryText)
            }
            .padding(12)
            .background(Theme.Colors.cardBackground)
            .cornerRadius(12)
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(isLoading)
    }
}

// MARK: - Bookmark Toast

struct BookmarkToast: View {
    let message: String

    var body: some View {
        HStack(spacing: 10) {
            Image(systemName: "bookmark.fill")
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Theme.Colors.accent)

            Text(message)
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Theme.Colors.primaryText)
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(
            Capsule()
                .fill(Theme.Colors.cardBackground)
                .shadow(color: .black.opacity(0.3), radius: 10, x: 0, y: 5)
        )
        .padding(.top, 60) // Below status bar / notch
    }
}

// MARK: - Suggest Topic Sheet

struct SuggestTopicSheet: View {
    @Bindable var viewModel: HomeViewModel
    let onSuccess: () -> Void

    @State private var topicName = ""
    @State private var description = ""
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 20) {
                Text("Tell us what you'd like to listen to and we'll consider adding it.")
                    .font(.system(size: 15))
                    .foregroundColor(Theme.Colors.secondaryText)

                VStack(alignment: .leading, spacing: 8) {
                    Text("Topic name")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.Colors.secondaryText)

                    TextField("e.g. Quantum Computing", text: $topicName)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 16))
                }

                VStack(alignment: .leading, spacing: 8) {
                    Text("Description (optional)")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.Colors.secondaryText)

                    TextField("What should this topic cover?", text: $description, axis: .vertical)
                        .textFieldStyle(.roundedBorder)
                        .font(.system(size: 16))
                        .lineLimit(2...4)
                }

                if let error = viewModel.suggestTopicError {
                    Text(error)
                        .font(.system(size: 14))
                        .foregroundColor(.red)
                }

                Button(action: {
                    Task {
                        await viewModel.suggestTopic(
                            topicName: topicName,
                            description: description.isEmpty ? nil : description
                        )
                    }
                }) {
                    HStack {
                        if viewModel.suggestTopicLoading {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(0.8)
                        }
                        Text(viewModel.suggestTopicLoading ? "Submitting..." : "Submit")
                            .font(.system(size: 16, weight: .semibold))
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(topicName.isEmpty ? Theme.Colors.accent.opacity(0.4) : Theme.Colors.accent)
                    .cornerRadius(12)
                }
                .disabled(topicName.isEmpty || viewModel.suggestTopicLoading)

                Spacer()
            }
            .padding(24)
            .background(Theme.Colors.background)
            .navigationTitle("Suggest a Topic")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                    .foregroundColor(Theme.Colors.accent)
                }
            }
        }
    }
}

#Preview {
    HomeView(viewModel: HomeViewModel())
}
