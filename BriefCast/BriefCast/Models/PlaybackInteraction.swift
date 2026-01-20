//
//  PlaybackInteraction.swift
//  BriefCast
//
//  Models for skip/tell me more playback interactions and adaptive learning
//

import Foundation

// MARK: - Playback Interaction Types

enum PlaybackInteractionType: String, Codable {
    case skip = "skip"
    case tellMeMore = "tell_me_more"
    case completed = "completed"
    case paused = "paused"
}

struct PlaybackInteraction: Codable, Identifiable {
    let id: String
    let userId: String
    let contextType: String      // "daily_brief", "topic", "deep_dive", "live_station"
    let contextId: String
    let segmentType: String?     // "calendar", "email", "news", "weather", etc.
    let segmentIndex: Int?
    let interactionType: PlaybackInteractionType
    let timestamp: Double        // Position in audio when interaction occurred
    let metadata: [String: String]?
    let createdAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case contextType = "context_type"
        case contextId = "context_id"
        case segmentType = "segment_type"
        case segmentIndex = "segment_index"
        case interactionType = "interaction_type"
        case timestamp
        case metadata
        case createdAt = "created_at"
    }
}

// MARK: - Tell Me More Response

struct TellMeMoreResponse: Codable {
    let success: Bool
    let data: TellMeMoreData?
    let error: String?
}

struct TellMeMoreData: Codable {
    let expansion: TellMeMoreExpansion
}

struct TellMeMoreExpansion: Codable, Identifiable {
    let id: String
    let originalSegment: String
    let expandedContent: String
    let audioUrl: String?
    let durationSeconds: Int?
    let sources: [ExpansionSource]?

    enum CodingKeys: String, CodingKey {
        case id
        case originalSegment = "original_segment"
        case expandedContent = "expanded_content"
        case audioUrl = "audio_url"
        case durationSeconds = "duration_seconds"
        case sources
    }
}

struct ExpansionSource: Codable, Identifiable {
    let id: String
    let title: String
    let url: String?
    let snippet: String?
}

// MARK: - Segment Info (for tracking what user is listening to)

struct AudioSegmentInfo: Codable, Identifiable {
    let id: String
    let type: String             // "intro", "calendar", "email", "news", "weather", "topic_teaser", "outro"
    let title: String
    let startTime: Double
    let endTime: Double
    let content: String?         // Summary of segment content
    let topicId: String?         // If segment is about a specific topic

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case title
        case startTime = "start_time"
        case endTime = "end_time"
        case content
        case topicId = "topic_id"
    }

    var duration: Double {
        endTime - startTime
    }
}

// MARK: - User Preferences (Adaptive Learning)

struct UserPreferencesData: Codable {
    var skippedTopics: [String: Int]           // topicId -> skip count
    var expandedTopics: [String: Int]          // topicId -> tell me more count
    var preferredSegmentTypes: [String: Double] // segmentType -> preference score (0-1)
    var avgListeningDuration: Double?
    var preferredTimeOfDay: String?            // "morning", "afternoon", "evening"
    var lastUpdated: Date

    enum CodingKeys: String, CodingKey {
        case skippedTopics = "skipped_topics"
        case expandedTopics = "expanded_topics"
        case preferredSegmentTypes = "preferred_segment_types"
        case avgListeningDuration = "avg_listening_duration"
        case preferredTimeOfDay = "preferred_time_of_day"
        case lastUpdated = "last_updated"
    }

    static let empty = UserPreferencesData(
        skippedTopics: [:],
        expandedTopics: [:],
        preferredSegmentTypes: [:],
        avgListeningDuration: nil,
        preferredTimeOfDay: nil,
        lastUpdated: Date()
    )
}

// MARK: - API Responses

struct RecordInteractionResponse: Codable {
    let success: Bool
    let message: String?
}

struct UserPreferencesResponse: Codable {
    let success: Bool
    let data: UserPreferencesResponseData?
}

struct UserPreferencesResponseData: Codable {
    let preferences: UserPreferencesData
    let recommendations: [String]?
}
