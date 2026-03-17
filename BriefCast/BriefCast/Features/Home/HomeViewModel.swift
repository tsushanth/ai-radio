//
//  HomeViewModel.swift
//  BriefCast
//
//  Home view model with podcast generation
//

import Foundation
import Observation
import Network

// Generation state for the daily brief
enum DailyBriefState: Equatable {
    case notLinked           // No account linked yet
    case ready               // Ready to generate
    case generating(Int)     // Generating with progress percentage
    case completed(String)   // Generation complete with audio URL
    case playing(String)     // Currently playing
    case error(String)       // Generation failed
    case needsRelink(String) // Token expired, needs to relink account
    case noContent(String)   // No emails/content to generate from

    static func == (lhs: DailyBriefState, rhs: DailyBriefState) -> Bool {
        switch (lhs, rhs) {
        case (.notLinked, .notLinked): return true
        case (.ready, .ready): return true
        case (.generating(let a), .generating(let b)): return a == b
        case (.completed(let a), .completed(let b)): return a == b
        case (.playing(let a), .playing(let b)): return a == b
        case (.error(let a), .error(let b)): return a == b
        case (.needsRelink(let a), .needsRelink(let b)): return a == b
        case (.noContent(let a), .noContent(let b)): return a == b
        default: return false
        }
    }
}

/// Cached episode data for persistence
struct CachedEpisode: Codable {
    let id: String
    let audioUrl: String
    let durationSeconds: Int
    let date: String  // YYYY-MM-DD format
    let generatedAt: Date
}

@Observable
@MainActor
class HomeViewModel {
    var selectedTab: Int = 0  // 0 = For You, 1 = Discover
    var userName: String = ""
    var userEmail: String = ""
    var dailyBriefDate: String = ""
    var keepListening: [Episode] = []
    var forYouEpisodes: [Episode] = []
    // discoverCategories is now computed - see below
    var isLoading: Bool = false

    // Daily brief state
    var dailyBriefState: DailyBriefState = .notLinked
    var hasLinkedAccount: Bool = false
    var showLinkAccountPrompt: Bool = false

    // Cached episode for today (to avoid regeneration)
    var hasCachedEpisodeForToday: Bool = false

    // Current episode for playback
    var currentEpisode: Episode?
    var currentAudioUrl: String?

    // Topic podcasts
    var topics: [Topic] = []
    var topicCategories: [Category] = []
    var selectedTopic: Topic?
    var topicPlaybackState: TopicPlaybackState = .idle

    // Deep Dive history
    var deepDiveHistory: [DeepDiveEpisode] = []
    private let deepDiveService = DeepDiveService.shared

    // Live Stations
    var liveStations: [LiveStation] = []
    private let liveStationService = LiveStationService.shared

    // Preferences - stored locally to trigger UI updates
    private let preferencesService = PreferencesService.shared
    var hiddenTopicIds: Set<String> = []
    var bookmarkedTopicIds: Set<String> = []

    // Computed properties for filtering (use local observable properties)
    var visibleTopics: [Topic] {
        topics.filter { !hiddenTopicIds.contains($0.id) }
    }

    var bookmarkedTopics: [Topic] {
        topics.filter { bookmarkedTopicIds.contains($0.id) && !hiddenTopicIds.contains($0.id) }
    }

    // Discover categories filtered by hidden topics
    var discoverCategories: [DiscoverCategory] {
        topicCategories.map { category in
            let visibleShows = category.shows.filter { !hiddenTopicIds.contains($0.id) }
            return DiscoverCategory(title: category.name, shows: visibleShows)
        }.filter { !$0.shows.isEmpty }  // Remove empty categories
    }

    func isTopicBookmarked(_ topicId: String) -> Bool {
        bookmarkedTopicIds.contains(topicId)
    }

    func isTopicHidden(_ topicId: String) -> Bool {
        hiddenTopicIds.contains(topicId)
    }

    func toggleBookmark(for topicId: String) {
        preferencesService.toggleBookmark(for: topicId)
        // Update local observable copy to trigger UI update
        bookmarkedTopicIds = preferencesService.bookmarkedTopicIds
    }

