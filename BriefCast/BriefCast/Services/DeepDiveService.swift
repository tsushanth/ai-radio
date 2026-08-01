//
//  DeepDiveService.swift
//  BriefCast
//
//  Service for generating and managing Deep Dive on-demand research podcasts
//

import Foundation
import UIKit

@MainActor
class DeepDiveService {
    static let shared = DeepDiveService()

    private let baseURL = "https://ai-radio-backend.fly.dev/api"
    private let jsonDecoder: JSONDecoder
    private let jsonEncoder: JSONEncoder

    /// Standard session for quick requests (60s timeout)
    private let standardSession: URLSession

    /// Extended timeout session for research/generation (5 min timeout)
    private let generationSession: URLSession

    // Cache keys
    private static let cachedDeepDivesKey = "cachedDeepDives"
    private static let cacheTimestampKey = "deepDivesCacheTimestamp"

    // In-memory cache for instant access
    private var cachedDeepDives: [DeepDiveEpisode] = []

    /// Get the current user ID from UserDefaults or device ID
    private var currentUserId: String {
        // Check for guest user first
        if let guestId = UserDefaults.standard.string(forKey: "guestUserId"), !guestId.isEmpty {
            return guestId
        }
        // Fall back to device ID
        return UIDevice.current.identifierForVendor?.uuidString ?? "anonymous-\(Int(Date().timeIntervalSince1970))"
    }

    private init() {
        jsonDecoder = JSONDecoder()
        jsonEncoder = JSONEncoder()

        // Standard session with default timeout
        let standardConfig = URLSessionConfiguration.default
        standardConfig.timeoutIntervalForRequest = 60
        standardConfig.timeoutIntervalForResource = 60
        standardSession = URLSession(configuration: standardConfig)

        // Generation session with extended timeout (research can take 3-5 minutes)
        let generationConfig = URLSessionConfiguration.default
        generationConfig.timeoutIntervalForRequest = 300 // 5 minutes
        generationConfig.timeoutIntervalForResource = 300
        generationSession = URLSession(configuration: generationConfig)

        // Load cached deep dives into memory
        loadCachedDeepDivesIntoMemory()
    }

    // MARK: - Caching

    private func loadCachedDeepDivesIntoMemory() {
        if let data = UserDefaults.standard.data(forKey: Self.cachedDeepDivesKey),
           let episodes = try? jsonDecoder.decode([DeepDiveEpisode].self, from: data) {
            cachedDeepDives = episodes
            print("📦 Loaded \(episodes.count) cached deep dives into memory")
        }
    }

