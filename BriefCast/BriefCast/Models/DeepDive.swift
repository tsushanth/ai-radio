//
//  DeepDive.swift
//  BriefCast
//
//  Models for Deep Dive on-demand research podcasts
//

import Foundation
import SwiftUI

// MARK: - Deep Dive Episode

struct DeepDiveEpisode: Identifiable, Codable, Hashable {
    let id: String
    let userId: String
    let query: String
    let title: String
    let description: String
    let audioUrl: String?
    let durationSeconds: Int?
    let status: DeepDiveStatus
    let language: String
    let sources: [DeepDiveSource]
    let generatedAt: String?
    let createdAt: String
    let errorMessage: String?

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "userId"
        case query, title, description
        case audioUrl = "audioUrl"
        case durationSeconds = "durationSeconds"
        case status, language, sources
        case generatedAt = "generatedAt"
        case createdAt = "createdAt"
        case errorMessage = "error"  // Backend sends "error", iOS uses errorMessage
    }

    // Custom init to handle missing fields gracefully
    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decodeIfPresent(String.self, forKey: .userId) ?? ""
        query = try container.decode(String.self, forKey: .query)
        title = try container.decode(String.self, forKey: .title)
        description = try container.decode(String.self, forKey: .description)
        audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl)
        durationSeconds = try container.decodeIfPresent(Int.self, forKey: .durationSeconds)
        status = try container.decode(DeepDiveStatus.self, forKey: .status)
        language = try container.decodeIfPresent(String.self, forKey: .language) ?? "en"
        sources = try container.decodeIfPresent([DeepDiveSource].self, forKey: .sources) ?? []
        generatedAt = try container.decodeIfPresent(String.self, forKey: .generatedAt)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        errorMessage = try container.decodeIfPresent(String.self, forKey: .errorMessage)
    }

    // Standard init for creating instances
    init(
        id: String,
        userId: String,
        query: String,
        title: String,
        description: String,
        audioUrl: String?,
        durationSeconds: Int?,
        status: DeepDiveStatus,
        language: String,
        sources: [DeepDiveSource],
        generatedAt: String?,
        createdAt: String,
        errorMessage: String?
    ) {
        self.id = id
        self.userId = userId
        self.query = query
        self.title = title
        self.description = description
        self.audioUrl = audioUrl
        self.durationSeconds = durationSeconds
        self.status = status
        self.language = language
        self.sources = sources
        self.generatedAt = generatedAt
        self.createdAt = createdAt
        self.errorMessage = errorMessage
    }

    // MARK: - Computed Properties

    var isAvailable: Bool {
        status == .completed && audioUrl != nil
    }

    var formattedDate: String {
        // Parse ISO date string
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        if let date = formatter.date(from: generatedAt ?? createdAt) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateFormat = "EEEE, MMMM d"
            return displayFormatter.string(from: date)
        }

        // Fallback: try without fractional seconds
        formatter.formatOptions = [.withInternetDateTime]
        if let date = formatter.date(from: generatedAt ?? createdAt) {
            let displayFormatter = DateFormatter()
            displayFormatter.dateFormat = "EEEE, MMMM d"
            return displayFormatter.string(from: date)
        }

        return generatedAt ?? createdAt
    }

    var formattedDuration: String {
        guard let seconds = durationSeconds else { return "" }
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }

    var durationMinutes: Int {
        (durationSeconds ?? 0) / 60
    }

    var shortQuery: String {
        if query.count > 50 {
            return String(query.prefix(47)) + "..."
        }
        return query
    }

    // Deep dive brand color (purple)
    static let brandColor = "#6366F1"

    var swiftUIColor: Color {
        Color(hex: Self.brandColor)
    }
}

// MARK: - Deep Dive Status

enum DeepDiveStatus: String, Codable {
    case pending
    case researching
    case generating
    case completed
    case failed

    var displayText: String {
        switch self {
        case .pending: return "Queued"
        case .researching: return "Researching..."
        case .generating: return "Generating audio..."
        case .completed: return "Ready"
        case .failed: return "Failed"
        }
    }

    var isInProgress: Bool {
        self == .pending || self == .researching || self == .generating
    }
}

// MARK: - Deep Dive Source

struct DeepDiveSource: Identifiable, Codable, Hashable {
    let id: String
    let url: String
    let title: String
    let domain: String
    let snippet: String?
    let accessedAt: String?

