//
//  InteractiveQA.swift
//  BriefCast
//
//  Models for Interactive Q&A - ask follow-up questions about content
//

import Foundation
import SwiftUI

// MARK: - Q&A Session

struct QASession: Identifiable, Codable, Hashable {
    let id: String
    let userId: String
    let contextType: QAContextType
    let contextId: String
    let contextTitle: String
    let messages: [QAMessage]
    let createdAt: String
    let updatedAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case userId = "userId"
        case contextType = "contextType"
        case contextId = "contextId"
        case contextTitle = "contextTitle"
        case messages
        case createdAt = "createdAt"
        case updatedAt = "updatedAt"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        userId = try container.decodeIfPresent(String.self, forKey: .userId) ?? ""
        contextType = try container.decode(QAContextType.self, forKey: .contextType)
        contextId = try container.decode(String.self, forKey: .contextId)
        contextTitle = try container.decodeIfPresent(String.self, forKey: .contextTitle) ?? ""
        messages = try container.decodeIfPresent([QAMessage].self, forKey: .messages) ?? []
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
        updatedAt = try container.decodeIfPresent(String.self, forKey: .updatedAt) ?? ""
    }

    init(
        id: String,
        userId: String,
        contextType: QAContextType,
        contextId: String,
        contextTitle: String,
        messages: [QAMessage],
        createdAt: String,
        updatedAt: String
    ) {
        self.id = id
        self.userId = userId
        self.contextType = contextType
        self.contextId = contextId
        self.contextTitle = contextTitle
        self.messages = messages
        self.createdAt = createdAt
        self.updatedAt = updatedAt
    }

    var lastMessage: QAMessage? {
        messages.last
    }

    var questionCount: Int {
        messages.filter { $0.role == .user }.count
    }
}

// MARK: - Q&A Context Type

enum QAContextType: String, Codable {
    case topic = "topic"
    case deepDive = "deep_dive"
    case liveStation = "live_station"
    case dailyBrief = "daily_brief"

    var displayName: String {
        switch self {
        case .topic: return "Topic"
        case .deepDive: return "Deep Dive"
        case .liveStation: return "Live Station"
        case .dailyBrief: return "Daily Brief"
        }
    }

    var icon: String {
        switch self {
        case .topic: return "list.bullet"
        case .deepDive: return "magnifyingglass"
        case .liveStation: return "radio"
        case .dailyBrief: return "sun.max"
        }
    }
}

// MARK: - Q&A Message

struct QAMessage: Identifiable, Codable, Hashable {
    let id: String
    let sessionId: String
    let role: QAMessageRole
    let content: String
    let audioUrl: String?
    let durationSeconds: Int?
    let sources: [QASource]?
    let createdAt: String

    enum CodingKeys: String, CodingKey {
        case id
        case sessionId = "sessionId"
        case role, content
        case audioUrl = "audioUrl"
        case durationSeconds = "durationSeconds"
        case sources
        case createdAt = "createdAt"
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decode(String.self, forKey: .id)
        sessionId = try container.decodeIfPresent(String.self, forKey: .sessionId) ?? ""
        role = try container.decode(QAMessageRole.self, forKey: .role)
        content = try container.decode(String.self, forKey: .content)
        audioUrl = try container.decodeIfPresent(String.self, forKey: .audioUrl)
        durationSeconds = try container.decodeIfPresent(Int.self, forKey: .durationSeconds)
        sources = try container.decodeIfPresent([QASource].self, forKey: .sources)
        createdAt = try container.decodeIfPresent(String.self, forKey: .createdAt) ?? ""
    }

    init(
        id: String,
        sessionId: String,
        role: QAMessageRole,
        content: String,
        audioUrl: String?,
        durationSeconds: Int?,
        sources: [QASource]?,
        createdAt: String
    ) {
        self.id = id
        self.sessionId = sessionId
        self.role = role
        self.content = content
        self.audioUrl = audioUrl
        self.durationSeconds = durationSeconds
        self.sources = sources
        self.createdAt = createdAt
    }

    var isUser: Bool {
        role == .user
    }

    var hasAudio: Bool {
        audioUrl != nil
    }

    var formattedDuration: String {
        guard let seconds = durationSeconds else { return "" }
        let minutes = seconds / 60
        let remainingSeconds = seconds % 60
        return String(format: "%d:%02d", minutes, remainingSeconds)
    }
}

// MARK: - Q&A Message Role

enum QAMessageRole: String, Codable {
    case user
    case assistant
    case system
}

// MARK: - Q&A Source

struct QASource: Identifiable, Codable, Hashable {
    let id: String
    let title: String
    let url: String?
    let snippet: String?
    let type: QASourceType

    enum CodingKeys: String, CodingKey {
        case id, title, url, snippet, type
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = try container.decodeIfPresent(String.self, forKey: .id) ?? UUID().uuidString
        title = try container.decode(String.self, forKey: .title)
        url = try container.decodeIfPresent(String.self, forKey: .url)
        snippet = try container.decodeIfPresent(String.self, forKey: .snippet)
        type = try container.decodeIfPresent(QASourceType.self, forKey: .type) ?? .web
    }

