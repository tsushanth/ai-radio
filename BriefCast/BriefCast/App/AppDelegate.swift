//
//  AppDelegate.swift
//  BriefCast
//
//  Handles push notification registration and callbacks
//

import UIKit
import UserNotifications
import RevenueCat

class AppDelegate: NSObject, UIApplicationDelegate, UNUserNotificationCenterDelegate {

    func application(
        _ application: UIApplication,
        didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]? = nil
    ) -> Bool {
        // Set notification delegate
        UNUserNotificationCenter.current().delegate = self

        // Configure RevenueCat
        Purchases.logLevel = .debug
        Purchases.configure(withAPIKey: RevenueCatConfig.apiKey)

        // Check permission status and restore scheduled notification if needed
        Task {
            await PushNotificationService.shared.checkPermissionStatus()
            await PushNotificationService.shared.restoreScheduledNotificationIfNeeded()
        }

        return true
    }

    // MARK: - Remote Notification Registration

    func application(
        _ application: UIApplication,
        didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data
    ) {
        Task { @MainActor in
            PushNotificationService.shared.didRegisterForRemoteNotifications(deviceToken: deviceToken)
        }
    }

    func application(
        _ application: UIApplication,
        didFailToRegisterForRemoteNotificationsWithError error: Error
    ) {
        Task { @MainActor in
            PushNotificationService.shared.didFailToRegisterForRemoteNotifications(error: error)
        }
    }

    // MARK: - UNUserNotificationCenterDelegate

    // Handle notification received while app is in foreground
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        willPresent notification: UNNotification,
        withCompletionHandler completionHandler: @escaping (UNNotificationPresentationOptions) -> Void
    ) {
        Task { @MainActor in
            PushNotificationService.shared.handleForegroundNotification(
                notification,
                completionHandler: completionHandler
            )
        }
    }

    // Handle notification tap (user opened the notification)
    func userNotificationCenter(
        _ center: UNUserNotificationCenter,
        didReceive response: UNNotificationResponse,
        withCompletionHandler completionHandler: @escaping () -> Void
    ) {
        Task { @MainActor in
            PushNotificationService.shared.handleNotificationTap(response)
        }
        completionHandler()
    }
}

// MARK: - RevenueCat Configuration

enum RevenueCatConfig {
    // TODO: Replace with your RevenueCat public API key from the RevenueCat dashboard
    // Dashboard: https://app.revenuecat.com → Project → API Keys → Public API Key (iOS)
    static let apiKey = "appl_YOUR_REVENUECAT_API_KEY"

    // Entitlement identifier configured in RevenueCat
    static let premiumEntitlementId = "premium"
}
