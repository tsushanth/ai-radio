//
//  RadioReminderScheduler.swift
//  BriefCast
//
//  Schedules local notifications for bookmarked topics that are about to play
//  on the radio. Polls the orchestrator's /api/upcoming-plays endpoint, matches
//  predicted plays against the user's bookmarks, and arms a
//  UNCalendarNotificationTrigger per match.
//
//  Why this design (vs. server-side push):
//    The bookmark set is local-only on each device; no server-side bookmark
//    table to broadcast against. Having the device pull the radio schedule
//    and arm its own local notifications matches Android's approach and
//    keeps the system shippable without an external push provider.
//
//  Caveats:
//    - Only covers topics already in the ready queue (~next 30-60 min).
//    - Predicted play times drift; we re-poll on every app foreground.
//    - Dedupes per UTC day so a topic that rotates twice doesn't double-fire.
//

import Foundation
import UserNotifications

@MainActor
final class RadioReminderScheduler {
    static let shared = RadioReminderScheduler()

    private let upcomingPlaysURL =
        URL(string: "http://178.156.192.31:8081/api/upcoming-plays")!
    private let firedKey = "radioRemindersFired"

    private init() {}

    /// Pull predicted queue, match against bookmarks, arm UN notifications
    /// for matches we haven't already armed today. Safe to call on every
    /// foreground — `UNUserNotificationCenter.add` upserts by identifier.
    func refresh() async {
        let prefs = PreferencesService.shared
        let bookmarked = prefs.bookmarkedTopicIds
        guard !bookmarked.isEmpty else { return }

        let lang = prefs.preferredLanguage
        let topics = TopicService.shared.getCachedTopics()?.topics ?? []
        guard !topics.isEmpty else { return }

        // The orchestrator returns the queue's topic_name verbatim. For the
        // hardcoded EN radio topics that's `topic.name`; for podcasts injected
        // by the radio it's the localized title. The topics fetched at
        // `lang=<X>` already carry the localized name in `topic.name`, so
        // matching against that covers both cases.
        var nameToId: [String: String] = [:]
        for topic in topics {
            nameToId[topic.name.trimmingCharacters(in: .whitespaces)] = topic.id
        }

        let upcoming: [UpcomingPlay]
        do {
            upcoming = try await fetchUpcomingPlays(lang: lang)
        } catch {
            print("[RadioReminder] fetch failed: \(error)")
            return
        }
        guard !upcoming.isEmpty else { return }

        let firedToday = firedSetForToday()
        let center = UNUserNotificationCenter.current()
        let granted = await notificationsAuthorized(center)
        guard granted else {
            print("[RadioReminder] notifications not authorized; skipping")
            return
        }

        var scheduled = 0
        for play in upcoming {
            guard let topicId = nameToId[play.topicName.trimmingCharacters(in: .whitespaces)] else {
                continue
            }
            guard bookmarked.contains(topicId) else { continue }
            let dedupeKey = "\(todayKey()):\(topicId)"
            if firedToday.contains(dedupeKey) { continue }

            // Skip past or near-now times (under 30s) — the orchestrator's
            // prediction may have drifted, and a delivered "playing now"
            // notification for something already over reads as noise.
            let lead = play.estimatedPlayTime.timeIntervalSinceNow
            if lead < 30 { continue }

            await schedule(topicId: topicId, topicName: play.topicName,
                           at: play.estimatedPlayTime)
            recordFired(dedupeKey: dedupeKey)
            scheduled += 1
        }

        if scheduled > 0 {
            print("[RadioReminder] scheduled \(scheduled) of \(upcoming.count)")
        }
    }

    /// Cancel any pending radio-topic notification for the given topic.
    /// Called when the user un-bookmarks.
    func cancel(topicId: String) {
        UNUserNotificationCenter.current()
            .removePendingNotificationRequests(withIdentifiers: [identifier(for: topicId)])
    }

    // MARK: - Private

