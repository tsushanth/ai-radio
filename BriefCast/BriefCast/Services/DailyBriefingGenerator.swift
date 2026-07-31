//
//  DailyBriefingGenerator.swift
//  BriefCast
//
//  Orchestrates on-device daily-briefing generation:
//
//    1. Pulls a multi-host script from the backend (POST /podcast/script)
//       using the user's selected topics from UserTopicPreferences.
//    2. Synthesizes that script locally with KokoroPodcastSynthesizer.
//    3. Persists the resulting WAV in Library/DailyBriefings, keyed by date,
//       so a re-open of the same day's briefing doesn't re-render.
//
//  Gated on Kokoro eligibility + premium + linked-account email at the
//  call site (settings UI). The generator itself throws clearly when any
//  precondition is missing, so callers can surface specific guidance.
//

import Foundation

actor DailyBriefingGenerator {

    static let shared = DailyBriefingGenerator()

    // Two-host voices map to KokoroVoiceCatalog and mirror the choices used
    // by DeepDivePlaybackPreparer so the experience feels consistent.
    private static let host1Voice = "af_bella"
    private static let host2Voice = "am_michael"

    private let baseURL = "https://ai-radio-backend.fly.dev/api"

    /// Progress signal forwarded to the UI. The same fraction maps cleanly
    /// onto a determinate progress bar — script fetch contributes the first
    /// 10%, synthesis the remaining 90%.
    struct Progress: Sendable {
        let fraction: Double
        let message: String
    }

    struct Result: Sendable {
        let fileURL: URL
        let durationSeconds: Double
        let topicIds: [String]
        let dateKey: String   // yyyy-MM-dd
    }

    /// Top-level entry point. Reads the latest UserTopicPreferences on the
    /// main actor, fetches the script, then synthesizes locally.
    func generateToday(
        progress: @escaping @Sendable (Progress) -> Void
    ) async throws -> Result {
        // Cache hit: today's briefing already rendered.
        let dateKey = Self.todayKey()
        let prefSnapshot = await readPreferenceSnapshot()
        let topicIds = prefSnapshot.selectedTopicIds
        let userEmail = prefSnapshot.userEmail

        guard !topicIds.isEmpty else { throw DailyBriefingError.noTopicsSelected }
        guard let userEmail else { throw DailyBriefingError.notLinked }
        guard await MainActor.run(body: { KokoroModelManager.isDeviceEligible }) else {
            throw DailyBriefingError.deviceIneligible
        }

        let cachedURL = cachedFileURL(dateKey: dateKey, topicIds: topicIds)
        if FileManager.default.fileExists(atPath: cachedURL.path),
           let duration = readWavDuration(at: cachedURL) {
            progress(Progress(fraction: 1.0, message: "Ready"))
            return Result(fileURL: cachedURL, durationSeconds: duration,
                          topicIds: topicIds, dateKey: dateKey)
        }

        progress(Progress(fraction: 0.02, message: "Fetching today's script…"))
        let script = try await fetchScript(userEmail: userEmail, topicIds: topicIds)
        progress(Progress(fraction: 0.10, message: "Script ready, preparing voices…"))

        let segments = script.segments.compactMap { seg -> KokoroPodcastSynthesizer.Segment? in
            let text = seg.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !text.isEmpty else { return nil }
            return KokoroPodcastSynthesizer.Segment(
                speaker: seg.speaker == "host2" ? "host2" : "host1",
                text: text
            )
        }
        guard !segments.isEmpty else { throw DailyBriefingError.scriptEmpty }

        let synth = try await KokoroPodcastSynthesizer.shared.synthesize(
            segments: segments,
            host1Voice: Self.host1Voice,
            host2Voice: Self.host2Voice,
            speed: 1.0,
            progress: { snapshot in
                // Synthesizer 0..1 → overall 0.10..1.00
                progress(Progress(
                    fraction: 0.10 + snapshot.fraction * 0.90,
                    message: snapshot.message
                ))
            }
        )

        try ensureCacheDirExists()
        try? FileManager.default.removeItem(at: cachedURL)
        try FileManager.default.moveItem(at: synth.fileURL, to: cachedURL)
        progress(Progress(fraction: 1.0, message: "Ready"))

        return Result(fileURL: cachedURL,
                      durationSeconds: synth.durationSeconds,
                      topicIds: topicIds,
                      dateKey: dateKey)
    }

    /// Returns the cached file URL for today's briefing if one exists,
    /// else nil. Cheap — no network, no synth. Reads UserDefaults directly
    /// so the UI can check sync-from-actor without awaiting.
    nonisolated func cachedURLForToday() -> URL? {
        let dateKey = Self.todayKey()
        let topicIds = UserDefaults.standard.array(
            forKey: "audexa.dailyBrief.selectedTopicIds.v1"
        ) as? [String] ?? []
        guard !topicIds.isEmpty else { return nil }
        let url = cachedFileURL(dateKey: dateKey, topicIds: topicIds)
        return FileManager.default.fileExists(atPath: url.path) ? url : nil
    }

    /// Delete every cached briefing older than yesterday. Cheap — just a
    /// directory scan. Call from app launch.
    func purgeOldCaches() throws {
        let dir = cacheDirURL()
        guard FileManager.default.fileExists(atPath: dir.path) else { return }
        let entries = (try? FileManager.default.contentsOfDirectory(at: dir, includingPropertiesForKeys: nil)) ?? []
        let cutoff = Calendar.current.date(byAdding: .day, value: -1, to: Date()) ?? Date()
        for url in entries {
            if let attrs = try? FileManager.default.attributesOfItem(atPath: url.path),
               let modified = attrs[.modificationDate] as? Date,
               modified < cutoff {
                try? FileManager.default.removeItem(at: url)
            }
        }
    }

    // MARK: - Backend script fetch

    private func fetchScript(userEmail: String, topicIds: [String]) async throws -> PodcastScript {
        let endpoint = "\(baseURL)/podcast/script"
        guard let url = URL(string: endpoint) else { throw DailyBriefingError.invalidURL }

        let body: [String: Any] = [
            "user_id": userEmail,
            "preferences": [
                "briefing_time": Self.currentBriefingTimeHHmm(),
                "topics": topicIds,
                "include_topics": true,
                "include_weather": false,
                "include_calendar": false,
                "include_email": false,
                "language": "en",
            ],
        ]

        var req = URLRequest(url: url)
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try JSONSerialization.data(withJSONObject: body)
        req.timeoutInterval = 90

        let (data, response): (Data, URLResponse)
        do {
            (data, response) = try await URLSession.shared.data(for: req)
        } catch {
            throw DailyBriefingError.network(error.localizedDescription)
        }

        guard let http = response as? HTTPURLResponse else {
            throw DailyBriefingError.network("Invalid response")
        }
        guard (200..<300).contains(http.statusCode) else {
            let msg = String(data: data, encoding: .utf8) ?? "HTTP \(http.statusCode)"
            throw DailyBriefingError.serverError(http.statusCode, msg)
        }

        // The /podcast/script endpoint returns
        // { success: true, script: { segments, totalSegments, language }, title }.
        // Reuse PodcastScript (decodes `segments`).
        let decoder = JSONDecoder()
        struct Envelope: Decodable {
            let success: Bool
            let script: PodcastScript
        }
        do {
            return try decoder.decode(Envelope.self, from: data).script
        } catch {
            throw DailyBriefingError.scriptDecode(error.localizedDescription)
        }
    }

    // MARK: - Helpers

    private struct PreferenceSnapshot { let selectedTopicIds: [String]; let userEmail: String? }

    private func readPreferenceSnapshot() async -> PreferenceSnapshot {
        await MainActor.run {
            let ids = UserTopicPreferences.shared.selectedTopicIds
            // Same key as NotificationSettingsView's manual-trigger path.
            let email = UserDefaults.standard.string(forKey: "linkedAccountEmail")
            return PreferenceSnapshot(selectedTopicIds: ids, userEmail: email)
        }
    }

    private static func todayKey() -> String {
        let df = DateFormatter()
        df.dateFormat = "yyyy-MM-dd"
        df.timeZone = TimeZone.current
        return df.string(from: Date())
    }

    private static func currentBriefingTimeHHmm() -> String {
        let df = DateFormatter()
        df.dateFormat = "HH:mm"
        return df.string(from: Date())
    }

    nonisolated private func cachedFileURL(dateKey: String, topicIds: [String]) -> URL {
        // Hash the topic set so a same-day selection change re-renders.
        let token = topicIds.sorted().joined(separator: ",")
        let safeToken = token.replacingOccurrences(of: "/", with: "_")
                              .replacingOccurrences(of: ":", with: "_")
                              .replacingOccurrences(of: " ", with: "_")
        let digest = String(safeToken.hash, radix: 16)
        return cacheDirURL().appendingPathComponent("briefing-\(dateKey)-\(digest).wav")
    }

    nonisolated private func cacheDirURL() -> URL {
        let root = FileManager.default.urls(for: .libraryDirectory, in: .userDomainMask)[0]
        return root.appendingPathComponent("DailyBriefings", isDirectory: true)
    }

    private func ensureCacheDirExists() throws {
        let dir = cacheDirURL()
        if !FileManager.default.fileExists(atPath: dir.path) {
            try FileManager.default.createDirectory(at: dir, withIntermediateDirectories: true)
        }
    }

    /// Best-effort WAV duration probe. Reads the 16-bit-PCM header at 24 kHz
    /// the synthesizer emits. Returns nil if anything looks off so callers
    /// fall back to a clean re-render.
    private func readWavDuration(at url: URL) -> Double? {
        guard let data = try? Data(contentsOf: url, options: [.mappedIfSafe]),
              data.count > 44,
              data.starts(with: [0x52, 0x49, 0x46, 0x46]) // "RIFF"
        else { return nil }
        let sampleRate = 24_000
        let bytesPerSample = 2
        let samples = (data.count - 44) / bytesPerSample
        return Double(samples) / Double(sampleRate)
    }
}

enum DailyBriefingError: LocalizedError {
    case noTopicsSelected
    case notLinked
    case deviceIneligible
    case invalidURL
    case network(String)
    case serverError(Int, String)
    case scriptDecode(String)
    case scriptEmpty

    var errorDescription: String? {
        switch self {
        case .noTopicsSelected:
            return "Pick at least one topic to include in your daily briefing."
        case .notLinked:
            return "Link your account in Settings to generate a daily briefing."
        case .deviceIneligible:
            return "Daily briefing needs iPhone 13 or newer with iOS 17+."
        case .invalidURL:
            return "Couldn't build the request URL."
        case .network(let detail):
            return "Network error: \(detail)"
        case .serverError(let code, _):
            return "The briefing server returned an error (HTTP \(code))."
        case .scriptDecode(let detail):
            return "Couldn't decode the briefing script: \(detail)"
        case .scriptEmpty:
            return "The briefing script came back empty."
        }
    }
}
