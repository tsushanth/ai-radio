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

    var body: some View {
        Button(action: onTap) {
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
        .buttonStyle(PlainButtonStyle())
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
