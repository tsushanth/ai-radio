//
//  TopicDetailView.swift
//  BriefCast
//
//  Detail view for a topic with player controls, episode history, and settings
//

import SwiftUI

struct TopicDetailView: View {
    let topic: Topic
    let onDismiss: () -> Void
    let onHide: () -> Void

    @State private var viewModel: TopicDetailViewModel
    @State private var showLanguagePicker: Bool = false
    @State private var playbackTimer: Timer?
    @State private var showBookmarkLimitPaywall = false

    init(topic: Topic, onDismiss: @escaping () -> Void, onHide: @escaping () -> Void) {
        self.topic = topic
        self.onDismiss = onDismiss
        self.onHide = onHide
        self._viewModel = State(initialValue: TopicDetailViewModel(topic: topic))
    }

    var body: some View {
        NavigationStack {
            ZStack {
                ScrollView {
                    VStack(spacing: 24) {
                        // Topic header with artwork
                        topicHeader

                        // Language selector
                        languageSelector

                        // Player controls based on episode state
                        if viewModel.isGenerating {
                            generatingView
                        } else if viewModel.hasEpisodeForCurrentLanguage {
                            TopicPlayerControls(
                                isPlaying: viewModel.isPlaying,
                                currentTime: viewModel.currentTime,
                                duration: viewModel.duration,
                                onPlayPause: { viewModel.togglePlayPause() },
                                onSeek: { viewModel.seek(to: $0) },
                                onSkipBackward: { viewModel.skipBackward() },
                                onSkipForward: { viewModel.skipForward() }
                            )
                        } else if viewModel.isLoading {
                            loadingView
                        } else if viewModel.currentEpisode?.status == .notGenerated {
                            episodeComingSoonView
                        } else if viewModel.currentEpisode?.status == .failed {
                            episodeFailedView
                        } else {
                            episodeComingSoonView
                        }

                        // Regenerate button (when episode exists and not generating)
                        if viewModel.hasEpisodeForCurrentLanguage && !viewModel.isGenerating {
                            regenerateButton
                        }

                        // Error message
                        if let error = viewModel.loadError {
                            errorView(error)
                        }

                        // Episode history
                        episodeHistorySection

                        Spacer(minLength: 100)
                    }
                    .padding(.top, 16)
                }

                // Ad companion overlay
                if viewModel.isPlayingAd, let ad = viewModel.currentAd {
                    AdCompanionView(
                        ad: ad,
                        timeRemaining: viewModel.adTimeRemaining,
                        onSkip: { viewModel.skipAd() },
                        onTap: { viewModel.handleAdTap() }
                    )
                }
            }
            .background(Theme.Colors.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(Theme.Colors.primaryText)
                    }
                }

                ToolbarItem(placement: .principal) {
                    Text(topic.name)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(Theme.Colors.primaryText)
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    HStack(spacing: 16) {
                        // Bookmark button
                        Button(action: { viewModel.toggleBookmark() }) {
                            Image(systemName: viewModel.isBookmarked ? "bookmark.fill" : "bookmark")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(viewModel.isBookmarked ? Theme.Colors.accent : Theme.Colors.primaryText)
                        }

                        // Settings menu
                        Menu {
                            Button(role: .destructive, action: {
                                viewModel.hideTopic()
                                onHide()
                                onDismiss()
                            }) {
                                Label("Hide Topic", systemImage: "eye.slash")
                            }
                        } label: {
                            Image(systemName: "ellipsis")
                                .font(.system(size: 16, weight: .medium))
                                .foregroundColor(Theme.Colors.primaryText)
                        }
                    }
                }
            }
        }
        .task {
            await viewModel.loadInitialData()
        }
        .onAppear {
            // Always keep timer running while view is visible to catch auto-play transitions
            startPlaybackTimer()
        }
        .onDisappear {
            stopPlaybackTimer()
        }
        .onChange(of: viewModel.selectedLanguage) { _, _ in
            // Sync playback state when language changes
            viewModel.syncPlaybackState()
        }
        .sheet(isPresented: $showLanguagePicker) {
            LanguagePickerSheet(
                selectedLanguage: viewModel.selectedLanguage,
                onSelect: { language in
                    Task {
                        await viewModel.setLanguage(language)
                    }
                    showLanguagePicker = false
                }
            )
            .presentationDetents([.medium])
        }
        .onReceive(NotificationCenter.default.publisher(for: .showBookmarkLimitPaywall)) { _ in
            showBookmarkLimitPaywall = true
        }
        .sheet(isPresented: $showBookmarkLimitPaywall) {
            RemotePaywallView(triggerSource: "bookmark_limit")
        }
    }

    // MARK: - Playback Timer

    private func startPlaybackTimer() {
        // Invalidate any existing timer first
        playbackTimer?.invalidate()

        // Create a timer that syncs playback state every 0.5 seconds
        playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [viewModel] _ in
            Task { @MainActor in
                viewModel.syncPlaybackState()
            }
        }
    }

    private func stopPlaybackTimer() {
        playbackTimer?.invalidate()
        playbackTimer = nil
    }

    // MARK: - Topic Header

    private var topicHeader: some View {
        VStack(spacing: 16) {
            // Topic icon with gradient background
            ZStack {
                RoundedRectangle(cornerRadius: 24)
                    .fill(
                        LinearGradient(
                            colors: [
                                topic.swiftUIColor.opacity(0.8),
                                topic.swiftUIColor.opacity(0.4)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 160, height: 160)

                Image(systemName: topic.systemImage)
                    .font(.system(size: 64, weight: .medium))
                    .foregroundColor(.white)
            }

            // Episode info
            if let episode = viewModel.currentEpisode {
                VStack(spacing: 4) {
                    Text(episode.title)
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Theme.Colors.primaryText)
                        .multilineTextAlignment(.center)

                    Text(episode.formattedDate)
                        .font(.system(size: 14))
                        .foregroundColor(Theme.Colors.secondaryText)

                    if episode.status == .completed, let duration = episode.durationSeconds {
                        Text("\(duration / 60) min")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(topic.swiftUIColor)
                    }
                }
            } else {
                Text(topic.description)
                    .font(.system(size: 14))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
            }
        }
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    // MARK: - Language Selector

    private var languageSelector: some View {
        Button(action: { showLanguagePicker = true }) {
            HStack(spacing: 8) {
                Text(viewModel.selectedLanguage.flagEmoji)
                    .font(.system(size: 20))

                Text(viewModel.selectedLanguage.displayName)
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(Theme.Colors.primaryText)

                Image(systemName: "chevron.down")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.Colors.secondaryText)
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 10)
            .background(Theme.Colors.cardBackground)
            .cornerRadius(20)
        }
    }

    // MARK: - Episode Coming Soon View

    private var episodeComingSoonView: some View {
        VStack(spacing: 12) {
            Image(systemName: "clock.badge.checkmark")
                .font(.system(size: 32))
                .foregroundColor(topic.swiftUIColor.opacity(0.7))

            Text("Today's episode is on its way")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(Theme.Colors.primaryText)

            Text("Episodes are auto-generated daily. Check back shortly!")
                .font(.system(size: 13))
                .foregroundColor(Theme.Colors.secondaryText)
                .multilineTextAlignment(.center)

            Button(action: {
                Task {
                    await viewModel.loadInitialData()
                }
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 13, weight: .medium))
                    Text("Refresh")
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundColor(topic.swiftUIColor)
                .padding(.horizontal, 16)
                .padding(.vertical, 8)
                .background(topic.swiftUIColor.opacity(0.1))
                .cornerRadius(16)
            }
            .padding(.top, 4)
        }
        .padding(.vertical, 24)
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    // MARK: - Episode Failed View

    private var episodeFailedView: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 32))
                .foregroundColor(.orange)

            Text("Episode generation failed")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(Theme.Colors.primaryText)

            if let error = viewModel.currentEpisode?.error {
                Text(error)
                    .font(.system(size: 13))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
            }

            Button(action: {
                Task {
                    await viewModel.regenerateEpisode()
                }
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 14, weight: .medium))
                    Text("Retry")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(.white)
                .padding(.horizontal, 24)
                .padding(.vertical, 10)
                .background(topic.swiftUIColor)
                .cornerRadius(20)
            }
            .padding(.top, 4)
        }
        .padding(.vertical, 24)
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    // MARK: - Regenerate Button

    private var regenerateButton: some View {
        VStack(spacing: 8) {
            Button(action: {
                Task {
                    await viewModel.regenerateEpisode()
                }
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 14, weight: .medium))

                    Text("Don't like this one? Regenerate")
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundColor(Theme.Colors.secondaryText)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Theme.Colors.cardBackground)
                .cornerRadius(20)
            }

            Text("Creates a fresh episode with the latest content")
                .font(.system(size: 12))
                .foregroundColor(Theme.Colors.secondaryText.opacity(0.7))
        }
        .padding(.top, 8)
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: Theme.Colors.accent))

            Text("Loading episode...")
                .font(.system(size: 14))
                .foregroundColor(Theme.Colors.secondaryText)
        }
        .padding(.vertical, 32)
    }

    // MARK: - Generating View

    private var generatingView: some View {
        VStack(spacing: 12) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: topic.swiftUIColor))
                .scaleEffect(1.2)

            Text("Generating your podcast...")
                .font(.system(size: 15, weight: .medium))
                .foregroundColor(Theme.Colors.primaryText)

            Text("This may take a minute")
                .font(.system(size: 13))
                .foregroundColor(Theme.Colors.secondaryText)
        }
        .padding(.vertical, 32)
    }

    // MARK: - Error View

    private func errorView(_ error: String) -> some View {
        VStack(spacing: 8) {
            Image(systemName: "exclamationmark.triangle")
                .font(.system(size: 24))
                .foregroundColor(.orange)

            Text(error)
                .font(.system(size: 13))
                .foregroundColor(Theme.Colors.secondaryText)
                .multilineTextAlignment(.center)
        }
        .padding()
        .background(Theme.Colors.cardBackground)
        .cornerRadius(12)
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    // MARK: - Episode History

    private var episodeHistorySection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Previous Episodes")
                .font(.system(size: 18, weight: .semibold))
                .foregroundColor(Theme.Colors.primaryText)
                .padding(.horizontal, Theme.Spacing.screenPadding)

            if viewModel.episodeHistory.isEmpty {
                Text("No previous episodes available")
                    .font(.system(size: 14))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .padding(.horizontal, Theme.Spacing.screenPadding)
                    .padding(.vertical, 16)
            } else {
                VStack(spacing: 8) {
                    ForEach(viewModel.episodeHistory) { episode in
                        EpisodeHistoryRow(
                            episode: episode,
                            topicColor: topic.swiftUIColor,
                            isCurrentlyPlaying: viewModel.currentEpisode?.id == episode.id && viewModel.isPlaying,
                            onTap: {
                                viewModel.playEpisode(episode)
                            }
                        )
                    }
                }
                .padding(.horizontal, Theme.Spacing.screenPadding)
            }
        }
    }
}

