//
//  PushNotificationService.swift
//  BriefCast
//
//  Handles push notification registration, local notification scheduling,
//  and remote notification handling
//

import Foundation
import UserNotifications
import UIKit

@MainActor
class PushNotificationService: NSObject, ObservableObject {
    static let shared = PushNotificationService()

    @Published var isRegistered = false
    @Published var permissionStatus: UNAuthorizationStatus = .notDetermined
    @Published var deviceToken: String?

    private let tokenKey = "apns_device_token"
    private let dailyNotificationIdentifier = "daily_brief_reminder"

    // UserDefaults keys for notification settings
    private let notificationsEnabledKey = "dailyBriefNotificationsEnabled"
    private let briefingTimeKey = "dailyBriefingTime"
    private let briefingTimezoneKey = "dailyBriefingTimezone"

    private override init() {
        super.init()
        loadCachedToken()
    }

    // MARK: - Permission & Registration

    /// Request notification permission and register for remote notifications
    func requestPermissionAndRegister() async {
        do {
            let center = UNUserNotificationCenter.current()

            // Request permission
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])

            if granted {
                // Register for remote notifications on main thread
                await MainActor.run {
                    UIApplication.shared.registerForRemoteNotifications()
                }
                print("✅ Push notification permission granted")
            } else {
                print("⚠️ Push notification permission denied")
            }

