//
//  PushNotificationService.swift
//  BriefCast
//
//  Handles push notification registration and handling
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

    private let apiClient = APIClient.shared
    private let tokenKey = "apns_device_token"

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

    /// Register device token with backend
    private func registerTokenWithBackend(_ token: String) async {
        guard let userId = AuthService.shared.currentUserId else {
            print("⚠️ No user ID, skipping token registration")
            return
        }

        do {
            let _: EmptyResponse = try await apiClient.post(
                endpoint: "/notifications/register",
                body: [
                    "user_id": userId,
                    "device_token": token,
                    "platform": "ios"
                ]
            )
            print("✅ Device token registered with backend")
        } catch {
            print("⚠️ Failed to register token with backend: \(error.localizedDescription)")
        }
    }

    /// Unregister device from push notifications
    func unregisterDevice() async {
        guard let token = deviceToken,
              let userId = AuthService.shared.currentUserId else {
            return
        }

        do {
            let _: EmptyResponse = try await apiClient.delete(
                endpoint: "/notifications/unregister",
                body: [
                    "user_id": userId,
                    "device_token": token
                ]
            )
            print("✅ Device unregistered from push notifications")
        } catch {
            print("⚠️ Failed to unregister device: \(error.localizedDescription)")
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
            // Navigate to player
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

    // MARK: - Settings

    /// Update notification settings on backend
    func updateSettings(
        briefingTime: String,
        timezone: String,
        enabled: Bool
    ) async {
        guard let userId = AuthService.shared.currentUserId else { return }

        do {
            let _: EmptyResponse = try await apiClient.post(
                endpoint: "/notifications/settings",
                body: [
                    "user_id": userId,
                    "briefing_time": briefingTime,
                    "timezone": timezone,
                    "notifications_enabled": enabled
                ]
            )
            print("✅ Notification settings updated")
        } catch {
            print("⚠️ Failed to update notification settings: \(error.localizedDescription)")
        }
    }

    /// Fetch current notification settings from backend
    func fetchSettings() async -> NotificationSettings? {
        guard let userId = AuthService.shared.currentUserId else { return nil }

        do {
            let response: NotificationSettingsResponse = try await apiClient.get(
                endpoint: "/notifications/settings/\(userId)"
            )
            return response.data
        } catch {
            print("⚠️ Failed to fetch notification settings: \(error.localizedDescription)")
            return nil
        }
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

struct EmptyResponse: Codable {
    let success: Bool
    let message: String?
}

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

struct NotificationSettingsResponse: Codable {
    let success: Bool
    let data: NotificationSettings?
}

// MARK: - Notification Names

extension Notification.Name {
    static let openDailyBriefPlayer = Notification.Name("openDailyBriefPlayer")
    static let showDailyBriefRetry = Notification.Name("showDailyBriefRetry")
    static let openContent = Notification.Name("openContent")
}
