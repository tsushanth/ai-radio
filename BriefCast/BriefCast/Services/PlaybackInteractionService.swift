//
//  PlaybackInteractionService.swift
//  BriefCast
//
//  Service for tracking playback interactions (skip/tell me more) and adaptive learning
//

import Foundation

@MainActor
class PlaybackInteractionService {
    static let shared = PlaybackInteractionService()

    private let apiClient = APIClient.shared
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
            // Decrease preference for skipped segment types
            let currentScore = userPreferences.preferredSegmentTypes[segmentType] ?? 0.5
            userPreferences.preferredSegmentTypes[segmentType] = max(0, currentScore - 0.1)
        }
        userPreferences.lastUpdated = Date()
        cachePreferences()

        // Send to server async
        await sendInteractionToServer(interaction)
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
            // Increase preference for expanded segment types
            let currentScore = userPreferences.preferredSegmentTypes[segmentType] ?? 0.5
            userPreferences.preferredSegmentTypes[segmentType] = min(1.0, currentScore + 0.15)
        }
        userPreferences.lastUpdated = Date()
        cachePreferences()

        // Get expanded content from server
        return await fetchExpandedContent(
            contextType: contextType,
            contextId: contextId,
            segmentType: segmentType,
            segmentIndex: segmentIndex,
            timestamp: timestamp
        )
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

        await sendInteractionToServer(interaction)
    }

    // MARK: - Fetch Expanded Content (Tell Me More)

    private func fetchExpandedContent(
        contextType: String,
        contextId: String,
        segmentType: String?,
        segmentIndex: Int?,
        timestamp: Double
    ) async -> TellMeMoreExpansion? {
        do {
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

            let response: TellMeMoreResponse = try await apiClient.post(
                endpoint: "/interactions/tell-me-more",
                body: body
            )

            return response.data?.expansion
        } catch {
            print("⚠️ Failed to fetch expanded content: \(error.localizedDescription)")
            return nil
        }
    }

    // MARK: - Preferences

    /// Get user preferences (with recommendations)
    func fetchUserPreferences() async -> UserPreferencesData {
        do {
            let response: UserPreferencesResponse = try await apiClient.get(
                endpoint: "/interactions/preferences"
            )

            if let data = response.data {
                userPreferences = data.preferences
                cachePreferences()
            }
        } catch {
            print("⚠️ Failed to fetch user preferences: \(error.localizedDescription)")
        }

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
        PlaybackInteraction(
            id: "interaction-\(Date().timeIntervalSince1970)-\(UUID().uuidString.prefix(8))",
            userId: AuthService.shared.currentUserId ?? "anonymous",
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

    private func sendInteractionToServer(_ interaction: PlaybackInteraction) async {
        do {
            let _: RecordInteractionResponse = try await apiClient.post(
                endpoint: "/interactions/record",
                body: [
                    "context_type": interaction.contextType,
                    "context_id": interaction.contextId,
                    "segment_type": interaction.segmentType as Any,
                    "segment_index": interaction.segmentIndex as Any,
                    "interaction_type": interaction.interactionType.rawValue,
                    "timestamp": interaction.timestamp,
                    "metadata": interaction.metadata as Any
                ]
            )
        } catch {
            print("⚠️ Failed to send interaction to server: \(error.localizedDescription)")
            // Interaction is still stored locally
        }
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
