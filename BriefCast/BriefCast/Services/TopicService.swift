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

    /// Standard session for quick requests (60s timeout)
    private let standardSession: URLSession

    /// Long-running session for generation requests (3 min timeout)
    private let generationSession: URLSession

    private init() {
        jsonDecoder = JSONDecoder()

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
    }

    // MARK: - Topics

    /// Fetch all available topics
    func fetchTopics() async throws -> TopicsData {
        let endpoint = "\(baseURL)/topics"
        let data = try await performRequest(endpoint: endpoint)

        let response = try jsonDecoder.decode(TopicsResponse.self, from: data)
        return response.data
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
            publisher: "BriefCast",
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
