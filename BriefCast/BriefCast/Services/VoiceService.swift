//
//  VoiceService.swift
//  BriefCast
//
//  Service for fetching available TTS voices from the backend
//

import Foundation

@Observable
class VoiceService {
    static let shared = VoiceService()

    private(set) var voices: [Voice] = []
    private(set) var voicePairs: [VoicePair] = []
    private(set) var providers: [ProviderInfo] = []
    private(set) var isLoading = false
    private(set) var error: String?

    private let baseURL = "https://ai-radio-backend.fly.dev/api"
    private var authToken: String?

    private init() {}

    // MARK: - Authentication

    func setAuthToken(_ token: String) {
        self.authToken = token
    }

    // MARK: - Fetch Voices

    /// Fetch all available voices from the backend
    func fetchVoices(provider: TTSProvider? = nil, forceRefresh: Bool = false) async throws {
        // Return cached voices if available and not forcing refresh
        if !forceRefresh && !voices.isEmpty {
            return
        }

        isLoading = true
        error = nil

        defer { isLoading = false }

        var urlString = "\(baseURL)/voices"
        if let provider = provider {
            urlString += "?provider=\(provider.rawValue)"
        }

        guard let url = URL(string: urlString) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                throw APIError.invalidResponse
            }

            let decoder = JSONDecoder()
            let voicesResponse = try decoder.decode(VoicesResponse.self, from: data)

            self.voices = voicesResponse.voices
        } catch let decodingError as DecodingError {
            self.error = "Failed to parse voice data"
            throw APIError.decodingError(decodingError)
        } catch {
            self.error = error.localizedDescription
            throw APIError.networkError(error)
        }
    }

    /// Fetch recommended voice pairs for two-host podcasts
    func fetchVoicePairs(provider: TTSProvider? = nil) async throws {
        isLoading = true
        error = nil

        defer { isLoading = false }

        var urlString = "\(baseURL)/voices/pairs"
        if let provider = provider {
            urlString += "?provider=\(provider.rawValue)"
        }

        guard let url = URL(string: urlString) else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                throw APIError.invalidResponse
            }

            let decoder = JSONDecoder()
            let pairsResponse = try decoder.decode(VoicePairsResponse.self, from: data)

            self.voicePairs = pairsResponse.pairs
        } catch let decodingError as DecodingError {
            self.error = "Failed to parse voice pairs"
            throw APIError.decodingError(decodingError)
        } catch {
            self.error = error.localizedDescription
            throw APIError.networkError(error)
        }
    }

    /// Fetch available TTS providers
    func fetchProviders() async throws {
        isLoading = true
        error = nil

        defer { isLoading = false }

        guard let url = URL(string: "\(baseURL)/voices/providers") else {
            throw APIError.invalidURL
        }

        var request = URLRequest(url: url)
        request.httpMethod = "GET"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        if let token = authToken {
            request.setValue("Bearer \(token)", forHTTPHeaderField: "Authorization")
        }

        do {
            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse,
                  httpResponse.statusCode == 200 else {
                throw APIError.invalidResponse
            }

            let decoder = JSONDecoder()
            let providersResponse = try decoder.decode(ProvidersResponse.self, from: data)

            self.providers = providersResponse.providers
        } catch let decodingError as DecodingError {
            self.error = "Failed to parse providers"
            throw APIError.decodingError(decodingError)
        } catch {
            self.error = error.localizedDescription
            throw APIError.networkError(error)
        }
    }

    // MARK: - Helper Methods

    /// Get voices filtered by provider
    func voices(for provider: TTSProvider) -> [Voice] {
        voices.filter { $0.provider == provider.rawValue }
    }

    /// Get voices filtered by gender
    func voices(byGender gender: String) -> [Voice] {
        voices.filter { $0.gender.lowercased() == gender.lowercased() }
    }

    /// Find a voice by its ID
    func voice(withId id: String) -> Voice? {
        voices.first { $0.id == id }
    }

    /// Get display name for a voice ID (for UI)
    func displayName(for voiceId: String?) -> String {
        guard let id = voiceId,
              let voice = voice(withId: id) else {
            return "Default Voice"
        }
        return voice.name
    }
}
