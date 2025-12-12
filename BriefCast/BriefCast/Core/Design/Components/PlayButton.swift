//
//  PlayButton.swift
//  BriefCast
//
//  Large oval play button component with scale animation
//

import SwiftUI

struct PlayButton: View {
    let isPlaying: Bool
    let onTap: () -> Void
    @State private var isPressed = false
    @State private var isPulsing = false

    init(isPlaying: Bool = false, onTap: @escaping () -> Void = {}) {
        self.isPlaying = isPlaying
        self.onTap = onTap
    }

    var body: some View {
        Button(action: {
            // Haptic feedback
            HapticManager.shared.medium()

            if !UIAccessibility.isReduceMotionEnabled {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                    isPressed = true
                }
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.6)) {
                        isPressed = false
                    }
                }
            }

            onTap()
        }) {
            HStack(spacing: 10) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)
                    .contentTransition(.symbolEffect(.replace))
            }
            .frame(width: 160, height: 56)
            .background(
                ZStack {
                    // Semi-transparent dark background
                    Color.black.opacity(0.4)

                    // Blur effect
                    Rectangle()
                        .fill(.ultraThinMaterial)
                        .opacity(0.8)

                    // Pulsing glow when playing
                    if isPlaying && !UIAccessibility.isReduceMotionEnabled {
                        RoundedRectangle(cornerRadius: 28)
                            .stroke(Color.white.opacity(isPulsing ? 0.4 : 0.1), lineWidth: 2)
                            .blur(radius: isPulsing ? 4 : 2)
                    }
                }
            )
            .cornerRadius(28)
            .overlay(
                RoundedRectangle(cornerRadius: 28)
                    .stroke(Color.white.opacity(0.2), lineWidth: 1)
            )
            .shadow(color: Color.black.opacity(0.3), radius: 10, x: 0, y: 5)
        }
        .buttonStyle(ScaleButtonStyle())
        .scaleEffect(isPressed ? 0.95 : 1.0)
        .accessibilityLabel(isPlaying ? "Pause" : "Play")
        .accessibilityHint("Double tap to \(isPlaying ? "pause" : "play") audio")
        .onAppear {
            if isPlaying && !UIAccessibility.isReduceMotionEnabled {
                withAnimation(
                    .easeInOut(duration: 1.2)
                    .repeatForever(autoreverses: true)
                ) {
                    isPulsing = true
                }
            }
        }
        .onChange(of: isPlaying) { oldValue, newValue in
            if newValue && !UIAccessibility.isReduceMotionEnabled {
                withAnimation(
                    .easeInOut(duration: 1.2)
                    .repeatForever(autoreverses: true)
                ) {
                    isPulsing = true
                }
            } else {
                isPulsing = false
            }
        }
    }
}

// Custom button style for subtle scale animation
struct ScaleButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.95 : 1.0)
            .animation(.spring(response: 0.3, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

#Preview {
    VStack(spacing: 40) {
        PlayButton(isPlaying: false) {
            print("Play tapped")
        }

        PlayButton(isPlaying: true) {
            print("Pause tapped")
        }
    }
    .padding()
    .background(
        LinearGradient(
            colors: [Color(hex: "#8B4513"), Color(hex: "#FF8C00")],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    )
}
