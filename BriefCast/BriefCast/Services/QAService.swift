//
//  QAService.swift
//  BriefCast
//
//  Service for interactive Q&A about podcast content
//

import Foundation
import UIKit

@MainActor
class QAService {
    static let shared = QAService()

    private let baseURL = "https://ai-radio-backend-917362189743.us-central1.run.app/api"
    private let jsonDecoder: JSONDecoder
    private let jsonEncoder: JSONEncoder
    private let standardSession: URLSession
    private let generationSession: URLSession

    // Cache
    private static let cachedSessionsKey = "cachedQASessions"
    private var cachedSessions: [QASession] = []

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

        let standardConfig = URLSessionConfiguration.default
        standardConfig.timeoutIntervalForRequest = 60
        standardSession = URLSession(configuration: standardConfig)

        // Q&A generation can take a while with audio
        let generationConfig = URLSessionConfiguration.default
        generationConfig.timeoutIntervalForRequest = 120
        generationSession = URLSession(configuration: generationConfig)

        loadCachedSessionsIntoMemory()
    }

    // MARK: - Caching

    private func loadCachedSessionsIntoMemory() {
        if let data = UserDefaults.standard.data(forKey: Self.cachedSessionsKey),
           let sessions = try? jsonDecoder.decode([QASession].self, from: data) {
            cachedSessions = sessions
            print("📦 Loaded \(sessions.count) cached Q&A sessions")
        }
    }

    private func cacheSessions(_ sessions: [QASession]) {
        cachedSessions = sessions
        if let data = try? jsonEncoder.encode(sessions) {
            UserDefaults.standard.set(data, forKey: Self.cachedSessionsKey)
        }
    }

    private func updateSessionInCache(_ session: QASession) {
        if let index = cachedSessions.firstIndex(where: { $0.id == session.id }) {
            cachedSessions[index] = session
        } else {
            cachedSessions.insert(session, at: 0)
        }
        // Keep only last 30 sessions
        if cachedSessions.count > 30 {
            cachedSessions = Array(cachedSessions.prefix(30))
        }
        cacheSessions(cachedSessions)
    }

    func getCachedSessions() -> [QASession] {
        return cachedSessions
    }

    // MARK: - Ask Question

    /// Ask a question about content
    func askQuestion(
        question: String,
        contextType: QAContextType,
        contextId: String,
        sessionId: String? = nil,
        includeAudio: Bool = false
    ) async throws -> QAAskData {
        let endpoint = "\(baseURL)/qa/ask"

        let request = QAAskRequest(
            question: question,
            contextType: contextType,
            contextId: contextId,
            sessionId: sessionId,
            includeAudio: includeAudio,
            userId: currentUserId
        )

        let bodyData = try jsonEncoder.encode(request)

        print("❓ Asking question: \(question.prefix(50))...")

        let data = try await performRequest(
            endpoint: endpoint,
            method: "POST",
            bodyData: bodyData,
            session: generationSession
        )

        let response = try jsonDecoder.decode(QAAskResponse.self, from: data)

        // Update cache
        updateSessionInCache(response.data.session)

        print("✅ Answer received (\(response.data.answer.content.count) chars)")

        return response.data
    }

    // MARK: - Session History

    /// Fetch user's Q&A session history
    func fetchHistory(limit: Int = 20, offset: Int = 0) async throws -> [QASession] {
        let endpoint = "\(baseURL)/qa/history?userId=\(currentUserId)&limit=\(limit)&offset=\(offset)"

        do {
            let data = try await performRequest(endpoint: endpoint)
            let response = try jsonDecoder.decode(QASessionHistoryResponse.self, from: data)

            if offset == 0 {
                cacheSessions(response.data.sessions)
            }

            return response.data.sessions
        } catch {
            if !cachedSessions.isEmpty {
                return cachedSessions
            }
            throw error
        }
    }

    // MARK: - Session Detail

    /// Get a specific session with all messages
    func getSession(sessionId: String) async throws -> QASession {
        // Check cache first
        if let cached = cachedSessions.first(where: { $0.id == sessionId }) {
            return cached
        }

        let endpoint = "\(baseURL)/qa/session/\(sessionId)?userId=\(currentUserId)"
        let data = try await performRequest(endpoint: endpoint)
        let response = try jsonDecoder.decode(QASessionDetailResponse.self, from: data)
        return response.data.session
    }

    // MARK: - Delete Session

    /// Delete a Q&A session
    func deleteSession(sessionId: String) async throws {
        let endpoint = "\(baseURL)/qa/session/\(sessionId)?userId=\(currentUserId)"
        _ = try await performRequest(endpoint: endpoint, method: "DELETE")

        cachedSessions.removeAll { $0.id == sessionId }
        cacheSessions(cachedSessions)

        print("🗑️ Deleted Q&A session: \(sessionId)")
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
            throw APIError.serverError(httpResponse.statusCode, nil)
        }
    }
}
