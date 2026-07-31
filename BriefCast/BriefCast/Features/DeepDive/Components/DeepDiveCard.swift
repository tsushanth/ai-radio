//
//  DeepDiveCard.swift
//  BriefCast
//
//  Card component for displaying Deep Dive episodes in history
//

import SwiftUI

struct DeepDiveCard: View {
    let deepDive: DeepDiveEpisode
    let isPlaying: Bool
    let onTap: () -> Void
    /// Tapped when the user hits the play affordance directly. Optional
    /// so callers can opt-in to direct playback; when provided, taps on
    /// the play button start playback without opening the detail view.
    var onPlay: (() -> Void)? = nil

    var body: some View {
        // Top-level ZStack: card-content Button on the bottom layer,
        // play Button on top. SwiftUI's gesture router gives taps to the
        // topmost interactive view, so tapping the play circle never falls
        // through to the card Button below.
        ZStack(alignment: .topLeading) {
            Button(action: onTap) {
                cardContent
            }
            .buttonStyle(.plain)

            if deepDive.status == .completed && !isPlaying, let onPlay {
                Button(action: onPlay) {
                    ZStack {
                        Circle()
                            .fill(Color.white)
                            .frame(width: 32, height: 32)
                        Image(systemName: "play.fill")
                            .font(.system(size: 14, weight: .bold))
                            .foregroundColor(Color(hex: DeepDiveEpisode.brandColor))
                            .offset(x: 1) // optical center
                    }
                    .shadow(color: .black.opacity(0.25), radius: 4, y: 2)
                }
                .buttonStyle(.plain)
                // Pin to the bottom-right of the 100pt-tall icon row so it
                // sits inside the colored card image, not below the text.
                .offset(x: 140 - 32 - 8, y: 100 - 32 - 8)
            }
        }
        .frame(width: 140)
    }

    @ViewBuilder
    private var cardContent: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Icon area with playing indicator
            ZStack(alignment: .bottomLeading) {
                ZStack {
                    Color(hex: DeepDiveEpisode.brandColor)
                        .frame(width: 140, height: 100)
                        .cornerRadius(12)

                    Image(systemName: "magnifyingglass.circle.fill")
                        .font(.system(size: 32))
                        .foregroundColor(.white.opacity(0.9))
                }

                // Now Playing indicator
                if isPlaying {
                    HStack(spacing: 4) {
                        DeepDiveNowPlayingIndicator()
                        Text("Playing")
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color(hex: DeepDiveEpisode.brandColor).opacity(0.9))
                    .cornerRadius(6)
                    .padding(6)
                }

                // Status badge for non-completed episodes
                if deepDive.status != .completed && !isPlaying {
                    HStack(spacing: 4) {
                        if deepDive.status.isInProgress {
                            ProgressView()
                                .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                .scaleEffect(0.6)
                        }
                        Text(deepDive.status.displayText)
                            .font(.system(size: 10, weight: .semibold))
                            .foregroundColor(.white)
                    }
                    .padding(.horizontal, 8)
                    .padding(.vertical, 4)
                    .background(Color.black.opacity(0.6))
                    .cornerRadius(6)
                    .padding(6)
                }
            }

            // Query text
            Text(deepDive.shortQuery)
                .font(.system(size: 13, weight: .medium))
                .foregroundColor(Theme.Colors.primaryText)
                .lineLimit(2)
                .multilineTextAlignment(.leading)

            // Duration
            if let duration = deepDive.durationSeconds {
                Text("\(duration / 60) min")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.Colors.secondaryText)
            }
        }
        .frame(width: 140)
    }
}

// MARK: - Now Playing Indicator

struct DeepDiveNowPlayingIndicator: View {
    @State private var animating = false

    var body: some View {
        HStack(spacing: 2) {
            ForEach(0..<3) { index in
                RoundedRectangle(cornerRadius: 1)
                    .fill(Color.white)
                    .frame(width: 3, height: animating ? CGFloat.random(in: 6...12) : 4)
                    .animation(
                        Animation.easeInOut(duration: 0.4)
                            .repeatForever(autoreverses: true)
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

// MARK: - Large Deep Dive Card (for featured display)

struct DeepDiveCardLarge: View {
    let deepDive: DeepDiveEpisode
    let isPlaying: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Icon
                ZStack {
                    RoundedRectangle(cornerRadius: 12)
                        .fill(
                            LinearGradient(
                                colors: [
                                    Color(hex: DeepDiveEpisode.brandColor).opacity(0.8),
                                    Color(hex: DeepDiveEpisode.brandColor).opacity(0.4)
                                ],
                                startPoint: .topLeading,
                                endPoint: .bottomTrailing
                            )
                        )
                        .frame(width: 60, height: 60)

                    if isPlaying {
                        DeepDiveNowPlayingIndicator()
                    } else if deepDive.status == .completed {
                        Image(systemName: "play.fill")
                            .font(.system(size: 22, weight: .bold))
                            .foregroundColor(.white)
                            .offset(x: 1)
                    } else {
                        Image(systemName: "magnifyingglass.circle.fill")
                            .font(.system(size: 28))
                            .foregroundColor(.white)
                    }
                }

                // Content
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(deepDive.shortQuery)
                            .font(.system(size: 14, weight: .semibold))
                            .foregroundColor(Theme.Colors.primaryText)
                            .lineLimit(1)

                        if isPlaying {
                            Text("Playing")
                                .font(.system(size: 10, weight: .semibold))
                                .foregroundColor(Color(hex: DeepDiveEpisode.brandColor))
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color(hex: DeepDiveEpisode.brandColor).opacity(0.2))
                                .cornerRadius(4)
                        }
                    }

                    HStack(spacing: 8) {
                        if let duration = deepDive.durationSeconds {
                            Text("\(duration / 60) min")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.Colors.secondaryText)
                        }

                        if deepDive.status == .completed {
                            Text("•")
                                .foregroundColor(Theme.Colors.secondaryText)

                            Text(deepDive.formattedDate)
                                .font(.system(size: 12))
                                .foregroundColor(Theme.Colors.secondaryText)
                        } else {
                            Text(deepDive.status.displayText)
                                .font(.system(size: 12))
                                .foregroundColor(Color(hex: DeepDiveEpisode.brandColor))
                        }
                    }

                    if !deepDive.sources.isEmpty {
                        Text("\(deepDive.sources.count) sources")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.Colors.secondaryText.opacity(0.7))
                    }
                }

                Spacer()

                // Chevron
                Image(systemName: "chevron.right")
                    .font(.system(size: 12))
                    .foregroundColor(Theme.Colors.secondaryText)
            }
            .padding(12)
            .background(Theme.Colors.cardBackground)
            .cornerRadius(12)
        }
        .buttonStyle(PlainButtonStyle())
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()

        VStack(spacing: 20) {
            // Small cards
            HStack(spacing: 16) {
                DeepDiveCard(
                    deepDive: DeepDiveEpisode.preview,
                    isPlaying: false,
                    onTap: {}
                )

                DeepDiveCard(
                    deepDive: DeepDiveEpisode.preview,
                    isPlaying: true,
                    onTap: {}
                )
            }

            // Large card
            DeepDiveCardLarge(
                deepDive: DeepDiveEpisode.preview,
                isPlaying: false,
                onTap: {}
            )
            .padding(.horizontal, 16)

            DeepDiveCardLarge(
                deepDive: DeepDiveEpisode.preview,
                isPlaying: true,
                onTap: {}
            )
            .padding(.horizontal, 16)
        }
    }
}
