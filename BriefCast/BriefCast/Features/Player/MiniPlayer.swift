//
//  MiniPlayer.swift
//  BriefCast
//
//  Compact player bar with swipe up gesture and seek bar
//

import SwiftUI

// MARK: - Enhanced Mini Player (with seek bar)

struct MiniPlayerEnhanced: View {
    let episode: Episode
    let isPlaying: Bool
    let currentTime: TimeInterval
    let duration: TimeInterval
    let onPlayPause: () -> Void
    let onTap: () -> Void
    let onSeek: (TimeInterval) -> Void

    @State private var dragOffset: CGFloat = 0
    @State private var isSeeking: Bool = false
    @State private var seekTime: TimeInterval = 0

    private var progress: Double {
        guard duration > 0 else { return 0 }
        return (isSeeking ? seekTime : currentTime) / duration
    }

    var body: some View {
        VStack(spacing: 0) {
            // Progress bar at top
            GeometryReader { geometry in
                ZStack(alignment: .leading) {
                    // Background track
                    Rectangle()
                        .fill(Color.white.opacity(0.2))
                        .frame(height: 3)

                    // Progress fill
                    Rectangle()
                        .fill(Theme.Colors.accent)
                        .frame(width: geometry.size.width * progress, height: 3)
                }
                .gesture(
                    DragGesture(minimumDistance: 0)
                        .onChanged { value in
                            isSeeking = true
                            let percentage = max(0, min(1, value.location.x / geometry.size.width))
                            seekTime = percentage * duration
                        }
                        .onEnded { value in
                            let percentage = max(0, min(1, value.location.x / geometry.size.width))
                            let newTime = percentage * duration
                            onSeek(newTime)
                            isSeeking = false
                        }
                )
            }
            .frame(height: 3)

            // Main content
            HStack(spacing: 12) {
                // Artwork thumbnail with color from episode
                RoundedRectangle(cornerRadius: 8)
                    .fill(
                        LinearGradient(
                            colors: [
                                Color(hex: episode.imageColor),
                                Color(hex: episode.imageColor).opacity(0.6)
                            ],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 46, height: 46)
                    .overlay(
                        Group {
                            if isPlaying {
                                // Animated waveform when playing
                                NowPlayingBars()
                            } else {
                                Image(systemName: "waveform")
                                    .font(.system(size: 18))
                                    .foregroundColor(.white.opacity(0.8))
                            }
                        }
                    )

                // Episode info
                VStack(alignment: .leading, spacing: 2) {
                    Text(episode.title)
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Theme.Colors.primaryText)
                        .lineLimit(1)

                    HStack(spacing: 4) {
                        Text(formatTime(isSeeking ? seekTime : currentTime))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Theme.Colors.secondaryText)

                        Text("•")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.Colors.secondaryText.opacity(0.5))

                        Text(formatTime(duration))
                            .font(.system(size: 11, weight: .medium))
                            .foregroundColor(Theme.Colors.secondaryText)
                    }
                }

                Spacer()

                // Skip backward button
                Button(action: {
                    let newTime = max(0, currentTime - 15)
                    onSeek(newTime)
                }) {
                    Image(systemName: "gobackward.15")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                        .frame(width: 36, height: 36)
                }

                // Play/Pause button
                Button(action: onPlayPause) {
                    Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                        .font(.system(size: 24, weight: .semibold))
                        .foregroundColor(Theme.Colors.accent)
                        .frame(width: 44, height: 44)
                }
                .buttonStyle(ScaleButtonStyle())

                // Skip forward button
                Button(action: {
                    let newTime = min(duration, currentTime + 15)
                    onSeek(newTime)
                }) {
                    Image(systemName: "goforward.15")
                        .font(.system(size: 18, weight: .medium))
                        .foregroundColor(.white.opacity(0.8))
                        .frame(width: 36, height: 36)
                }
            }
            .padding(.horizontal, 12)
            .padding(.vertical, 8)
        }
        .frame(height: 68)
        .background(
            ZStack {
                // Dark blurred background
                Color.black.opacity(0.95)

                Rectangle()
                    .fill(.ultraThinMaterial)
                    .opacity(0.7)
            }
        )
        .cornerRadius(16)
        .overlay(
            RoundedRectangle(cornerRadius: 16)
                .stroke(Color.white.opacity(0.1), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.4), radius: 12, x: 0, y: 6)
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

    private func formatTime(_ seconds: TimeInterval) -> String {
        guard seconds.isFinite && seconds >= 0 else { return "0:00" }
        let mins = Int(seconds) / 60
        let secs = Int(seconds) % 60
        return String(format: "%d:%02d", mins, secs)
    }
}

// MARK: - Now Playing Animation Bars

struct NowPlayingBars: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<4, id: \.self) { index in
                Capsule()
                    .fill(.white.opacity(0.9))
                    .frame(width: 3)
                    .frame(height: animating ? CGFloat.random(in: 8...18) : 6)
                    .animation(
                        .easeInOut(duration: 0.4)
                        .repeatForever()
                        .delay(Double(index) * 0.1),
                        value: animating
                    )
            }
        }
        .onAppear {
            animating = true
        }
    }
}

// MARK: - Original Mini Player (legacy)

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

#Preview("Enhanced Mini Player") {
    VStack {
        Spacer()

        MiniPlayerEnhanced(
            episode: .mock,
            isPlaying: true,
            currentTime: 125,
            duration: 300,
            onPlayPause: { print("Play/Pause") },
            onTap: { print("Expand") },
            onSeek: { time in print("Seek to \(time)") }
        )
        .padding(.horizontal, 16)
        .padding(.bottom, 90)
    }
    .background(Color.black)
}

#Preview("Original Mini Player") {
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
