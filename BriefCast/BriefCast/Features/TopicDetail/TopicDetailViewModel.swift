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
            let episodeData = try await topicService.generateEpisode(
                topicId: topic.id,
                language: selectedLanguage.rawValue
            )
            currentEpisode = episodeData.episode

            if let seconds = episodeData.episode.durationSeconds {
                duration = TimeInterval(seconds)
            }

            // Refresh history
            try await loadEpisodeHistory()
        } catch {
            loadError = "Failed to generate episode: \(error.localizedDescription)"
        }

        isGenerating = false
    }

    // MARK: - Playback Controls

    func play() {
        guard let episode = currentEpisode,
              let audioUrlString = episode.audioUrl,
              URL(string: audioUrlString) != nil else { return }

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
        syncPlaybackState()
    }

    func pause() {
        audioService.pause()
        isPlaying = false
    }

    func togglePlayPause() {
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

        if let seconds = episode.durationSeconds {
            duration = TimeInterval(seconds)
        }

        syncPlaybackState()
    }

    // MARK: - Playback State Sync

    func syncPlaybackState() {
        // Only sync playing state if AudioService is playing THIS topic's episode
        if let currentAudioEpisode = audioService.currentEpisode,
           currentAudioEpisode.showId == topic.id {
            isPlaying = audioService.isPlaying
            currentTime = audioService.currentTime
            if audioService.duration > 0 {
                duration = audioService.duration
            }
        } else {
            // Different topic is playing (or nothing), show as not playing
            isPlaying = false
            currentTime = 0
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
