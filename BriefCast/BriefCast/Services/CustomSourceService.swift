//
//  CustomSourceService.swift
//  BriefCast
//
//  Service for managing user-added RSS feeds, newsletters, and websites
//

import Foundation
import UIKit

@MainActor
class CustomSourceService {
    static let shared = CustomSourceService()

    private let baseURL = "https://ai-radio-backend.fly.dev/api"
    private let jsonDecoder: JSONDecoder
    private let jsonEncoder: JSONEncoder
    private let standardSession: URLSession

    // Cache
    private static let cachedSourcesKey = "cachedCustomSources"
    private var cachedSources: [CustomSource] = []

    /// Get the current user ID
    private var currentUserId: String {
        if let guestId = UserDefaults.standard.string(forKey: "guestUserId"), !guestId.isEmpty {
            return guestId
        }
        return UIDevice.current.identifierForVendor?.uuidString ?? "anonymous-\(Int(Date().timeIntervalSince1970))"
    }

    private init() {
        jsonDecoder = JSONDecoder()
        jsonEncoder = JSONEncoder()

        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 60
        standardSession = URLSession(configuration: config)

        loadCachedSourcesIntoMemory()
    }

    // MARK: - Caching

    private func loadCachedSourcesIntoMemory() {
        if let data = UserDefaults.standard.data(forKey: Self.cachedSourcesKey),
           let sources = try? jsonDecoder.decode([CustomSource].self, from: data) {
            cachedSources = sources
            print("📦 Loaded \(sources.count) cached custom sources")
        }
    }

    private func cacheSources(_ sources: [CustomSource]) {
        cachedSources = sources
        if let data = try? jsonEncoder.encode(sources) {
            UserDefaults.standard.set(data, forKey: Self.cachedSourcesKey)
        }
    }

    private func addToCache(_ source: CustomSource) {
        cachedSources.removeAll { $0.id == source.id }
        cachedSources.insert(source, at: 0)
        cacheSources(cachedSources)
    }

    func getCachedSources() -> [CustomSource] {
        return cachedSources
    }

    var hasCachedSources: Bool {
        return !cachedSources.isEmpty
    }

    // MARK: - Validate Source

    /// Validate a source URL before adding
    func validateSource(url: String, sourceType: CustomSourceType) async throws -> CustomSourceValidateData {
        let endpoint = "\(baseURL)/sources/validate"

        struct ValidateRequest: Codable {
            let url: String
            let sourceType: CustomSourceType
        }

        let request = ValidateRequest(url: url, sourceType: sourceType)
        let bodyData = try jsonEncoder.encode(request)
        let data = try await performRequest(endpoint: endpoint, method: "POST", bodyData: bodyData)
        let response = try jsonDecoder.decode(CustomSourceValidateResponse.self, from: data)
        return response.data
    }

    // MARK: - Add Source

    /// Add a new custom source
    func addSource(url: String, sourceType: CustomSourceType, name: String? = nil) async throws -> CustomSource {
        let endpoint = "\(baseURL)/sources"

        let request = CustomSourceAddRequest(
            url: url,
            sourceType: sourceType,
            name: name,
            userId: currentUserId
        )

        let bodyData = try jsonEncoder.encode(request)

        print("➕ Adding custom source: \(url)")

        let data = try await performRequest(endpoint: endpoint, method: "POST", bodyData: bodyData)
        let response = try jsonDecoder.decode(CustomSourceAddResponse.self, from: data)

        addToCache(response.data.source)

        print("✅ Added source: \(response.data.source.name)")

        return response.data.source
    }

    // MARK: - Fetch Sources

    /// Fetch all custom sources for the user
    func fetchSources() async throws -> [CustomSource] {
        let endpoint = "\(baseURL)/sources?userId=\(currentUserId)"

        do {
            let data = try await performRequest(endpoint: endpoint)
            let response = try jsonDecoder.decode(CustomSourcesResponse.self, from: data)
            cacheSources(response.data.sources)
            return response.data.sources
        } catch {
            if !cachedSources.isEmpty {
                return cachedSources
            }
            throw error
        }
    }

    /// Fetch sources with immediate cache callback
    func fetchSourcesWithCache(onCachedData: (([CustomSource]) -> Void)? = nil) async throws -> [CustomSource] {
        if !cachedSources.isEmpty {
            onCachedData?(cachedSources)
        }
        return try await fetchSources()
    }

