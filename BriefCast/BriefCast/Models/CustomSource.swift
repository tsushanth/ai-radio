//
//  CustomSource.swift
//  BriefCast
//
//  Models for Custom Sources - RSS feeds, newsletters, and websites
//

import Foundation
import SwiftUI

// MARK: - Custom Source

struct CustomSource: Identifiable, Codable, Hashable {
    let id: String
    let userId: String
    let name: String
    let url: String
    let sourceType: CustomSourceType
    let icon: String?
    let color: String
    let isActive: Bool
    let lastFetchedAt: String?
    let itemCount: Int
    let status: CustomSourceStatus
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "userId"
        case name, url
        case sourceType = "sourceType"
        case icon, color
        case isActive = "isActive"
        case lastFetchedAt = "lastFetchedAt"
        case itemCount = "itemCount"
        case status
        case createdAt = "createdAt"
        case updatedAt = "updatedAt"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decodeIfPresent(String.self, forKey: .userId) ?? ""
        name = try container.decode(String.self, forKey: .name)
        url = try container.decode(String.self, forKey: .url)
        sourceType = try container.decode(CustomSourceType.self, forKey: .sourceType)
        icon = try container.decodeIfPresent(String.self, forKey: .icon)
        color = try container.decodeIfPresent(String.self, forKey: .color) ?? "#10B981"
        isActive = try container.decodeIfPresent(Bool.self, forKey: .isActive) ?? true
        lastFetchedAt = try container.decodeIfPresent(String.self, forKey: .lastFetchedAt)
        itemCount = try container.decodeIfPresent(Int.self, forKey: .itemCount) ?? 0
        status = try container.decodeIfPresent(CustomSourceStatus.self, forKey: .status) ?? .active
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
    }

    init(
        id: String,
        userId: String,
        name: String,
        url: String,
        sourceType: CustomSourceType,
        icon: String?,
        color: String,
        isActive: Bool,
        lastFetchedAt: String?,
        itemCount: Int,
        status: CustomSourceStatus,
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.userId = userId
        self.name = name
        self.url = url
        self.sourceType = sourceType
        self.icon = icon
        self.color = color
        self.isActive = isActive
        self.lastFetchedAt = lastFetchedAt
        self.itemCount = itemCount
        self.status = status
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    // MARK: - Computed Properties

    var swiftUIColor: Color {
        Color(hex: color)
    }

    var systemImage: String {
        if let icon = icon {
            return icon
        }
        return sourceType.icon
    }

    var displayDomain: String {
        guard let parsedUrl = URL(string: url) else { return url }
        return parsedUrl.host ?? url
    }

    var formattedLastFetch: String {
        guard let lastFetchedAt = lastFetchedAt else { return "Never synced" }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = formatter.date(from: lastFetchedAt) {
            return formatRelativeDate(date)
        }

        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: lastFetchedAt) {
            return formatRelativeDate(date)
        }

        return lastFetchedAt
    }

    private func formatRelativeDate(_ date: Date) -> String {
        let interval = Date().timeIntervalSince(date)

        if interval < 60 {
            return "Just now"
        } else if interval < 3600 {
            let minutes = Int(interval / 60)
            return "\(minutes)m ago"
        } else if interval < 86400 {
            let hours = Int(interval / 3600)
            return "\(hours)h ago"
        } else {
            let days = Int(interval / 86400)
            return "\(days)d ago"
        }
    }

    // Custom source brand color (green/teal)
    static let brandColor = "#10B981"
}

// MARK: - Custom Source Type

enum CustomSourceType: String, Codable, CaseIterable {
    case rss = "rss"
    case newsletter = "newsletter"
    case website = "website"
    case youtube = "youtube"
    case podcast = "podcast"

    var displayName: String {
        switch self {
        case .rss: return "RSS Feed"
        case .newsletter: return "Newsletter"
        case .website: return "Website"
        case .youtube: return "YouTube Channel"
        case .podcast: return "Podcast"
        }
    }

    var icon: String {
        switch self {
        case .rss: return "dot.radiowaves.up.forward"
        case .newsletter: return "envelope"
        case .website: return "globe"
        case .youtube: return "play.rectangle"
        case .podcast: return "mic"
        }
    }

    var description: String {
        switch self {
        case .rss: return "Add any RSS or Atom feed"
        case .newsletter: return "Add newsletters you subscribe to"
        case .website: return "Monitor a specific website for updates"
        case .youtube: return "Add a YouTube channel"
        case .podcast: return "Add an external podcast feed"
        }
    }

    var placeholder: String {
        switch self {
        case .rss: return "https://example.com/feed.xml"
        case .newsletter: return "your-newsletter@example.com"
        case .website: return "https://example.com"
        case .youtube: return "https://youtube.com/@channel"
        case .podcast: return "https://example.com/podcast.rss"
        }
    }
}

// MARK: - Custom Source Status

enum CustomSourceStatus: String, Codable {
    case active
    case paused
    case error
    case pending

    var displayText: String {
        switch self {
        case .active: return "Active"
        case .paused: return "Paused"
        case .error: return "Error"
        case .pending: return "Pending"
        }
    }

    var color: Color {
        switch self {
        case .active: return .green
        case .paused: return .orange
        case .error: return .red
        case .pending: return .gray
        }
    }
}

// MARK: - Custom Source Item

struct CustomSourceItem: Identifiable, Codable, Hashable {
    let id: String
    let sourceId: String
    let title: String
    let url: String
    let content: String?
    let summary: String?
    let author: String?
    let publishedAt: String?
    let fetchedAt: String
    let isRead: Bool
    let isIncludedInBrief: Bool

