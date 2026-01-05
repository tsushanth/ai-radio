//
//  PreferencesService.swift
//  BriefCast
//
//  Centralized UserDefaults management for app preferences
//

import Foundation
import SwiftUI

// MARK: - App Theme

enum AppTheme: String, CaseIterable, Identifiable {
    case system = "system"
    case dark = "dark"
    case light = "light"

    var id: String { rawValue }

    var displayName: String {
        switch self {
        case .system: return "System"
        case .dark: return "Dark"
        case .light: return "Light"
        }
    }

    var iconName: String {
        switch self {
        case .system: return "circle.lefthalf.filled"
        case .dark: return "moon.fill"
        case .light: return "sun.max.fill"
        }
    }

    var colorScheme: ColorScheme? {
        switch self {
        case .system: return nil
        case .dark: return .dark
        case .light: return .light
        }
    }
}

@MainActor
class PreferencesService: ObservableObject {
    static let shared = PreferencesService()

    // MARK: - UserDefaults Keys

    private enum Keys {
        static let bookmarkedTopicIds = "bookmarkedTopicIds"
        static let hiddenTopicIds = "hiddenTopicIds"
        static let preferredLanguage = "preferredLanguage"
        static let selectedTopics = "selectedTopics"
        static let hasCompletedOnboarding = "hasCompletedOnboarding"
        static let appTheme = "appTheme"
        static let emailEnabled = "emailEnabled"
        static let calendarEnabled = "calendarEnabled"
    }

    private let defaults = UserDefaults.standard

    private init() {}

    // MARK: - Bookmarked Topics

    var bookmarkedTopicIds: Set<String> {
        get {
            let array = defaults.stringArray(forKey: Keys.bookmarkedTopicIds) ?? []
            return Set(array)
        }
        set {
            defaults.set(Array(newValue), forKey: Keys.bookmarkedTopicIds)
            objectWillChange.send()
        }
    }

    func isTopicBookmarked(_ topicId: String) -> Bool {
        bookmarkedTopicIds.contains(topicId)
    }

    func toggleBookmark(for topicId: String) {
        var bookmarks = bookmarkedTopicIds
        if bookmarks.contains(topicId) {
            bookmarks.remove(topicId)
        } else {
            bookmarks.insert(topicId)
        }
        bookmarkedTopicIds = bookmarks
    }

    func addBookmark(for topicId: String) {
        var bookmarks = bookmarkedTopicIds
        bookmarks.insert(topicId)
        bookmarkedTopicIds = bookmarks
    }

    func removeBookmark(for topicId: String) {
        var bookmarks = bookmarkedTopicIds
        bookmarks.remove(topicId)
        bookmarkedTopicIds = bookmarks
    }

    // MARK: - Hidden Topics

    var hiddenTopicIds: Set<String> {
        get {
            let array = defaults.stringArray(forKey: Keys.hiddenTopicIds) ?? []
            return Set(array)
        }
        set {
            defaults.set(Array(newValue), forKey: Keys.hiddenTopicIds)
            objectWillChange.send()
        }
    }

    func isTopicHidden(_ topicId: String) -> Bool {
        hiddenTopicIds.contains(topicId)
    }

    func hideTopic(_ topicId: String) {
        var hidden = hiddenTopicIds
        hidden.insert(topicId)
        hiddenTopicIds = hidden

        // Also remove from bookmarks if hidden
        removeBookmark(for: topicId)
    }

    func unhideTopic(_ topicId: String) {
        var hidden = hiddenTopicIds
        hidden.remove(topicId)
        hiddenTopicIds = hidden
    }

    func unhideAllTopics() {
        hiddenTopicIds = []
    }

    // MARK: - Preferred Language

    var preferredLanguage: String {
        get {
            defaults.string(forKey: Keys.preferredLanguage) ?? "en"
        }
        set {
            defaults.set(newValue, forKey: Keys.preferredLanguage)
            objectWillChange.send()
        }
    }

    /// Convenience computed property for getting the SupportedLanguage enum
    var preferredSupportedLanguage: SupportedLanguage {
        SupportedLanguage(rawValue: preferredLanguage) ?? .en
    }

    // MARK: - Selected Topics (for personalization)

    var selectedTopics: [String] {
        get {
            defaults.stringArray(forKey: Keys.selectedTopics) ?? ["Technology", "AI", "Business", "News"]
        }
        set {
            defaults.set(newValue, forKey: Keys.selectedTopics)
            objectWillChange.send()
        }
    }

    // MARK: - Onboarding

    var hasCompletedOnboarding: Bool {
        get {
            defaults.bool(forKey: Keys.hasCompletedOnboarding)
        }
        set {
            defaults.set(newValue, forKey: Keys.hasCompletedOnboarding)
        }
    }

    // MARK: - App Theme

    var appTheme: AppTheme {
        get {
            let rawValue = defaults.string(forKey: Keys.appTheme) ?? "system"
            return AppTheme(rawValue: rawValue) ?? .system
        }
        set {
            defaults.set(newValue.rawValue, forKey: Keys.appTheme)
            objectWillChange.send()
        }
    }

    // MARK: - Email/Calendar Integration

    var emailEnabled: Bool {
        get {
            // Default to true if not set
            if defaults.object(forKey: Keys.emailEnabled) == nil {
                return true
            }
            return defaults.bool(forKey: Keys.emailEnabled)
        }
        set {
            defaults.set(newValue, forKey: Keys.emailEnabled)
            objectWillChange.send()
        }
    }

    var calendarEnabled: Bool {
        get {
            // Default to true if not set
            if defaults.object(forKey: Keys.calendarEnabled) == nil {
                return true
            }
            return defaults.bool(forKey: Keys.calendarEnabled)
        }
        set {
            defaults.set(newValue, forKey: Keys.calendarEnabled)
            objectWillChange.send()
        }
    }

    // MARK: - Reset

    func resetAllPreferences() {
        bookmarkedTopicIds = []
        hiddenTopicIds = []
        preferredLanguage = "en"
        selectedTopics = ["Technology", "AI", "Business", "News"]
        appTheme = .system
        emailEnabled = true
        calendarEnabled = true
    }
}
