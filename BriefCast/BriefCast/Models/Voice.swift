//
//  Voice.swift
//  BriefCast
//
//  Voice models for TTS provider selection
//

import Foundation

/// TTS Provider options
enum TTSProvider: String, Codable, CaseIterable {
    case openai = "openai"
    case elevenlabs = "elevenlabs"

    var displayName: String {
        switch self {
        case .openai: return "OpenAI"
        case .elevenlabs: return "ElevenLabs"
        }
    }

    var description: String {
        switch self {
        case .openai: return "Fast, high-quality neural voices"
        case .elevenlabs: return "Ultra-realistic with voice cloning"
        }
    }

    var icon: String {
        switch self {
        case .openai: return "waveform"
        case .elevenlabs: return "waveform.circle.fill"
        }
    }
}

/// Unified voice representation from API
struct Voice: Codable, Identifiable, Hashable {
    let id: String
    let name: String
    let provider: String
    let gender: String
    let accent: String?
    let description: String?
    let previewUrl: String?
    let category: String?

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case provider
        case gender
        case accent
        case description
        case previewUrl = "preview_url"
        case category
    }

    var displayGender: String {
        gender.capitalized
    }

    var providerType: TTSProvider? {
        TTSProvider(rawValue: provider)
    }

    var genderIcon: String {
        switch gender.lowercased() {
        case "male": return "person.fill"
        case "female": return "person.fill"
        default: return "person.fill.questionmark"
        }
    }
}

/// Voice pair recommendation for two-host podcasts
struct VoicePair: Codable, Identifiable {
    let id: String
    let name: String
    let provider: String
    let host1: Voice
    let host2: Voice
    let description: String

    var providerType: TTSProvider? {
        TTSProvider(rawValue: provider)
    }
}

/// API response for voices endpoint
struct VoicesResponse: Codable {
    let success: Bool
    let total: Int
    let voices: [Voice]
    let grouped: [String: [Voice]]?
}

/// API response for voice pairs endpoint
struct VoicePairsResponse: Codable {
    let success: Bool
    let pairs: [VoicePair]
}

/// API response for providers endpoint
struct ProvidersResponse: Codable {
    let success: Bool
    let providers: [ProviderInfo]
}

struct ProviderInfo: Codable, Identifiable {
    let id: String
    let name: String
    let description: String
    let available: Bool
    let configured: Bool
    let voiceCount: Int
    let features: [String]

    enum CodingKeys: String, CodingKey {
        case id
        case name
        case description
        case available
        case configured
        case voiceCount = "voice_count"
        case features
    }
}

/// Current voice configuration
struct VoiceConfiguration: Codable {
    var provider: TTSProvider
    var host1VoiceId: String
    var host2VoiceId: String

    static let `default` = VoiceConfiguration(
        provider: .openai,
        host1VoiceId: "openai:nova",
        host2VoiceId: "openai:onyx"
    )
}
