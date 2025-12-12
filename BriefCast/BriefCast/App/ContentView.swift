//
//  ContentView.swift
//  BriefCast (AIRadio)
//
//  Main app shell with tab navigation and mini player
//

import SwiftUI

struct ContentView: View {
    @EnvironmentObject var authService: AuthService
    @State private var selectedTab: Tab = .home
    @State private var showMiniPlayer: Bool = false
    @State private var showOnboarding: Bool = false
    @State private var currentEpisode: Episode?

    private var hasCompletedOnboarding: Bool {
        UserDefaults.standard.bool(forKey: "hasCompletedOnboarding")
    }

    var body: some View {
        Group {
            if authService.isAuthenticated {
                mainAppView
            } else {
                AuthView()
            }
        }
        .preferredColorScheme(.dark)
        .task {
            await authService.restoreSession()
            // Check onboarding after session restore
            if authService.isAuthenticated && !hasCompletedOnboarding {
                showOnboarding = true
            }
        }
        .onChange(of: authService.isAuthenticated) { _, isAuthenticated in
            // Show onboarding when user first signs in
            if isAuthenticated && !hasCompletedOnboarding {
                showOnboarding = true
            }
        }
        .fullScreenCover(isPresented: $showOnboarding) {
            OnboardingView()
        }
    }

    // MARK: - Main App View

    private var mainAppView: some View {
        ZStack {
            // Background
            Color.black.ignoresSafeArea()

            // Main content based on selected tab
            switch selectedTab {
            case .home:
                HomeView()
            case .profile:
                ProfileView()
            }

            // Overlays
            VStack {
                Spacer()

                // Mini player overlay (when audio is playing)
                if showMiniPlayer, let episode = currentEpisode {
                    MiniPlayer(
                        episode: episode,
                        isPlaying: true,
                        onPlayPause: {
                            // TODO: Toggle playback
                            print("Toggle playback")
                        },
                        onTap: {
                            // TODO: Show full player
                            print("Show full player")
                        }
                    )
                    .padding(.horizontal, 16)
                    .padding(.bottom, 90) // Above tab bar
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                }

                // Floating tab bar
                TabRouter(selectedTab: $selectedTab)
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthService())
}