// MARK: - Language Picker Sheet

struct LanguagePickerSheet: View {
    let selectedLanguage: SupportedLanguage
    let onSelect: (SupportedLanguage) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(SupportedLanguage.allCases) { language in
                    Button(action: { onSelect(language) }) {
                        HStack {
                            Text(language.flagEmoji)
                                .font(.system(size: 24))

                            VStack(alignment: .leading, spacing: 2) {
                                Text(language.displayName)
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(Theme.Colors.primaryText)

                                Text(language.nativeName)
                                    .font(.system(size: 13))
                                    .foregroundColor(Theme.Colors.secondaryText)
                            }

                            Spacer()

                            if language == selectedLanguage {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(Theme.Colors.accent)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Select Language")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

#Preview {
    let previewTopic = Topic.preview

    TopicDetailView(
        topic: previewTopic,
        onDismiss: {},
        onHide: {}
    )
}

// MARK: - Preview Helper

extension Topic {
    static var preview: Topic {
        let json = """
        {
            "id": "ai-ml",
            "name": "AI & Machine Learning",
            "description": "Latest in artificial intelligence and ML breakthroughs",
            "icon": "brain.head.profile",
            "color": "#9B59B6",
            "category": "technology",
            "targetDurationMinutes": 5,
            "isActive": true
        }
        """.data(using: .utf8)!

        return try! JSONDecoder().decode(Topic.self, from: json)
    }
}
