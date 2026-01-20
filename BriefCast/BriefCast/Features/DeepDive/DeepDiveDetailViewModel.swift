//
//  DeepDiveDetailViewModel.swift
//  BriefCast
//
//  ViewModel for Deep Dive Detail View - manages playback and state
//

import Foundation
import Observation

@Observable
@MainActor
class DeepDiveDetailViewModel {
    // MARK: - Properties

    var deepDive: DeepDiveEpisode

    // Playback state (synced from AudioService)
    var isPlaying: Bool = false
    var currentTime: TimeInterval = 0
    var duration: TimeInterval = 0

    // UI state
    var showSources: Bool = true
    var isRegenerating: Bool = false
    var regenerateError: String?

    // Services
    private let audioService = AudioService.shared
    private let deepDiveService = DeepDiveService.shared

    // Track the episode ID we're playing
    private var lastKnownAudioEpisodeId: String?

    // MARK: - Computed Properties

    var canPlay: Bool {
        deepDive.audioUrl != nil && deepDive.status == .completed
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

    var hasFinished: Bool {
        guard duration > 0 else { return false }
        return currentTime >= duration - 1 // Within 1 second of end
    }

    // MARK: - Initialization

    init(deepDive: DeepDiveEpisode) {
        self.deepDive = deepDive

        // Set initial duration if available
        if let seconds = deepDive.durationSeconds {
            duration = TimeInterval(seconds)
        }
    }

    // MARK: - Playback Controls

    func play() {
        print("🎵 DeepDiveDetailViewModel.play() called")
        guard let audioUrlString = deepDive.audioUrl,
              URL(string: audioUrlString) != nil else {
            print("🎵 No audio URL available")
            return
        }

        print("🎵 Playing: \(deepDive.title)")

        // Convert DeepDiveEpisode to Episode for AudioService
        let playableEpisode = Episode(
            id: deepDive.id,
            userId: deepDive.userId,
            title: deepDive.title,
            description: deepDive.description,
            audioUrl: audioUrlString,
            durationSeconds: deepDive.durationSeconds,
            status: .completed,
            errorMessage: nil,
            generatedAt: Date(),
            createdAt: Date(),
            showId: "deep-dive",
            showName: "Deep Dive",
            imageColor: DeepDiveEpisode.brandColor,
            progress: 0,
            isCompleted: false,
            lastPlayedAt: nil
        )

        audioService.play(episode: playableEpisode)
        isPlaying = true
        lastKnownAudioEpisodeId = deepDive.id

        syncPlaybackState()
    }

    func pause() {
        audioService.pause()
        isPlaying = false
    }

    func togglePlayPause() {
        print("🎵 togglePlayPause() called, isPlaying: \(isPlaying)")
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

    // MARK: - Playback State Sync

    func syncPlaybackState() {
        // Only sync if AudioService is playing THIS deep dive
        if let currentAudioEpisode = audioService.currentEpisode,
           currentAudioEpisode.id == deepDive.id {

            isPlaying = audioService.isPlaying
            currentTime = audioService.currentTime

            if audioService.duration > 0 {
                duration = audioService.duration
            }
        } else {
            // Different content is playing, show as not playing
            isPlaying = false
            currentTime = 0
            lastKnownAudioEpisodeId = nil
        }
    }

    // MARK: - Regenerate

    func regenerate() async {
        isRegenerating = true
        regenerateError = nil

        // Stop current playback
        if isPlaying {
            pause()
        }

        currentTime = 0

        do {
            let newEpisode = try await deepDiveService.generateDeepDive(
                query: deepDive.query,
                language: deepDive.language,
                targetDurationMinutes: (deepDive.durationSeconds ?? 600) / 60
            )

            deepDive = newEpisode

            if let seconds = newEpisode.durationSeconds {
                duration = TimeInterval(seconds)
            }

            isRegenerating = false
        } catch {
            regenerateError = "Failed to regenerate: \(error.localizedDescription)"
            isRegenerating = false
        }
    }

    // MARK: - Helpers

    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}