            // Update status
            await checkPermissionStatus()

        } catch {
            print("❌ Push notification permission error: \(error.localizedDescription)")
        }
    }

    /// Check current permission status
    func checkPermissionStatus() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        permissionStatus = settings.authorizationStatus
    }

    // MARK: - Device Token Management

    /// Called when APNs registration succeeds
    func didRegisterForRemoteNotifications(deviceToken: Data) {
        let token = deviceToken.map { String(format: "%02.2hhx", $0) }.joined()
        self.deviceToken = token
        self.isRegistered = true

        // Cache token locally
        UserDefaults.standard.set(token, forKey: tokenKey)

        print("✅ Device token: \(token)")

        // Register with backend
        Task {
            await registerTokenWithBackend(token)
        }
    }

    /// Called when APNs registration fails
    func didFailToRegisterForRemoteNotifications(error: Error) {
        print("❌ Failed to register for push notifications: \(error.localizedDescription)")
        isRegistered = false
    }

    /// Register device token with backend for push notifications
    private func registerTokenWithBackend(_ token: String) async {
        let userId = UserDefaults.standard.string(forKey: "linkedAccountEmail")
        guard let userId = userId, !userId.isEmpty else {
            print("⚠️ No user ID, skipping token registration")
            return
        }

        guard let url = URL(string: "https://ai-radio-backend-917362189743.us-central1.run.app/api/notifications/register") else {
            print("❌ Invalid backend URL for token registration")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "user_id": userId,
            "device_token": token,
            "platform": "ios"
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    print("✅ Device token registered with backend for user: \(userId)")
                } else {
                    print("⚠️ Backend returned status \(httpResponse.statusCode) for token registration")
                }
            }
        } catch {
            print("❌ Failed to register token with backend: \(error.localizedDescription)")
        }
    }

    /// Unregister device from push notifications
    func unregisterDevice() async {
        let userId = UserDefaults.standard.string(forKey: "linkedAccountEmail")
        guard let token = deviceToken, let userId = userId else {
            return
        }

        // Unregister from backend
        if let url = URL(string: "https://ai-radio-backend-917362189743.us-central1.run.app/api/notifications/unregister") {
            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let body: [String: Any] = [
                "user_id": userId,
                "device_token": token
            ]

            do {
                request.httpBody = try JSONSerialization.data(withJSONObject: body)
                let (_, response) = try await URLSession.shared.data(for: request)

                if let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 {
                    print("✅ Device token unregistered from backend")
                }
            } catch {
                print("❌ Failed to unregister token from backend: \(error.localizedDescription)")
            }
        }

        deviceToken = nil
        isRegistered = false
        UserDefaults.standard.removeObject(forKey: tokenKey)
    }

    // MARK: - Notification Handling

    /// Handle received notification when app is in foreground
    func handleForegroundNotification(
        _ notification: UNNotification,
        completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        let userInfo = notification.request.content.userInfo

        print("📬 Received foreground notification: \(userInfo)")

        // Show banner and play sound even in foreground
        completionHandler([.banner, .sound, .badge])
    }

    /// Handle notification tap (user opened notification)
    func handleNotificationTap(_ response: UNNotificationResponse) {
        let userInfo = response.notification.request.content.userInfo

        print("👆 Notification tapped: \(userInfo)")

        // Parse notification type
        if let type = userInfo["type"] as? String {
            handleNotificationType(type, userInfo: userInfo)
        }
    }

    /// Handle different notification types
    private func handleNotificationType(_ type: String, userInfo: [AnyHashable: Any]) {
        switch type {
        case "daily_brief_ready":
            // Navigate to player (from push notification when brief is generated)
            NotificationCenter.default.post(
                name: .openDailyBriefPlayer,
                object: nil,
                userInfo: userInfo
            )

        case "daily_brief_reminder":
            // Navigate to home to generate/play daily brief (from local scheduled notification)
            NotificationCenter.default.post(
                name: .openDailyBriefPlayer,
                object: nil,
                userInfo: userInfo
            )

        case "daily_brief_failed":
            // Navigate to home with retry option
            NotificationCenter.default.post(
                name: .showDailyBriefRetry,
                object: nil,
                userInfo: userInfo
            )

        case "new_content":
            // Navigate to specific content
            if let contentId = userInfo["content_id"] as? String {
                NotificationCenter.default.post(
                    name: .openContent,
                    object: nil,
                    userInfo: ["content_id": contentId]
                )
            }

        default:
            print("Unknown notification type: \(type)")
        }
    }

    // MARK: - Local Daily Notification Scheduling

    /// Schedule a daily local notification for the briefing reminder
    func scheduleDailyNotification(at time: Date, timezone: TimeZone = .current) async {
        let center = UNUserNotificationCenter.current()

        // Cancel any existing daily notification
        center.removePendingNotificationRequests(withIdentifiers: [dailyNotificationIdentifier])

        // Create notification content
        let content = UNMutableNotificationContent()
        content.title = "Good Morning!"
        content.body = "Time for your Daily Brief. Tap to get caught up on emails, calendar, and news."
        content.sound = .default
        content.badge = 1
        content.userInfo = ["type": "daily_brief_reminder"]

        // Create date components for the trigger
        var calendar = Calendar.current
        calendar.timeZone = timezone

        var dateComponents = calendar.dateComponents([.hour, .minute], from: time)
        dateComponents.second = 0

        // Create a repeating daily trigger
        let trigger = UNCalendarNotificationTrigger(dateMatching: dateComponents, repeats: true)

        // Create the request
        let request = UNNotificationRequest(
            identifier: dailyNotificationIdentifier,
            content: content,
            trigger: trigger
        )

        do {
            try await center.add(request)
            let timeString = String(format: "%02d:%02d", dateComponents.hour ?? 0, dateComponents.minute ?? 0)
            print("✅ Daily notification scheduled for \(timeString) in \(timezone.identifier)")

            // Save settings locally
            saveLocalNotificationSettings(enabled: true, time: time, timezone: timezone)
        } catch {
            print("❌ Failed to schedule daily notification: \(error.localizedDescription)")
        }
    }

    /// Cancel the daily notification
    func cancelDailyNotification() {
        let center = UNUserNotificationCenter.current()
        center.removePendingNotificationRequests(withIdentifiers: [dailyNotificationIdentifier])
        print("🔕 Daily notification cancelled")

        // Update local settings
        UserDefaults.standard.set(false, forKey: notificationsEnabledKey)
    }

    /// Check if daily notification is currently scheduled
    func isDailyNotificationScheduled() async -> Bool {
        let center = UNUserNotificationCenter.current()
        let requests = await center.pendingNotificationRequests()
        return requests.contains { $0.identifier == dailyNotificationIdentifier }
    }

    /// Restore scheduled notification on app launch if it was enabled but missing
    /// This handles cases where the notification was removed (e.g., after app update)
    func restoreScheduledNotificationIfNeeded() async {
        let settings = loadLocalNotificationSettings()

        // Only restore if notifications were enabled
        guard settings.enabled else { return }

        // Check if notification is already scheduled
        let isScheduled = await isDailyNotificationScheduled()
        if isScheduled {
            print("✅ Daily notification already scheduled")
            return
        }

        // Check if we have permission
        await checkPermissionStatus()
        guard permissionStatus == .authorized else {
            print("⚠️ Notification permission not granted, cannot restore notification")
            return
        }

        // Re-schedule the notification
        print("🔄 Restoring daily notification...")
        await scheduleDailyNotification(at: settings.time, timezone: settings.timezone)
    }

    /// Save notification settings locally
    private func saveLocalNotificationSettings(enabled: Bool, time: Date, timezone: TimeZone) {
        UserDefaults.standard.set(enabled, forKey: notificationsEnabledKey)
        UserDefaults.standard.set(time.timeIntervalSince1970, forKey: briefingTimeKey)
        UserDefaults.standard.set(timezone.identifier, forKey: briefingTimezoneKey)
    }

    /// Load saved notification settings
    func loadLocalNotificationSettings() -> (enabled: Bool, time: Date, timezone: TimeZone) {
        let enabled = UserDefaults.standard.bool(forKey: notificationsEnabledKey)
        let timeInterval = UserDefaults.standard.double(forKey: briefingTimeKey)
        let timezoneId = UserDefaults.standard.string(forKey: briefingTimezoneKey) ?? TimeZone.current.identifier

        let time: Date
        if timeInterval > 0 {
            time = Date(timeIntervalSince1970: timeInterval)
        } else {
            // Default to 7:00 AM
            time = Calendar.current.date(from: DateComponents(hour: 7, minute: 0)) ?? Date()
        }

        let timezone = TimeZone(identifier: timezoneId) ?? .current

        return (enabled, time, timezone)
    }

    // MARK: - Settings Sync

    /// Update notification settings (local + backend)
    func updateSettings(
        briefingTime: String,
        timezone: String,
        enabled: Bool
    ) async {
        // Parse time string (HH:mm format)
        let components = briefingTime.split(separator: ":")
        if components.count == 2,
           let hour = Int(components[0]),
           let minute = Int(components[1]) {
            let time = Calendar.current.date(from: DateComponents(hour: hour, minute: minute)) ?? Date()
            let tz = TimeZone(identifier: timezone) ?? .current

            if enabled {
                await scheduleDailyNotification(at: time, timezone: tz)
            } else {
                cancelDailyNotification()
            }
        }

        // Sync with backend so it generates the brief at the scheduled time
        let userId = UserDefaults.standard.string(forKey: "linkedAccountEmail")
        guard let userId = userId, !userId.isEmpty else {
            print("⚠️ No user ID, skipping backend notification settings sync")
            return
        }

        await syncSettingsWithBackend(
            userId: userId,
            briefingTime: briefingTime,
            timezone: timezone,
            enabled: enabled
        )
    }

    /// Sync notification settings with backend
    /// The backend scheduler will generate the daily brief at the specified time
    private func syncSettingsWithBackend(
        userId: String,
        briefingTime: String,
        timezone: String,
        enabled: Bool
    ) async {
        guard let url = URL(string: "https://ai-radio-backend-917362189743.us-central1.run.app/api/notifications/settings") else {
            print("❌ Invalid backend URL for notification settings")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        var body: [String: Any] = [
            "user_id": userId,
            "briefing_time": briefingTime,
            "timezone": timezone,
            "notifications_enabled": enabled
        ]

        // Include device token if available for push notifications
        if let token = deviceToken {
            body["device_token"] = token
            body["platform"] = "ios"
        }

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    print("✅ Notification settings synced with backend: \(briefingTime) \(timezone)")
                } else {
                    print("⚠️ Backend returned status \(httpResponse.statusCode) for notification settings")
                }
            }
        } catch {
            print("❌ Failed to sync notification settings with backend: \(error.localizedDescription)")
        }
    }

    /// Fetch current notification settings (local fallback if backend unavailable)
    func fetchSettings() async -> NotificationSettings? {
        let userId = UserDefaults.standard.string(forKey: "linkedAccountEmail")
        guard let userId = userId, !userId.isEmpty else { return nil }

        // TODO: Implement server-side settings fetch
        // For now, return local settings
        let local = loadLocalNotificationSettings()

        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        let timeString = formatter.string(from: local.time)

        return NotificationSettings(
            briefingTime: timeString,
            timezone: local.timezone.identifier,
            notificationsEnabled: local.enabled,
            deviceTokens: deviceToken != nil ? [deviceToken!] : []
        )
    }

    // MARK: - Cache

    private func loadCachedToken() {
        if let token = UserDefaults.standard.string(forKey: tokenKey) {
            deviceToken = token
            isRegistered = true
        }
    }
}

// MARK: - Response Types

struct NotificationSettings: Codable {
    let briefingTime: String
    let timezone: String
    let notificationsEnabled: Bool
    let deviceTokens: [String]

    enum CodingKeys: String, CodingKey {
        case briefingTime = "briefing_time"
        case timezone
        case notificationsEnabled = "notifications_enabled"
        case deviceTokens = "device_tokens"
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let openDailyBriefPlayer = Notification.Name("openDailyBriefPlayer")
    static let showDailyBriefRetry = Notification.Name("showDailyBriefRetry")
    static let openContent = Notification.Name("openContent")
}