    private func cacheDeepDives(_ episodes: [DeepDiveEpisode]) {
        cachedDeepDives = episodes

        if let data = try? jsonEncoder.encode(episodes) {
            UserDefaults.standard.set(data, forKey: Self.cachedDeepDivesKey)
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Self.cacheTimestampKey)
            print("💾 Cached \(episodes.count) deep dives")
        }
    }

    private func addToCache(_ episode: DeepDiveEpisode) {
        // Remove if already exists (by ID) and add to front
        cachedDeepDives.removeAll { $0.id == episode.id }
        cachedDeepDives.insert(episode, at: 0)

        // Keep only last 50
        if cachedDeepDives.count > 50 {
            cachedDeepDives = Array(cachedDeepDives.prefix(50))
        }

        cacheDeepDives(cachedDeepDives)
    }

    /// Get cached deep dives (returns immediately from memory)
    func getCachedDeepDives() -> [DeepDiveEpisode] {
        return cachedDeepDives
    }

    /// Remove a single dive from the local cache without touching the
    /// backend. Used by the "Try again" flow to clear a failed/stale row
    /// before kicking off a fresh generation.
    func dropEpisode(id: String) {
        let before = cachedDeepDives.count
        cachedDeepDives.removeAll { $0.id == id }
        if cachedDeepDives.count != before {
            cacheDeepDives(cachedDeepDives)
            NotificationCenter.default.post(name: .deepDiveListChanged, object: nil)
        }
    }

    /// Drop every locally-cached failed attempt for a given query so that
    /// the new attempt isn't shadowed by leftover red cards in the home
    /// list — and so the detail view's "post-poll swap" can't accidentally
    /// revert the new placeholder to an older failure. Completed dives are
    /// preserved (they're real history).
    func dropFailedAttempts(matching query: String) {
        let before = cachedDeepDives.count
        cachedDeepDives.removeAll { $0.status == .failed && $0.query == query }
        if cachedDeepDives.count != before {
            cacheDeepDives(cachedDeepDives)
            NotificationCenter.default.post(name: .deepDiveListChanged, object: nil)
        }
    }

    var hasCachedDeepDives: Bool {
        return !cachedDeepDives.isEmpty
    }

    // MARK: - Optimistic / Background Generation

    /// Insert a client-side placeholder for a new deep dive and kick off the
    /// real generation in the background. Returns immediately with the
    /// placeholder so the caller can dismiss the input UI and let the home
    /// list render it as "researching" right away.
    ///
    /// When the backend response lands the placeholder is removed and the
    /// real episode takes its place. Both transitions fire
    /// `.deepDiveListChanged` so observers can refresh.
    @discardableResult
    func startBackgroundGeneration(
        query: String,
        language: String = "en",
        targetDurationMinutes: Int = 10
    ) -> DeepDiveEpisode {
        let placeholderId = "dd-pending-\(UUID().uuidString)"
        let nowIso = ISO8601DateFormatter().string(from: Date())
        let placeholder = DeepDiveEpisode(
            id: placeholderId,
            userId: currentUserId,
            query: query,
            title: query,
            description: "Researching your deep dive…",
            audioUrl: nil,
            durationSeconds: targetDurationMinutes * 60,
            status: .researching,
            language: language,
            sources: [],
            generatedAt: nil,
            createdAt: nowIso,
            errorMessage: nil,
            script: nil
        )

        addToCache(placeholder)
        NotificationCenter.default.post(name: .deepDiveListChanged, object: nil)
        print("🪄 [DeepDive] inserted placeholder \(placeholderId)")

        Task { [weak self] in
            guard let self else { return }
            do {
                let serverStub = try await self.generateDeepDive(
                    query: query,
                    language: language,
                    targetDurationMinutes: targetDurationMinutes
                )
                await MainActor.run {
                    self.replacePlaceholder(placeholderId: placeholderId, with: serverStub)
                }
                // Backend is fire-and-forget: the 202 stub above is just an
                // ack. Poll history every 45s until the dive lands as
                // completed/failed, with a 15-minute ceiling so we don't
                // poll forever on a stuck dive.
                await self.pollUntilDone(query: query, since: Date().addingTimeInterval(-30))
            } catch {
                print("❌ [DeepDive] background generation failed: \(error.localizedDescription)")
                await MainActor.run {
                    self.failPlaceholder(placeholderId: placeholderId, message: error.localizedDescription)
                }
            }
        }

        return placeholder
    }

    /// Poll `/deepdive/history` until an episode matching `query` shows up
    /// as `.completed` or `.failed`, capped at 15 minutes. Each successful
    /// fetch posts `.deepDiveListChanged` so the home view picks up the
    /// status flip without the user pulling to refresh.
    private func pollUntilDone(query: String, since cutoff: Date) async {
        let deadline = Date().addingTimeInterval(15 * 60)
        let intervalNs: UInt64 = 45 * 1_000_000_000
        let isoParser = ISO8601DateFormatter()
        isoParser.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let isoParserFallback = ISO8601DateFormatter()
        isoParserFallback.formatOptions = [.withInternetDateTime]

        while Date() < deadline {
            try? await Task.sleep(nanoseconds: intervalNs)
            do {
                let history = try await fetchHistory(limit: 20)
                NotificationCenter.default.post(name: .deepDiveListChanged, object: nil)

                // Look for a recently-created episode for the same query.
                let match = history.first { ep in
                    guard ep.query == query else { return false }
                    guard ep.status == .completed || ep.status == .failed else { return false }
                    let createdAtStr = ep.generatedAt ?? ep.createdAt
                    let createdDate = isoParser.date(from: createdAtStr) ?? isoParserFallback.date(from: createdAtStr) ?? Date()
                    return createdDate >= cutoff
                }
                if let match = match {
                    print("🪄 [DeepDive] polling found \(match.status.rawValue) dive \(match.id)")
                    return
                }
                print("🪄 [DeepDive] still polling — \(Int(deadline.timeIntervalSinceNow))s left")
            } catch {
                print("🪄 [DeepDive] poll fetch failed: \(error.localizedDescription)")
            }
        }
        print("🪄 [DeepDive] polling timed out after 15 minutes")
    }

    private func replacePlaceholder(placeholderId: String, with episode: DeepDiveEpisode) {
        cachedDeepDives.removeAll { $0.id == placeholderId }
        cachedDeepDives.removeAll { $0.id == episode.id } // dedupe in case
        cachedDeepDives.insert(episode, at: 0)
        if cachedDeepDives.count > 50 {
            cachedDeepDives = Array(cachedDeepDives.prefix(50))
        }
        cacheDeepDives(cachedDeepDives)
        NotificationCenter.default.post(
            name: .deepDiveListChanged,
            object: nil,
            userInfo: ["placeholderId": placeholderId, "episodeId": episode.id]
        )
        print("🪄 [DeepDive] swapped placeholder → \(episode.id)")
    }

    private func failPlaceholder(placeholderId: String, message: String) {
        guard let idx = cachedDeepDives.firstIndex(where: { $0.id == placeholderId }) else { return }
        let p = cachedDeepDives[idx]
        let failed = DeepDiveEpisode(
            id: p.id,
            userId: p.userId,
            query: p.query,
            title: p.title,
            description: p.description,
            audioUrl: nil,
            durationSeconds: p.durationSeconds,
            status: .failed,
            language: p.language,
            sources: [],
            generatedAt: nil,
            createdAt: p.createdAt,
            errorMessage: message,
            script: nil
        )
        cachedDeepDives[idx] = failed
        cacheDeepDives(cachedDeepDives)
        NotificationCenter.default.post(name: .deepDiveListChanged, object: nil)
    }

    // MARK: - Generate Deep Dive

    /// Generate a new Deep Dive episode for the given query
    /// - Parameters:
    ///   - query: The topic/question to research
    ///   - language: Language code (default: "en")
    ///   - targetDurationMinutes: Target duration in minutes (5, 10, or 15)
    /// - Returns: The generated DeepDiveEpisode
    func generateDeepDive(
        query: String,
        language: String = "en",
        targetDurationMinutes: Int = 10
    ) async throws -> DeepDiveEpisode {
        let endpoint = "\(baseURL)/deepdive/generate"

        // Deep Dive is on-device only. Cloud rendering was removed —
        // 3-10 min server-side generation was too slow and expensive.
        // Callers should gate on `KokoroModelManager.isDeviceEligible`
        // before reaching this method; we re-check defensively.
        guard KokoroModelManager.isDeviceEligible else {
            print("🔬 [DeepDive] BLOCKED — device ineligible for on-device synth")
            throw DeepDiveError.deviceIneligible
        }
        guard language.hasPrefix("en") else {
            print("🔬 [DeepDive] BLOCKED — language=\(language) not supported on-device")
            throw DeepDiveError.unsupportedLanguage(language)
        }

        // Warm the Kokoro pipeline if it isn't loaded yet. Tolerates a
        // cold start; the synthesizer's own progress reporting surfaces
        // model download UI when needed.
        let kokoroReady = await MainActor.run {
            KokoroModelManager.shared.state == .ready
        }
        if !kokoroReady {
            print("🔬 [DeepDive] Kokoro not ready — preparing model first")
            do {
                try await KokoroPodcastSynthesizer.shared.prepare()
            } catch {
                print("🔬 [DeepDive] Kokoro prepare failed: \(error.localizedDescription)")
                throw DeepDiveError.modelUnavailable(error.localizedDescription)
            }
        }

        print("🔬 [DeepDive] Starting generation (ON-DEVICE)")
        print("   query: \"\(query)\"")
        print("   language: \(language), targetMinutes: \(targetDurationMinutes)")
        print("   estimated total: ~60-120s")

        // Always request script-only — we render audio on-device.
        let request = DeepDiveGenerationRequest(
            query: query,
            language: language,
            targetDurationMinutes: targetDurationMinutes,
            userId: currentUserId,
            format: "script"
        )

        let bodyData = try jsonEncoder.encode(request)

        let requestStart = Date()
        print("🔬 [DeepDive] POST \(endpoint)")

        let data = try await performRequest(
            endpoint: endpoint,
            method: "POST",
            bodyData: bodyData,
            session: generationSession
        )

        let elapsed = Date().timeIntervalSince(requestStart)
        print("🔬 [DeepDive] backend responded in \(String(format: "%.1f", elapsed))s (\(data.count) bytes)")

        let response: DeepDiveResponse
        do {
            response = try jsonDecoder.decode(DeepDiveResponse.self, from: data)
        } catch {
            // Surface raw body + structured DecodingError context so a
            // recurrence of "data couldn't be read because it is missing"
            // tells us EXACTLY which field choked instead of the generic
            // localized message.
            let raw = String(data: data, encoding: .utf8) ?? "<non-utf8>"
            print("❌ [DeepDive] decode failed: \(error)")
            print("❌ [DeepDive] raw response: \(raw)")
            if let dec = error as? DecodingError {
                switch dec {
                case .keyNotFound(let key, let ctx):
                    print("❌ [DeepDive] keyNotFound: \(key.stringValue) at \(ctx.codingPath.map(\.stringValue))")
                case .typeMismatch(let type, let ctx):
                    print("❌ [DeepDive] typeMismatch: expected \(type) at \(ctx.codingPath.map(\.stringValue))")
                case .valueNotFound(let type, let ctx):
                    print("❌ [DeepDive] valueNotFound: expected \(type) at \(ctx.codingPath.map(\.stringValue))")
                case .dataCorrupted(let ctx):
                    print("❌ [DeepDive] dataCorrupted at \(ctx.codingPath.map(\.stringValue)): \(ctx.debugDescription)")
                @unknown default:
                    break
                }
            }
            throw error
        }
        let episode = response.data.episode

        let hasAudio = !(episode.audioUrl?.isEmpty ?? true)
        let hasScript = !(episode.script?.isEmpty ?? true)
        print("✅ [DeepDive] Generated: \"\(episode.title)\"")
        print("   id: \(episode.id), status: \(episode.status.rawValue)")
        print("   audioUrl: \(hasAudio ? "present" : "nil"), script: \(hasScript ? "present (\(episode.script?.count ?? 0) chars)" : "nil")")
        print("   payload kind: \(hasAudio ? "CLOUD AUDIO" : (hasScript ? "SCRIPT (will synth on-device)" : "EMPTY"))")

        // Add to cache
        addToCache(episode)

        return episode
    }

    // MARK: - Fetch History

    /// Fetch user's deep dive history
    /// - Parameters:
    ///   - limit: Maximum number of episodes to fetch
    ///   - offset: Offset for pagination
    /// - Returns: Array of DeepDiveEpisodes
    func fetchHistory(limit: Int = 20, offset: Int = 0) async throws -> [DeepDiveEpisode] {
        let endpoint = "\(baseURL)/deepdive/history?userId=\(currentUserId)&limit=\(limit)&offset=\(offset)"

        do {
            let data = try await performRequest(endpoint: endpoint)
            let response = try jsonDecoder.decode(DeepDiveHistoryResponse.self, from: data)

            // Update cache with fresh data
            if offset == 0 {
                cacheDeepDives(response.data.episodes)
            }

            return response.data.episodes
        } catch {
            // If network fails and we have cache, return cache
            if !cachedDeepDives.isEmpty {
                print("⚠️ Network failed, using cached deep dives: \(error.localizedDescription)")
                return cachedDeepDives
            }
            throw error
        }
    }

    /// Fetch history with immediate cached data callback
    func fetchHistoryWithCache(onCachedData: (([DeepDiveEpisode]) -> Void)? = nil) async throws -> [DeepDiveEpisode] {
        // Immediately return cached data if available
        if !cachedDeepDives.isEmpty {
            onCachedData?(cachedDeepDives)
        }

        // Then fetch fresh data
        return try await fetchHistory()
    }

    // MARK: - Get Single Deep Dive

    /// Fetch a single deep dive by ID
    func getDeepDive(id: String) async throws -> DeepDiveEpisode {
        // Check cache first
        if let cached = cachedDeepDives.first(where: { $0.id == id }) {
            return cached
        }

        let endpoint = "\(baseURL)/deepdive/\(id)?userId=\(currentUserId)"
        let data = try await performRequest(endpoint: endpoint)

        // Parse response - could be wrapped or direct
        if let response = try? jsonDecoder.decode(DeepDiveResponse.self, from: data) {
            return response.data.episode
        }

        // Try direct decode
        let episode = try jsonDecoder.decode(DeepDiveEpisode.self, from: data)
        return episode
    }

    // MARK: - Delete Deep Dive

    /// Delete a deep dive from history
    func deleteDeepDive(id: String) async throws {
        let endpoint = "\(baseURL)/deepdive/\(id)?userId=\(currentUserId)"

        _ = try await performRequest(endpoint: endpoint, method: "DELETE")

        // Remove from cache
        cachedDeepDives.removeAll { $0.id == id }
        cacheDeepDives(cachedDeepDives)

        print("🗑️ Deleted deep dive: \(id)")
    }

    // MARK: - Network

    private func performRequest(
        endpoint: String,
        method: String = "GET",
        bodyData: Data? = nil,
        session: URLSession? = nil
    ) async throws -> Data {
        guard let url = URL(string: endpoint) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let bodyData = bodyData {
            request.httpBody = bodyData
        }

        let urlSession = session ?? standardSession

        do {
            let (data, response) = try await urlSession.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }

            switch httpResponse.statusCode {
            case 200...299:
                return data
            case 404:
                throw APIError.notFound
            default:
                let errorMessage = try? JSONDecoder().decode(ErrorResponse.self, from: data).displayMessage ?? nil
                throw APIError.serverError(httpResponse.statusCode, errorMessage)
            }
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.networkError(error)
        }
    }
}