    enum CodingKeys: String, CodingKey {
        case id
        case sourceId = "sourceId"
        case title, url, content, summary, author
        case publishedAt = "publishedAt"
        case fetchedAt = "fetchedAt"
        case isRead = "isRead"
        case isIncludedInBrief = "isIncludedInBrief"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        sourceId = try container.decodeIfPresent(String.self, forKey: .sourceId) ?? ""
        title = try container.decode(String.self, forKey: .title)
        url = try container.decode(String.self, forKey: .url)
        content = try container.decodeIfPresent(String.self, forKey: .content)
        summary = try container.decodeIfPresent(String.self, forKey: .summary)
        author = try container.decodeIfPresent(String.self, forKey: .author)
        publishedAt = try container.decodeIfPresent(String.self, forKey: .publishedAt)
        fetchedAt = try container.decodeIfPresent(String.self, forKey: .fetchedAt) ?? ""
        isRead = try container.decodeIfPresent(Bool.self, forKey: .isRead) ?? false
        isIncludedInBrief = try container.decodeIfPresent(Bool.self, forKey: .isIncludedInBrief) ?? false
    }

    init(
        id: String,
        sourceId: String,
        title: String,
        url: String,
        content: String?,
        summary: String?,
        author: String?,
        publishedAt: String?,
        fetchedAt: String,
        isRead: Bool,
        isIncludedInBrief: Bool
    ) {
        self.id = id
        self.sourceId = sourceId
        self.title = title
        self.url = url
        self.content = content
        self.summary = summary
        self.author = author
        self.publishedAt = publishedAt
        self.fetchedAt = fetchedAt
        self.isRead = isRead
        self.isIncludedInBrief = isIncludedInBrief
    }

    var formattedDate: String {
        guard let publishedAt = publishedAt else { return "" }

        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = formatter.date(from: publishedAt) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateFormat = "MMM d, h:mm a"
            return displayFormatter.string(from: date)
        }

        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: publishedAt) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateFormat = "MMM d, h:mm a"
            return displayFormatter.string(from: date)
        }

        return publishedAt
    }
}

// MARK: - API Request/Response Types

struct CustomSourceAddRequest: Codable {
    let url: String
    let sourceType: CustomSourceType
    let name: String?
    let userId: String

    enum CodingKeys: String, CodingKey {
        case url
        case sourceType = "sourceType"
        case name
        case userId = "userId"
    }
}

struct CustomSourceAddResponse: Codable {
    let success: Bool
    let data: CustomSourceAddData
}

struct CustomSourceAddData: Codable {
    let source: CustomSource
    let message: String
}

struct CustomSourcesResponse: Codable {
    let success: Bool
    let data: CustomSourcesData
}

struct CustomSourcesData: Codable {
    let sources: [CustomSource]
    let total: Int
}

struct CustomSourceDetailResponse: Codable {
    let success: Bool
    let data: CustomSourceDetailData
}

struct CustomSourceDetailData: Codable {
    let source: CustomSource
    let items: [CustomSourceItem]
    let hasMore: Bool
}

struct CustomSourceRefreshResponse: Codable {
    let success: Bool
    let data: CustomSourceRefreshData
}

struct CustomSourceRefreshData: Codable {
    let source: CustomSource
    let newItemCount: Int
    let message: String
}

struct CustomSourceValidateResponse: Codable {
    let success: Bool
    let data: CustomSourceValidateData
}

struct CustomSourceValidateData: Codable {
    let isValid: Bool
    let sourceType: CustomSourceType?
    let suggestedName: String?
    let itemCount: Int?
    let error: String?
}

// MARK: - Preview Helpers

extension CustomSource {
    static var previewRSS: CustomSource {
        CustomSource(
            id: "source-1",
            userId: "user-1",
            name: "TechCrunch",
            url: "https://techcrunch.com/feed/",
            sourceType: .rss,
            icon: nil,
            color: "#00D084",
            isActive: true,
            lastFetchedAt: "2025-01-20T14:30:00Z",
            itemCount: 25,
            status: .active,
            createdAt: "2025-01-15T10:00:00Z",
            updatedAt: "2025-01-20T14:30:00Z"
        )
    }

    static var previewNewsletter: CustomSource {
        CustomSource(
            id: "source-2",
            userId: "user-1",
            name: "Morning Brew",
            url: "morningbrew@email.com",
            sourceType: .newsletter,
            icon: nil,
            color: "#F59E0B",
            isActive: true,
            lastFetchedAt: "2025-01-20T08:00:00Z",
            itemCount: 5,
            status: .active,
            createdAt: "2025-01-10T10:00:00Z",
            updatedAt: "2025-01-20T08:00:00Z"
        )
    }

    static var previewList: [CustomSource] {
        [previewRSS, previewNewsletter]
    }
}

extension CustomSourceItem {
    static var preview: CustomSourceItem {
        CustomSourceItem(
            id: "item-1",
            sourceId: "source-1",
            title: "OpenAI Announces GPT-5 with Breakthrough Capabilities",
            url: "https://techcrunch.com/article",
            content: "OpenAI has announced the release of GPT-5...",
            summary: "OpenAI's latest model shows significant improvements in reasoning and multimodal capabilities.",
            author: "Sarah Chen",
            publishedAt: "2025-01-20T12:00:00Z",
            fetchedAt: "2025-01-20T14:30:00Z",
            isRead: false,
            isIncludedInBrief: true
        )
    }
}
