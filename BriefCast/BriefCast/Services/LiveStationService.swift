//
//  LiveStationService.swift
//  BriefCast
//
//  Service for live streaming news stations
//

import Foundation
import UIKit

@MainActor
class LiveStationService {
    static let shared = LiveStationService()

    private let baseURL = "https://ai-radio-backend-917362189743.us-central1.run.app/api"
    private let jsonDecoder: JSONDecoder
    private let jsonEncoder: JSONEncoder
    private let standardSession: URLSession

    // Cache
    private static let cachedStationsKey = "cachedLiveStations"
    private var cachedStations: [LiveStation] = []

    private init() {
        jsonDecoder = JSONDecoder()
        jsonEncoder = JSONEncoder()

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        config.timeoutIntervalForResource = 120
        standardSession = URLSession(configuration: config)

        loadCachedStationsIntoMemory()
    }

    // MARK: - Caching

    private func loadCachedStationsIntoMemory() {
        if let data = UserDefaults.standard.data(forKey: Self.cachedStationsKey),
           let stations = try? jsonDecoder.decode([LiveStation].self, from: data) {
            cachedStations = stations
            print("📦 Loaded \(stations.count) cached live stations")
        }
    }

    private func cacheStations(_ stations: [LiveStation]) {
        cachedStations = stations
        if let data = try? jsonEncoder.encode(stations) {
            UserDefaults.standard.set(data, forKey: Self.cachedStationsKey)
        }
    }

    func getCachedStations() -> [LiveStation] {
        return cachedStations
    }

    var hasCachedStations: Bool {
        return !cachedStations.isEmpty
    }

    // MARK: - Fetch Stations

    /// Fetch all available live stations
    func fetchStations() async throws -> [LiveStation] {
        let endpoint = "\(baseURL)/livestation"

        do {
            let data = try await performRequest(endpoint: endpoint)
            let response = try jsonDecoder.decode(LiveStationsResponse.self, from: data)
            cacheStations(response.data.stations)
            return response.data.stations
        } catch {
            if !cachedStations.isEmpty {
                print("⚠️ Network failed, using cached stations")
                return cachedStations
            }
            throw error
        }
    }

    /// Fetch stations with immediate cache callback
    func fetchStationsWithCache(onCachedData: (([LiveStation]) -> Void)? = nil) async throws -> [LiveStation] {
        if !cachedStations.isEmpty {
            onCachedData?(cachedStations)
        }
        return try await fetchStations()
    }

    // MARK: - Station Detail

    /// Get station detail with recent episodes
    func getStationDetail(stationId: String) async throws -> LiveStationDetailData {
        let endpoint = "\(baseURL)/livestation/\(stationId)"
        let data = try await performRequest(endpoint: endpoint)
        let response = try jsonDecoder.decode(LiveStationDetailResponse.self, from: data)
        return response.data
    }

    // MARK: - Tune In

    /// Tune into a live station
    func tuneIn(stationId: String) async throws -> LiveStationTuneInData {
        let endpoint = "\(baseURL)/livestation/\(stationId)/tune-in"
        let data = try await performRequest(endpoint: endpoint, method: "POST")
        let response = try jsonDecoder.decode(LiveStationTuneInResponse.self, from: data)
        return response.data
    }

    // MARK: - Refresh

    /// Force refresh a station's content
    func refreshStation(stationId: String) async throws -> LiveStation {
        let endpoint = "\(baseURL)/livestation/\(stationId)/refresh"
        let data = try await performRequest(endpoint: endpoint, method: "POST")

        struct RefreshResponse: Codable {
            let success: Bool
            let data: RefreshData
        }
        struct RefreshData: Codable {
            let station: LiveStation
            let episode: LiveStationEpisode
        }

        let response = try jsonDecoder.decode(RefreshResponse.self, from: data)
        return response.data.station
    }

    // MARK: - Network

    private func performRequest(
        endpoint: String,
        method: String = "GET",
        bodyData: Data? = nil
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

        let (data, response) = try await standardSession.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw APIError.invalidResponse
        }

        switch httpResponse.statusCode {
        case 200...299:
            return data
        case 404:
            throw APIError.notFound
        default:
            throw APIError.serverError(httpResponse.statusCode, nil)
        }
    }
}