    // MARK: - Source Detail

    /// Get source detail with items
    func getSourceDetail(sourceId: String, limit: Int = 20, offset: Int = 0) async throws -> CustomSourceDetailData {
        let endpoint = "\(baseURL)/sources/\(sourceId)?userId=\(currentUserId)&limit=\(limit)&offset=\(offset)"
        let data = try await performRequest(endpoint: endpoint)
        let response = try jsonDecoder.decode(CustomSourceDetailResponse.self, from: data)
        return response.data
    }

    // MARK: - Refresh Source

    /// Refresh a source to fetch new items
    func refreshSource(sourceId: String) async throws -> CustomSourceRefreshData {
        let endpoint = "\(baseURL)/sources/\(sourceId)/refresh"

        struct RefreshRequest: Codable {
            let userId: String
        }

        let request = RefreshRequest(userId: currentUserId)
        let bodyData = try jsonEncoder.encode(request)

        print("🔄 Refreshing source: \(sourceId)")

        let data = try await performRequest(endpoint: endpoint, method: "POST", bodyData: bodyData)
        let response = try jsonDecoder.decode(CustomSourceRefreshResponse.self, from: data)

        // Update cache
        if let index = cachedSources.firstIndex(where: { $0.id == sourceId }) {
            cachedSources[index] = response.data.source
            cacheSources(cachedSources)
        }

        print("✅ Refreshed: \(response.data.newItemCount) new items")

        return response.data
    }

    // MARK: - Toggle Source

    /// Toggle source active state
    func toggleSource(sourceId: String, isActive: Bool) async throws -> CustomSource {
        let endpoint = "\(baseURL)/sources/\(sourceId)/toggle"

        struct ToggleRequest: Codable {
            let userId: String
            let isActive: Bool
        }

        let request = ToggleRequest(userId: currentUserId, isActive: isActive)
        let bodyData = try jsonEncoder.encode(request)
        let data = try await performRequest(endpoint: endpoint, method: "PATCH", bodyData: bodyData)

        struct ToggleResponse: Codable {
            let success: Bool
            let data: ToggleData
        }
        struct ToggleData: Codable {
            let source: CustomSource
        }

        let response = try jsonDecoder.decode(ToggleResponse.self, from: data)

        // Update cache
        if let index = cachedSources.firstIndex(where: { $0.id == sourceId }) {
            cachedSources[index] = response.data.source
            cacheSources(cachedSources)
        }

        return response.data.source
    }

    // MARK: - Delete Source

    /// Delete a custom source
    func deleteSource(sourceId: String) async throws {
        let endpoint = "\(baseURL)/sources/\(sourceId)?userId=\(currentUserId)"
        _ = try await performRequest(endpoint: endpoint, method: "DELETE")

        cachedSources.removeAll { $0.id == sourceId }
        cacheSources(cachedSources)

        print("🗑️ Deleted source: \(sourceId)")
    }

    // MARK: - Item Actions

    /// Mark an item as read
    func markItemRead(sourceId: String, itemId: String) async throws {
        let endpoint = "\(baseURL)/sources/\(sourceId)/items/\(itemId)/read"
        _ = try await performRequest(endpoint: endpoint, method: "POST")
    }

    /// Toggle item inclusion in daily brief
    func toggleItemInBrief(sourceId: String, itemId: String, include: Bool) async throws {
        let endpoint = "\(baseURL)/sources/\(sourceId)/items/\(itemId)/brief"

        struct ToggleRequest: Codable {
            let include: Bool
        }

        let request = ToggleRequest(include: include)
        let bodyData = try jsonEncoder.encode(request)
        _ = try await performRequest(endpoint: endpoint, method: "PATCH", bodyData: bodyData)
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
        case 400:
            // Try to extract error message
            struct ErrorResponse: Codable {
                let error: String?
            }
            if let errorResponse = try? jsonDecoder.decode(ErrorResponse.self, from: data),
               let errorMessage = errorResponse.error {
                throw APIError.badRequest(errorMessage)
            }
            throw APIError.badRequest("Invalid request")
        default:
            throw APIError.serverError(httpResponse.statusCode, nil)
        }
    }
}

// MARK: - API Error Extension

extension APIError {
    static func badRequest(_ message: String) -> APIError {
        return .serverError(400, message)
    }
}
