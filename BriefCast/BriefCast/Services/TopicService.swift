//
//  TopicService.swift
//  BriefCast
//
//  Service for fetching and playing topic-based podcasts
//

import Foundation

@MainActor
class TopicService {
    static let shared = TopicService()

    private let baseURL = "https://ai-radio-backend-917362189743.us-central1.run.app/api"
    private let jsonDecoder: JSONDecoder
    private let jsonEncoder: JSONEncoder

    /// Standard session for quick requests (60s timeout)
    private let standardSession: URLSession

    /// Long-running session for generation requests (3 min timeout)
    private let generationSession: URLSession

    // Cache keys
    private static let cachedTopicsKey = "cachedTopics"
    private static let cachedCategoriesKey = "cachedCategories"
    private static let cacheTimestampKey = "topicsCacheTimestamp"

    // In-memory cache for instant access
    private var cachedTopicsData: TopicsData?

    private init() {
        jsonDecoder = JSONDecoder()
        jsonEncoder = JSONEncoder()

        // Standard session with default timeout
        let standardConfig = URLSessionConfiguration.default
        standardConfig.timeoutIntervalForRequest = 60
        standardConfig.timeoutIntervalForResource = 60
        standardSession = URLSession(configuration: standardConfig)

        // Generation session with extended timeout (podcast generation can take 2+ minutes)
        let generationConfig = URLSessionConfiguration.default
        generationConfig.timeoutIntervalForRequest = 180 // 3 minutes
        generationConfig.timeoutIntervalForResource = 180
        generationSession = URLSession(configuration: generationConfig)

        // Load cached topics into memory immediately
        loadCachedTopicsIntoMemory()
    }

    // MARK: - Topic Caching

    /// Load cached topics from UserDefaults into memory for instant access
    private func loadCachedTopicsIntoMemory() {
        if let topicsData = UserDefaults.standard.data(forKey: Self.cachedTopicsKey),
           let categoriesData = UserDefaults.standard.data(forKey: Self.cachedCategoriesKey),
           let topics = try? jsonDecoder.decode([Topic].self, from: topicsData),
           let categories = try? jsonDecoder.decode([CategoryInfo].self, from: categoriesData) {
            cachedTopicsData = TopicsData(topics: topics, categories: categories)
            print("📦 Loaded \(topics.count) cached topics into memory")
        }
    }