    func hideTopic(_ topicId: String) {
        preferencesService.hideTopic(topicId)
        // Update local observable copies to trigger UI update
        hiddenTopicIds = preferencesService.hiddenTopicIds
        bookmarkedTopicIds = preferencesService.bookmarkedTopicIds
    }

    func unhideTopic(_ topicId: String) {
        preferencesService.unhideTopic(topicId)
        // Update local observable copy to trigger UI update
        hiddenTopicIds = preferencesService.hiddenTopicIds
    }

    // User preferences (for topics) - loaded from UserDefaults
    var selectedTopics: [String] = {
        if let topics = UserDefaults.standard.stringArray(forKey: "selectedTopics"), !topics.isEmpty {
            return topics
        }
        return ["Technology", "AI", "Business", "News"]
    }()

    private let apiService = APIService.shared
    private let podcastService = PodcastService.shared
    private let topicService = TopicService.shared

    // Playback end observer
    private nonisolated(unsafe) var playbackEndObserver: NSObjectProtocol?
    // Onboarding generation observer
    private nonisolated(unsafe) var onboardingGenerationObserver: NSObjectProtocol?

    init() {
        // Check linked account status immediately from UserDefaults
        // This ensures correct initial state before loadData() is called
        let hasAccount = UserDefaults.standard.bool(forKey: "hasLinkedGoogleAccount")
        self.hasLinkedAccount = hasAccount

        // Load preferences for filtering
        self.hiddenTopicIds = preferencesService.hiddenTopicIds
        self.bookmarkedTopicIds = preferencesService.bookmarkedTopicIds

        // Load cached topics immediately for instant UI display
        if let cachedData = topicService.getCachedTopics() {
            self.topics = cachedData.topics
            self.topicCategories = topicService.groupTopicsByCategory(cachedData.topics)
            // discoverCategories is now a computed property that filters by hiddenTopicIds
            print("📦 Loaded \(cachedData.topics.count) cached topics for instant display")
        }

        // Check for cached episode for today
        if hasAccount, let cached = loadCachedEpisode(), cached.date == todayDateString() {
            // We have a cached episode for today - show as completed
            self.dailyBriefState = .completed(cached.audioUrl)
            self.currentAudioUrl = cached.audioUrl
            self.hasCachedEpisodeForToday = true

            // Reconstruct the episode object
            self.currentEpisode = Episode(
                id: cached.id,
                userId: "",
                title: "Your Morning Briefing",
                description: "Today's schedule, emails, and news summary",
                audioUrl: cached.audioUrl,
                durationSeconds: cached.durationSeconds,
                status: .completed,
                errorMessage: nil,
                generatedAt: cached.generatedAt,
                createdAt: cached.generatedAt,
                showId: "morning-brief",
                showName: "Morning Brief",
                imageColor: "#FF6B35",
                progress: 0,
                isCompleted: false,
                lastPlayedAt: nil
            )
            print("📦 Loaded cached episode for today: \(cached.id)")
        } else {
            self.dailyBriefState = hasAccount ? .ready : .notLinked
        }

        setupPlaybackEndObserver()
        setupOnboardingGenerationObserver()
    }

    // MARK: - Episode Caching

    private static let cachedEpisodeKey = "cachedDailyBriefEpisode"

    /// Get today's date as YYYY-MM-DD string
    private func todayDateString() -> String {
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        return formatter.string(from: Date())
    }

    /// Save episode to cache
    private func cacheEpisode(_ episode: CachedEpisode) {
        if let data = try? JSONEncoder().encode(episode) {
            UserDefaults.standard.set(data, forKey: Self.cachedEpisodeKey)
            hasCachedEpisodeForToday = true
            print("💾 Cached episode for \(episode.date)")
        }
    }

    /// Load cached episode
    private func loadCachedEpisode() -> CachedEpisode? {
        guard let data = UserDefaults.standard.data(forKey: Self.cachedEpisodeKey),
              let episode = try? JSONDecoder().decode(CachedEpisode.self, from: data) else {
            return nil
        }
        return episode
    }

