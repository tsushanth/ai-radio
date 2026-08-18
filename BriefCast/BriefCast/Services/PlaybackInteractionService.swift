//
//  PlaybackInteractionService.swift
//  BriefCast
//
//  Service for tracking playback interactions (skip/tell me more) and adaptive learning
//  Interactions are cached locally for instant UI feedback and posted to
//  POST /api/interactions/record, which is what drives server-side
//  user_preferences aggregation (skipped_topics / expanded_topics).
//
//  Models are defined in PlaybackInteraction.swift
//

import Foundation
import UIKit

@MainActor
class PlaybackInteractionService {
    static let shared = PlaybackInteractionService()

    private let baseURL = "https://ai-radio-backend.fly.dev/api"
    private let cacheKey = "cached_user_preferences"
    private let jsonDecoder = JSONDecoder()
    private let jsonEncoder = JSONEncoder()

    /// Session with extended timeout for AI-generated content
    private let generationSession: URLSession

    // Local tracking for immediate UI response
    private(set) var localInteractions: [PlaybackInteraction] = []
    private(set) var userPreferences: UserPreferencesData = .empty

    /// Get the current user ID
    private var currentUserId: String {
        if let guestId = UserDefaults.standard.string(forKey: "guestUserId"), !guestId.isEmpty {
            return guestId
        }
        return UIDevice.current.identifierForVendor?.uuidString ?? "anonymous"
    }

    private init() {
        let config = URLSessionConfiguration.default
        config.timeoutIntervalForRequest = 120
        generationSession = URLSession(configuration: config)
        loadCachedPreferences()
    }

    // MARK: - Record Interactions

    /// Record a skip interaction
    func recordSkip(
        contextType: String,
        contextId: String,
        segmentType: String?,
        segmentIndex: Int?,
        timestamp: Double,
        topicId: String? = nil
    ) async {
        let interaction = createInteraction(
            contextType: contextType,
            contextId: contextId,
            segmentType: segmentType,
            segmentIndex: segmentIndex,
            interactionType: .skip,
            timestamp: timestamp,
            metadata: topicId != nil ? ["topic_id": topicId!] : nil
        )

        localInteractions.append(interaction)

        // Update local preferences immediately
        if let topicId = topicId {
            userPreferences.skippedTopics[topicId, default: 0] += 1
        }
        if let segmentType = segmentType {
            let currentScore = userPreferences.preferredSegmentTypes[segmentType] ?? 0.5
            userPreferences.preferredSegmentTypes[segmentType] = max(0, currentScore - 0.1)
        }
        userPreferences.lastUpdated = Date()
        cachePreferences()

        await postInteraction(interaction)

        print("📊 Recorded skip interaction for \(contextId)")
    }

    /// Record a "Tell Me More" interaction and fetch expanded content from server
    func recordTellMeMore(
        contextType: String,
        contextId: String,
        segmentType: String?,
        segmentIndex: Int?,
        timestamp: Double,
        topicId: String? = nil
    ) async -> TellMeMoreExpansion? {
        let interaction = createInteraction(
            contextType: contextType,
            contextId: contextId,
            segmentType: segmentType,
            segmentIndex: segmentIndex,
            interactionType: .tellMeMore,
            timestamp: timestamp,
            metadata: topicId != nil ? ["topic_id": topicId!] : nil
        )

        localInteractions.append(interaction)

        // Update local preferences immediately
        if let topicId = topicId {
            userPreferences.expandedTopics[topicId, default: 0] += 1
        }
        if let segmentType = segmentType {
            let currentScore = userPreferences.preferredSegmentTypes[segmentType] ?? 0.5
            userPreferences.preferredSegmentTypes[segmentType] = min(1.0, currentScore + 0.15)
        }
        userPreferences.lastUpdated = Date()
        cachePreferences()

        await postInteraction(interaction)

        print("📊 Recorded tell-me-more interaction for \(contextId)")

        // Fetch expanded content from backend
        do {
            let expansion = try await fetchExpansion(
                contextType: contextType,
                contextId: contextId,
                segmentType: segmentType,
                segmentIndex: segmentIndex,
                timestamp: timestamp
            )
            return expansion
        } catch {
            print("⚠️ Failed to fetch expansion: \(error.localizedDescription)")
            return nil
        }
    }

