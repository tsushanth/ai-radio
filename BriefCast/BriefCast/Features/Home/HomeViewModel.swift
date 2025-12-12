//
//  HomeViewModel.swift
//  BriefCast
//
//  Home view model with podcast generation
//

import Foundation
import Observation

// Generation state for the daily brief
enum DailyBriefState: Equatable {
    case notLinked           // No account linked yet
    case ready               // Ready to generate
    case generating(Int)     // Generating with progress percentage
    case completed(String)   // Generation complete with audio URL
    case playing(String)     // Currently playing
    case error(String)       // Generation failed

    static func == (lhs: DailyBriefState, rhs: DailyBriefState) -> Bool {
        switch (lhs, rhs) {
        case (.notLinked, .notLinked): return true
        case (.ready, .ready): return true
        case (.generating(let a), .generating(let b)): return a == b
        case (.completed(let a), .completed(let b)): return a == b
        case (.playing(let a), .playing(let b)): return a == b
        case (.error(let a), .error(let b)): return a == b
        default: return false
        }
    }
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
    var discoverCategories: [DiscoverCategory] = []
    var isLoading: Bool = false

    // Daily brief state
    var dailyBriefState: DailyBriefState = .notLinked
    var hasLinkedAccount: Bool = false
    var showLinkAccountPrompt: Bool = false

    // Current episode for playback
    var currentEpisode: Episode?
    var currentAudioUrl: String?

    // Topic podcasts
    var topics: [Topic] = []
    var topicCategories: [Category] = []
    var selectedTopic: Topic?
    var topicPlaybackState: TopicPlaybackState = .idle

    // Preferences
    private let preferencesService = PreferencesService.shared

    // Computed properties for filtering
    var visibleTopics: [Topic] {
        topics.filter { !preferencesService.hiddenTopicIds.contains($0.id) }
    }

    var bookmarkedTopics: [Topic] {
        topics.filter { preferencesService.bookmarkedTopicIds.contains($0.id) }
    }

    func isTopicBookmarked(_ topicId: String) -> Bool {
        preferencesService.bookmarkedTopicIds.contains(topicId)
    }

    func isTopicHidden(_ topicId: String) -> Bool {
        preferencesService.hiddenTopicIds.contains(topicId)
    }

    func toggleBookmark(for topicId: String) {
        preferencesService.toggleBookmark(for: topicId)
    }

    func hideTopic(_ topicId: String) {
        preferencesService.hideTopic(topicId)
    }

