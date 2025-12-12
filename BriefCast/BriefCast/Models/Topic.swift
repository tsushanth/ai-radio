//
//  Topic.swift
//  BriefCast
//
//  Models for topic-based podcasts
//

import Foundation
import SwiftUI

// MARK: - Topic Definition

struct Topic: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let description: String
    let icon: String
    let color: String
    let category: TopicCategory
    let targetDurationMinutes: Int
    let isActive: Bool

    // Computed property for SwiftUI color
    var swiftUIColor: Color {
        Color(hex: color)
    }

    // Computed property for SF Symbol
    var systemImage: String {
        // Map backend icon names to SF Symbols
        switch icon {
        case "newspaper.fill": return "newspaper.fill"
        case "building.columns.fill": return "building.columns.fill"
        case "globe.americas.fill": return "globe.americas.fill"
        case "brain.head.profile": return "brain.head.profile"
        case "laptopcomputer": return "laptopcomputer"
        case "chevron.left.forwardslash.chevron.right": return "chevron.left.forwardslash.chevron.right"
        case "chart.line.uptrend.xyaxis": return "chart.line.uptrend.xyaxis"
        case "dollarsign.circle.fill": return "dollarsign.circle.fill"
        case "sparkles": return "sparkles"
        case "atom": return "atom"
        case "heart.fill": return "heart.fill"
        case "gamecontroller.fill": return "gamecontroller.fill"
        case "sportscourt.fill": return "sportscourt.fill"
        default: return "mic.fill"
        }
    }

    // Custom init to ignore extra fields from backend
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decode(String.self, forKey: .description)
        icon = try container.decode(String.self, forKey: .icon)
        color = try container.decode(String.self, forKey: .color)
        category = try container.decode(TopicCategory.self, forKey: .category)
        targetDurationMinutes = try container.decode(Int.self, forKey: .targetDurationMinutes)
        isActive = try container.decode(Bool.self, forKey: .isActive)
    }

    enum CodingKeys: String, CodingKey {
        case id, name, description, icon, color, category
        case targetDurationMinutes = "targetDurationMinutes"
        case isActive = "isActive"
    }
}

// MARK: - Topic Category

enum TopicCategory: String, Codable, CaseIterable {
    case news
    case technology
    case business
    case science
    case lifestyle
    case entertainment
    case sports

    var displayName: String {
        switch self {
        case .news: return "News"
        case .technology: return "Technology"
        case .business: return "Business"
        case .science: return "Science"
        case .lifestyle: return "Lifestyle"
        case .entertainment: return "Entertainment"
        case .sports: return "Sports"
        }
    }

    var icon: String {
        switch self {
        case .news: return "newspaper"
        case .technology: return "laptopcomputer"
        case .business: return "chart.line.uptrend.xyaxis"
        case .science: return "atom"
        case .lifestyle: return "heart"
        case .entertainment: return "film"
        case .sports: return "sportscourt"
        }
    }
}

// MARK: - Topic Episode

struct TopicEpisode: Identifiable, Codable {
    let id: String
    let topicId: String
    let date: String
    let status: TopicEpisodeStatus
    let title: String
    let description: String
    let audioUrl: String?
    let durationSeconds: Int?
    let generatedAt: String?
    let playCount: Int
    let error: String?
    let language: String

    enum CodingKeys: String, CodingKey {
        case id
        case topicId = "topicId"
        case date, status, title, description
        case audioUrl = "audioUrl"
        case durationSeconds = "durationSeconds"
        case generatedAt = "generatedAt"
        case playCount = "playCount"
        case error
        case language
    }

    // Custom init to ignore extra fields from backend (stories, script, audioPath, etc.)
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        topicId = try container.decode(String.self, forKey: .topicId)
        date = try container.decode(String.self, forKey: .date)
        status = try container.decode(TopicEpisodeStatus.self, forKey: .status)
        title = try container.decode(String.self, forKey: .title)
        description = try container.decode(String.self, forKey: .description)
        audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl)
        durationSeconds = try container.decodeIfPresent(Int.self, forKey: .durationSeconds)
        generatedAt = try container.decodeIfPresent(String.self, forKey: .generatedAt)
        playCount = try container.decodeIfPresent(Int.self, forKey: .playCount) ?? 0
        error = try container.decodeIfPresent(String.self, forKey: .error)
        language = try container.decodeIfPresent(String.self, forKey: .language) ?? "en"
    }

    var formattedDate: String {
        // Parse YYYY-MM-DD format
        let formatter = DateFormatter()
        formatter.dateFormat = "yyyy-MM-dd"
        if let date = formatter.date(from: date) {
            formatter.dateFormat = "EEEE, MMMM d"
            return formatter.string(from: date)
        }
        return date
    }

    var formattedDuration: String {
        guard let seconds = durationSeconds else { return "" }
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }
}

enum TopicEpisodeStatus: String, Codable {
    case notGenerated = "not_generated"
    case generating
    case completed
    case failed
}

// MARK: - API Response Types

struct TopicsResponse: Codable {
    let success: Bool
    let data: TopicsData
}

struct TopicsData: Codable {
    let topics: [Topic]
    let categories: [CategoryInfo]
}

struct CategoryInfo: Codable, Identifiable {
    let id: TopicCategory
    let name: String
    let count: Int
}

struct TopicEpisodeResponse: Codable {
    let success: Bool
    let data: TopicEpisodeData
}

struct TopicEpisodeData: Codable {
    let episode: TopicEpisode
    let isNew: Bool
    let message: String
}

struct TopicDetailResponse: Codable {
    let success: Bool
    let data: TopicDetailData
}

struct TopicDetailData: Codable {
    let topic: Topic
    let recentEpisodes: [TopicEpisode]
}

struct TopicEpisodesResponse: Codable {
    let success: Bool
    let data: TopicEpisodesData
}

struct TopicEpisodesData: Codable {
    let episodes: [TopicEpisode]
    let topicId: String
    let language: String
}