    init(id: String = UUID().uuidString, title: String, url: String?, snippet: String?, type: QASourceType) {
        self.id = id
        self.title = title
        self.url = url
        self.snippet = snippet
        self.type = type
    }
}

enum QASourceType: String, Codable {
    case web
    case episode
    case transcript
    case research
}

// MARK: - API Request/Response Types

struct QAAskRequest: Codable {
    let question: String
    let contextType: QAContextType
    let contextId: String
    let sessionId: String?
    let includeAudio: Bool
    let userId: String

    enum CodingKeys: String, CodingKey {
        case question
        case contextType = "contextType"
        case contextId = "contextId"
        case sessionId = "sessionId"
        case includeAudio = "includeAudio"
        case userId = "userId"
    }
}

struct QAAskResponse: Codable {
    let success: Bool
    let data: QAAskData
}

struct QAAskData: Codable {
    let session: QASession
    let answer: QAMessage
    let suggestedQuestions: [String]?
}

struct QASessionHistoryResponse: Codable {
    let success: Bool
    let data: QASessionHistoryData
}

struct QASessionHistoryData: Codable {
    let sessions: [QASession]
    let total: Int
    let hasMore: Bool
}

struct QASessionDetailResponse: Codable {
    let success: Bool
    let data: QASessionDetailData
}

struct QASessionDetailData: Codable {
    let session: QASession
}

// MARK: - Q&A State (for UI)

enum QAState: Equatable {
    case idle
    case asking
    case answering
    case generatingAudio
    case ready(QAMessage)
    case error(String)

    var isLoading: Bool {
        switch self {
        case .asking, .answering, .generatingAudio:
            return true
        default:
            return false
        }
    }

    var statusText: String {
        switch self {
        case .idle:
            return ""
        case .asking:
            return "Processing your question..."
        case .answering:
            return "Generating answer..."
        case .generatingAudio:
            return "Creating audio response..."
        case .ready:
            return ""
        case .error(let message):
            return message
        }
    }
}

// MARK: - Suggested Questions

struct SuggestedQuestion: Identifiable {
    let id = UUID()
    let text: String
    let icon: String

    static func forContext(_ contextType: QAContextType) -> [SuggestedQuestion] {
        switch contextType {
        case .topic:
            return [
                SuggestedQuestion(text: "What's the most important takeaway?", icon: "star"),
                SuggestedQuestion(text: "Can you explain this in simpler terms?", icon: "lightbulb"),
                SuggestedQuestion(text: "What are the implications of this?", icon: "arrow.right.circle"),
                SuggestedQuestion(text: "Are there opposing viewpoints?", icon: "arrow.left.arrow.right")
            ]
        case .deepDive:
            return [
                SuggestedQuestion(text: "What sources did you use for this?", icon: "doc.text"),
                SuggestedQuestion(text: "Can you go deeper on one aspect?", icon: "arrow.down.circle"),
                SuggestedQuestion(text: "How does this compare to alternatives?", icon: "scale.3d"),
                SuggestedQuestion(text: "What are the latest developments?", icon: "clock")
            ]
        case .liveStation:
            return [
                SuggestedQuestion(text: "What's the background on this story?", icon: "book"),
                SuggestedQuestion(text: "How does this affect me?", icon: "person"),
                SuggestedQuestion(text: "What happens next?", icon: "arrow.forward"),
                SuggestedQuestion(text: "Who are the key players involved?", icon: "person.3")
            ]
        case .dailyBrief:
            return [
                SuggestedQuestion(text: "Tell me more about my first meeting", icon: "calendar"),
                SuggestedQuestion(text: "What emails need my attention?", icon: "envelope"),
                SuggestedQuestion(text: "Summarize the most important news", icon: "newspaper"),
                SuggestedQuestion(text: "What should I prioritize today?", icon: "checklist")
            ]
        }
    }
}

// MARK: - Preview Helpers

extension QASession {
    static var preview: QASession {
        QASession(
            id: "qa-session-1",
            userId: "user-1",
            contextType: .topic,
            contextId: "tech-news",
            contextTitle: "Technology News",
            messages: [QAMessage.previewUser, QAMessage.previewAssistant],
            createdAt: "2025-01-20T10:00:00Z",
            updatedAt: "2025-01-20T10:05:00Z"
        )
    }
}

extension QAMessage {
    static var previewUser: QAMessage {
        QAMessage(
            id: "msg-1",
            sessionId: "qa-session-1",
            role: .user,
            content: "What's the most significant AI development mentioned?",
            audioUrl: nil,
            durationSeconds: nil,
            sources: nil,
            createdAt: "2025-01-20T10:00:00Z"
        )
    }

    static var previewAssistant: QAMessage {
        QAMessage(
            id: "msg-2",
            sessionId: "qa-session-1",
            role: .assistant,
            content: "The most significant AI development discussed was the breakthrough in multimodal reasoning, where models can now seamlessly process and reason across text, images, and audio. This represents a major step toward more general artificial intelligence.",
            audioUrl: "https://example.com/audio.mp3",
            durationSeconds: 45,
            sources: [
                QASource(title: "AI Research Paper", url: "https://arxiv.org/paper", snippet: "Recent advances in multimodal AI...", type: .web)
            ],
            createdAt: "2025-01-20T10:00:30Z"
        )
    }
}