    func unhideTopic(_ topicId: String) {
        preferencesService.unhideTopic(topicId)
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

    init() {
        setupPlaybackEndObserver()
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

    func removeObservers() {
        if let observer = playbackEndObserver {
            NotificationCenter.default.removeObserver(observer)
            playbackEndObserver = nil
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

        // Check if user has linked accounts
        await checkLinkedAccounts()

        isLoading = false
    }

    func loadTopics() async {
        do {
            let topicsData = try await topicService.fetchTopics()
            self.topics = topicsData.topics

            // Group topics by category for discover tab
            self.topicCategories = topicService.groupTopicsByCategory(topicsData.topics)

            // Update discover categories with real topics
            self.discoverCategories = topicCategories.map { category in
                DiscoverCategory(title: category.name, shows: category.shows)
            }

            // Create "For You" episodes from featured topics
            await loadForYouFromTopics()

            print("✅ Loaded \(topics.count) topics in \(topicCategories.count) categories")
        } catch {
            print("❌ Failed to load topics: \(error)")
            // Fall back to mock data if API fails
            loadMockData()
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

        if hasLinkedAccount {
            dailyBriefState = .ready
        } else {
            dailyBriefState = .notLinked
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
        }
    }

    func generateDailyBrief() async {
        guard hasLinkedAccount else {
            dailyBriefState = .notLinked
            showLinkAccountPrompt = true
            return
        }

        dailyBriefState = .generating(0)

        do {
            // Simulate progress updates
            dailyBriefState = .generating(10)

            // Create preferences from selected topics
            let preferences = UserPreferences(
                briefingTime: "07:00",
                topics: selectedTopics,
                voiceHost1: "nova",
                voiceHost2: "onyx",
                includeWeather: false,
                includeCalendar: true,
                includeEmail: true
            )

            dailyBriefState = .generating(20)

            // Use the linked account email (from OAuth) for podcast generation
            let linkedEmail = UserDefaults.standard.string(forKey: "linkedAccountEmail") ?? ""
            let emailToUse = linkedEmail.isEmpty ? userEmail : linkedEmail

            print("📧 Podcast generation - userEmail: \(userEmail), linkedEmail: \(linkedEmail), using: \(emailToUse)")

            // Call backend to generate podcast
            let response = try await podcastService.generatePodcast(
                for: emailToUse,
                preferences: preferences
            )

            dailyBriefState = .generating(90)

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

            // Add to for you episodes
            if !forYouEpisodes.contains(where: { $0.id == episode.id }) {
                forYouEpisodes.insert(episode, at: 0)
            }

            print("✅ Daily brief generated: \(episode.audioUrl ?? "no URL")")

        } catch {
            dailyBriefState = .error(error.localizedDescription)
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
    }

    func pauseDailyBrief() {
        print("⏸️ Pausing daily brief")
        AudioService.shared.pause()

        // Return to completed state so user can resume
        if let url = currentAudioUrl {
            dailyBriefState = .completed(url)
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

            // Check if episode is still generating
            if episode.status == .generating {
                topicPlaybackState = .generating(topic.id)
                print("⏳ Episode is generating, please wait...")
                return
            }

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

        // Discover categories
        discoverCategories = [
            DiscoverCategory(
                title: "News",
                shows: [
                    Show(id: "n1", title: "Daily News Brief", description: "Top headlines from around the world", category: "News", imageUrl: nil, imageColor: "#FF6B35", episodeCount: 125, isSubscribed: false, publisher: "News Network", rating: 4.5),
                    Show(id: "n2", title: "World Update", description: "International news and analysis", category: "News", imageUrl: nil, imageColor: "#E74C3C", episodeCount: 89, isSubscribed: false, publisher: "Global News", rating: 4.6),
                    Show(id: "n3", title: "The News Hour", description: "In-depth coverage of today's stories", category: "News", imageUrl: nil, imageColor: "#C0392B", episodeCount: 156, isSubscribed: false, publisher: "News Channel", rating: 4.7)
                ]
            ),
            DiscoverCategory(
                title: "Tech",
                shows: [
                    Show(id: "t1", title: "Tech News Daily", description: "Latest updates from Silicon Valley", category: "Technology", imageUrl: nil, imageColor: "#4A90E2", episodeCount: 342, isSubscribed: true, publisher: "TechCast", rating: 4.7),
                    Show(id: "t2", title: "Code & Coffee", description: "Programming tips and developer news", category: "Technology", imageUrl: nil, imageColor: "#3498DB", episodeCount: 78, isSubscribed: false, publisher: "DevTalks", rating: 4.8),
                    Show(id: "t3", title: "Gadget Review", description: "The newest tech products reviewed", category: "Technology", imageUrl: nil, imageColor: "#5DADE2", episodeCount: 94, isSubscribed: false, publisher: "Tech Reviews", rating: 4.6),
                    Show(id: "t4", title: "Startup Stories", description: "Behind the scenes of tech startups", category: "Technology", imageUrl: nil, imageColor: "#2E86C1", episodeCount: 67, isSubscribed: false, publisher: "Founder's Hub", rating: 4.5)
                ]
            ),
            DiscoverCategory(
                title: "AI",
                shows: [
                    Show(id: "ai1", title: "AI Insights", description: "Deep dive into artificial intelligence", category: "Technology", imageUrl: nil, imageColor: "#9B59B6", episodeCount: 45, isSubscribed: false, publisher: "AI Weekly", rating: 4.9),
                    Show(id: "ai2", title: "Machine Learning Weekly", description: "ML breakthroughs and applications", category: "Technology", imageUrl: nil, imageColor: "#8E44AD", episodeCount: 52, isSubscribed: false, publisher: "ML Institute", rating: 4.8),
                    Show(id: "ai3", title: "The AI Podcast", description: "Conversations with AI researchers", category: "Technology", imageUrl: nil, imageColor: "#A569BD", episodeCount: 38, isSubscribed: false, publisher: "AI Research", rating: 4.7)
                ]
            ),
            DiscoverCategory(
                title: "Companies",
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
