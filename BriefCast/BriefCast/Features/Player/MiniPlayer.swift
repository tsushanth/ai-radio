//
//  MiniPlayer.swift
//  BriefCast
//
//  Compact player bar with swipe up gesture
//

import SwiftUI

struct MiniPlayer: View {
    let episode: Episode
    let isPlaying: Bool
    let onPlayPause: () -> Void
    let onTap: () -> Void

    @State private var dragOffset: CGFloat = 0

    var body: some View {
        HStack(spacing: 12) {
            // Artwork thumbnail
            RoundedRectangle(cornerRadius: 8)
                .fill(
                    LinearGradient(
                        colors: [
                            Theme.Colors.accent,
                            Theme.Colors.accent.opacity(0.6)
                        ],
                        startPoint: .topLeading,
                        endPoint: .bottomTrailing
                    )
                )
                .frame(width: 50, height: 50)
                .overlay(
                    Image(systemName: "waveform")
                        .font(.system(size: 20))
                        .foregroundColor(.white.opacity(0.8))
                )

            // Episode info
            VStack(alignment: .leading, spacing: 4) {
                Text(episode.title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.Colors.primaryText)
                    .lineLimit(1)

                Text(episode.description)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .lineLimit(1)
            }

            Spacer()

            // Play/Pause button
            Button(action: onPlayPause) {
                Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                    .font(.system(size: 22, weight: .semibold))
                    .foregroundColor(Theme.Colors.accent)
                    .frame(width: 44, height: 44)
            }
            .buttonStyle(ScaleButtonStyle())
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 10)
        .frame(height: 64)
        .background(
            ZStack {
                // Dark blurred background
                Color.black.opacity(0.9)

                Rectangle()
                    .fill(.ultraThinMaterial)
                    .opacity(0.8)
            }
        )
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.3), radius: 10, x: 0, y: 5)
        .offset(y: dragOffset)
        .gesture(
            DragGesture()
                .onChanged { value in
                    // Only allow upward swipe
                    if value.translation.height < 0 {
                        dragOffset = value.translation.height
                    }
                }
                .onEnded { value in
                    // If swiped up more than 50pt, expand to full player
                    if value.translation.height < -50 {
                        onTap()
                    }
                    // Reset drag offset with animation
                    withAnimation(.spring(response: 0.3)) {
                        dragOffset = 0
                    }
                }
        )
        .onTapGesture {
            onTap()
        }
    }

    private func formatDuration(_ seconds: Int?) -> String {
        guard let seconds = seconds else { return "N/A" }
        let minutes = seconds / 60
        return "\(minutes) min"
    }
}

#Preview {
    VStack {
        Spacer()

        MiniPlayer(
            episode: .mock,
            isPlaying: true,
            onPlayPause: {
                print("Play/Pause tapped")
            },
            onTap: {
                print("Mini player tapped - expand to full view")
            }
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 90)
    }
    .background(Color.black)
}
