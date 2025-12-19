//
//  ContentView.swift
//  BriefCast (AIRadio)
//
//  Main app shell with tab navigation and mini player
//

import SwiftUI
import GoogleSignIn

struct ContentView: View {
    @EnvironmentObject var authService: AuthService
    @State private var selectedTab: Tab = .home
    @State private var showOnboarding: Bool = false
    @State private var showFullPlayer: Bool = false

    // HomeViewModel is owned here so it survives tab navigation
    // This preserves generation progress when switching between Home and Profile tabs
    @State private var homeViewModel = HomeViewModel()

    // Audio service for global playback state
    private let audioService = AudioService.shared

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
        .fullScreenCover(isPresented: $showOnboarding, onDismiss: {
            // Ensure user lands on Home screen after completing onboarding
            selectedTab = .home
        }) {
            OnboardingView()
                .onOpenURL { url in
                    // Handle Google OAuth callback even when fullScreenCover is presented
                    print("📱 Received URL in OnboardingView: \(url)")
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }

    // MARK: - Main App View

    private var mainAppView: some View {
        ZStack {
            // Background - use theme-aware color
            Theme.Colors.background.ignoresSafeArea()

            // Main content based on selected tab
            switch selectedTab {
            case .home:
                HomeView(viewModel: homeViewModel)
            case .profile:
                ProfileView()
            }

            // Overlays
            VStack {
                Spacer()

                // Mini player overlay (when audio is playing or paused with content)
                if let episode = audioService.currentEpisode {
                    MiniPlayerEnhanced(
                        episode: episode,
                        isPlaying: audioService.isPlaying,
                        currentTime: audioService.currentTime,
                        duration: audioService.duration,
                        onPlayPause: {
                            audioService.togglePlayPause()
                        },
                        onTap: {
                            showFullPlayer = true
                        },
                        onSeek: { time in
                            audioService.seek(to: time)
                        }
                    )
                    .padding(.horizontal, 16)
                    .padding(.bottom, 90) // Above tab bar
                    .transition(.move(edge: .bottom).combined(with: .opacity))
                    .animation(.spring(response: 0.3), value: audioService.currentEpisode?.id)
                }

                // Floating tab bar
                TabRouter(selectedTab: $selectedTab)
            }
        }
        .sheet(isPresented: $showFullPlayer) {
            if let episode = audioService.currentEpisode {
                PlayerView(episode: episode)
            }
        }
    }
}

#Preview {
    ContentView()
        .environmentObject(AuthService())
}
