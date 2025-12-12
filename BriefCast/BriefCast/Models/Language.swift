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

    /// Initialize from string, defaulting to English
    init(from code: String) {
        self = SupportedLanguage(rawValue: code) ?? .en
    }
}
