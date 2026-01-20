//
//  LiveStation.swift
//  BriefCast
//
//  Models for Live Stations - continuously updating news streams
//

import Foundation
import SwiftUI

// MARK: - Live Station

struct LiveStation: Identifiable, Codable, Hashable {
    let id: String
    let name: String
    let description: String
    let icon: String
    let color: String
    let category: LiveStationCategory
    let refreshIntervalMinutes: Int
    let isActive: Bool
    let listenerCount: Int
    let currentEpisode: LiveStationEpisode?
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id, name, description, icon, color, category
        case refreshIntervalMinutes = "refreshIntervalMinutes"
        case isActive = "isActive"
        case listenerCount = "listenerCount"
        case currentEpisode = "currentEpisode"
        case createdAt = "createdAt"
        case updatedAt = "updatedAt"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        name = try container.decode(String.self, forKey: .name)
        description = try container.decode(String.self, forKey: .description)
        icon = try container.decodeIfPresent(String.self, forKey: .icon) ?? "radio"
        color = try container.decodeIfPresent(String.self, forKey: .color) ?? "#EF4444"
        category = try container.decodeIfPresent(LiveStationCategory.self, forKey: .category) ?? .news
        refreshIntervalMinutes = try container.decodeIfPresent(Int.self, forKey: .refreshIntervalMinutes) ?? 30
        isActive = try container.decodeIfPresent(Bool.self, forKey: .isActive) ?? true
        listenerCount = try container.decodeIfPresent(Int.self, forKey: .listenerCount) ?? 0
        currentEpisode = try container.decodeIfPresent(LiveStationEpisode.self, forKey: .currentEpisode)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
    }

    init(
        id: String,
        name: String,
        description: String,
        icon: String,
        color: String,
        category: LiveStationCategory,
        refreshIntervalMinutes: Int,
        isActive: Bool,
        listenerCount: Int,
        currentEpisode: LiveStationEpisode?,
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.name = name
        self.description = description
        self.icon = icon
        self.color = color
        self.category = category
        self.refreshIntervalMinutes = refreshIntervalMinutes
        self.isActive = isActive
        self.listenerCount = listenerCount
        self.currentEpisode = currentEpisode
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    // MARK: - Computed Properties

    var swiftUIColor: Color {
        Color(hex: color)
    }

    var systemImage: String {
        switch icon {
        case "radio": return "radio"
        case "newspaper": return "newspaper"
        case "globe": return "globe"
        case "chart.line": return "chart.line.uptrend.xyaxis"
        case "cpu": return "cpu"
        case "sportscourt": return "sportscourt"
        case "film": return "film"
        default: return "radio.fill"
        }
    }

    var isLive: Bool {
        isActive && currentEpisode != nil
    }

    var formattedListenerCount: String {
        if listenerCount >= 1000 {
            return "\(listenerCount / 1000)K listening"
        }
        return "\(listenerCount) listening"
    }

    var nextUpdateText: String {
        guard let episode = currentEpisode else { return "Updating..." }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        guard let generatedAt = formatter.date(from: episode.generatedAt ?? "") else {
            formatter.formatOptions = [.withInternetDateTime]
            guard let generatedAt = formatter.date(from: episode.generatedAt ?? "") else {
                return "Next update soon"
            }
            return calculateNextUpdate(from: generatedAt)
        }
        return calculateNextUpdate(from: generatedAt)
    }

    private func calculateNextUpdate(from lastUpdate: Date) -> String {
        let nextUpdate = lastUpdate.addingTimeInterval(TimeInterval(refreshIntervalMinutes * 60))
        let remaining = nextUpdate.timeIntervalSince(Date())

        if remaining <= 0 {
            return "Updating now..."
        } else if remaining < 60 {
            return "Next update in <1 min"
        } else {
            let minutes = Int(remaining / 60)
            return "Next update in \(minutes) min"
        }
    }

    // Live station brand color (red for "live")
    static let liveColor = "#EF4444"
}

// MARK: - Live Station Category

enum LiveStationCategory: String, Codable, CaseIterable {
    case news
    case technology
    case business
    case sports
    case entertainment
    case world

    var displayName: String {
        switch self {
        case .news: return "Breaking News"
        case .technology: return "Tech"
        case .business: return "Business"
        case .sports: return "Sports"
        case .entertainment: return "Entertainment"
        case .world: return "World"
        }
    }

    var icon: String {
        switch self {
        case .news: return "newspaper"
        case .technology: return "cpu"
        case .business: return "chart.line.uptrend.xyaxis"
        case .sports: return "sportscourt"
        case .entertainment: return "film"
        case .world: return "globe"
        }
    }
}

// MARK: - Live Station Episode

struct LiveStationEpisode: Identifiable, Codable, Hashable {
    let id: String
    let stationId: String
    let title: String
    let description: String
    let audioUrl: String?
    let durationSeconds: Int?
    let headlines: [String]
    let generatedAt: String?
    let expiresAt: String?

