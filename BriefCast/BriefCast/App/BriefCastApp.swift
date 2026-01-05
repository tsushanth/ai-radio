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
    @StateObject private var authService = AuthService()
    @StateObject private var preferencesService = PreferencesService.shared
    @State private var showSplash = true

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
