//
//  PremiumFeature.swift
//  BriefCast
//
//  Premium feature definitions for paywall gating
//

import SwiftUI

enum PremiumFeature: String, CaseIterable, Identifiable {
    case unlimitedTopics
    case deepDive
    case liveStations
    case customSources
    case playbackSpeeds
    case allLanguages
    case premiumVoices
    case unlimitedRegenerations

    var id: String { rawValue }

    var paywallTitle: String {
        switch self {
        case .unlimitedTopics: return "Unlock Unlimited Topics"
        case .deepDive: return "Unlock Deep Dive"
        case .liveStations: return "Unlock Live Stations"
        case .customSources: return "Unlock Custom Sources"
        case .playbackSpeeds: return "Unlock Playback Speeds"
        case .allLanguages: return "Unlock All Languages"
        case .premiumVoices: return "Unlock Premium Voices"
        case .unlimitedRegenerations: return "Unlock Unlimited Regenerations"
        }
    }

    var paywallSubtitle: String {
        switch self {
        case .unlimitedTopics: return "Bookmark more than 5 topics and explore all categories"
        case .deepDive: return "Research any topic in-depth with AI-generated podcasts"
        case .liveStations: return "Listen to continuously updating live news streams"
        case .customSources: return "Add RSS feeds, newsletters, YouTube channels, and more"
        case .playbackSpeeds: return "Listen at 0.5x to 2.0x speed"
        case .allLanguages: return "Generate podcasts in 14+ languages"
        case .premiumVoices: return "Ultra-realistic ElevenLabs voices"
        case .unlimitedRegenerations: return "Regenerate your Daily Brief without limits"
        }
    }

    var icon: String {
        switch self {
        case .unlimitedTopics: return "infinity"
        case .deepDive: return "magnifyingglass.circle.fill"
        case .liveStations: return "antenna.radiowaves.left.and.right"
        case .customSources: return "plus.rectangle.on.folder"
        case .playbackSpeeds: return "gauge.with.dots.needle.67percent"
        case .allLanguages: return "globe"
        case .premiumVoices: return "waveform.circle.fill"
        case .unlimitedRegenerations: return "arrow.clockwise"
        }
    }
}