extension Notification.Name {
    /// Posted whenever the cached deep-dive list changes (placeholder added,
    /// real episode swapped in, failure recorded, history fetched).
    /// Observers should re-read `DeepDiveService.shared.getCachedDeepDives()`.
    static let deepDiveListChanged = Notification.Name("deepDiveListChanged")
}

// MARK: - Deep Dive Errors

enum DeepDiveError: LocalizedError {
    case deviceIneligible
    case unsupportedLanguage(String)
    case modelUnavailable(String)

    var errorDescription: String? {
        switch self {
        case .deviceIneligible:
            return "Deep Dive needs iPhone 13 or newer with iOS 17+."
        case .unsupportedLanguage(let lang):
            return "Deep Dive is currently English-only (\(lang) not supported)."
        case .modelUnavailable(let detail):
            return "Couldn't load the on-device model: \(detail)"
        }
    }
}

// MARK: - Deep Dive Playback State

enum DeepDivePlaybackState: Equatable {
    case idle
    case loading(String)     // episodeId
    case generating(String)  // query
    case ready(DeepDiveEpisode)
    case playing(DeepDiveEpisode)
    case error(String)

    static func == (lhs: DeepDivePlaybackState, rhs: DeepDivePlaybackState) -> Bool {
        switch (lhs, rhs) {
        case (.idle, .idle): return true
        case (.loading(let a), .loading(let b)): return a == b
        case (.generating(let a), .generating(let b)): return a == b
        case (.ready(let a), .ready(let b)): return a.id == b.id
        case (.playing(let a), .playing(let b)): return a.id == b.id
        case (.error(let a), .error(let b)): return a == b
        default: return false
        }
    }
}
