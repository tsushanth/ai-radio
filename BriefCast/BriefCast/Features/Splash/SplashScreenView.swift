//
//  SplashScreenView.swift
//  BriefCast
//
//  Animated splash screen shown when the app launches
//

import SwiftUI

struct SplashScreenView: View {
    @State private var isAnimating = false
    @State private var showPulse = false
    @State private var opacity: Double = 1.0

    var body: some View {
        ZStack {
            // Background
            Theme.Colors.background
                .ignoresSafeArea()

            VStack(spacing: 24) {
                // App icon with animation
                ZStack {
                    // Pulse effect
                    Circle()
                        .fill(Theme.Colors.accent.opacity(0.2))
                        .frame(width: 160, height: 160)
                        .scaleEffect(showPulse ? 1.3 : 1.0)
                        .opacity(showPulse ? 0 : 0.5)

                    // Icon background
                    Circle()
                        .fill(
                            LinearGradient(
                                colors: [Theme.Colors.accent, Theme.Colors.accent.opacity(0.7)],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 120, height: 120)
                        .shadow(color: Theme.Colors.accent.opacity(0.4), radius: 20, x: 0, y: 10)

                    // Waveform icon
                    Image(systemName: "waveform.circle.fill")
                        .font(.system(size: 70, weight: .medium))
                        .foregroundColor(.white)
                        .scaleEffect(isAnimating ? 1.0 : 0.8)
                }

                // App name
                VStack(spacing: 8) {
                    Text("Audexa")
                        .font(.system(size: 36, weight: .bold))
                        .foregroundColor(Theme.Colors.primaryText)
                        .opacity(isAnimating ? 1.0 : 0.0)

                    Text("Your AI-powered audio briefing")
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(Theme.Colors.secondaryText)
                        .opacity(isAnimating ? 1.0 : 0.0)
                }
            }
        }
        .opacity(opacity)
        .onAppear {
            // Start animations
            withAnimation(.easeOut(duration: 0.6)) {
                isAnimating = true
            }

            // Pulse animation
            withAnimation(.easeInOut(duration: 1.0).repeatForever(autoreverses: false)) {
                showPulse = true
            }
        }
    }

    /// Animate the splash screen out
    func animateOut(completion: @escaping () -> Void) {
        withAnimation(.easeIn(duration: 0.3)) {
            opacity = 0
        }

        DispatchQueue.main.asyncAfter(deadline: .now() + 0.3) {
            completion()
        }
    }
}

#Preview {
    SplashScreenView()
}
