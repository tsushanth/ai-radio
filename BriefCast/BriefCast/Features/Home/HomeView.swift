//
//  HomeView.swift
//  BriefCast
//
//  Home screen with For You and Discover tabs
//

import SwiftUI

struct HomeView: View {
    @EnvironmentObject var authService: AuthService
    @State private var viewModel = HomeViewModel()
    @State private var searchText = ""
    @State private var showLinkedAccounts = false
    @State private var selectedTopicForDetail: Topic?
    @State private var toastMessage: String?
    @State private var showToast = false

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
                        onPlayTapped: {
                            viewModel.playDailyBrief()
                        },
                        onPauseTapped: {
                            viewModel.pauseDailyBrief()
                        },
                        onLinkAccountTapped: {
                            showLinkedAccounts = true
                        }
                    )

                    // Tab selector
                    TabSelector(selectedTab: $viewModel.selectedTab, tabs: ["For You", "Discover"])
                        .padding(.top, 24)
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
        .overlay(alignment: .top) {
            if showToast, let message = toastMessage {
                BookmarkToast(message: message)
                    .transition(.move(edge: .top).combined(with: .opacity))
                    .zIndex(100)
            }
        }
        .animation(.spring(response: 0.3, dampingFraction: 0.8), value: showToast)
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

    // Observe AudioService for now playing indicator
    private let audioService = AudioService.shared

    var body: some View {
        VStack(spacing: 32) {
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

    // Observe AudioService for now playing indicator
    private let audioService = AudioService.shared

    var body: some View {
        VStack(spacing: 32) {
            // Search bar
            SearchBar(text: $searchText)
                .padding(.horizontal, Theme.Spacing.screenPadding)
                .padding(.top, 16)

            // Category rows with tappable shows
            ForEach(viewModel.discoverCategories) { category in
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
                    }
                )
            }

            // All Topics section
            if !viewModel.visibleTopics.isEmpty {
                VStack(alignment: .leading, spacing: 16) {
                    Text("All Topics")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(Theme.Colors.primaryText)
                        .padding(.horizontal, Theme.Spacing.screenPadding)

                    LazyVGrid(columns: [
                        GridItem(.flexible()),
                        GridItem(.flexible())
                    ], spacing: 16) {
                        ForEach(viewModel.visibleTopics) { topic in
                            let wasBookmarked = viewModel.isTopicBookmarked(topic.id)
                            TopicGridCard(
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

#Preview {
    HomeView()
}
