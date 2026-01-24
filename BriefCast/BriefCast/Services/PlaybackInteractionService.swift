//
//  PlaybackInteractionService.swift
//  BriefCast
//
//  Service for tracking playback interactions (skip/tell me more) and adaptive learning
//  Note: Server-side interaction tracking is not yet implemented
//
//  Models are defined in PlaybackInteraction.swift
//

import Foundation

@MainActor
class PlaybackInteractionService {
    static let shared = PlaybackInteractionService()

    private let cacheKey = "cached_user_preferences"

    // Local tracking for immediate UI response
    private(set) var localInteractions: [PlaybackInteraction] = []
    private(set) var userPreferences: UserPreferencesData = .empty

    private init() {
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

        print("📊 Recorded skip interaction for \(contextId)")
    }

    /// Record a "Tell Me More" interaction
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

        print("📊 Recorded tell-me-more interaction for \(contextId)")

        // TODO: Fetch expanded content from server
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
