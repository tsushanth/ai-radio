//
//  PreferencesService.swift
//  BriefCast
//
//  Centralized UserDefaults management for app preferences
//

import Foundation

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

    // MARK: - Reset

    func resetAllPreferences() {
        bookmarkedTopicIds = []
        hiddenTopicIds = []
        preferredLanguage = "en"
        selectedTopics = ["Technology", "AI", "Business", "News"]
    }
}
