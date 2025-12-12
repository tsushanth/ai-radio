//
//  AudioService.swift
//  BriefCast
//
//  Audio playback service with AVPlayer, background playback, and remote control
//

import Foundation
import AVFoundation
import Combine
import MediaPlayer

// Notification sent when playback finishes
extension Notification.Name {
    static let audioPlaybackDidEnd = Notification.Name("audioPlaybackDidEnd")
}

@MainActor
@Observable
class AudioService {
    // MARK: - Singleton

    static let shared = AudioService()

    // MARK: - Published Properties

    var isPlaying: Bool = false
    var currentTime: TimeInterval = 0
    var duration: TimeInterval = 0
    var currentEpisode: Episode?
    var playbackRate: Float = 1.0
    var isBuffering: Bool = false

    // MARK: - Private Properties

    private var player: AVPlayer?
    private var timeObserver: Any?
    private var statusObserver: NSKeyValueObservation?
    private var itemObserver: NSKeyValueObservation?
    private let audioSession = AVAudioSession.sharedInstance()

    // MARK: - Initialization

    init() {
        setupAudioSession()
        setupRemoteCommandCenter()
        setupNotifications()
    }

    // MARK: - Playback Control

    /// Play an episode from the beginning or resume if already loaded
    func play(episode: Episode) {
        print("🎵 AudioService.play() called for episode: \(episode.id)")
        print("🎵 Episode audioUrl: \(episode.audioUrl ?? "nil")")

        guard let urlString = episode.audioUrl,
              let url = URL(string: urlString) else {
            print("❌ AudioService: Invalid audio URL for episode \(episode.id)")
            return
        }

        print("🎵 Parsed URL: \(url)")

        // If same episode, just resume
        if currentEpisode?.id == episode.id, player != nil {
            print("🎵 Same episode, resuming...")
            resume()
            return
        }

        // Load new episode
        print("🎵 Loading new episode...")
        currentEpisode = episode
        loadAudio(from: url)

        // Update Now Playing info
        updateNowPlayingInfo()
    }

    /// Resume playback
    func resume() {
        print("🎵 AudioService.resume() called")
        print("🎵 Player exists: \(player != nil)")
        print("🎵 Player rate before: \(player?.rate ?? -1)")

        player?.play()
        player?.rate = playbackRate
        isPlaying = true

        print("🎵 Player rate after: \(player?.rate ?? -1)")
        print("🎵 Player status: \(player?.currentItem?.status.rawValue ?? -1)")
        print("🎵 Player error: \(player?.currentItem?.error?.localizedDescription ?? "none")")

        updateNowPlayingPlaybackRate()
    }

    /// Pause playback
    func pause() {
        print("⏸️ AudioService.pause() called")
        player?.pause()
        isPlaying = false
        updateNowPlayingPlaybackRate()
    }

    /// Toggle between play and pause
    func togglePlayPause() {
        if isPlaying {
            pause()
        } else {
            resume()
        }
    }

    /// Seek to a specific time
    func seek(to time: TimeInterval) {
        let cmTime = CMTime(seconds: time, preferredTimescale: CMTimeScale(NSEC_PER_SEC))

        player?.seek(to: cmTime, toleranceBefore: .zero, toleranceAfter: .zero) { [weak self] completed in
            if completed {
                Task { @MainActor in
                    self?.currentTime = time
                    self?.updateNowPlayingCurrentTime()
                }
            }
        }
    }

    /// Skip forward by specified seconds
    func skipForward(by seconds: TimeInterval = 15) {
        let newTime = min(currentTime + seconds, duration)
        seek(to: newTime)
    }

    /// Skip backward by specified seconds
    func skipBackward(by seconds: TimeInterval = 15) {
        let newTime = max(currentTime - seconds, 0)
        seek(to: newTime)
    }

    /// Set playback rate/speed
    func setRate(_ rate: Float) {
        playbackRate = rate
        if isPlaying {
            player?.rate = rate
        }
        updateNowPlayingPlaybackRate()
    }

    /// Stop playback and clean up
    func stop() {
        pause()
        player?.replaceCurrentItem(with: nil)
        currentEpisode = nil
        currentTime = 0
        duration = 0
        clearNowPlayingInfo()
    }

    // MARK: - Private Setup Methods

    private func setupAudioSession() {
        do {
            print("🎵 Setting up audio session...")
            try audioSession.setCategory(.playback, mode: .spokenAudio, options: [])
            try audioSession.setActive(true)
            print("✅ Audio session set up successfully")
            print("🎵 Audio session category: \(audioSession.category.rawValue)")
            print("🎵 Audio session mode: \(audioSession.mode.rawValue)")
        } catch {
            print("❌ AudioService: Failed to set up audio session: \(error)")
        }
    }

