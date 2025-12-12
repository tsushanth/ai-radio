//
//  PodcastService.swift
//  BriefCast
//
//  Service for generating morning brief podcasts from email and calendar data
//

import Foundation

actor PodcastService {
    static let shared = PodcastService()

    private let baseURL = "https://ai-radio-backend-917362189743.us-central1.run.app/api"

    // MARK: - Generate Podcast

    struct GeneratePodcastRequest: Codable {
        let userId: String
        let date: String  // Client's local date in YYYY-MM-DD format
        let preferences: Preferences

        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
            case date
            case preferences
        }

        struct Preferences: Codable {
            let briefingTime: String
            let topics: [String]
            let voiceHost1: String
            let voiceHost2: String
            let includeWeather: Bool
            let includeCalendar: Bool
            let includeEmail: Bool

            enum CodingKeys: String, CodingKey {
                case briefingTime = "briefing_time"
                case topics
                case voiceHost1 = "voice_host1"
                case voiceHost2 = "voice_host2"
                case includeWeather = "include_weather"
                case includeCalendar = "include_calendar"
                case includeEmail = "include_email"
            }
        }
    }

    struct GeneratePodcastResponse: Codable {
        let success: Bool
        let episode: EpisodeInfo
        let costEstimate: CostEstimate

        enum CodingKeys: String, CodingKey {
            case success
            case episode
            case costEstimate = "cost_estimate"
        }

        struct EpisodeInfo: Codable {
            let id: String
            let audioUrl: String
            let durationSeconds: Int
            let scriptSegments: Int

            enum CodingKeys: String, CodingKey {
                case id
                case audioUrl = "audio_url"
                case durationSeconds = "duration_seconds"
                case scriptSegments = "script_segments"
            }
        }

        struct CostEstimate: Codable {
            let scriptCostUsd: Double
            let ttsCostUsd: Double
            let totalCostUsd: Double

            enum CodingKeys: String, CodingKey {
                case scriptCostUsd = "script_cost_usd"
                case ttsCostUsd = "tts_cost_usd"
                case totalCostUsd = "total_cost_usd"
            }
        }
    }

    /// Generate a morning brief podcast
    func generatePodcast(
        for userEmail: String,
        preferences: UserPreferences
    ) async throws -> GeneratePodcastResponse {
        let url = URL(string: "\(baseURL)/podcast/generate")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Set generous timeout for podcast generation (can take 1-2 minutes)
        request.timeoutInterval = 180 // 3 minutes

        // Use client's local date to ensure consistency with UI
        let dateFormatter = DateFormatter()
        dateFormatter.dateFormat = "yyyy-MM-dd"
        let localDate = dateFormatter.string(from: Date())

        let requestBody = GeneratePodcastRequest(
            userId: userEmail,
            date: localDate,
            preferences: GeneratePodcastRequest.Preferences(
                briefingTime: preferences.briefingTime ?? "07:00",
                topics: preferences.topics ?? [],
                voiceHost1: preferences.voiceHost1 ?? "nova",
                voiceHost2: preferences.voiceHost2 ?? "onyx",
                includeWeather: preferences.includeWeather ?? false,
                includeCalendar: preferences.includeCalendar ?? true,
                includeEmail: preferences.includeEmail ?? true
            )
        )

        request.httpBody = try JSONEncoder().encode(requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NSError(domain: "PodcastService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
        }

        guard httpResponse.statusCode == 201 else {
            // Try to parse error message
            if let errorJson = try? JSONDecoder().decode([String: String].self, from: data),
               let errorMessage = errorJson["error"] {
                throw NSError(domain: "PodcastService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: errorMessage])
            }
            throw NSError(domain: "PodcastService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Failed to generate podcast"])
        }

        return try JSONDecoder().decode(GeneratePodcastResponse.self, from: data)
    }

    // MARK: - Fetch Episodes

    struct EpisodesResponse: Codable {
        let success: Bool
        let episodes: [Episode]
        let pagination: Pagination

        struct Episode: Codable {
            let id: String
            let title: String
            let description: String
            let audioUrl: String
            let durationSeconds: Int
            let generatedAt: String

            enum CodingKeys: String, CodingKey {
                case id
                case title
                case description
                case audioUrl = "audio_url"
                case durationSeconds = "duration_seconds"
                case generatedAt = "generated_at"
            }
        }

        struct Pagination: Codable {
            let limit: Int
            let offset: Int
            let total: Int
        }
    }

    /// Fetch user's podcast episodes
    func fetchEpisodes(
        for userEmail: String,
        limit: Int = 10,
        offset: Int = 0
    ) async throws -> EpisodesResponse {
        var components = URLComponents(string: "\(baseURL)/podcast/episodes/\(userEmail)")!
        components.queryItems = [
            URLQueryItem(name: "limit", value: String(limit)),
            URLQueryItem(name: "offset", value: String(offset))
        ]

        let url = components.url!
        let (data, response) = try await URLSession.shared.data(from: url)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw NSError(domain: "PodcastService", code: -2, userInfo: [NSLocalizedDescriptionKey: "Failed to fetch episodes"])
        }

        return try JSONDecoder().decode(EpisodesResponse.self, from: data)
    }

    // MARK: - Cost Estimation

    struct CostEstimationRequest: Codable {
        let userId: String
        let preferences: Preferences

        enum CodingKeys: String, CodingKey {
            case userId = "user_id"
            case preferences
        }

        struct Preferences: Codable {
            let includeEmail: Bool
            let includeCalendar: Bool

            enum CodingKeys: String, CodingKey {
                case includeEmail = "include_email"
                case includeCalendar = "include_calendar"
            }
        }
    }

    struct CostEstimationResponse: Codable {
        let success: Bool
        let estimate: Estimate

        struct Estimate: Codable {
            let scriptCostUsd: Double
            let ttsCostUsd: Double
            let totalCostUsd: Double
            let estimatedDurationSeconds: Int

            enum CodingKeys: String, CodingKey {
                case scriptCostUsd = "script_cost_usd"
                case ttsCostUsd = "tts_cost_usd"
                case totalCostUsd = "total_cost_usd"
                case estimatedDurationSeconds = "estimated_duration_seconds"
            }
        }
    }

    /// Estimate cost before generating podcast
    func estimateCost(
        for userEmail: String,
        includeEmail: Bool,
        includeCalendar: Bool
    ) async throws -> CostEstimationResponse {
        let url = URL(string: "\(baseURL)/podcast/estimate")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let requestBody = CostEstimationRequest(
            userId: userEmail,
            preferences: CostEstimationRequest.Preferences(
                includeEmail: includeEmail,
                includeCalendar: includeCalendar
            )
        )

        request.httpBody = try JSONEncoder().encode(requestBody)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw NSError(domain: "PodcastService", code: -3, userInfo: [NSLocalizedDescriptionKey: "Failed to estimate cost"])
        }

        return try JSONDecoder().decode(CostEstimationResponse.self, from: data)
    }
}
