//
//  Language.swift
//  BriefCast
//
//  Supported languages for podcast generation
//

import Foundation

enum SupportedLanguage: String, Codable, CaseIterable, Identifiable {
    case en = "en"
    case es = "es"
    case fr = "fr"
    case de = "de"
    case pt = "pt"
    case ja = "ja"
    case zh = "zh"
    case hi = "hi"
    case ko = "ko"
    case it = "it"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .en: return "English"
        case .es: return "Spanish"
        case .fr: return "French"
        case .de: return "German"
        case .pt: return "Portuguese"
        case .ja: return "Japanese"
        case .zh: return "Chinese"
        case .hi: return "Hindi"
        case .ko: return "Korean"
        case .it: return "Italian"
        }
    }

    var nativeName: String {
        switch self {
        case .en: return "English"
        case .es: return "Español"
        case .fr: return "Français"
        case .de: return "Deutsch"
        case .pt: return "Português"
        case .ja: return "日本語"
        case .zh: return "中文"
        case .hi: return "हिन्दी"
        case .ko: return "한국어"
        case .it: return "Italiano"
        }
    }

    var flagEmoji: String {
        switch self {
        case .en: return "🇺🇸"
        case .es: return "🇪🇸"
        case .fr: return "🇫🇷"
        case .de: return "🇩🇪"
        case .pt: return "🇧🇷"
        case .ja: return "🇯🇵"
        case .zh: return "🇨🇳"
        case .hi: return "🇮🇳"
        case .ko: return "🇰🇷"
        case .it: return "🇮🇹"
        }
    }

    /// Display string with flag and name
    var displayWithFlag: String {
        "\(flagEmoji) \(displayName)"
    }

    /// Station name for Audexa Radio in this language
    var radioStationName: String {
        switch self {
        case .en: return "Audexa Radio"
        case .es: return "Audexa Radio Español"
        case .hi: return "Audexa Radio हिन्दी"
        case .pt: return "Audexa Radio Português"
        case .fr: return "Audexa Radio Français"
        case .de: return "Audexa Radio Deutsch"
        case .ja: return "Audexa Radio 日本語"
        case .zh: return "Audexa Radio 中文"
        case .ko: return "Audexa Radio 한국어"
        case .it: return "Audexa Radio Italiano"
        }
    }

    /// Base URL for Icecast radio streams — fetched from backend, falls back to hardcoded
    static var radioBaseURL: String {
        RadioConfig.shared.baseURL
    }

    /// Stream URL path for this language's radio station
    var radioStreamURL: String {
        switch self {
        case .en: return "\(Self.radioBaseURL)/stream"
        default: return "\(Self.radioBaseURL)/stream-\(rawValue)"
        }
    }

    /// Languages available for radio streaming
    static var radioAvailable: [SupportedLanguage] {
        [.en, .es, .hi, .pt, .fr, .de, .ja, .ko, .zh, .it]
    }

    /// Initialize from string, defaulting to English
    init(from code: String) {
        self = SupportedLanguage(rawValue: code) ?? .en
    }
}