    private func setupRemoteCommandCenter() {
        let commandCenter = MPRemoteCommandCenter.shared()

        // Play command
        commandCenter.playCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.resume()
            }
            return .success
        }

        // Pause command
        commandCenter.pauseCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.pause()
            }
            return .success
        }

        // Skip forward command
        commandCenter.skipForwardCommand.preferredIntervals = [15]
        commandCenter.skipForwardCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.skipForward(by: 15)
            }
            return .success
        }

        // Skip backward command
        commandCenter.skipBackwardCommand.preferredIntervals = [15]
        commandCenter.skipBackwardCommand.addTarget { [weak self] _ in
            Task { @MainActor in
                self?.skipBackward(by: 15)
            }
            return .success
        }

        // Change playback position command
        commandCenter.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else {
                return .commandFailed
            }
            Task { @MainActor in
                self?.seek(to: event.positionTime)
            }
            return .success
        }
    }

    private func setupNotifications() {
        NotificationCenter.default.addObserver(
            forName: AVPlayerItem.didPlayToEndTimeNotification,
            object: nil,
            queue: .main
        ) { [weak self] _ in
            Task { @MainActor in
                self?.handlePlaybackEnded()
            }
        }
    }

    private func loadAudio(from url: URL) {
        print("🎵 loadAudio() called with URL: \(url)")

        // Clean up previous player
        cleanupPlayer()

        // Create new player
        print("🎵 Creating AVPlayerItem...")
        let playerItem = AVPlayerItem(url: url)
        player = AVPlayer(playerItem: playerItem)

        // Set player volume explicitly
        player?.volume = 1.0
        print("🎵 Player volume set to: \(player?.volume ?? -1)")

        // Set up time observer
        setupTimeObserver()

        // Observe player item status
        statusObserver = playerItem.observe(\.status, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                self?.handleStatusChange(item.status)
            }
        }

        // Observe duration
        itemObserver = playerItem.observe(\.duration, options: [.new]) { [weak self] item, _ in
            Task { @MainActor in
                let seconds = item.duration.seconds
                if seconds.isFinite {
                    self?.duration = seconds
                    print("🎵 Duration loaded: \(seconds) seconds")
                    self?.updateNowPlayingInfo()
                }
            }
        }

        // Add error observer
        NotificationCenter.default.addObserver(
            forName: NSNotification.Name.AVPlayerItemFailedToPlayToEndTime,
            object: playerItem,
            queue: .main
        ) { notification in
            if let error = notification.userInfo?[AVPlayerItemFailedToPlayToEndTimeErrorKey] as? Error {
                print("❌ AudioService: Playback failed: \(error.localizedDescription)")
            }
        }

        // Start playback
        print("🎵 Starting playback...")
        resume()
    }

    private func setupTimeObserver() {
        let interval = CMTime(seconds: 0.5, preferredTimescale: CMTimeScale(NSEC_PER_SEC))
        timeObserver = player?.addPeriodicTimeObserver(forInterval: interval, queue: .main) { [weak self] time in
            Task { @MainActor in
                self?.currentTime = time.seconds
            }
        }
    }

    private func handleStatusChange(_ status: AVPlayerItem.Status) {
        print("🎵 handleStatusChange: \(status.rawValue)")

        switch status {
        case .readyToPlay:
            print("✅ AudioService: Ready to play!")
            isBuffering = false
            if let item = player?.currentItem {
                let seconds = item.duration.seconds
                if seconds.isFinite {
                    duration = seconds
                    print("🎵 Duration: \(seconds) seconds")
                }
            }
            // Make sure we're actually playing
            if !isPlaying {
                print("🎵 Wasn't playing, starting now...")
                resume()
            }
        case .failed:
            isBuffering = false
            let errorMessage = player?.currentItem?.error?.localizedDescription ?? "Unknown error"
            print("❌ AudioService: Player item failed: \(errorMessage)")
        case .unknown:
            print("🎵 AudioService: Status unknown (buffering)")
            isBuffering = true
        @unknown default:
            print("🎵 AudioService: Unknown status case")
            break
        }
    }

    private func handlePlaybackEnded() {
        let endedEpisode = currentEpisode
        isPlaying = false
        currentTime = 0

        // Post notification so ViewModels can update their state
        NotificationCenter.default.post(
            name: .audioPlaybackDidEnd,
            object: nil,
            userInfo: ["episode": endedEpisode as Any]
        )

        print("🎵 Playback ended for episode: \(endedEpisode?.title ?? "unknown")")
    }

    private func cleanupPlayer() {
        if let observer = timeObserver {
            player?.removeTimeObserver(observer)
            timeObserver = nil
        }
        statusObserver?.invalidate()
        itemObserver?.invalidate()
        statusObserver = nil
        itemObserver = nil
    }

    // MARK: - Now Playing Info

    private func updateNowPlayingInfo() {
        guard let episode = currentEpisode else { return }

        var nowPlayingInfo = [String: Any]()
        nowPlayingInfo[MPMediaItemPropertyTitle] = episode.title
        nowPlayingInfo[MPMediaItemPropertyArtist] = episode.showName ?? "BriefCast"
        nowPlayingInfo[MPMediaItemPropertyPlaybackDuration] = duration
        nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? playbackRate : 0

        // TODO: Add artwork if available
        // if let artwork = loadArtwork(for: episode) {
        //     nowPlayingInfo[MPMediaItemPropertyArtwork] = artwork
        // }

        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }

    private func updateNowPlayingCurrentTime() {
        var nowPlayingInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
        nowPlayingInfo[MPNowPlayingInfoPropertyElapsedPlaybackTime] = currentTime
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }

    private func updateNowPlayingPlaybackRate() {
        var nowPlayingInfo = MPNowPlayingInfoCenter.default().nowPlayingInfo ?? [String: Any]()
        nowPlayingInfo[MPNowPlayingInfoPropertyPlaybackRate] = isPlaying ? playbackRate : 0
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nowPlayingInfo
    }

    private func clearNowPlayingInfo() {
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    // MARK: - Cleanup

    deinit {
        // Note: cleanupPlayer() is @MainActor isolated, but deinit is not
        // The player cleanup will happen automatically when the instance is deallocated
        NotificationCenter.default.removeObserver(self)
    }
}
