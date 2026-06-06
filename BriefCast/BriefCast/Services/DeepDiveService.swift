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

    var hasCachedDeepDives: Bool {
        return !cachedDeepDives.isEmpty
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

        let request = DeepDiveGenerationRequest(
            query: query,
            language: language,
            targetDurationMinutes: targetDurationMinutes,
            userId: currentUserId
        )

        let bodyData = try jsonEncoder.encode(request)

        print("🔬 Generating deep dive for: \(query)")

        let data = try await performRequest(
            endpoint: endpoint,
            method: "POST",
            bodyData: bodyData,
            session: generationSession
        )

        let response = try jsonDecoder.decode(DeepDiveResponse.self, from: data)
        let episode = response.data.episode

        print("✅ Deep dive generated: \(episode.title)")

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
                let errorMessage = try? JSONDecoder().decode(ErrorResponse.self, from: data).message
                throw APIError.serverError(httpResponse.statusCode, errorMessage)
            }
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.networkError(error)
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
