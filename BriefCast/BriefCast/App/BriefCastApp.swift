//
//  BriefCastApp.swift
//  BriefCast (AIRadio)
//
//  Created by Sushanth Tiruvaipati on 12/9/25.
//

import SwiftUI
import GoogleSignIn
import PaywallKit

@main
struct BriefCastApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authService = AuthService()
    @StateObject private var preferencesService = PreferencesService.shared
    @State private var subscriptionManager = SubscriptionManager.shared
    @State private var showSplash = true
    @State private var showAppOpenPaywall = false

    init() {
        // FASTLANE_SNAPSHOT: skip onboarding and paywall for screenshots
        if ProcessInfo.processInfo.arguments.contains("-FASTLANE_SNAPSHOT") {
            UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")
            UserDefaults.standard.set(999, forKey: "com.audexa.appOpenCount") // prevent paywall trigger
        }
        ReviewManager.shared.recordAppLaunch()
    }
    @State private var showDailyBriefPlayer = false
    @State private var pendingEpisodeId: String?

    var body: some Scene {
        WindowGroup {
            ZStack {
                ContentView()
                    .environmentObject(authService)
                    .onOpenURL { url in
                        // Handle Google OAuth callback when linking account from Settings
                        GIDSignIn.sharedInstance.handle(url)
                    }
                    .task {
                        await authService.restoreSession()
                        // Sync subscription state from StoreManager
                        await subscriptionManager.refreshFromStore()
                    }
                    .onReceive(NotificationCenter.default.publisher(for: .openDailyBriefPlayer)) { notification in
                        // Handle push notification to open daily brief player
                        if let episodeId = notification.userInfo?["episode_id"] as? String {
                            pendingEpisodeId = episodeId
                        }
                        showDailyBriefPlayer = true
                    }
                    .onReceive(NotificationCenter.default.publisher(for: .showDailyBriefRetry)) { _ in
                        // Navigate to home for retry - HomeView will handle this
                        NotificationCenter.default.post(name: .navigateToHome, object: nil)
                    }

                // Splash screen overlay
                if showSplash {
                    SplashScreenView()
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
            .reviewPrompt()
            .preferredColorScheme(preferencesService.appTheme.colorScheme)
            .onAppear {
                // Dismiss splash screen after a delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
                    withAnimation(.easeOut(duration: 0.4)) {
                        showSplash = false
                    }
                    // Trigger app-open paywall after splash dismisses
                    triggerAppOpenPaywall()
                }
            }
            .fullScreenCover(isPresented: $showAppOpenPaywall) {
                RemotePaywallView(triggerSource: "app_open")
            }
        }
    }

    // MARK: - App-Open Paywall Trigger

    /// Shows paywall on 1st, 3rd, 5th open, then every 3rd open after that
    private func triggerAppOpenPaywall() {
        // Don't show if already subscribed
        guard !subscriptionManager.isSubscribed else { return }

        let key = "com.audexa.appOpenCount"
        let count = UserDefaults.standard.integer(forKey: key) + 1
        UserDefaults.standard.set(count, forKey: key)

        let shouldShow: Bool
        switch count {
        case 1, 3, 5:
            shouldShow = true
        default:
            // Every 3rd open after 5th (8, 11, 14, ...)
            shouldShow = count > 5 && (count - 5) % 3 == 0
        }

        if shouldShow {
            // Small delay so UI is ready
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                showAppOpenPaywall = true
            }
        }
    }
}

// Additional notification names for navigation
extension Notification.Name {
    static let navigateToHome = Notification.Name("navigateToHome")
}
