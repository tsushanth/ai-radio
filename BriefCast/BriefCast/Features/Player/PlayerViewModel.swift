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
    var sleepTimerRemaining: TimeInterval? { audioService.sleepTimerRemaining }

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

    // MARK: - Sleep Timer

    func startSleepTimer(minutes: Int) {
        audioService.startSleepTimer(minutes: minutes)
    }

    func cancelSleepTimer() {
        audioService.cancelSleepTimer()
    }

    func formatSleepTimer() -> String? {
        guard let remaining = sleepTimerRemaining, remaining > 0 else { return nil }
        let mins = Int(remaining) / 60
        let secs = Int(remaining) % 60
        return String(format: "%d:%02d", mins, secs)
    }

    // MARK: - Episode Management

    func loadEpisode(_ episode: Episode) {
        // If this is a different episode, load it
        if audioService.currentEpisode?.id != episode.id {
            audioService.play(episode: episode)
        }
        loadTranscript(from: episode)
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

    private func loadTranscript(from episode: Episode) {
        guard let script = episode.script, !script.segments.isEmpty else {
            transcript = []
            return
        }

        var segments: [TranscriptSegment] = []
        var currentOffset: TimeInterval = 0

        // Use segment timings from the episode if available for accurate timing
        let totalDuration = episode.duration > 0 ? episode.duration : TimeInterval(script.estimatedDurationSeconds ?? 300)

        for (index, seg) in script.segments.enumerated() {
            guard !seg.text.isEmpty else { continue }

            let estimatedDuration: TimeInterval
            if let est = seg.durationEstimate, est > 0 {
                estimatedDuration = TimeInterval(est)
            } else {
                // Rough estimate: ~150 words per minute
                let wordCount = seg.text.split(separator: " ").count
                estimatedDuration = max(2.0, TimeInterval(wordCount) / 2.5)
            }

            segments.append(TranscriptSegment(
                text: seg.text,
                startTime: currentOffset,
                endTime: currentOffset + estimatedDuration,
                speaker: seg.speaker
            ))
            currentOffset += estimatedDuration
        }

        // Scale timing to match actual episode duration if we have it
        if !segments.isEmpty && totalDuration > 0 && currentOffset > 0 {
            let scale = totalDuration / currentOffset
            if abs(scale - 1.0) > 0.1 { // Only rescale if off by more than 10%
                segments = segments.map { seg in
                    TranscriptSegment(
                        text: seg.text,
                        startTime: seg.startTime * scale,
                        endTime: seg.endTime * scale,
                        speaker: seg.speaker
                    )
                }
            }
        }

        transcript = segments
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