    /// Clear cached episode (for regeneration)
    func clearCachedEpisode() {
        UserDefaults.standard.removeObject(forKey: Self.cachedEpisodeKey)
        hasCachedEpisodeForToday = false
        dailyBriefState = hasLinkedAccount ? .ready : .notLinked
        currentEpisode = nil
        currentAudioUrl = nil
        print("🗑️ Cleared cached episode")
    }

    /// Force regenerate today's episode
    func regenerateDailyBrief() async {
        clearCachedEpisode()
        await generateDailyBrief()
    }

    private func setupPlaybackEndObserver() {
        playbackEndObserver = NotificationCenter.default.addObserver(
            forName: .audioPlaybackDidEnd,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.handlePlaybackEnded()
            }
        }
    }

    private func setupOnboardingGenerationObserver() {
        onboardingGenerationObserver = NotificationCenter.default.addObserver(
            forName: .startDailyBriefGeneration,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                guard let self = self else { return }
                // Refresh linked account status from UserDefaults
                self.hasLinkedAccount = UserDefaults.standard.bool(forKey: "hasLinkedGoogleAccount")

                // Only generate if we have a linked account and don't already have today's episode
                if self.hasLinkedAccount && !self.hasCachedEpisodeForToday {
                    print("🚀 Received onboarding generation notification, starting Daily Brief generation")
                    await self.generateDailyBrief()
                }
            }
        }
    }

    func removeObservers() {
        if let observer = playbackEndObserver {
            NotificationCenter.default.removeObserver(observer)
            playbackEndObserver = nil
        }
        if let observer = onboardingGenerationObserver {
            NotificationCenter.default.removeObserver(observer)
            onboardingGenerationObserver = nil
        }
    }

    private func handlePlaybackEnded() {
        // Reset daily brief state to completed (ready to play again)
        if case .playing(let url) = dailyBriefState {
            dailyBriefState = .completed(url)
            print("🎵 Daily brief playback ended, state reset to completed")
        }

        // Reset topic playback state
        if case .playing(let episode) = topicPlaybackState {
            topicPlaybackState = .ready(episode)
            print("🎵 Topic playback ended, state reset to ready")
        }
    }

    // MARK: - Data Loading

    func loadData() async {
        isLoading = true

        // Update date
        let formatter = DateFormatter()
        formatter.dateFormat = "MMMM d, yyyy"
        dailyBriefDate = formatter.string(from: Date())

        // Load topics from API
        await loadTopics()

        // Load live stations
        await loadLiveStations()

        // Load deep dive history
        await loadDeepDiveHistory()

        // Check if user has linked accounts
        await checkLinkedAccounts()

        isLoading = false
    }

    // MARK: - Live Stations

    func loadLiveStations() async {
        // Load cached immediately
        liveStations = liveStationService.getCachedStations()

        do {
            let stations = try await liveStationService.fetchStations()
            liveStations = stations
            print("✅ Loaded \(stations.count) live stations")
        } catch {
            print("⚠️ Failed to load live stations: \(error.localizedDescription)")
        }
    }

    // MARK: - Deep Dive History

    func loadDeepDiveHistory() async {
        // Load cached immediately
        deepDiveHistory = deepDiveService.getCachedDeepDives()

        do {
            // Fetch fresh from server
            let history = try await deepDiveService.fetchHistory(limit: 10)
            deepDiveHistory = history
            print("✅ Loaded \(history.count) deep dives")
        } catch {
            print("⚠️ Failed to load deep dive history: \(error.localizedDescription)")
            // Keep cached data if available
        }
    }

    func loadTopics() async {
        do {
            // Fetch from server (will update cache automatically)
            // Topics are already loaded from cache in init, so this updates in background
            let topicsData = try await topicService.fetchTopics()

            // Only update UI if data changed (server takes precedence)
            let newTopicIds = Set(topicsData.topics.map { $0.id })
            let currentTopicIds = Set(self.topics.map { $0.id })

            // Update if topics changed or if we had no cached data
            if newTopicIds != currentTopicIds || self.topics.isEmpty {
                self.topics = topicsData.topics

                // Group topics by category for discover tab
                self.topicCategories = topicService.groupTopicsByCategory(topicsData.topics)
                // discoverCategories is now a computed property that filters by hiddenTopicIds

                print("✅ Updated topics from server: \(topics.count) topics")
            } else {
                print("✅ Topics unchanged from server")
            }

            // Create "For You" episodes from featured topics
            await loadForYouFromTopics()

        } catch {
            print("❌ Failed to load topics from server: \(error)")
            // If we already have cached topics loaded in init, we're fine
            // Only fall back to mock data if we have nothing
            if self.topics.isEmpty {
                loadMockData()
            }
        }
    }

    private func loadForYouFromTopics() async {
        // Get recommended topics based on user preferences
        let recommendedTopics = topics.filter { topic in
            selectedTopics.contains { pref in
                topic.name.lowercased().contains(pref.lowercased()) ||
                topic.category.displayName.lowercased().contains(pref.lowercased())
            }
        }.prefix(4)

        // Convert topics to episodes for "For You" display
        forYouEpisodes = Array(recommendedTopics).map { topic in
            Episode(
                id: "topic-\(topic.id)",
                userId: userEmail,
                title: topic.name,
                description: topic.description,
                audioUrl: nil,
                durationSeconds: topic.targetDurationMinutes * 60,
                status: .pending,
                errorMessage: nil,
                generatedAt: Date(),
                createdAt: Date(),
                showId: topic.id,
                showName: topic.category.displayName,
                imageColor: topic.color,
                progress: 0,
                isCompleted: false,
                lastPlayedAt: nil
            )
        }
    }

    func setUser(name: String, email: String) {
        userName = name
        userEmail = email
    }

    func checkLinkedAccounts() async {
        // Check UserDefaults for linked account status
        let hasAccount = UserDefaults.standard.bool(forKey: "hasLinkedGoogleAccount")

        hasLinkedAccount = hasAccount

        // Only update state if not currently in an active state (generating, playing, etc.)
        // This preserves progress when navigating away and back
        switch dailyBriefState {
        case .generating, .playing, .completed:
            // Keep current state - don't reset during active operations
            break
        default:
            if hasLinkedAccount {
                dailyBriefState = .ready
            } else {
                dailyBriefState = .notLinked
            }
        }
    }

    func setLinkedAccount(_ linked: Bool) {
        hasLinkedAccount = linked
        UserDefaults.standard.set(linked, forKey: "hasLinkedGoogleAccount")

        if linked {
            dailyBriefState = .ready
        } else {
            dailyBriefState = .notLinked
        }
    }

    // MARK: - Daily Brief Generation

    func playDailyBrief() {
        switch dailyBriefState {
        case .notLinked:
            // Show link account prompt
            showLinkAccountPrompt = true

        case .ready, .error:
            // Generate new brief
            Task {
                await generateDailyBrief()
            }

        case .generating:
            // Already generating, do nothing
            print("Already generating...")

        case .completed(let audioUrl):
            // Play the episode
            playAudio(url: audioUrl)

        case .playing:
            // Already playing
            print("Already playing...")

        case .needsRelink:
            // Show link account prompt to relink
            showLinkAccountPrompt = true

        case .noContent:
            // User tapped when there's no content - try generating again
            Task {
                await generateDailyBrief()
            }
        }
    }

    func generateDailyBrief() async {
        guard hasLinkedAccount else {
            dailyBriefState = .notLinked
            showLinkAccountPrompt = true
            return
        }

        // Check network connectivity
        guard await isNetworkAvailable() else {
            dailyBriefState = .error("No internet connection. Please check your network and try again.")
            return
        }

        dailyBriefState = .generating(0)

        // Get user's preferred language from settings
        let language = preferencesService.preferredLanguage
        print("🌐 Daily Brief generation with language: \(language)")

        // Check if user wants topic updates included
        let includeTopicTeasers = UserDefaults.standard.object(forKey: "includeTopicUpdates") as? Bool ?? true

        // Create preferences from selected topics
        let preferences = UserPreferences(
            briefingTime: "07:00",
            topics: selectedTopics,
            voiceHost1: "nova",
            voiceHost2: "onyx",
            includeWeather: false,
            includeCalendar: true,
            includeEmail: true,
            language: language,
            includeTopicTeasers: includeTopicTeasers
        )

        // Use the linked account email (from OAuth) for podcast generation
        let linkedEmail = UserDefaults.standard.string(forKey: "linkedAccountEmail") ?? ""
        let emailToUse = linkedEmail.isEmpty ? userEmail : linkedEmail

        print("📧 Podcast generation - userEmail: \(userEmail), linkedEmail: \(linkedEmail), using: \(emailToUse)")

        do {
            // Use async generation with polling - gets real-time progress from backend
            let response = try await podcastService.generatePodcastAsync(
                for: emailToUse,
                preferences: preferences
            ) { [weak self] progress, message in
                // Update UI with real progress from backend
                Task { @MainActor in
                    self?.dailyBriefState = .generating(progress)
                    print("📊 Progress: \(progress)% - \(message)")
                }
            }

            // Create episode from response
            let episode = Episode(
                id: response.episode.id,
                userId: userEmail,
                title: "Your Morning Briefing",
                description: "Today's schedule, emails, and news summary for \(dailyBriefDate)",
                audioUrl: response.episode.audioUrl,
                durationSeconds: response.episode.durationSeconds,
                status: .completed,
                errorMessage: nil,
                generatedAt: Date(),
                createdAt: Date(),
                showId: "morning-brief",
                showName: "Morning Brief",
                imageColor: "#FF6B35",
                progress: 0,
                isCompleted: false,
                lastPlayedAt: nil
            )

            currentEpisode = episode
            currentAudioUrl = response.episode.audioUrl
            dailyBriefState = .completed(response.episode.audioUrl)

            // Cache the episode for today to avoid regeneration
            let cachedEpisode = CachedEpisode(
                id: response.episode.id,
                audioUrl: response.episode.audioUrl,
                durationSeconds: response.episode.durationSeconds,
                date: todayDateString(),
                generatedAt: Date()
            )
            cacheEpisode(cachedEpisode)

            // Add to for you episodes
            if !forYouEpisodes.contains(where: { $0.id == episode.id }) {
                forYouEpisodes.insert(episode, at: 0)
            }

            print("✅ Daily brief generated and cached: \(episode.audioUrl ?? "no URL")")

        } catch let apiError as PodcastAPIError {
            // Handle structured API errors
            if apiError.isAuthError || apiError.requiresRelink {
                // Token expired or needs relink - prompt user to reconnect
                dailyBriefState = .needsRelink(apiError.message)
                print("🔐 Auth error, needs relink: \(apiError.message)")
            } else if apiError.isContentError {
                // No emails or content - show friendly message
                dailyBriefState = .noContent(apiError.message)
                print("📭 No content: \(apiError.message)")
            } else if apiError.retryable {
                // Retryable error - show error with option to retry
                dailyBriefState = .error(apiError.message)
                print("⚠️ Retryable error: \(apiError.message)")
            } else {
                // Non-retryable error
                dailyBriefState = .error(apiError.message)
                print("❌ Error: \(apiError.message)")
            }
        } catch {
            // Provide a more user-friendly error message for timeouts
            let errorMessage: String
            if (error as NSError).code == NSURLErrorTimedOut {
                errorMessage = "Generation is taking longer than expected. Please try again."
            } else {
                errorMessage = error.localizedDescription
            }

            dailyBriefState = .error(errorMessage)
            print("❌ Failed to generate daily brief: \(error)")
        }
    }

    func playAudio(url: String) {
        guard let episode = currentEpisode else {
            print("❌ No episode to play")
            return
        }

        dailyBriefState = .playing(url)
        currentAudioUrl = url
        print("▶️ Playing audio: \(url)")

        // Use shared AudioService for actual playback
        AudioService.shared.play(episode: episode)

        // Queue up other available episodes for auto-play
        let availableEpisodes = forYouEpisodes.filter { $0.id != episode.id && $0.isAvailable }
        AudioService.shared.setQueue(availableEpisodes)
    }

    func pauseDailyBrief() {
        print("⏸️ Pausing daily brief")
        AudioService.shared.pause()

        // Return to completed state so user can resume
        if let url = currentAudioUrl {
            dailyBriefState = .completed(url)
        }
    }

    func cancelGeneration() {
        print("❌ Cancelling generation")
        // Reset to ready state so user can try again
        dailyBriefState = hasLinkedAccount ? .ready : .notLinked
    }

    // MARK: - Network Connectivity

    /// Check if network is available using NWPathMonitor
    nonisolated private func isNetworkAvailable() async -> Bool {
        await withCheckedContinuation { continuation in
            let monitor = NWPathMonitor()
            let queue = DispatchQueue(label: "NetworkMonitor")
            var hasResumed = false
            let lock = NSLock()

            monitor.pathUpdateHandler = { path in
                lock.lock()
                guard !hasResumed else {
                    lock.unlock()
                    return
                }
                hasResumed = true
                lock.unlock()

                monitor.cancel()
                continuation.resume(returning: path.status == .satisfied)
            }

            monitor.start(queue: queue)

            // Timeout after 3 seconds to avoid hanging
            queue.asyncAfter(deadline: .now() + 3) {
                lock.lock()
                guard !hasResumed else {
                    lock.unlock()
                    return
                }
                hasResumed = true
                lock.unlock()

                monitor.cancel()
                continuation.resume(returning: false)
            }
        }
    }

    // MARK: - Topic Podcast Playback

    /// Play a topic podcast - fetches or generates episode on demand
    func playTopicPodcast(_ topic: Topic) async {
        selectedTopic = topic
        topicPlaybackState = .loading(topic.id)

        do {
            print("🎙️ Fetching episode for topic: \(topic.name)")
            let response = try await topicService.getOrGenerateEpisode(topicId: topic.id)

            let episode = response.episode

            // Check if episode failed
            if episode.status == .failed {
                topicPlaybackState = .error(episode.error ?? "Generation failed")
                return
            }

            // Episode is ready - create Episode model for AudioService
            guard let audioUrl = episode.audioUrl else {
                topicPlaybackState = .error("No audio URL available")
                return
            }

            let playableEpisode = Episode(
                id: episode.id,
                userId: userEmail,
                title: episode.title,
                description: episode.description,
                audioUrl: audioUrl,
                durationSeconds: episode.durationSeconds ?? topic.targetDurationMinutes * 60,
                status: .completed,
                errorMessage: nil,
                generatedAt: Date(),
                createdAt: Date(),
                showId: topic.id,
                showName: topic.name,
                imageColor: topic.color,
                progress: 0,
                isCompleted: false,
                lastPlayedAt: nil
            )

            currentEpisode = playableEpisode
            currentAudioUrl = audioUrl
            topicPlaybackState = .playing(episode)

            // Play the audio
            AudioService.shared.play(episode: playableEpisode)

            print("✅ Playing topic episode: \(episode.title)")

            // Queue up episode history for auto-play (pass topic directly)
            print("🎵 Starting queue fetch for topic: \(topic.name)")
            await queueRelatedTopicEpisodes(currentTopic: topic)

        } catch {
            topicPlaybackState = .error(error.localizedDescription)
            print("❌ Failed to play topic podcast: \(error)")
        }
    }

    /// Play a show/topic from the Discover tab
    func playShow(_ show: Show) {
        // Find the topic that corresponds to this show
        if let topic = topics.first(where: { $0.id == show.id }) {
            Task {
                await playTopicPodcast(topic)
            }
        } else {
            print("❌ No topic found for show: \(show.id)")
        }
    }

    /// Pause topic playback
    func pauseTopicPlayback() {
        AudioService.shared.pause()

        if case .playing(let episode) = topicPlaybackState {
            topicPlaybackState = .ready(episode)
        }
    }

    /// Queue episode history for the current topic (previous days' episodes)
    private func queueRelatedTopicEpisodes(currentTopic: Topic) async {
        print("🎵 Fetching episode history for \(currentTopic.name)...")

        do {
            // Fetch previous episodes for this topic (last 7 days)
            let episodes = try await topicService.fetchEpisodeHistory(
                topicId: currentTopic.id,
                limit: 7
            )

            print("🎵 Found \(episodes.count) episodes in history")

            // Get the current episode ID to exclude it
            let currentEpisodeId = AudioService.shared.currentEpisode?.id

            // Add completed episodes to queue (excluding current one)
            for episode in episodes {
                print("🎵 Episode: \(episode.title), status: \(episode.status), audioUrl: \(episode.audioUrl ?? "nil")")

                // Skip the currently playing episode
                if episode.id == currentEpisodeId {
                    print("🎵 Skipping current episode: \(episode.title)")
                    continue
                }

                // Only add episodes that are completed with audio
                if episode.status == .completed, let audioUrl = episode.audioUrl {
                    let queueEpisode = Episode(
                        id: episode.id,
                        userId: userEmail,
                        title: episode.title,
                        description: episode.description,
                        audioUrl: audioUrl,
                        durationSeconds: episode.durationSeconds ?? currentTopic.targetDurationMinutes * 60,
                        status: .completed,
                        errorMessage: nil,
                        generatedAt: Date(),
                        createdAt: Date(),
                        showId: currentTopic.id,
                        showName: currentTopic.name,
                        imageColor: currentTopic.color,
                        progress: 0,
                        isCompleted: false,
                        lastPlayedAt: nil
                    )
                    AudioService.shared.addToQueue(queueEpisode)
                    print("🎵 Added to queue: \(episode.title)")
                }
            }
        } catch {
            print("⚠️ Could not fetch episode history for \(currentTopic.name): \(error.localizedDescription)")
        }

        print("🎵 Queue now has \(AudioService.shared.queue.count) episodes")
    }

    // MARK: - Mock Data

    private func loadMockData() {
        // Keep listening episodes (partially played)
        keepListening = [
            Episode(
                id: "1",
                userId: "user-1",
                title: "Tech News Roundup",
                description: "Latest updates from the tech world including AI breakthroughs",
                audioUrl: "https://example.com/audio1.mp3",
                durationSeconds: 420,
                status: .completed,
                errorMessage: nil,
                generatedAt: Date().addingTimeInterval(-3600),
                createdAt: Date().addingTimeInterval(-3600),
                showId: "tech-roundup",
                showName: "Tech Roundup",
                imageColor: "#4A90E2",
                progress: 180,
                isCompleted: false,
                lastPlayedAt: Date().addingTimeInterval(-3600)
            ),
            Episode(
                id: "2",
                userId: "user-1",
                title: "Business Insights",
                description: "Market trends and startup news you need to know",
                audioUrl: "https://example.com/audio2.mp3",
                durationSeconds: 360,
                status: .completed,
                errorMessage: nil,
                generatedAt: Date().addingTimeInterval(-7200),
                createdAt: Date().addingTimeInterval(-7200),
                showId: "business-insights",
                showName: "Business Insights",
                imageColor: "#50C878",
                progress: 120,
                isCompleted: false,
                lastPlayedAt: Date().addingTimeInterval(-7200)
            )
        ]

        // For You recommendations
        forYouEpisodes = [
            Episode(
                id: "3",
                userId: "user-1",
                title: "Your Morning Briefing",
                description: "Today's schedule, emails, and news summary for \(dailyBriefDate)",
                audioUrl: "https://example.com/audio3.mp3",
                durationSeconds: 300,
                status: .completed,
                errorMessage: nil,
                generatedAt: Date(),
                createdAt: Date(),
                showId: "morning-brief",
                showName: "Morning Brief",
                imageColor: "#FF6B35",
                progress: 0,
                isCompleted: false,
                lastPlayedAt: nil
            ),
            Episode(
                id: "4",
                userId: "user-1",
                title: "AI Weekly Digest",
                description: "The most important AI developments this week",
                audioUrl: "https://example.com/audio4.mp3",
                durationSeconds: 540,
                status: .completed,
                errorMessage: nil,
                generatedAt: Date().addingTimeInterval(-86400),
                createdAt: Date().addingTimeInterval(-86400),
                showId: "ai-weekly",
                showName: "AI Weekly",
                imageColor: "#9B59B6",
                progress: 0,
                isCompleted: false,
                lastPlayedAt: nil
            )
        ]

        // Set topicCategories for discover tab (discoverCategories is computed from this)
        topicCategories = [
            Category(
                id: "news",
                name: "News",
                icon: "newspaper",
                color: "#FF6B35",
                shows: [
                    Show(id: "n1", title: "Daily News Brief", description: "Top headlines from around the world", category: "News", imageUrl: nil, imageColor: "#FF6B35", episodeCount: 125, isSubscribed: false, publisher: "News Network", rating: 4.5),
                    Show(id: "n2", title: "World Update", description: "International news and analysis", category: "News", imageUrl: nil, imageColor: "#E74C3C", episodeCount: 89, isSubscribed: false, publisher: "Global News", rating: 4.6),
                    Show(id: "n3", title: "The News Hour", description: "In-depth coverage of today's stories", category: "News", imageUrl: nil, imageColor: "#C0392B", episodeCount: 156, isSubscribed: false, publisher: "News Channel", rating: 4.7)
                ]
            ),
            Category(
                id: "tech",
                name: "Tech",
                icon: "laptopcomputer",
                color: "#4A90E2",
                shows: [
                    Show(id: "t1", title: "Tech News Daily", description: "Latest updates from Silicon Valley", category: "Technology", imageUrl: nil, imageColor: "#4A90E2", episodeCount: 342, isSubscribed: true, publisher: "TechCast", rating: 4.7),
                    Show(id: "t2", title: "Code & Coffee", description: "Programming tips and developer news", category: "Technology", imageUrl: nil, imageColor: "#3498DB", episodeCount: 78, isSubscribed: false, publisher: "DevTalks", rating: 4.8),
                    Show(id: "t3", title: "Gadget Review", description: "The newest tech products reviewed", category: "Technology", imageUrl: nil, imageColor: "#5DADE2", episodeCount: 94, isSubscribed: false, publisher: "Tech Reviews", rating: 4.6),
                    Show(id: "t4", title: "Startup Stories", description: "Behind the scenes of tech startups", category: "Technology", imageUrl: nil, imageColor: "#2E86C1", episodeCount: 67, isSubscribed: false, publisher: "Founder's Hub", rating: 4.5)
                ]
            ),
            Category(
                id: "ai",
                name: "AI",
                icon: "cpu",
                color: "#9B59B6",
                shows: [
                    Show(id: "ai1", title: "AI Insights", description: "Deep dive into artificial intelligence", category: "Technology", imageUrl: nil, imageColor: "#9B59B6", episodeCount: 45, isSubscribed: false, publisher: "AI Weekly", rating: 4.9),
                    Show(id: "ai2", title: "Machine Learning Weekly", description: "ML breakthroughs and applications", category: "Technology", imageUrl: nil, imageColor: "#8E44AD", episodeCount: 52, isSubscribed: false, publisher: "ML Institute", rating: 4.8),
                    Show(id: "ai3", title: "The AI Podcast", description: "Conversations with AI researchers", category: "Technology", imageUrl: nil, imageColor: "#A569BD", episodeCount: 38, isSubscribed: false, publisher: "AI Research", rating: 4.7)
                ]
            ),
            Category(
                id: "business",
                name: "Companies",
                icon: "building.columns",
                color: "#50C878",
                shows: [
                    Show(id: "c1", title: "Business Brief", description: "Market insights and company news", category: "Business", imageUrl: nil, imageColor: "#50C878", episodeCount: 201, isSubscribed: false, publisher: "Market Watch", rating: 4.6),
                    Show(id: "c2", title: "Earnings Call Recap", description: "Key takeaways from quarterly reports", category: "Business", imageUrl: nil, imageColor: "#27AE60", episodeCount: 112, isSubscribed: false, publisher: "Finance Daily", rating: 4.5),
                    Show(id: "c3", title: "Corporate Chronicles", description: "Inside stories from major companies", category: "Business", imageUrl: nil, imageColor: "#58D68D", episodeCount: 87, isSubscribed: false, publisher: "Business Insider", rating: 4.7)
                ]
            )
        ]
    }
}

// MARK: - Supporting Types

struct DiscoverCategory: Identifiable {
    let id = UUID()
    let title: String
    let shows: [Show]
}
