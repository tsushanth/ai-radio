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
    /// True while we're preparing playback — fetching the cloud URL or, more
    /// commonly on this codebase, running the on-device Kokoro synth (which
    /// can take 60–180s on first play). Used to (a) gate `play()` so taps
    /// during prep don't re-enter the synth pipeline and (b) drive the UI's
    /// "Loading…" state so the user knows something is happening instead of
    /// hammering the button.
    var isPreparingPlayback: Bool = false
    /// Live progress for the on-device Kokoro synth (0.0…1.0). Surfaced on
    /// the detail view's play button so the user sees a real percentage
    /// during the 60-180s wait instead of a blank spinner.
    var synthProgress: Double = 0
    /// Human-readable phase ("Synthesizing segment 3 of 14…"). Empty for
    /// cloud / cache-hit paths.
    var synthMessage: String = ""
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

    // Observer for placeholder → real-episode hot-swap
    private nonisolated(unsafe) var listChangeObserver: NSObjectProtocol?

    // MARK: - Computed Properties

    var canPlay: Bool {
        // Completed dives are playable in two flavors:
        //   - cloud-rendered: `audioUrl` points at the Supabase mp3
        //   - on-device-rendered: `script` is present, Kokoro synthesizes
        //     the audio locally via `DeepDivePlaybackPreparer`
        guard deepDive.status == .completed else { return false }
        return deepDive.audioUrl != nil || deepDive.script != nil
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

        // Hot-swap the bound episode when a background generation finishes
        // (placeholder replaced with a real episode in the service cache).
        listChangeObserver = NotificationCenter.default.addObserver(
            forName: .deepDiveListChanged,
            object: nil,
            queue: .main
        ) { [weak self] note in
            Task { @MainActor [weak self] in
                guard let self else { return }
                let info = note.userInfo as? [String: String]

                // Case 1: explicit placeholder → server-stub swap from
                // startBackgroundGeneration.
                if let placeholderId = info?["placeholderId"],
                   let episodeId = info?["episodeId"],
                   placeholderId == self.deepDive.id,
                   let fresh = self.deepDiveService.getCachedDeepDives().first(where: { $0.id == episodeId }) {
                    self.deepDive = fresh
                    if let seconds = fresh.durationSeconds {
                        self.duration = TimeInterval(seconds)
                    }
                    print("🔄 [DeepDiveDetail] swapped placeholder → \(episodeId)")
                    return
                }

                // Case 2: general cache refresh (from background polling).
                // The poll fetch overwrites the cache with Supabase rows
                // whose IDs differ from our server stub, so match by query
                // instead. Two important guards:
                //   - only swap while we're still in an in-progress state
                //     (don't overwrite a playable dive with a stale dupe);
                //   - only swap to candidates that are NEWER than the current
                //     deepDive, so stale failures from earlier attempts can't
                //     replace a fresh placeholder.
                if self.deepDive.status == .researching || self.deepDive.status == .generating {
                    let currentCreated = self.parseDate(self.deepDive.generatedAt ?? self.deepDive.createdAt) ?? .distantPast
                    let candidates = self.deepDiveService.getCachedDeepDives().filter { ep in
                        guard ep.query == self.deepDive.query else { return false }
                        guard ep.status == .completed || ep.status == .failed else { return false }
                        let epCreated = self.parseDate(ep.generatedAt ?? ep.createdAt) ?? .distantPast
                        return epCreated >= currentCreated
                    }
                    if let best = candidates.first {
                        self.deepDive = best
                        if let seconds = best.durationSeconds {
                            self.duration = TimeInterval(seconds)
                        }
                        print("🔄 [DeepDiveDetail] post-poll swap → \(best.id) (\(best.status.rawValue))")
                    }
                }
            }
        }
    }

    deinit {
        if let observer = listChangeObserver {
            NotificationCenter.default.removeObserver(observer)
        }
    }

    // MARK: - Playback Controls

    func play() {
        print("🎵 DeepDiveDetailViewModel.play() called")

        // Guard against rapid taps re-entering the synth pipeline. Each
        // tap-during-prep used to spawn its own 60-180s Kokoro job; six
        // concurrent jobs OOM-crashed the app. The preparer also dedupes
        // by episode id, but stopping it at the UI gate avoids spinning
        // up unnecessary Tasks at all.
        guard !isPreparingPlayback else {
            print("🎵 play() ignored — playback prep already in flight")
            return
        }
        isPreparingPlayback = true
        synthProgress = 0
        synthMessage = ""

        // Resolve a playable URL — may synthesize on-device for script-only
        // episodes. This is fast (cache hit) on replays; first-time on-device
        // dives take a few seconds depending on script length.
        Task { [weak self] in
            guard let self else { return }

            // Capture the episode locally; DeepDive is a let on the VM but
            // calling into the actor needs a sendable value.
            let episode = await MainActor.run { self.deepDive }

            let resolvedURL: String?
            do {
                resolvedURL = try await DeepDivePlaybackPreparer.shared.playableURLString(
                    for: episode,
                    progress: { @Sendable [weak self] frac, msg in
                        Task { @MainActor [weak self] in
                            guard let self else { return }
                            self.synthProgress = frac
                            self.synthMessage = msg
                        }
                    }
                )
            } catch {
                print("🎵 Failed to prepare playback: \(error.localizedDescription)")
                resolvedURL = nil
            }

            guard
                let audioUrlString = resolvedURL,
                URL(string: audioUrlString) != nil
            else {
                print("🎵 No audio URL available (and on-device synth produced none)")
                await MainActor.run { self.isPreparingPlayback = false }
                return
            }

            await MainActor.run {
                print("🎵 Playing: \(episode.title)")

                // Convert DeepDiveEpisode to Episode for AudioService
                let playableEpisode = Episode(
                    id: episode.id,
                    userId: episode.userId,
                    title: episode.title,
                    description: episode.description,
                    audioUrl: audioUrlString,
                    durationSeconds: episode.durationSeconds,
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

                self.audioService.play(episode: playableEpisode)
                self.isPlaying = true
                self.isPreparingPlayback = false
                self.lastKnownAudioEpisodeId = episode.id

                self.syncPlaybackState()
            }
        }
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

        // Drop EVERY locally-failed attempt for this query, not just the
        // one we're looking at — otherwise the observer's post-poll swap
        // (which matches by query) can find an older failed row and revert
        // the brand-new placeholder. Completed dives are preserved.
        let queryToRetry = deepDive.query
        let langToRetry = deepDive.language
        let minutesToRetry = max(5, (deepDive.durationSeconds ?? 600) / 60)
        deepDiveService.dropFailedAttempts(matching: queryToRetry)

        // Kick off a new background generation. This returns instantly with a
        // client placeholder; the existing .deepDiveListChanged observer in
        // init() hot-swaps `self.deepDive` to the real episode when polling
        // finds it completed.
        let placeholder = deepDiveService.startBackgroundGeneration(
            query: queryToRetry,
            language: langToRetry,
            targetDurationMinutes: minutesToRetry
        )

        print("🔁 [DeepDiveDetail] regenerate → new placeholder \(placeholder.id), status=\(placeholder.status.rawValue)")
        deepDive = placeholder
        if let seconds = placeholder.durationSeconds {
            duration = TimeInterval(seconds)
        }
        isRegenerating = false
    }

    // MARK: - Helpers

    /// Best-effort ISO8601 parser used by the post-poll swap to decide
    /// whether a cached candidate is actually newer than the current dive.
    private func parseDate(_ s: String) -> Date? {
        let f1 = ISO8601DateFormatter()
        f1.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        if let d = f1.date(from: s) { return d }
        let f2 = ISO8601DateFormatter()
        f2.formatOptions = [.withInternetDateTime]
        return f2.date(from: s)
    }

    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}