    private func schedule(topicId: String, topicName: String, at fireDate: Date) async {
        let content = UNMutableNotificationContent()
        content.title = "On Audexa Radio now"
        content.body = "\(topicName) is playing live. Tap to tune in."
        content.sound = .default
        content.userInfo = [
            "notification_type": "radio_topic",
            "topic_id": topicId,
        ]

        let components = Calendar.current.dateComponents(
            [.year, .month, .day, .hour, .minute, .second],
            from: fireDate
        )
        let trigger = UNCalendarNotificationTrigger(dateMatching: components, repeats: false)
        let request = UNNotificationRequest(
            identifier: identifier(for: topicId),
            content: content,
            trigger: trigger
        )
        do {
            try await UNUserNotificationCenter.current().add(request)
        } catch {
            print("[RadioReminder] schedule failed for \(topicId): \(error)")
        }
    }

    private func identifier(for topicId: String) -> String {
        "radio_topic_\(topicId)"
    }

    private func notificationsAuthorized(_ center: UNUserNotificationCenter) async -> Bool {
        let settings = await center.notificationSettings()
        return settings.authorizationStatus == .authorized
            || settings.authorizationStatus == .provisional
    }

    private func fetchUpcomingPlays(lang: String) async throws -> [UpcomingPlay] {
        var components = URLComponents(url: upcomingPlaysURL, resolvingAgainstBaseURL: false)!
        components.queryItems = [URLQueryItem(name: "lang", value: lang)]
        var request = URLRequest(url: components.url!)
        request.timeoutInterval = 15
        let (data, response) = try await URLSession.shared.data(for: request)
        guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
            throw URLError(.badServerResponse)
        }
        let decoded = try JSONDecoder().decode(UpcomingPlaysResponse.self, from: data)
        let formatter = ISO8601DateFormatter()
        formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
        let fallback = ISO8601DateFormatter()
        fallback.formatOptions = [.withInternetDateTime]
        return decoded.upcoming.compactMap { entry in
            let parsed = formatter.date(from: entry.estimatedPlayTime)
                ?? fallback.date(from: entry.estimatedPlayTime)
            guard let date = parsed else { return nil }
            return UpcomingPlay(topicName: entry.topicName, estimatedPlayTime: date)
        }
    }

    // MARK: - Dedupe set in UserDefaults

    private func firedSetForToday() -> Set<String> {
        let defaults = UserDefaults.standard
        let stored = defaults.array(forKey: firedKey) as? [String] ?? []
        // Prune entries not from today/yesterday so the set stays bounded.
        let keep = [todayKey(), yesterdayKey()]
        let kept = stored.filter { entry in
            keep.contains { entry.hasPrefix("\($0):") }
        }
        if kept.count != stored.count {
            defaults.set(kept, forKey: firedKey)
        }
        return Set(kept)
    }

    private func recordFired(dedupeKey: String) {
        let defaults = UserDefaults.standard
        var current = defaults.array(forKey: firedKey) as? [String] ?? []
        if !current.contains(dedupeKey) {
            current.append(dedupeKey)
            defaults.set(current, forKey: firedKey)
        }
    }

    private func todayKey() -> String { utcDateKey(.now) }
    private func yesterdayKey() -> String {
        utcDateKey(Calendar.current.date(byAdding: .day, value: -1, to: .now) ?? .now)
    }

    private func utcDateKey(_ date: Date) -> String {
        var cal = Calendar(identifier: .gregorian)
        cal.timeZone = TimeZone(identifier: "UTC")!
        let c = cal.dateComponents([.year, .month, .day], from: date)
        return String(format: "%04d-%02d-%02d",
                      c.year ?? 0, c.month ?? 0, c.day ?? 0)
    }
}

private struct UpcomingPlaysResponse: Decodable {
    let upcoming: [UpcomingPlayDTO]
}

private struct UpcomingPlayDTO: Decodable {
    let topicName: String
    let estimatedPlayTime: String

    enum CodingKeys: String, CodingKey {
        case topicName = "topic_name"
        case estimatedPlayTime = "estimated_play_time"
    }
}

private struct UpcomingPlay {
    let topicName: String
    let estimatedPlayTime: Date
}
