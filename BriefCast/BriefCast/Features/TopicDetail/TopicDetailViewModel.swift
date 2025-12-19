//
//  TopicDetailViewModel.swift
//  BriefCast
//
//  ViewModel for Topic Detail View - manages episode loading, playback, and preferences
//

import Foundation
import Observation

@Observable
@MainActor
class TopicDetailViewModel {
    // MARK: - Properties

    let topic: Topic

    // Episode state
    var currentEpisode: TopicEpisode?
    var episodeHistory: [TopicEpisode] = []

    // Language
    var selectedLanguage: SupportedLanguage

    // Loading states
    var isLoading: Bool = false
    var isGenerating: Bool = false
    var loadError: String?

    // Playback state (synced from AudioService)
    var isPlaying: Bool = false
    var currentTime: TimeInterval = 0
    var duration: TimeInterval = 0

    // Services
    private let topicService = TopicService.shared
    private let audioService = AudioService.shared
    private let preferencesService = PreferencesService.shared

    // Track the last known episode ID to detect changes
    private var lastKnownAudioEpisodeId: String?

    // MARK: - Computed Properties

    var isBookmarked: Bool {
        preferencesService.isTopicBookmarked(topic.id)
    }

    var hasEpisodeForCurrentLanguage: Bool {
        currentEpisode != nil && currentEpisode?.status == .completed
    }

    var canPlay: Bool {
        currentEpisode?.audioUrl != nil && currentEpisode?.status == .completed
    }

    var progressPercentage: Double {
        guard duration > 0 else { return 0 }
        return currentTime / duration
    }

    var formattedCurrentTime: String {
        formatTime(currentTime)
    }

    var formattedDuration: String {
        formatTime(duration)
    }

    // MARK: - Initialization

    init(topic: Topic) {
        self.topic = topic
        self.selectedLanguage = SupportedLanguage(from: preferencesService.preferredLanguage)
    }

    // MARK: - Data Loading

    func loadInitialData() async {
        isLoading = true
        loadError = nil

        do {
            // Load episode and history concurrently
            try await withThrowingTaskGroup(of: Void.self) { group in
                group.addTask { try await self.loadEpisode() }
                group.addTask { try await self.loadEpisodeHistory() }
                try await group.waitForAll()
            }
        } catch {
            loadError = error.localizedDescription
        }

        isLoading = false
    }

    func loadEpisode() async throws {
        let episodeData = try await topicService.getOrGenerateEpisode(
            topicId: topic.id,
            language: selectedLanguage.rawValue,
            forceRegenerate: false
        )
        currentEpisode = episodeData.episode

        // If episode is ready, set duration
        if let seconds = episodeData.episode.durationSeconds {
            duration = TimeInterval(seconds)
        }
    }

    func loadEpisodeHistory() async throws {
        let episodes = try await topicService.fetchEpisodeHistory(
            topicId: topic.id,
            language: selectedLanguage.rawValue,
            limit: 7
        )
        episodeHistory = episodes
    }

    // MARK: - Language Selection

    func setLanguage(_ language: SupportedLanguage) async {
        guard language != selectedLanguage else { return }

        // Stop current playback if playing
        if audioService.isPlaying {
            audioService.stop()
        }

        selectedLanguage = language
        currentEpisode = nil

        // Clear old episode history immediately (it's for the wrong language)
        episodeHistory = []

        // Reset playback state for new language
        currentTime = 0
        duration = 0
        isPlaying = false
        loadError = nil

        // First, quickly load the episode history for the new language
        // This shows previous episodes while we check/generate today's episode
        do {
            try await loadEpisodeHistory()
        } catch {
            // Non-fatal - just won't show history
            print("Failed to load episode history for \(language.displayName)")
        }

        // Now load/generate the current episode
        // Use isGenerating instead of isLoading so the history remains visible
        isGenerating = true

        do {
            try await loadEpisode()
        } catch {
            loadError = "Failed to load episode for \(language.displayName)"
        }

        isGenerating = false
    }

    // MARK: - Episode Generation

    func regenerateEpisode() async {
        print("🔄 regenerateEpisode() called for topic: \(topic.name)")

        // Stop current playback if playing
        if audioService.isPlaying {
            audioService.stop()
        }

        isGenerating = true
        loadError = nil

        // Reset playback state for new episode
        currentTime = 0
        isPlaying = false

        do {
            print("🔄 Calling topicService.generateEpisode with forceRegenerate...")
            let episodeData = try await topicService.generateEpisode(
                topicId: topic.id,
                language: selectedLanguage.rawValue
            )
            print("🔄 Episode generated successfully: \(episodeData.episode.title)")
            currentEpisode = episodeData.episode

            if let seconds = episodeData.episode.durationSeconds {
                duration = TimeInterval(seconds)
                print("🔄 Episode duration: \(seconds) seconds")
            }

            // Refresh history
            try await loadEpisodeHistory()
            print("🔄 Episode history refreshed")
        } catch {
            print("❌ Failed to regenerate episode: \(error)")
            loadError = "Failed to generate episode: \(error.localizedDescription)"
        }

        isGenerating = false
        print("🔄 regenerateEpisode() completed, isGenerating: \(isGenerating)")
    }

    // MARK: - Playback Controls

