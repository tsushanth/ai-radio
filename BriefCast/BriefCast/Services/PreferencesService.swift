//
//  PreferencesService.swift
//  BriefCast
//
//  Centralized UserDefaults management for app preferences
//

import Foundation
import SwiftUI

// MARK: - Bookmark Paywall Notification

extension Notification.Name {
    static let showBookmarkLimitPaywall = Notification.Name("showBookmarkLimitPaywall")
}

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
        static let isSubscribed = "isSubscribed"
        static let episodesListened = "episodesListened"
        static let lastReviewPromptDate = "lastReviewPromptDate"
        static let radioLanguages = "radioLanguages"
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

    /// Returns `false` if the bookmark was blocked by the free-user limit (5 bookmarks).
    /// Posts `.showBookmarkLimitPaywall` notification when blocked.
    @discardableResult
    func toggleBookmark(for topicId: String) -> Bool {
        var bookmarks = bookmarkedTopicIds
        if bookmarks.contains(topicId) {
            bookmarks.remove(topicId)
            bookmarkedTopicIds = bookmarks
            // Drop any pending radio-topic notification — listener
            // un-bookmarked, no longer wants to be pinged.
            Task { @MainActor in
                RadioReminderScheduler.shared.cancel(topicId: topicId)
            }
            return true
        } else {
            // Enforce 5-bookmark limit for free users
            if !SubscriptionManager.shared.isSubscribed && bookmarks.count >= 5 {
                NotificationCenter.default.post(name: .showBookmarkLimitPaywall, object: nil)
                return false
            }
            bookmarks.insert(topicId)
            bookmarkedTopicIds = bookmarks
            // Newly-bookmarked topic might already be queued up; re-poll so
            // its predicted play time gets armed within seconds, not on next
            // app foreground.
            Task { @MainActor in
                await RadioReminderScheduler.shared.refresh()
            }
            return true
        }
    }

    /// Returns `false` if the bookmark was blocked by the free-user limit (5 bookmarks).
    /// Posts `.showBookmarkLimitPaywall` notification when blocked.
    @discardableResult
    func addBookmark(for topicId: String) -> Bool {
        var bookmarks = bookmarkedTopicIds
        // Enforce 5-bookmark limit for free users
        if !bookmarks.contains(topicId) && !SubscriptionManager.shared.isSubscribed && bookmarks.count >= 5 {
            NotificationCenter.default.post(name: .showBookmarkLimitPaywall, object: nil)
            return false
        }
        bookmarks.insert(topicId)
        bookmarkedTopicIds = bookmarks
        return true
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

    // MARK: - Subscription (cached for offline/instant access)

    var isSubscribed: Bool {
        get { defaults.bool(forKey: Keys.isSubscribed) }
        set {
            defaults.set(newValue, forKey: Keys.isSubscribed)
            objectWillChange.send()
        }
    }

    // MARK: - Review Prompt

    var episodesListened: Int {
        get { defaults.integer(forKey: Keys.episodesListened) }
        set { defaults.set(newValue, forKey: Keys.episodesListened) }
    }

    var lastReviewPromptDate: Date? {
        get { defaults.object(forKey: Keys.lastReviewPromptDate) as? Date }
        set { defaults.set(newValue, forKey: Keys.lastReviewPromptDate) }
    }

    func incrementEpisodesListened() {
        episodesListened += 1
    }

    /// Whether we should prompt for a review (after 3 episodes, max once per 60 days)
    var shouldPromptForReview: Bool {
        guard episodesListened >= 3 else { return false }
        if let lastPrompt = lastReviewPromptDate {
            return Date().timeIntervalSince(lastPrompt) > 60 * 24 * 60 * 60
        }
        return true
    }

    func recordReviewPrompt() {
        lastReviewPromptDate = Date()
    }

    // MARK: - Radio Languages

    /// Languages the user wants to see radio stations for.
    /// Defaults to English + the user's preferred podcast language.
    var radioLanguages: [String] {
        get {
            if let stored = defaults.stringArray(forKey: Keys.radioLanguages) {
                return stored
            }
            // Default: English + preferred language (deduplicated)
            var langs = ["en"]
            let pref = preferredLanguage
            if pref != "en" { langs.append(pref) }
            return langs
        }
        set {
            defaults.set(newValue, forKey: Keys.radioLanguages)
            objectWillChange.send()
        }
    }

    /// Resolved SupportedLanguage objects for selected radio languages,
    /// filtered to only those available for radio.
    var radioSupportedLanguages: [SupportedLanguage] {
        let available = Set(SupportedLanguage.radioAvailable.map { $0.rawValue })
        return radioLanguages
            .filter { available.contains($0) }
            .compactMap { SupportedLanguage(rawValue: $0) }
    }

    func toggleRadioLanguage(_ code: String) {
        var langs = radioLanguages
        if langs.contains(code) {
            // Don't allow removing the last language
            guard langs.count > 1 else { return }
            langs.removeAll { $0 == code }
        } else {
            langs.append(code)
        }
        radioLanguages = langs
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
