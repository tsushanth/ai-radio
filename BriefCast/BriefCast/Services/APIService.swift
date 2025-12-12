//
//  APIService.swift
//  BriefCast
//
//  Backend API communication service with comprehensive endpoints
//

import Foundation

enum APIError: Error {
    case invalidURL
    case networkError(Error)
    case decodingError(Error)
    case serverError(Int, String?)
    case unauthorized
    case notFound
    case invalidResponse

    var localizedDescription: String {
        switch self {
        case .invalidURL:
            return "Invalid URL"
        case .networkError(let error):
            return "Network error: \(error.localizedDescription)"
        case .decodingError(let error):
            return "Failed to decode response: \(error.localizedDescription)"
        case .serverError(let code, let message):
            return "Server error (\(code)): \(message ?? "Unknown error")"
        case .unauthorized:
            return "Unauthorized. Please sign in again."
        case .notFound:
            return "Resource not found"
        case .invalidResponse:
            return "Invalid server response"
        }
    }
}

actor APIService {
    static let shared = APIService()

    private let baseURL = "https://ai-radio-backend-917362189743.us-central1.run.app/api"
    private var authToken: String?
    private let jsonDecoder: JSONDecoder
    private let jsonEncoder: JSONEncoder

    private init() {
        // Configure JSON decoder with ISO8601 date decoding
        jsonDecoder = JSONDecoder()
        jsonDecoder.dateDecodingStrategy = .iso8601

        // Configure JSON encoder with ISO8601 date encoding
        jsonEncoder = JSONEncoder()
        jsonEncoder.dateEncodingStrategy = .iso8601
    }

    // MARK: - Authentication

    func setAuthToken(_ token: String) {
        self.authToken = token
    }

    // MARK: - Episodes

    /// Fetch all episodes for a user
    func fetchEpisodes(for userId: String) async throws -> [Episode] {
        let endpoint = "\(baseURL)/podcast/episodes/\(userId)"
        let data = try await performRequest(endpoint: endpoint, method: "GET")

        let response = try jsonDecoder.decode(EpisodesResponse.self, from: data)
        return response.episodes
    }

    /// Fetch a single episode by ID
    func fetchEpisode(_ episodeId: String) async throws -> Episode {
        let endpoint = "\(baseURL)/podcast/episodes/detail/\(episodeId)"
        let data = try await performRequest(endpoint: endpoint, method: "GET")

        let response = try jsonDecoder.decode(EpisodeDetailResponse.self, from: data)
        return response.episode
    }

    /// Generate a new podcast episode
    func generateEpisode(userId: String, preferences: UserPreferences) async throws -> Episode {
        let endpoint = "\(baseURL)/podcast/generate"

        let requestBody = GenerateEpisodeRequest(
            userId: userId,
            preferences: preferences
        )

        let bodyData = try jsonEncoder.encode(requestBody)
        let data = try await performRequest(endpoint: endpoint, method: "POST", bodyData: bodyData)

        let response = try jsonDecoder.decode(EpisodeDetailResponse.self, from: data)
        return response.episode
    }

    /// Fetch daily briefing (convenience method)
    func fetchDailyBrief(for userId: String) async throws -> Episode {
        let endpoint = "\(baseURL)/podcast/daily-brief/\(userId)"
        let data = try await performRequest(endpoint: endpoint, method: "GET")

        let response = try jsonDecoder.decode(EpisodeDetailResponse.self, from: data)
        return response.episode
    }

    /// Fetch "For You" personalized episodes
    func fetchForYou(for userId: String) async throws -> [Episode] {
        let endpoint = "\(baseURL)/podcast/for-you/\(userId)"
        let data = try await performRequest(endpoint: endpoint, method: "GET")

        let response = try jsonDecoder.decode(EpisodesResponse.self, from: data)
        return response.episodes
    }

    /// Fetch discover categories with shows
    func fetchDiscover() async throws -> [Category] {
        let endpoint = "\(baseURL)/discover/categories"
        let data = try await performRequest(endpoint: endpoint, method: "GET")

        let response = try jsonDecoder.decode(DiscoverResponse.self, from: data)

        // Map response to Category model
        return response.categories.map { categoryData in
            Category(
                id: categoryData.id,
                name: categoryData.name,
                icon: categoryData.icon,
                color: categoryData.color,
                shows: categoryData.shows
            )
        }
    }

    // MARK: - User

    /// Fetch user profile
    func fetchUser(userId: String) async throws -> User {
        let endpoint = "\(baseURL)/users/\(userId)"
        let data = try await performRequest(endpoint: endpoint, method: "GET")

        let response = try jsonDecoder.decode(UserResponse.self, from: data)
        return response.user
    }

    /// Update user preferences
    func updateUserPreferences(userId: String, preferences: UserPreferences) async throws -> User {
        let endpoint = "\(baseURL)/users/\(userId)/preferences"

        let bodyData = try jsonEncoder.encode(preferences)
        let data = try await performRequest(endpoint: endpoint, method: "PUT", bodyData: bodyData)

        let response = try jsonDecoder.decode(UserResponse.self, from: data)
        return response.user
    }

    // MARK: - OAuth & Account Linking

    /// Link a Google account
    func linkGoogleAccount(userId: String, code: String) async throws -> LinkedAccount {
        let endpoint = "\(baseURL)/oauth/google/callback"

        let requestBody = OAuthCallbackRequest(userId: userId, code: code)
        let bodyData = try jsonEncoder.encode(requestBody)
        let data = try await performRequest(endpoint: endpoint, method: "POST", bodyData: bodyData)

        let response = try jsonDecoder.decode(LinkedAccountResponse.self, from: data)
        return response.account
    }

    /// Link a Microsoft account
    func linkMicrosoftAccount(userId: String, code: String) async throws -> LinkedAccount {
        let endpoint = "\(baseURL)/oauth/microsoft/callback"

        let requestBody = OAuthCallbackRequest(userId: userId, code: code)
        let bodyData = try jsonEncoder.encode(requestBody)
        let data = try await performRequest(endpoint: endpoint, method: "POST", bodyData: bodyData)

        let response = try jsonDecoder.decode(LinkedAccountResponse.self, from: data)
        return response.account
    }

    /// Disconnect a linked account
    func disconnectAccount(userId: String, accountId: String) async throws {
        let endpoint = "\(baseURL)/users/\(userId)/accounts/\(accountId)"
        _ = try await performRequest(endpoint: endpoint, method: "DELETE")
    }

    // MARK: - Private Helpers

    private func performRequest(
        endpoint: String,
        method: String,
        bodyData: Data? = nil
    ) async throws -> Data {
        guard let url = URL(string: endpoint) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = method
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        if let bodyData = bodyData {
            request.httpBody = bodyData
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw APIError.invalidResponse
            }

            // Handle different HTTP status codes
            switch httpResponse.statusCode {
            case 200...299:
                return data
            case 401:
                throw APIError.unauthorized
            case 404:
                throw APIError.notFound
            default:
                // Try to extract error message from response
                let errorMessage = try? jsonDecoder.decode(ErrorResponse.self, from: data).message
                throw APIError.serverError(httpResponse.statusCode, errorMessage)
            }
        } catch let error as APIError {
            throw error
        } catch {
            throw APIError.networkError(error)
        }
    }
}

// MARK: - Request Models

struct GenerateEpisodeRequest: Codable {
    let userId: String
    let preferences: UserPreferences

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case preferences
    }
}

struct OAuthCallbackRequest: Codable {
    let userId: String
    let code: String

    enum CodingKeys: String, CodingKey {
        case userId = "user_id"
        case code
    }
}

// MARK: - Response Models

struct ErrorResponse: Codable {
    let success: Bool
    let message: String
}

struct EpisodesResponse: Codable {
    let success: Bool
    let episodes: [Episode]
}

struct EpisodeDetailResponse: Codable {
    let success: Bool
    let episode: Episode
}

struct DiscoverResponse: Codable {
    let success: Bool
    let categories: [CategoryData]

    struct CategoryData: Codable {
        let id: String
        let name: String
        let icon: String
        let color: String
        let shows: [Show]
    }
}

struct UserResponse: Codable {
    let success: Bool
    let user: User
}

struct LinkedAccountResponse: Codable {
    let success: Bool
    let account: LinkedAccount
}
