//
//  AdCompanionView.swift
//  BriefCast
//
//  Companion display for native audio ads - shows image, sponsor label, CTA, and skip

import SwiftUI

struct AdCompanionView: View {
    let ad: AdSegment
    let timeRemaining: TimeInterval
    let onSkip: () -> Void
    let onTap: () -> Void

    var body: some View {
        VStack(spacing: 0) {
            Spacer()

            VStack(spacing: 16) {
                // Sponsored label
                HStack {
                    Text("Sponsored")
                        .font(.system(size: 11, weight: .semibold))
                        .foregroundColor(Theme.Colors.secondaryText)
                        .textCase(.uppercase)
                        .tracking(0.5)

                    Spacer()

                    // Skip button (always available)
                    Button(action: onSkip) {
                        HStack(spacing: 4) {
                            Text("Skip")
                                .font(.system(size: 13, weight: .medium))
                            Image(systemName: "forward.fill")
                                .font(.system(size: 10))
                        }
                        .foregroundColor(Theme.Colors.primaryText)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 6)
                        .background(Color.white.opacity(0.15))
                        .cornerRadius(14)
                    }
                }

                // Companion image
                if let imageUrlString = ad.companionImageUrl,
                   let imageUrl = URL(string: imageUrlString) {
                    Button(action: onTap) {
                        AsyncImage(url: imageUrl) { phase in
                            switch phase {
                            case .success(let image):
                                image
                                    .resizable()
                                    .aspectRatio(contentMode: .fill)
                                    .frame(maxHeight: 200)
                                    .clipped()
                            case .failure:
                                adPlaceholder
                            case .empty:
                                ProgressView()
                                    .frame(height: 120)
                            @unknown default:
                                adPlaceholder
                            }
                        }
                        .cornerRadius(12)
                    }
                }

                // CTA button
                if let ctaText = ad.ctaText, let clickUrl = ad.clickThroughUrl, !clickUrl.isEmpty {
                    Button(action: onTap) {
                        Text(ctaText)
                            .font(.system(size: 15, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 12)
                            .background(Theme.Colors.accent)
                            .cornerRadius(10)
                    }
                }

                // Countdown
                HStack {
                    // Progress bar
                    GeometryReader { geometry in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.15))
                                .frame(height: 3)

                            Capsule()
                                .fill(Theme.Colors.accent)
                                .frame(width: geometry.size.width * adProgress, height: 3)
                                .animation(.linear(duration: 0.5), value: adProgress)
                        }
                    }
                    .frame(height: 3)

                    Text(formatTime(timeRemaining))
                        .font(.system(size: 12, weight: .medium, design: .monospaced))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
            }
            .padding(20)
            .background(
                RoundedRectangle(cornerRadius: 20)
                    .fill(Theme.Colors.cardBackground)
                    .shadow(color: .black.opacity(0.3), radius: 20, y: -5)
            )
            .padding(.horizontal, 12)
            .padding(.bottom, 8)
        }
        .transition(.move(edge: .bottom).combined(with: .opacity))
    }

    // MARK: - Computed

    private var adProgress: Double {
        let total = Double(ad.audioDurationSeconds)
        guard total > 0 else { return 0 }
        return max(0, min(1, 1.0 - (timeRemaining / total)))
    }

    // MARK: - Subviews

    private var adPlaceholder: some View {
        RoundedRectangle(cornerRadius: 12)
            .fill(Color.white.opacity(0.1))
            .frame(height: 120)
            .overlay(
                VStack(spacing: 8) {
                    Image(systemName: "megaphone.fill")
                        .font(.system(size: 28))
                        .foregroundColor(Theme.Colors.secondaryText)
                    Text("Ad")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
            )
    }

    // MARK: - Helpers

    private func formatTime(_ time: TimeInterval) -> String {
        let seconds = Int(max(0, time))
        return "0:\(String(format: "%02d", seconds))"
    }
}
