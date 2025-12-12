//
//  PlayerViewModel.swift
//  BriefCast
//
//  Player view model with transcript support
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
    var currentEpisode: Episode?
    var isPlaying: Bool = false
    var currentTime: TimeInterval = 0
    var duration: TimeInterval = 0
    var playbackSpeed: Float = 1.0
    var transcript: [TranscriptSegment] = []
    var currentSegmentIndex: Int = 0

    private let audioService = AudioService()

    // MARK: - Playback Control

    func play() {
        guard let episode = currentEpisode else { return }
        audioService.play(episode: episode)
        isPlaying = true
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
        updateCurrentSegment()
    }

    func skipForward(_ seconds: TimeInterval = 15) {
        let newTime = min(currentTime + seconds, duration)
        seek(to: newTime)
    }

    func skipBackward(_ seconds: TimeInterval = 15) {
        let newTime = max(currentTime - seconds, 0)
        seek(to: newTime)
    }

    func setPlaybackSpeed(_ speed: Float) {
        playbackSpeed = speed
        // TODO: Implement actual playback speed change in AudioService
        print("Playback speed set to \(speed)x")
    }

    // MARK: - Episode Management

    func loadEpisode(_ episode: Episode) {
        currentEpisode = episode
        duration = TimeInterval(episode.durationSeconds ?? 0)
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