    /// Call backend to generate expanded content
    private func fetchExpansion(
        contextType: String,
        contextId: String,
        segmentType: String?,
        segmentIndex: Int?,
        timestamp: Double
    ) async throws -> TellMeMoreExpansion? {
        guard let url = URL(string: "\(baseURL)/interactions/tell-me-more") else {
            return nil
        }

        var body: [String: Any] = [
            "context_type": contextType,
            "context_id": contextId,
            "timestamp": timestamp
        ]
        if let segmentType = segmentType {
            body["segment_type"] = segmentType
        }
        if let segmentIndex = segmentIndex {
            body["segment_index"] = segmentIndex
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(currentUserId, forHTTPHeaderField: "x-user-id")
        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await generationSession.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse,
              (200...299).contains(httpResponse.statusCode) else {
            return nil
        }

        let tellMeMoreResponse = try jsonDecoder.decode(TellMeMoreResponse.self, from: data)

        if tellMeMoreResponse.success, let expansion = tellMeMoreResponse.data?.expansion {
            print("✅ Expansion received: \(expansion.expandedContent.prefix(50))...")
            return expansion
        }

        return nil
    }

    /// Record completion of listening
    func recordCompletion(
        contextType: String,
        contextId: String,
        totalDuration: Double,
        listenedDuration: Double
    ) async {
        let interaction = createInteraction(
            contextType: contextType,
            contextId: contextId,
            segmentType: nil,
            segmentIndex: nil,
            interactionType: .completed,
            timestamp: listenedDuration,
            metadata: [
                "total_duration": String(totalDuration),
                "completion_rate": String(listenedDuration / totalDuration)
            ]
        )

        localInteractions.append(interaction)

        // Update average listening duration
        if let current = userPreferences.avgListeningDuration {
            userPreferences.avgListeningDuration = (current + listenedDuration) / 2
        } else {
            userPreferences.avgListeningDuration = listenedDuration
        }

        // Detect preferred time of day
        let hour = Calendar.current.component(.hour, from: Date())
        if hour >= 5 && hour < 12 {
            userPreferences.preferredTimeOfDay = "morning"
        } else if hour >= 12 && hour < 17 {
            userPreferences.preferredTimeOfDay = "afternoon"
        } else {
            userPreferences.preferredTimeOfDay = "evening"
        }

        userPreferences.lastUpdated = Date()
        cachePreferences()

        await postInteraction(interaction)

        print("📊 Recorded completion for \(contextId)")
    }

    // MARK: - Preferences

    /// Get user preferences
    func fetchUserPreferences() async -> UserPreferencesData {
        return userPreferences
    }

    /// Check if a topic is frequently skipped
    func isFrequentlySkipped(topicId: String) -> Bool {
        (userPreferences.skippedTopics[topicId] ?? 0) >= 3
    }

    /// Check if a topic has high interest
    func hasHighInterest(topicId: String) -> Bool {
        (userPreferences.expandedTopics[topicId] ?? 0) >= 2
    }

    /// Get preference score for a segment type (0-1)
    func preferenceScore(for segmentType: String) -> Double {
        userPreferences.preferredSegmentTypes[segmentType] ?? 0.5
    }

    // MARK: - Network

    /// POST the interaction to the backend so it lands in `playback_interactions`
    /// and drives server-side `user_preferences` aggregation. Best-effort: local
    /// state and UI already updated, so failures here are logged and swallowed.
    private func postInteraction(_ interaction: PlaybackInteraction) async {
        guard let url = URL(string: "\(baseURL)/interactions/record") else { return }

        var body: [String: Any] = [
            "context_type": interaction.contextType,
            "context_id": interaction.contextId,
            "interaction_type": interaction.interactionType.rawValue,
            "timestamp": interaction.timestamp
        ]
        if let segmentType = interaction.segmentType {
            body["segment_type"] = segmentType
        }
        if let segmentIndex = interaction.segmentIndex {
            body["segment_index"] = segmentIndex
        }
        if let metadata = interaction.metadata {
            body["metadata"] = metadata
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        request.setValue(currentUserId, forHTTPHeaderField: "x-user-id")

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (_, response) = try await generationSession.data(for: request)
            if let httpResponse = response as? HTTPURLResponse, !(200...299).contains(httpResponse.statusCode) {
                print("⚠️ Failed to post interaction: HTTP \(httpResponse.statusCode)")
            }
        } catch {
            print("⚠️ Failed to post interaction: \(error.localizedDescription)")
        }
    }

    // MARK: - Private Helpers

    private func createInteraction(
        contextType: String,
        contextId: String,
        segmentType: String?,
        segmentIndex: Int?,
        interactionType: PlaybackInteractionType,
        timestamp: Double,
        metadata: [String: String]?
    ) -> PlaybackInteraction {
        let userId = UserDefaults.standard.string(forKey: "linkedAccountEmail") ?? "anonymous"

        return PlaybackInteraction(
            id: "interaction-\(Date().timeIntervalSince1970)-\(UUID().uuidString.prefix(8))",
            userId: userId,
            contextType: contextType,
            contextId: contextId,
            segmentType: segmentType,
            segmentIndex: segmentIndex,
            interactionType: interactionType,
            timestamp: timestamp,
            metadata: metadata,
            createdAt: Date()
        )
    }

    // MARK: - Caching

    private func loadCachedPreferences() {
        if let data = UserDefaults.standard.data(forKey: cacheKey),
           let cached = try? JSONDecoder().decode(UserPreferencesData.self, from: data) {
            userPreferences = cached
        }
    }

    private func cachePreferences() {
        if let data = try? JSONEncoder().encode(userPreferences) {
            UserDefaults.standard.set(data, forKey: cacheKey)
        }
    }
}
