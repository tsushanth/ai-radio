//
//  TopicPlayerControls.swift
//  BriefCast
//
//  Reusable player controls with play/pause, seek slider, and skip buttons
//

import SwiftUI

struct TopicPlayerControls: View {
    let isPlaying: Bool
    let currentTime: TimeInterval
    let duration: TimeInterval
    let onPlayPause: () -> Void
    let onSeek: (TimeInterval) -> Void
    let onSkipBackward: () -> Void
    let onSkipForward: () -> Void

    @State private var isDragging: Bool = false
    @State private var dragValue: Double = 0

    private var displayTime: TimeInterval {
        isDragging ? dragValue : currentTime
    }

    private var progress: Double {
        guard duration > 0 else { return 0 }
        return displayTime / duration
    }

    var body: some View {
        VStack(spacing: 24) {
            // Progress slider
            VStack(spacing: 8) {
                // Slider
                GeometryReader { geometry in
                    ZStack(alignment: .leading) {
                        // Track background
                        Capsule()
                            .fill(Color.white.opacity(0.2))
                            .frame(height: 6)

                        // Progress fill
                        Capsule()
                            .fill(Theme.Colors.accent)
                            .frame(width: max(0, geometry.size.width * progress), height: 6)

                        // Thumb
                        Circle()
                            .fill(Color.white)
                            .frame(width: 16, height: 16)
                            .shadow(color: .black.opacity(0.3), radius: 2, x: 0, y: 1)
                            .offset(x: max(0, min(geometry.size.width - 16, geometry.size.width * progress - 8)))
                    }
                    .gesture(
                        DragGesture(minimumDistance: 0)
                            .onChanged { value in
                                isDragging = true
                                let percentage = max(0, min(1, value.location.x / geometry.size.width))
                                dragValue = percentage * duration
                            }
                            .onEnded { value in
                                let percentage = max(0, min(1, value.location.x / geometry.size.width))
                                let newTime = percentage * duration
                                onSeek(newTime)
                                isDragging = false
                            }
                    )
                }
                .frame(height: 16)

                // Time labels
                HStack {
                    Text(formatTime(displayTime))
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(Theme.Colors.secondaryText)

                    Spacer()

                    Text(formatTime(duration))
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
            }

            // Control buttons
            HStack(spacing: 40) {
                // Skip backward 15s
                Button(action: onSkipBackward) {
                    Image(systemName: "gobackward.15")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundColor(Theme.Colors.primaryText)
                }
                .buttonStyle(ScaleButtonStyle())

                // Play/Pause
                Button(action: onPlayPause) {
                    ZStack {
                        Circle()
                            .fill(Theme.Colors.accent)
                            .frame(width: 72, height: 72)

                        Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                            .font(.system(size: 28, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: isPlaying ? 0 : 2) // Visual centering for play icon
                    }
                }
                .buttonStyle(ScaleButtonStyle())

                // Skip forward 15s
                Button(action: onSkipForward) {
                    Image(systemName: "goforward.15")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundColor(Theme.Colors.primaryText)
                }
                .buttonStyle(ScaleButtonStyle())
            }
        }
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    private func formatTime(_ time: TimeInterval) -> String {
        let minutes = Int(time) / 60
        let seconds = Int(time) % 60
        return String(format: "%d:%02d", minutes, seconds)
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()

        TopicPlayerControls(
            isPlaying: false,
            currentTime: 45,
            duration: 180,
            onPlayPause: {},
            onSeek: { _ in },
            onSkipBackward: {},
            onSkipForward: {}
        )
    }
}