    enum CodingKeys: String, CodingKey {
        case id
        case stationId = "stationId"
        case title, description
        case audioUrl = "audioUrl"
        case durationSeconds = "durationSeconds"
        case headlines
        case generatedAt = "generatedAt"
        case expiresAt = "expiresAt"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        stationId = try container.decodeIfPresent(String.self, forKey: .stationId) ?? ""
        title = try container.decode(String.self, forKey: .title)
        description = try container.decodeIfPresent(String.self, forKey: .description) ?? ""
        audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl)
        durationSeconds = try container.decodeIfPresent(Int.self, forKey: .durationSeconds)
        headlines = try container.decodeIfPresent([String].self, forKey: .headlines) ?? []
        generatedAt = try container.decodeIfPresent(String.self, forKey: .generatedAt)
        expiresAt = try container.decodeIfPresent(String.self, forKey: .expiresAt)
    }

    init(
        id: String,
        stationId: String,
        title: String,
        description: String,
        audioUrl: String?,
        durationSeconds: Int?,
        headlines: [String],
        generatedAt: String?,
        expiresAt: String?
    ) {
        self.id = id
        self.stationId = stationId
        self.title = title
        self.description = description
        self.audioUrl = audioUrl
        self.durationSeconds = durationSeconds
        self.headlines = headlines
        self.generatedAt = generatedAt
        self.expiresAt = expiresAt
    }

    var isExpired: Bool {
        guard let expiresAt = expiresAt else { return false }
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = formatter.date(from: expiresAt) {
            return date < Date()
        }
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: expiresAt) {
            return date < Date()
        }
        return false
    }

    var formattedDuration: String {
        guard let seconds = durationSeconds else { return "" }
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }
}

// MARK: - API Response Types

struct LiveStationsResponse: Codable {
    let success: Bool
    let data: LiveStationsData
}

struct LiveStationsData: Codable {
    let stations: [LiveStation]
    let categories: [LiveStationCategoryInfo]
}

struct LiveStationCategoryInfo: Codable, Identifiable {
    let id: LiveStationCategory
    let name: String
    let count: Int
}

struct LiveStationDetailResponse: Codable {
    let success: Bool
    let data: LiveStationDetailData
}

struct LiveStationDetailData: Codable {
    let station: LiveStation
    let recentEpisodes: [LiveStationEpisode]
}

struct LiveStationTuneInResponse: Codable {
    let success: Bool
    let data: LiveStationTuneInData
}

struct LiveStationTuneInData: Codable {
    let station: LiveStation
    let episode: LiveStationEpisode
    let nextUpdateAt: String
}

// MARK: - Live Station State (for UI)

enum LiveStationState: Equatable {
    case idle
    case tuningIn
    case streaming(LiveStationEpisode)
    case updating
    case error(String)

    var isStreaming: Bool {
        if case .streaming = self {
            return true
        }
        return false
    }

    var statusText: String {
        switch self {
        case .idle:
            return "Tap to tune in"
        case .tuningIn:
            return "Tuning in..."
        case .streaming:
            return "LIVE"
        case .updating:
            return "Updating..."
        case .error(let message):
            return message
        }
    }
}

// MARK: - Preview Helpers

extension LiveStation {
    static var preview: LiveStation {
        LiveStation(
            id: "live-news-1",
            name: "Breaking News",
            description: "24/7 coverage of breaking news and developing stories",
            icon: "newspaper",
            color: "#EF4444",
            category: .news,
            refreshIntervalMinutes: 15,
            isActive: true,
            listenerCount: 1523,
            currentEpisode: LiveStationEpisode.preview,
            createdAt: "2025-01-20T10:00:00Z",
            updatedAt: "2025-01-20T14:30:00Z"
        )
    }

    static var previewTech: LiveStation {
        LiveStation(
            id: "live-tech-1",
            name: "Tech Pulse",
            description: "Latest technology news, AI updates, and startup coverage",
            icon: "cpu",
            color: "#3B82F6",
            category: .technology,
            refreshIntervalMinutes: 30,
            isActive: true,
            listenerCount: 892,
            currentEpisode: nil,
            createdAt: "2025-01-20T10:00:00Z",
            updatedAt: "2025-01-20T14:00:00Z"
        )
    }

    static var previewList: [LiveStation] {
        [preview, previewTech]
    }
}

extension LiveStationEpisode {
    static var preview: LiveStationEpisode {
        LiveStationEpisode(
            id: "ep-live-1",
            stationId: "live-news-1",
            title: "Breaking: Major Policy Announcement",
            description: "Coverage of today's key developments",
            audioUrl: "https://example.com/live-audio.mp3",
            durationSeconds: 180,
            headlines: [
                "Federal Reserve signals interest rate decision",
                "Tech giants report quarterly earnings",
                "International summit begins in Geneva"
            ],
            generatedAt: "2025-01-20T14:30:00Z",
            expiresAt: "2025-01-20T14:45:00Z"
        )
    }
}
