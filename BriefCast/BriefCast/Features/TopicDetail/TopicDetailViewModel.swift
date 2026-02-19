//
//  TopicDetailViewModel.swift
//  BriefCast
//
//  ViewModel for Topic Detail View - manages episode loading, playback, ads, and preferences
//

import Foundation
import Observation
import AVFoundation
#if canImport(UIKit)
import UIKit
#endif

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

    // Ad state
    var ads: [AdSegment] = []
    var isPlayingAd: Bool = false
    var currentAd: AdSegment?
    var adTimeRemaining: TimeInterval = 0

    // Services
    private let topicService = TopicService.shared
    private let audioService = AudioService.shared
    private let preferencesService = PreferencesService.shared
    private let imaAdManager = IMAAdManager.shared

    // Track the last known episode ID to detect changes
    private var lastKnownAudioEpisodeId: String?

    // Ad playback internals
    private var adPlayer: AVPlayer?
    private var adTimeObserver: Any?
    private var adInsertionPoints: [TimeInterval] = []
    private var nextAdIndex: Int = 0
    private var adEndObserver: Any?

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

        // Auto-play the episode once loaded
        if canPlay {
            play()
        }
    }

    func loadEpisode() async throws {
        let episodeData = try await topicService.getOrGenerateEpisode(
            topicId: topic.id,
            language: selectedLanguage.rawValue,
            forceRegenerate: false
        )
        currentEpisode = episodeData.episode

        let isSubscriber = preferencesService.isSubscribed

        // Subscribers get no ads
        if isSubscriber {
            ads = []
        } else {
            // Store custom ads from backend
            ads = episodeData.ads ?? []

            // IMA fallback disabled — test VAST tag was causing issues in production.
            // Re-enable once a production Google Ad Manager tag is configured.
            if !ads.isEmpty {
                print("📢 Loaded \(ads.count) custom ad(s) for episode")
            }
        }

        // Calculate ad insertion points from segment timings
        calculateAdInsertionPoints()

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

    // MARK: - Ad Insertion Points

    /// Calculate where to insert ads based on segment timings or episode duration
    private func calculateAdInsertionPoints() {
        adInsertionPoints = []
        nextAdIndex = 0

        guard !ads.isEmpty else { return }

        if let timings = currentEpisode?.segmentTimings, timings.count >= 3 {
            // Use segment boundaries for natural break points
            let totalDuration = timings.last?.endTime ?? 0
            guard totalDuration > 30 else { return }

            if ads.count >= 2 {
                // Two ads: insert at ~33% and ~66%
                let oneThird = totalDuration / 3.0
                let twoThirds = totalDuration * 2.0 / 3.0
                adInsertionPoints.append(findNearestBreak(near: oneThird, timings: timings))
                adInsertionPoints.append(findNearestBreak(near: twoThirds, timings: timings))
            } else {
                // One ad: insert at midpoint
                let mid = totalDuration / 2.0
                adInsertionPoints.append(findNearestBreak(near: mid, timings: timings))
            }
        } else if let durationSecs = currentEpisode?.durationSeconds, durationSecs > 60 {
            // Fallback: use episode duration directly
            let total = Double(durationSecs)
            if ads.count >= 2 {
                adInsertionPoints.append(total / 3.0)
                adInsertionPoints.append(total * 2.0 / 3.0)
            } else {
                adInsertionPoints.append(total / 2.0)
            }
        }

        if !adInsertionPoints.isEmpty {
            print("📢 Ad insertion points: \(adInsertionPoints.map { String(format: "%.1f", $0) })")
        }
    }

    /// Find the nearest segment boundary to a target time
    private func findNearestBreak(near target: Double, timings: [SegmentTiming]) -> TimeInterval {
        var closest = target
        var minDist = Double.greatestFiniteMagnitude

        for timing in timings {
            let dist = abs(timing.endTime - target)
            if dist < minDist {
                minDist = dist
                closest = timing.endTime
            }
        }

        return closest
    }

    // MARK: - Language Selection

    func setLanguage(_ language: SupportedLanguage) async {
        guard language != selectedLanguage else { return }

        // Stop current playback if playing
        if audioService.isPlaying {
            audioService.stop()
        }
        stopAdPlayback()

        selectedLanguage = language
        currentEpisode = nil
        ads = []
        adInsertionPoints = []
        nextAdIndex = 0

        // Clear old episode history immediately (it's for the wrong language)
        episodeHistory = []

        // Reset playback state for new language
        currentTime = 0
        duration = 0
        isPlaying = false
        loadError = nil

        // First, quickly load the episode history for the new language
        do {
            try await loadEpisodeHistory()
        } catch {
            print("Failed to load episode history for \(language.displayName)")
        }

        // Now load/generate the current episode
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
        stopAdPlayback()

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
            ads = episodeData.ads ?? []
            calculateAdInsertionPoints()

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
              URL(string: audioUrlString) != nil else {
            return
        }

        // Convert TopicEpisode to Episode for AudioService
        var playableEpisode = Episode(
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
        playableEpisode.script = episode.script

        audioService.play(episode: playableEpisode)
        isPlaying = true

        // Track the episode we're playing
        lastKnownAudioEpisodeId = episode.id

        // Reset ad tracking for fresh playback
        nextAdIndex = 0

        syncPlaybackState()

        // Queue episode history for auto-play
        queueEpisodeHistory(excludingEpisodeId: episode.id)
    }

    func pause() {
        audioService.pause()
        isPlaying = false
    }

    func togglePlayPause() {
        if isPlayingAd {
            skipAd()
            return
        }

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

        stopAdPlayback()

        var playableEpisode = Episode(
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
        playableEpisode.script = episode.script

        audioService.play(episode: playableEpisode)
        currentEpisode = episode
        isPlaying = true

        lastKnownAudioEpisodeId = episode.id

        // Reset ad state for history episodes (no ads for them)
        ads = []
        adInsertionPoints = []
        nextAdIndex = 0

        if let seconds = episode.durationSeconds {
            duration = TimeInterval(seconds)
        }

        syncPlaybackState()
        queueEpisodeHistory(excludingEpisodeId: episode.id)
    }

    /// Queue episode history for auto-play
    private func queueEpisodeHistory(excludingEpisodeId: String) {
        audioService.clearQueue()

        for episode in episodeHistory {
            if episode.id == excludingEpisodeId { continue }

            if episode.status == .completed, let audioUrl = episode.audioUrl {
                var queueEpisode = Episode(
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
                queueEpisode.script = episode.script
                audioService.addToQueue(queueEpisode)
            }
        }
    }

    // MARK: - Ad Playback

    /// Check if we've reached an ad insertion point during playback
    private func checkForAdInsertion() {
        guard !isPlayingAd,
              nextAdIndex < ads.count,
              nextAdIndex < adInsertionPoints.count,
              isPlaying else { return }

        let insertionPoint = adInsertionPoints[nextAdIndex]

        // Trigger ad when we pass the insertion point (within a 1.5-second window)
        if currentTime >= insertionPoint && currentTime < insertionPoint + 1.5 {
            playAd(ads[nextAdIndex])
        }
    }

    /// Start playing an ad
    private func playAd(_ ad: AdSegment) {
        guard let audioUrl = URL(string: ad.audioUrl) else { return }

        print("📢 Playing ad: \(ad.creativeId)")

        // Pause main episode
        audioService.pause()

        // Set ad state
        isPlayingAd = true
        currentAd = ad
        adTimeRemaining = TimeInterval(ad.audioDurationSeconds)

        // Create ad player
        let playerItem = AVPlayerItem(url: audioUrl)
        adPlayer = AVPlayer(playerItem: playerItem)
        adPlayer?.volume = 1.0

        // Observe ad playback time for countdown
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        adTimeObserver = adPlayer?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor in
                guard let self = self else { return }
                let elapsed = time.seconds
                self.adTimeRemaining = max(0, TimeInterval(ad.audioDurationSeconds) - elapsed)
            }
        }

        // Observe ad completion
        adEndObserver = NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: playerItem,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.adPlaybackDidEnd(wasSkipped: false)
            }
        }

        adPlayer?.play()

        // Track impression
        if ad.type == "ima" {
            imaAdManager.reportAdStarted(creativeId: ad.creativeId)
        } else {
            Task {
                await topicService.trackAdImpression(
                    creativeId: ad.creativeId,
                    campaignId: ad.campaignId,
                    episodeId: currentEpisode?.id ?? "",
                    topicId: topic.id,
                    language: selectedLanguage.rawValue,
                    durationListened: ad.audioDurationSeconds,
                    wasSkipped: false
                )
            }
        }
    }

    /// Skip the current ad
    func skipAd() {
        guard isPlayingAd, let ad = currentAd else { return }

        let listenedDuration = Int(TimeInterval(ad.audioDurationSeconds) - adTimeRemaining)

        // Track as skipped (custom ads only — IMA tracking in adPlaybackDidEnd)
        if ad.type != "ima" {
            Task {
                await topicService.trackAdImpression(
                    creativeId: ad.creativeId,
                    campaignId: ad.campaignId,
                    episodeId: currentEpisode?.id ?? "",
                    topicId: topic.id,
                    language: selectedLanguage.rawValue,
                    durationListened: listenedDuration,
                    wasSkipped: true
                )
            }
        }

        adPlaybackDidEnd(wasSkipped: true)
    }

    /// Handle ad click (open URL)
    func handleAdTap() {
        guard let ad = currentAd,
              let urlString = ad.clickThroughUrl,
              let url = URL(string: urlString) else { return }

        if ad.type == "ima" {
            imaAdManager.reportAdClicked(creativeId: ad.creativeId)
        } else {
            Task {
                await topicService.trackAdClick(
                    creativeId: ad.creativeId,
                    campaignId: ad.campaignId
                )
            }
        }

        #if canImport(UIKit)
        UIApplication.shared.open(url)
        #endif
    }

    /// Ad finished or was skipped - resume main episode
    private func adPlaybackDidEnd(wasSkipped: Bool) {
        // Report to IMA for tracking
        if let ad = currentAd, ad.type == "ima" {
            if wasSkipped {
                imaAdManager.reportAdSkipped(creativeId: ad.creativeId)
            } else {
                imaAdManager.reportAdCompleted(creativeId: ad.creativeId)
            }
        }

        stopAdPlayback()
        nextAdIndex += 1

        // Resume main episode
        audioService.resume()
        isPlaying = true
    }

    /// Clean up ad player resources
    private func stopAdPlayback() {
        if let observer = adTimeObserver {
            adPlayer?.removeTimeObserver(observer)
            adTimeObserver = nil
        }
        if let observer = adEndObserver {
            NotificationCenter.default.removeObserver(observer)
            adEndObserver = nil
        }
        adPlayer?.pause()
        adPlayer = nil
        isPlayingAd = false
        currentAd = nil
        adTimeRemaining = 0
    }

    // MARK: - Playback State Sync

    func syncPlaybackState() {
        // Don't update main playback state while ad is playing
        if isPlayingAd { return }

        // Only sync playing state if AudioService is playing THIS topic's episode
        if let currentAudioEpisode = audioService.currentEpisode,
           currentAudioEpisode.showId == topic.id {

            // Detect episode change (auto-play switched to next episode)
            let episodeChanged = lastKnownAudioEpisodeId != nil && lastKnownAudioEpisodeId != currentAudioEpisode.id

            if episodeChanged {
                currentTime = 0

                if let matchingEpisode = episodeHistory.first(where: { $0.id == currentAudioEpisode.id }) {
                    currentEpisode = matchingEpisode

                    if let seconds = matchingEpisode.durationSeconds {
                        duration = TimeInterval(seconds)
                    }
                }

                // Clear ads for auto-played episodes
                ads = []
                adInsertionPoints = []
                nextAdIndex = 0
            }

            lastKnownAudioEpisodeId = currentAudioEpisode.id

            // Don't override isPlaying to false while audio is downloading/buffering
            if audioService.isDownloading || audioService.isBuffering {
                // Keep current isPlaying state (set by play())
            } else {
                isPlaying = audioService.isPlaying
            }
            currentTime = audioService.currentTime

            if audioService.duration > 0 {
                duration = audioService.duration
            }

            // Check for ad insertion
            checkForAdInsertion()

        } else if !audioService.isDownloading && !audioService.isBuffering {
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