    func play() {
        print("🎵 TopicDetailViewModel.play() called")
        guard let episode = currentEpisode,
              let audioUrlString = episode.audioUrl,
              URL(string: audioUrlString) != nil else {
            print("🎵 TopicDetailViewModel.play() - no episode or audio URL")
            return
        }
        print("🎵 TopicDetailViewModel.play() - playing: \(episode.title)")

        // Convert TopicEpisode to Episode for AudioService
        let playableEpisode = Episode(
            id: episode.id,
            userId: "",
            title: episode.title,
            description: episode.description,
            audioUrl: audioUrlString,
            durationSeconds: episode.durationSeconds,
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

        audioService.play(episode: playableEpisode)
        isPlaying = true

        // Track the episode we're playing
        lastKnownAudioEpisodeId = episode.id

        syncPlaybackState()

        // Queue episode history for auto-play
        queueEpisodeHistory(excludingEpisodeId: episode.id)
    }

    func pause() {
        audioService.pause()
        isPlaying = false
    }

    func togglePlayPause() {
        print("🎵 TopicDetailViewModel.togglePlayPause() called, isPlaying: \(isPlaying)")
        if isPlaying {
            pause()
        } else {
            play()
        }
    }

    func seek(to time: TimeInterval) {
        audioService.seek(to: time)
        currentTime = time
    }

    func skipForward(by seconds: TimeInterval = 15) {
        let newTime = min(currentTime + seconds, duration)
        seek(to: newTime)
    }

    func skipBackward(by seconds: TimeInterval = 15) {
        let newTime = max(currentTime - seconds, 0)
        seek(to: newTime)
    }

    func playEpisode(_ episode: TopicEpisode) {
        guard let audioUrlString = episode.audioUrl else { return }

        let playableEpisode = Episode(
            id: episode.id,
            userId: "",
            title: episode.title,
            description: episode.description,
            audioUrl: audioUrlString,
            durationSeconds: episode.durationSeconds,
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

        audioService.play(episode: playableEpisode)
        currentEpisode = episode
        isPlaying = true

        // Track the episode we're playing
        lastKnownAudioEpisodeId = episode.id

        if let seconds = episode.durationSeconds {
            duration = TimeInterval(seconds)
        }

        syncPlaybackState()

        // Queue remaining episode history for auto-play
        queueEpisodeHistory(excludingEpisodeId: episode.id)
    }

    /// Queue episode history for auto-play (excluding the currently playing episode)
    private func queueEpisodeHistory(excludingEpisodeId: String) {
        print("🎵 queueEpisodeHistory called, episodeHistory count: \(episodeHistory.count)")

        // Clear existing queue first
        audioService.clearQueue()

        // Add all completed episodes from history to the queue
        for episode in episodeHistory {
            // Skip the currently playing episode
            if episode.id == excludingEpisodeId {
                print("🎵 Skipping current episode: \(episode.title)")
                continue
            }

            // Only add episodes that are completed with audio
            if episode.status == .completed, let audioUrl = episode.audioUrl {
                let queueEpisode = Episode(
                    id: episode.id,
                    userId: "",
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
                audioService.addToQueue(queueEpisode)
                print("🎵 Added to queue: \(episode.title)")
            } else {
                print("🎵 Skipping episode (not completed or no audio): \(episode.title), status: \(episode.status)")
            }
        }

        print("🎵 Queue now has \(audioService.queue.count) episodes")
    }

    // MARK: - Playback State Sync

    func syncPlaybackState() {
        // Only sync playing state if AudioService is playing THIS topic's episode
        if let currentAudioEpisode = audioService.currentEpisode,
           currentAudioEpisode.showId == topic.id {

            // Detect episode change (auto-play switched to next episode)
            let episodeChanged = lastKnownAudioEpisodeId != nil && lastKnownAudioEpisodeId != currentAudioEpisode.id

            if episodeChanged {
                print("🎵 Episode changed detected! From \(lastKnownAudioEpisodeId ?? "nil") to \(currentAudioEpisode.id)")

                // Reset playback state for the new episode
                currentTime = 0

                // Find the matching episode in history to update the UI
                if let matchingEpisode = episodeHistory.first(where: { $0.id == currentAudioEpisode.id }) {
                    currentEpisode = matchingEpisode
                    print("🎵 Updated currentEpisode to: \(matchingEpisode.title)")

                    // Update duration from the new episode
                    if let seconds = matchingEpisode.durationSeconds {
                        duration = TimeInterval(seconds)
                        print("🎵 Updated duration to: \(duration)")
                    }
                }
            }

            // Update tracking
            lastKnownAudioEpisodeId = currentAudioEpisode.id

            // Sync playback state
            isPlaying = audioService.isPlaying
            currentTime = audioService.currentTime

            // Only update duration from AudioService if it's valid
            if audioService.duration > 0 {
                duration = audioService.duration
            }

        } else {
            // Different topic is playing (or nothing), show as not playing
            isPlaying = false
            currentTime = 0
            lastKnownAudioEpisodeId = nil
        }
    }

    // MARK: - Bookmarking

    func toggleBookmark() {
        preferencesService.toggleBookmark(for: topic.id)
    }

    // MARK: - Hide Topic

    func hideTopic() {
        preferencesService.hideTopic(topic.id)
    }

    // MARK: - Helpers

    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}
