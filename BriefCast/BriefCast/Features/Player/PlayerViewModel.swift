//
//  PlayerViewModel.swift
//  BriefCast
//
//  Player view model with transcript support - syncs with shared AudioService
//

import Foundation
import Observation

// MARK: - Transcript Segment

struct TranscriptSegment: Identifiable {
    let id = UUID()
    let text: String
    let startTime: TimeInterval
    let endTime: TimeInterval
    let speaker: String // "host1" or "host2"
}

// MARK: - Player View Model

@Observable
@MainActor
class PlayerViewModel {
    var transcript: [TranscriptSegment] = []
    var currentSegmentIndex: Int = 0

    // Use shared AudioService singleton for app-wide playback sync
    private let audioService = AudioService.shared

    // Computed properties that reflect AudioService state
    var currentEpisode: Episode? { audioService.currentEpisode }
    var isPlaying: Bool { audioService.isPlaying }
    var currentTime: TimeInterval { audioService.currentTime }
    var duration: TimeInterval { audioService.duration }
    var playbackSpeed: Float { audioService.playbackRate }

    // MARK: - Playback Control

    func play() {
        audioService.resume()
    }

    func pause() {
        audioService.pause()
    }

    func togglePlayPause() {
        audioService.togglePlayPause()
    }

    func seek(to time: TimeInterval) {
        audioService.seek(to: time)
        updateCurrentSegment()
    }

    func skipForward(_ seconds: TimeInterval = 15) {
        audioService.skipForward(by: seconds)
    }

    func skipBackward(_ seconds: TimeInterval = 15) {
        audioService.skipBackward(by: seconds)
    }

    func setPlaybackSpeed(_ speed: Float) {
        audioService.setRate(speed)
    }

    // MARK: - Episode Management

    func loadEpisode(_ episode: Episode) {
        // If this is a different episode, load it
        if audioService.currentEpisode?.id != episode.id {
            audioService.play(episode: episode)
        }
        loadMockTranscript()
    }

    // MARK: - Transcript Management

    private func updateCurrentSegment() {
        guard !transcript.isEmpty else { return }

        for (index, segment) in transcript.enumerated() {
            if currentTime >= segment.startTime && currentTime < segment.endTime {
                currentSegmentIndex = index
                break
            }
        }
    }

    private func loadMockTranscript() {
        // TODO: Load actual transcript from API or episode metadata
        transcript = [
            TranscriptSegment(text: "Welcome to your daily briefing for December 10th.", startTime: 0, endTime: 3, speaker: "host1"),
            TranscriptSegment(text: "Let's start with your calendar for today.", startTime: 3, endTime: 5, speaker: "host2"),
            TranscriptSegment(text: "You have 3 meetings scheduled, starting at 10 AM.", startTime: 5, endTime: 8, speaker: "host1"),
            TranscriptSegment(text: "Your inbox has 12 new messages since yesterday.", startTime: 8, endTime: 11, speaker: "host2"),
            TranscriptSegment(text: "Here are the most important ones to review.", startTime: 11, endTime: 14, speaker: "host1")
        ]
    }

    // MARK: - Formatting

    func formatTime(_ seconds: TimeInterval) -> String {
        let minutes = Int(seconds) / 60
        let remainingSeconds = Int(seconds) % 60
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }

    func progressPercentage() -> Double {
        guard duration > 0 else { return 0 }
        return currentTime / duration
    }
}