    /// Save topics to cache (UserDefaults + memory)
    private func cacheTopics(_ data: TopicsData) {
        cachedTopicsData = data

        if let topicsData = try? jsonEncoder.encode(data.topics),
           let categoriesData = try? jsonEncoder.encode(data.categories) {
            UserDefaults.standard.set(topicsData, forKey: Self.cachedTopicsKey)
            UserDefaults.standard.set(categoriesData, forKey: Self.cachedCategoriesKey)
            UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: Self.cacheTimestampKey)
            print("💾 Cached \(data.topics.count) topics")
        }
    }

    /// Get cached topics (returns immediately from memory if available)
    func getCachedTopics() -> TopicsData? {
        return cachedTopicsData
    }

    /// Check if cache exists
    var hasCachedTopics: Bool {
        return cachedTopicsData != nil
    }

    // MARK: - Topics

    /// Fetch all available topics - returns cached data immediately, then updates from server
    /// Use this for initial load to show content instantly
    func fetchTopics() async throws -> TopicsData {
        // Try to fetch from server
        let endpoint = "\(baseURL)/topics"

        do {
            let data = try await performRequest(endpoint: endpoint)
            let response = try jsonDecoder.decode(TopicsResponse.self, from: data)

            // Cache the fresh data (server takes precedence)
            cacheTopics(response.data)

            return response.data
        } catch {
            // If network fails and we have cache, return cache
            if let cached = cachedTopicsData {
                print("⚠️ Network failed, using cached topics: \(error.localizedDescription)")
                return cached
            }
            // No cache, propagate error
            throw error
        }
    }

    /// Fetch topics with callback for immediate cached data
    /// - Parameter onCachedData: Called immediately with cached data if available
    /// - Returns: Fresh data from server (also updates cache)
    func fetchTopicsWithCache(onCachedData: ((TopicsData) -> Void)? = nil) async throws -> TopicsData {
        // Immediately return cached data if available
        if let cached = cachedTopicsData {
            onCachedData?(cached)
        }

        // Then fetch fresh data from server
        return try await fetchTopics()
    }

    /// Fetch a single topic with recent episodes
    func fetchTopic(_ topicId: String) async throws -> TopicDetailData {
        let endpoint = "\(baseURL)/topics/\(topicId)"
        let data = try await performRequest(endpoint: endpoint)

        let response = try jsonDecoder.decode(TopicDetailResponse.self, from: data)
        return response.data
    }

    // MARK: - Episodes

    /// Get or generate today's episode for a topic
    func getOrGenerateEpisode(
        topicId: String,
        language: String = "en",
        forceRegenerate: Bool = false
    ) async throws -> TopicEpisodeData {
        var endpoint = "\(baseURL)/topics/\(topicId)/episode?lang=\(language)"
        if forceRegenerate {
            endpoint += "&regenerate=true"
        }

        // Use generation session since this may trigger generation
        let data = try await performRequest(endpoint: endpoint, session: generationSession)

        let response = try jsonDecoder.decode(TopicEpisodeResponse.self, from: data)
        return response.data
    }

    /// Generate a new episode (force generation)
    func generateEpisode(topicId: String, language: String = "en") async throws -> TopicEpisodeData {
        let endpoint = "\(baseURL)/topics/\(topicId)/generate"

        let bodyDict: [String: Any] = [
            "forceRegenerate": true,
            "language": language
        ]
        let bodyData = try JSONSerialization.data(withJSONObject: bodyDict)

        // Use generation session with extended timeout
        let data = try await performRequest(endpoint: endpoint, method: "POST", bodyData: bodyData, session: generationSession)

        let response = try jsonDecoder.decode(TopicEpisodeResponse.self, from: data)
        return response.data
    }

    /// Fetch episode history for a topic
    func fetchEpisodeHistory(
        topicId: String,
        language: String = "en",
        limit: Int = 7
    ) async throws -> [TopicEpisode] {
        let endpoint = "\(baseURL)/topics/\(topicId)/episodes?lang=\(language)&limit=\(limit)"
        let data = try await performRequest(endpoint: endpoint)

        let response = try jsonDecoder.decode(TopicEpisodesResponse.self, from: data)
        return response.data.episodes
    }

    // MARK: - Ad Tracking

    /// Track an ad impression (fire-and-forget)
    func trackAdImpression(
        creativeId: String,
        campaignId: String,
        episodeId: String,
        topicId: String,
        language: String,
        durationListened: Int,
        wasSkipped: Bool
    ) async {
        let endpoint = "\(baseURL)/ads/impression"
        let body: [String: Any] = [
            "creativeId": creativeId,
            "campaignId": campaignId,
            "episodeId": episodeId,
            "topicId": topicId,
            "devicePlatform": "ios",
            "language": language,
            "durationListenedSeconds": durationListened,
            "wasSkipped": wasSkipped
        ]

        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            _ = try await performRequest(endpoint: endpoint, method: "POST", bodyData: bodyData)
        } catch {
            print("Failed to track ad impression: \(error.localizedDescription)")
        }
    }

    /// Track an ad click (fire-and-forget)
    func trackAdClick(creativeId: String, campaignId: String) async {
        let endpoint = "\(baseURL)/ads/click"
        let body: [String: Any] = [
            "creativeId": creativeId,
            "campaignId": campaignId
        ]

        do {
            let bodyData = try JSONSerialization.data(withJSONObject: body)
            _ = try await performRequest(endpoint: endpoint, method: "POST", bodyData: bodyData)
        } catch {
            print("Failed to track ad click: \(error.localizedDescription)")
        }
    }

    // MARK: - Helpers

    /// Convert Topic to Show for UI compatibility
    func topicToShow(_ topic: Topic) -> Show {
        Show(
            id: topic.id,
            title: topic.name,
            description: topic.description,
            category: topic.category.displayName,
            imageUrl: nil,
            imageColor: topic.color,
            episodeCount: topic.targetDurationMinutes,
            isSubscribed: false,
            publisher: "Audexa",
            rating: nil
        )
    }

    /// Group topics by category for Discover view
    func groupTopicsByCategory(_ topics: [Topic]) -> [Category] {
        let grouped = Dictionary(grouping: topics) { $0.category }

        return grouped.map { category, categoryTopics in
            Category(
                id: category.rawValue,
                name: category.displayName,
                icon: category.icon,
                color: categoryTopics.first?.color ?? "#4A90E2",
                shows: categoryTopics.map { topicToShow($0) }
            )
        }.sorted { $0.name < $1.name }
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

// MARK: - Episode State

enum TopicPlaybackState: Equatable {
    case idle
    case loading(String)     // topicId
    case generating(String)  // topicId
    case ready(TopicEpisode)
    case playing(TopicEpisode)
    case error(String)

    static func == (lhs: TopicPlaybackState, rhs: TopicPlaybackState) -> Bool {
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
