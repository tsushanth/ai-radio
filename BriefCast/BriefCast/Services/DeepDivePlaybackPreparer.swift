//
//  DeepDivePlaybackPreparer.swift
//  BriefCast
//
//  Bridges the cloud-rendered and on-device deep-dive playback paths.
//  Given a completed DeepDiveEpisode, returns a playable URL:
//   - cloud audio URL when `audioUrl` is present, or
//   - local WAV file produced by KokoroPodcastSynthesizer when the episode
//     was generated in `format=script` mode (audioUrl == nil, script != nil).
//

import Foundation

actor DeepDivePlaybackPreparer {

    static let shared = DeepDivePlaybackPreparer()

    /// Two voice slots for the two-host script. These map to KokoroVoiceCatalog
    /// entries (also bundled in the FluidAudio Core ML package). Picked to
    /// approximate the cloud OpenAI defaults (nova/onyx → US female/male).
    private static let host1Voice = "af_bella"
    private static let host2Voice = "am_michael"

    /// In-flight synthesis Tasks keyed by episode id. Multiple concurrent
    /// `playableURLString(for:)` calls for the same episode (e.g. the user
    /// frantically tapping Play before the first synth finishes) share the
    /// same underlying Task instead of each spawning their own 2-3 minute
    /// Kokoro pipeline — which previously OOM-crashed the app.
    private var inFlight: [String: Task<String?, Error>] = [:]

    /// Returns a playable URL string for the episode. Synthesizes on-device
    /// when the episode is a script-only payload; returns the cloud URL
    /// otherwise. Caches the synthesized WAV at a stable path keyed by
    /// episode id so repeat opens of the same dive don't re-synthesize.
    ///
    /// - Parameter progress: Optional callback invoked from Kokoro's synth
    ///   loop with (fraction 0…1, phase message). Only fires on the
    ///   on-device synth path. The first caller to start a synth Task owns
    ///   the callback; deduped callers join silently.
    /// - Throws: `KokoroError` if on-device synth is required but fails.
    func playableURLString(
        for episode: DeepDiveEpisode,
        progress: (@Sendable (Double, String) -> Void)? = nil
    ) async throws -> String? {
        // Cloud-rendered path — nothing to do.
        if let url = episode.audioUrl, !url.isEmpty {
            print("🎧 [Preparer] CLOUD path — using audioUrl")
            return url
        }

        // On-device path requires both a script and a loaded model.
        guard let scriptJson = episode.script, !scriptJson.isEmpty else {
            print("🎧 [Preparer] No audioUrl and no script — nothing to play")
            return nil
        }

        // Cache hit: synthesized audio for this episode is already on disk.
        let cachedURL = cachedFileURL(for: episode.id)
        if FileManager.default.fileExists(atPath: cachedURL.path) {
            print("🎧 [Preparer] CACHE HIT — \(cachedURL.lastPathComponent)")
            return cachedURL.absoluteString
        }

        // Coalesce concurrent requests for the same episode onto one Task.
        if let existing = inFlight[episode.id] {
            print("🎧 [Preparer] join in-flight synth for \(episode.id)")
            return try await existing.value
        }

        print("🎧 [Preparer] ON-DEVICE synth required for episode \(episode.id)")
        print("🎧 [Preparer] script length: \(scriptJson.count) chars")

        let synthTask = Task<String?, Error> { [scriptJson, cachedURL, episodeId = episode.id, progress] in
            try await self.runSynthesis(
                episodeId: episodeId,
                scriptJson: scriptJson,
                cachedURL: cachedURL,
                progress: progress
            )
        }
        inFlight[episode.id] = synthTask
        defer { inFlight[episode.id] = nil }
        return try await synthTask.value
    }

    private func runSynthesis(
        episodeId: String,
        scriptJson: String,
        cachedURL: URL,
        progress: (@Sendable (Double, String) -> Void)? = nil
    ) async throws -> String? {

        // Decode the backend's `JSON.stringify(script)` into the same
        // PodcastScript shape iOS already uses for topic podcasts.
        let scriptData = Data(scriptJson.utf8)
        let podcastScript: PodcastScript
        do {
            podcastScript = try JSONDecoder().decode(PodcastScript.self, from: scriptData)
        } catch {
            print("🎧 [Preparer] script decode FAILED: \(error.localizedDescription)")
            throw DeepDivePlaybackError.scriptDecode(error.localizedDescription)
        }

        let segments: [KokoroPodcastSynthesizer.Segment] = podcastScript.segments.compactMap { seg in
            let text = (seg.text ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return KokoroPodcastSynthesizer.Segment(
                speaker: (seg.speaker ?? "host1") == "host2" ? "host2" : "host1",
                text: text
            )
        }
        guard !segments.isEmpty else {
            print("🎧 [Preparer] script has no speakable segments")
            throw DeepDivePlaybackError.scriptEmpty
        }

        let totalChars = segments.reduce(0) { $0 + $1.text.count }
        // Empirical: iPhone 14 chunks at ~70-90 chars/s. Estimate 75 chars/s
        // to give a conservative-but-not-alarmist ETA in the log.
        let estSec = Int(Double(totalChars) / 75.0)
        print("🎧 [Preparer] \(segments.count) segments, \(totalChars) chars — ETA ~\(estSec)s")

        let synthStart = Date()

        // Run the on-device synth. KokoroPodcastSynthesizer manages model
        // download + load via FluidAudio, so a cold-start path produces the
        // model first if the user enabled the engine but never warmed it.
        let result = try await KokoroPodcastSynthesizer.shared.synthesize(
            segments: segments,
            host1Voice: Self.host1Voice,
            host2Voice: Self.host2Voice,
            speed: 1.0,
            progress: { snapshot in
                // Forward to the caller's UI callback (if any) and log every
                // 10% bump for the console.
                progress?(snapshot.fraction, snapshot.message)
                let pct = Int(snapshot.fraction * 100)
                if pct % 10 == 0 {
                    print("🎧 [Preparer] synth progress \(pct)% — \(snapshot.message)")
                }
            }
        )

        let synthElapsed = Date().timeIntervalSince(synthStart)
        print("🎧 [Preparer] synth done in \(String(format: "%.1f", synthElapsed))s, audio duration \(String(format: "%.1f", result.durationSeconds))s")

        // Persist the synthesized WAV at the stable cache path so we don't
        // re-render on every replay.
        try ensureCacheDirExists()
        try? FileManager.default.removeItem(at: cachedURL)
        try FileManager.default.moveItem(at: result.fileURL, to: cachedURL)
        print("🎧 [Preparer] cached at \(cachedURL.lastPathComponent)")

        return cachedURL.absoluteString
    }

    /// Remove cached on-device audio for the given episode (e.g. when the
    /// user deletes the dive). Safe to call when nothing is cached.
    func clearCache(for episodeId: String) {
        let url = cachedFileURL(for: episodeId)
        try? FileManager.default.removeItem(at: url)
    }

    // MARK: - Private

    private func cachedFileURL(for episodeId: String) -> URL {
        let dir = cacheDirURL()
        return dir.appendingPathComponent("\(safeFileName(from: episodeId)).wav")
    }

    private func cacheDirURL() -> URL {
        let cacheRoot = FileManager.default.urls(for: .cachesDirectory, in: .userDomainMask)[0]
        return cacheRoot.appendingPathComponent("DeepDiveOnDeviceAudio", isDirectory: true)
    }

    private func ensureCacheDirExists() throws {
        let dir = cacheDirURL()
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
    }

    private func safeFileName(from id: String) -> String {
        id.replacingOccurrences(of: "/", with: "_")
          .replacingOccurrences(of: ":", with: "_")
          .replacingOccurrences(of: " ", with: "_")
    }
}

enum DeepDivePlaybackError: LocalizedError {
    case scriptDecode(String)
    case scriptEmpty

    var errorDescription: String? {
        switch self {
        case .scriptDecode(let message):
            return "Could not decode deep dive script: \(message)"
        case .scriptEmpty:
            return "Deep dive script contains no speakable segments."
        }
    }
}
