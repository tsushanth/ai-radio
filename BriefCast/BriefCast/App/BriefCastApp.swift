//
//  BriefCastApp.swift
//  BriefCast (AIRadio)
//
//  Created by Sushanth Tiruvaipati on 12/9/25.
//

import SwiftUI
import GoogleSignIn
import PaywallKit
import RatingKit

@main
struct BriefCastApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authService = AuthService()
    @StateObject private var preferencesService = PreferencesService.shared
    @State private var subscriptionManager = SubscriptionManager.shared
    @State private var showSplash = true
    @State private var showAppOpenPaywall = false
    @ObservedObject private var paywallCoordinator = PaywallCoordinator.shared

    init() {
        // FASTLANE_SNAPSHOT: skip onboarding and paywall for screenshots
        if ProcessInfo.processInfo.arguments.contains("-FASTLANE_SNAPSHOT") {
            UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")
            UserDefaults.standard.set(999, forKey: "com.audexa.appOpenCount") // prevent paywall trigger
        }

        // Initialize ad attribution SDKs
        FacebookSDKHelper.shared.initialize()
        TikTokHelper.shared.initialize()
        TikTokHelper.shared.requestTrackingPermission()
        FacebookSDKHelper.shared.requestTrackingPermission()
    
        // Server-driven rating prompts (variant testing + analytics).
        // Currently in simple mode — uses native SKStoreReviewController, no UI overlay.
        RatingKit.configure(appId: "audexa", apiUrl: "https://paywallkit-api.fly.dev")
        RatingKit.shared.trackAppOpen()
    }
    @State private var showDailyBriefPlayer = false
    @State private var pendingEpisodeId: String?

    var body: some Scene {
        WindowGroup {
            ZStack {
                ContentView()
                    .ratingPrompt()
                    .environmentObject(authService)
                    .onOpenURL { url in
                        // Handle promo code deep links (e.g. audexa://open?code=FOCUS30)
                        PromoCodeManager.shared.handleURL(url)
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
                    .onReceive(NotificationCenter.default.publisher(for: UIApplication.willEnterForegroundNotification)) { _ in
                        // Winback eligibility is checked after paywall dismiss only, not on foreground
                        _ = subscriptionManager.isSubscribed
                    }

                // Splash screen overlay
                if showSplash {
                    SplashScreenView()
                        .transition(.opacity)
                        .zIndex(1)
                }
            }
            .preferredColorScheme(preferencesService.appTheme.colorScheme)
            .onAppear {
                // Check clipboard for promo code once per install
                Task { await PromoCodeManager.shared.checkClipboard() }
                // Dismiss splash screen after a delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
                    withAnimation(.easeOut(duration: 0.4)) {
                        showSplash = false
                    }
                    // Trigger app-open paywall after splash dismisses
                    triggerAppOpenPaywall()
                }
            }
            .fullScreenCover(isPresented: $showAppOpenPaywall, onDismiss: {
                PaywallCoordinator.shared.trackDismiss()
                // Winback check deferred — will trigger on next paywall dismiss after cooldown
            }) {
                RemotePaywallView(triggerSource: "app_open")
            }
            .fullScreenCover(isPresented: $paywallCoordinator.showWinbackOffer) {
                WinbackOfferView()
            }
        }
    }

    // MARK: - App-Open Paywall Trigger

    /// Shows paywall on the 5th open, then every 25th open (5, 30, 55, ...).
    /// Intentionally infrequent — compliant with App Store guideline 5.6.
    private func triggerAppOpenPaywall() {
        // Don't show if already subscribed
        guard !subscriptionManager.isSubscribed else { return }

        let key = "com.audexa.appOpenCount"
        let count = UserDefaults.standard.integer(forKey: key) + 1
        UserDefaults.standard.set(count, forKey: key)

        let shouldShow = count == 5 || (count > 5 && (count - 5) % 25 == 0)

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
