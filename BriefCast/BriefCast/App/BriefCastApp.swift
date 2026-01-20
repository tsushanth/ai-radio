//
//  BriefCastApp.swift
//  BriefCast (AIRadio)
//
//  Created by Sushanth Tiruvaipati on 12/9/25.
//

import SwiftUI
import GoogleSignIn

@main
struct BriefCastApp: App {
    @UIApplicationDelegateAdaptor(AppDelegate.self) var appDelegate
    @StateObject private var authService = AuthService()
    @StateObject private var preferencesService = PreferencesService.shared
    @State private var showSplash = true
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
            .preferredColorScheme(preferencesService.appTheme.colorScheme)
            .onAppear {
                // Dismiss splash screen after a delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 1.8) {
                    withAnimation(.easeOut(duration: 0.4)) {
                        showSplash = false
                    }
                }
            }
        }
    }
}

// Additional notification names for navigation
extension Notification.Name {
    static let navigateToHome = Notification.Name("navigateToHome")
}
