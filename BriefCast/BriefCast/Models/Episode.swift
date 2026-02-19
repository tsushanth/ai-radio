//
//  Episode.swift
//  BriefCast
//
//  Podcast episode model with playback tracking
//

import Foundation

struct Episode: Codable, Identifiable {
    let id: String
    let userId: String
    let title: String
    let description: String
    let audioUrl: String?
    let durationSeconds: Int?
    let status: EpisodeStatus
    let errorMessage: String?
    let generatedAt: Date
    let createdAt: Date

    // UI display properties
    let showId: String?
    let showName: String?
    let imageColor: String // hex color for placeholder gradient

    // Playback tracking (local state, not from API)
    var progress: TimeInterval
    var isCompleted: Bool
    var lastPlayedAt: Date?

    // Transcript data (carried from TopicEpisode, not in CodingKeys)
    var script: PodcastScript? = nil

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "user_id"
        case title, description
        case audioUrl = "audio_url"
        case durationSeconds = "duration_seconds"
        case status
        case errorMessage = "error_message"
        case generatedAt = "generated_at"
        case createdAt = "created_at"
        case showId = "show_id"
        case showName = "show_name"
        case imageColor = "image_color"
        case progress
        case isCompleted = "is_completed"
        case lastPlayedAt = "last_played_at"
    }

    // MARK: - Computed Properties

    var duration: TimeInterval {
        TimeInterval(durationSeconds ?? 0)
    }

    var progressPercentage: Double {
        guard duration > 0 else { return 0 }
        return progress / duration
    }

    var remainingTime: TimeInterval {
        max(0, duration - progress)
    }

    var isAvailable: Bool {
        status == .completed && audioUrl != nil
    }
}

enum EpisodeStatus: String, Codable {
    case pending
    case generating
    case completed
    case failed

    var displayText: String {
        switch self {
        case .pending: return "Queued"
        case .generating: return "Generating..."
        case .completed: return "Ready"
        case .failed: return "Failed"
        }
    }
}

// MARK: - Mock Data for Preview

extension Episode {
    static let mock = Episode(
        id: "1",
        userId: "user-1",
        title: "Morning Briefing - Dec 10, 2025",
        description: "Your daily schedule, emails, and news summary",
        audioUrl: "https://example.com/audio.mp3",
        durationSeconds: 300,
        status: .completed,
        errorMessage: nil,
        generatedAt: Date(),
        createdAt: Date(),
        showId: "daily-brief",
        showName: "Daily Brief",
        imageColor: "#FF6B35",
        progress: 120,
        isCompleted: false,
        lastPlayedAt: Date().addingTimeInterval(-3600)
    )

    static let mockList: [Episode] = [
        Episode.mock,
        Episode(
            id: "2",
            userId: "user-1",
            title: "Evening Update - Dec 9, 2025",
            description: "Recap of today's important items",
            audioUrl: "https://example.com/audio2.mp3",
            durationSeconds: 180,
            status: .completed,
            errorMessage: nil,
            generatedAt: Date().addingTimeInterval(-86400),
            createdAt: Date().addingTimeInterval(-86400),
            showId: "evening-update",
            showName: "Evening Update",
            imageColor: "#8B4513",
            progress: 60,
            isCompleted: false,
            lastPlayedAt: Date().addingTimeInterval(-90000)
        ),
        Episode(
            id: "3",
            userId: "user-1",
            title: "Tech Roundup - Weekly Edition",
            description: "Latest in AI, software, and startups",
            audioUrl: "https://example.com/audio3.mp3",
            durationSeconds: 420,
            status: .completed,
            errorMessage: nil,
            generatedAt: Date().addingTimeInterval(-172800),
            createdAt: Date().addingTimeInterval(-172800),
            showId: "tech-roundup",
            showName: "Tech Roundup",
            imageColor: "#4A90E2",
            progress: 0,
            isCompleted: false,
            lastPlayedAt: nil
        ),
        Episode(
            id: "4",
            userId: "user-1",
            title: "Business Insights - Market Update",
            description: "Key trends and market analysis",
            audioUrl: "https://example.com/audio4.mp3",
            durationSeconds: 240,
            status: .completed,
            errorMessage: nil,
            generatedAt: Date().addingTimeInterval(-259200),
            createdAt: Date().addingTimeInterval(-259200),
            showId: "business-insights",
            showName: "Business Insights",
            imageColor: "#50C878",
            progress: 240,
            isCompleted: true,
            lastPlayedAt: Date().addingTimeInterval(-172800)
        )
    ]

    // Factory method for creating mock episodes with custom data
    static func mockEpisode(
        id: String = UUID().uuidString,
        title: String,
        description: String,
        showName: String,
        imageColor: String,
        durationSeconds: Int = 300,
        progress: TimeInterval = 0,
        daysAgo: Int = 0
    ) -> Episode {
        Episode(
            id: id,
            userId: "user-1",
            title: title,
            description: description,
            audioUrl: "https://example.com/audio/\(id).mp3",
            durationSeconds: durationSeconds,
            status: .completed,
            errorMessage: nil,
            generatedAt: Date().addingTimeInterval(TimeInterval(-86400 * daysAgo)),
            createdAt: Date().addingTimeInterval(TimeInterval(-86400 * daysAgo)),
            showId: showName.lowercased().replacingOccurrences(of: " ", with: "-"),
            showName: showName,
            imageColor: imageColor,
            progress: progress,
            isCompleted: progress >= TimeInterval(durationSeconds),
            lastPlayedAt: progress > 0 ? Date().addingTimeInterval(TimeInterval(-3600 * daysAgo)) : nil
        )
    }
}