    enum CodingKeys: String, CodingKey {
        case id, url, title, domain, snippet
        case accessedAt = "accessedAt"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        // Generate ID if not provided
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        url = try container.decode(String.self, forKey: .url)
        title = try container.decode(String.self, forKey: .title)
        domain = try container.decodeIfPresent(String.self, forKey: .domain) ?? URL(string: url)?.host ?? ""
        snippet = try container.decodeIfPresent(String.self, forKey: .snippet)
        accessedAt = try container.decodeIfPresent(String.self, forKey: .accessedAt)
    }

    init(id: String = UUID().uuidString, url: String, title: String, domain: String, snippet: String?, accessedAt: String?) {
        self.id = id
        self.url = url
        self.title = title
        self.domain = domain
        self.snippet = snippet
        self.accessedAt = accessedAt
    }
}

// MARK: - API Request/Response Types

struct DeepDiveGenerationRequest: Codable {
    let query: String
    let language: String
    let targetDurationMinutes: Int
    let userId: String

    enum CodingKeys: String, CodingKey {
        case query, language, userId
        case targetDurationMinutes = "targetDurationMinutes"
    }
}

struct DeepDiveResponse: Codable {
    let success: Bool
    let data: DeepDiveData
}

struct DeepDiveData: Codable {
    let episode: DeepDiveEpisode
    let isNew: Bool
    let message: String
}

struct DeepDiveHistoryResponse: Codable {
    let success: Bool
    let data: DeepDiveHistoryData
}

struct DeepDiveHistoryData: Codable {
    let episodes: [DeepDiveEpisode]
    let total: Int
    let hasMore: Bool
}

// MARK: - Generation State (for UI)

enum DeepDiveGenerationState: Equatable {
    case idle
    case researching
    case generating
    case completed(DeepDiveEpisode)
    case failed(String)

    var isInProgress: Bool {
        switch self {
        case .researching, .generating:
            return true
        default:
            return false
        }
    }

    var progressMessage: String {
        switch self {
        case .idle:
            return ""
        case .researching:
            return "Researching your topic..."
        case .generating:
            return "Generating your podcast..."
        case .completed:
            return "Ready to play!"
        case .failed(let message):
            return message
        }
    }
}

// MARK: - Preview Helpers

extension DeepDiveEpisode {
    static var preview: DeepDiveEpisode {
        DeepDiveEpisode(
            id: "preview-1",
            userId: "user-1",
            query: "The history and future of quantum computing",
            title: "Deep Dive: Quantum Computing",
            description: "An in-depth exploration of quantum computing, from its theoretical foundations to cutting-edge developments and future possibilities.",
            audioUrl: "https://example.com/audio.mp3",
            durationSeconds: 612,
            status: .completed,
            language: "en",
            sources: [
                DeepDiveSource(
                    url: "https://nature.com/quantum",
                    title: "Quantum Supremacy Achieved",
                    domain: "nature.com",
                    snippet: "Google's Sycamore processor performed a calculation in 200 seconds...",
                    accessedAt: "2025-01-20T10:00:00Z"
                ),
                DeepDiveSource(
                    url: "https://arxiv.org/quantum",
                    title: "Advances in Quantum Error Correction",
                    domain: "arxiv.org",
                    snippet: "Recent breakthroughs in error correction bring us closer to practical quantum computers...",
                    accessedAt: "2025-01-20T10:00:00Z"
                )
            ],
            generatedAt: "2025-01-20T10:05:00Z",
            createdAt: "2025-01-20T10:00:00Z",
            errorMessage: nil
        )
    }

    static var previewGenerating: DeepDiveEpisode {
        DeepDiveEpisode(
            id: "preview-2",
            userId: "user-1",
            query: "How does machine learning work?",
            title: "Deep Dive: Machine Learning",
            description: "Exploring the fundamentals of machine learning...",
            audioUrl: nil,
            durationSeconds: nil,
            status: .generating,
            language: "en",
            sources: [],
            generatedAt: nil,
            createdAt: "2025-01-20T10:00:00Z",
            errorMessage: nil
        )
    }
}

extension DeepDiveSource {
    static var preview: DeepDiveSource {
        DeepDiveSource(
            url: "https://nature.com/quantum",
            title: "Quantum Supremacy Achieved",
            domain: "nature.com",
            snippet: "Google's Sycamore processor performed a calculation in 200 seconds that would take the world's fastest supercomputer 10,000 years.",
            accessedAt: "2025-01-20T10:00:00Z"
        )
    }
}
