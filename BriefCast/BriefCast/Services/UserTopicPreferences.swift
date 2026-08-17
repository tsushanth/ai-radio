//
//  UserTopicPreferences.swift
//  BriefCast
//
//  User-selected topic IDs for the on-device daily briefing.
//  Persisted locally (UserDefaults) for now; server sync is a Phase 2
//  follow-up that will replace the storage layer behind this API without
//  changing call sites.
//

import Foundation

@MainActor
@Observable
final class UserTopicPreferences {

    static let shared = UserTopicPreferences()

    private static let storageKey = "audexa.dailyBrief.selectedTopicIds.v1"

    /// Ordered list of selected topic IDs. Ordering reflects user pick order
    /// so the briefing reads in the order the user added topics.
    private(set) var selectedTopicIds: [String]

    private init() {
        let saved = UserDefaults.standard.array(forKey: Self.storageKey) as? [String]
        selectedTopicIds = saved ?? []
    }

    var count: Int { selectedTopicIds.count }
    var isEmpty: Bool { selectedTopicIds.isEmpty }

    func isSelected(_ topicId: String) -> Bool {
        selectedTopicIds.contains(topicId)
    }

    func toggle(_ topicId: String) {
        if let idx = selectedTopicIds.firstIndex(of: topicId) {
            selectedTopicIds.remove(at: idx)
        } else {
            selectedTopicIds.append(topicId)
        }
        persist()
    }

    func setSelection(_ ids: [String]) {
        // Deduplicate while preserving order.
        var seen = Set<String>()
        selectedTopicIds = ids.filter { seen.insert($0).inserted }
        persist()
    }

    private func persist() {
        UserDefaults.standard.set(selectedTopicIds, forKey: Self.storageKey)
    }
}
