//
//  User.swift
//  BriefCast
//
//  User model with linked accounts
//

import Foundation

struct User: Codable, Identifiable {
    let id: String
    let email: String
    let name: String?
    let timezone: String
    var linkedAccounts: [LinkedAccount]
    var preferences: UserPreferences
    let createdAt: Date
    let updatedAt: Date

    enum CodingKeys: String, CodingKey {
        case id, email, name, timezone
        case linkedAccounts = "linked_accounts"
        case preferences
        case createdAt = "created_at"
        case updatedAt = "updated_at"
    }
}

// MARK: - Linked Account

struct LinkedAccount: Identifiable, Codable {
    let id: String
    let provider: Provider
    let email: String
    let isActive: Bool
    let connectedAt: Date
    let lastSyncedAt: Date?

    enum Provider: String, Codable {
        case gmail = "gmail"
        case outlook = "outlook"
        case googleCalendar = "google_calendar"

        var displayName: String {
            switch self {
            case .gmail: return "Gmail"
            case .outlook: return "Outlook"
            case .googleCalendar: return "Google Calendar"
            }
        }

        var iconName: String {
            switch self {
            case .gmail: return "envelope.fill"
            case .outlook: return "envelope.badge.fill"
            case .googleCalendar: return "calendar"
            }
        }
    }

    enum CodingKeys: String, CodingKey {
        case id, provider, email
        case isActive = "is_active"
        case connectedAt = "connected_at"
        case lastSyncedAt = "last_synced_at"
    }
}

// MARK: - User Preferences

struct UserPreferences: Codable {
    var briefingTime: String? // e.g., "07:00"
    var topics: [String]?
    var voiceHost1: String?
    var voiceHost2: String?
    var includeWeather: Bool?
    var includeCalendar: Bool?
    var includeEmail: Bool?
    var language: String? // e.g., "en", "es", "hi"
    var includeTopicTeasers: Bool? // Include topic headlines in Daily Brief

    enum CodingKeys: String, CodingKey {
        case briefingTime = "briefing_time"
        case topics
        case voiceHost1 = "voice_host1"
        case voiceHost2 = "voice_host2"
        case includeWeather = "include_weather"
        case includeCalendar = "include_calendar"
        case includeEmail = "include_email"
        case language
        case includeTopicTeasers = "include_topic_teasers"
    }
}

// MARK: - Mock Data

extension User {
    static let mock = User(
        id: "user-1",
        email: "sushanth@example.com",
        name: "Sushanth",
        timezone: "America/Los_Angeles",
        linkedAccounts: LinkedAccount.mockList,
        preferences: UserPreferences(
            briefingTime: "07:00",
            topics: ["Technology", "AI", "Business", "Startups"],
            voiceHost1: "neural-male-1",
            voiceHost2: "neural-female-1",
            includeWeather: true,
            includeCalendar: true,
            includeEmail: true
        ),
        createdAt: Date().addingTimeInterval(-86400 * 30), // 30 days ago
        updatedAt: Date()
    )
}

extension LinkedAccount {
    static let mockList: [LinkedAccount] = [
        LinkedAccount(
            id: "link-1",
            provider: .gmail,
            email: "sushanth@gmail.com",
            isActive: true,
            connectedAt: Date().addingTimeInterval(-86400 * 7), // 7 days ago
            lastSyncedAt: Date().addingTimeInterval(-3600) // 1 hour ago
        ),
        LinkedAccount(
            id: "link-2",
            provider: .googleCalendar,
            email: "sushanth@gmail.com",
            isActive: true,
            connectedAt: Date().addingTimeInterval(-86400 * 7),
            lastSyncedAt: Date().addingTimeInterval(-3600)
        ),
        LinkedAccount(
            id: "link-3",
            provider: .outlook,
            email: "sushanth@outlook.com",
            isActive: false,
            connectedAt: Date().addingTimeInterval(-86400 * 20), // 20 days ago
            lastSyncedAt: Date().addingTimeInterval(-86400 * 5) // 5 days ago
        )
    ]
}
