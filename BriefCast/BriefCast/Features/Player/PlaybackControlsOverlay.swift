//
//  PlaybackControlsOverlay.swift
//  BriefCast
//
//  Skip and Tell Me More controls overlay for the player
//

import SwiftUI

struct PlaybackControlsOverlay: View {
    @Binding var isVisible: Bool
    let currentSegment: AudioSegmentInfo?
    let onSkip: () -> Void
    let onTellMeMore: () -> Void

    @State private var isLoadingExpansion = false

    var body: some View {
        VStack {
            Spacer()

            // Controls appear above the main playback controls
            VStack(spacing: 12) {
                // Current segment info
                if let segment = currentSegment {
                    HStack(spacing: 8) {
                        Image(systemName: segmentIcon(for: segment.type))
                            .font(.system(size: 14))
                            .foregroundColor(.white.opacity(0.7))

                        Text(segment.title)
                            .font(.system(size: 14, weight: .medium))
                            .foregroundColor(.white.opacity(0.9))
                            .lineLimit(1)
                    }
                    .padding(.horizontal, 16)
                    .padding(.vertical, 8)
                    .background(Color.white.opacity(0.1))
                    .cornerRadius(20)
                }

                // Skip and Tell Me More buttons
                HStack(spacing: 16) {
                    // Skip button
                    Button(action: {
                        withAnimation(.spring(response: 0.3)) {
                            onSkip()
                        }
                    }) {
                        HStack(spacing: 6) {
                            Image(systemName: "forward.fill")
                                .font(.system(size: 14))

                            Text("Skip")
                                .font(.system(size: 15, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 24)
                                .fill(Color.white.opacity(0.2))
                        )
                    }

                    // Tell Me More button
                    Button(action: {
                        if !isLoadingExpansion {
                            isLoadingExpansion = true
                            onTellMeMore()
                            // Reset after a delay (actual loading handled by parent)
                            DispatchQueue.main.asyncAfter(deadline: .now() + 2) {
                                isLoadingExpansion = false
                            }
                        }
                    }) {
                        HStack(spacing: 6) {
                            if isLoadingExpansion {
                                ProgressView()
                                    .progressViewStyle(CircularProgressViewStyle(tint: .white))
                                    .scaleEffect(0.8)
                            } else {
                                Image(systemName: "plus.magnifyingglass")
                                    .font(.system(size: 14))
                            }

                            Text("Tell Me More")
                                .font(.system(size: 15, weight: .semibold))
                        }
                        .foregroundColor(.black)
                        .padding(.horizontal, 20)
                        .padding(.vertical, 12)
                        .background(
                            RoundedRectangle(cornerRadius: 24)
                                .fill(Color.white)
                        )
                    }
                    .disabled(isLoadingExpansion)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 16)
            .transition(.move(edge: .bottom).combined(with: .opacity))
        }
    }

    private func segmentIcon(for type: String) -> String {
        switch type {
        case "intro": return "sun.max.fill"
        case "calendar": return "calendar"
        case "email": return "envelope.fill"
        case "news": return "newspaper.fill"
        case "weather": return "cloud.sun.fill"
        case "topic_teaser": return "star.fill"
        case "outro": return "moon.fill"
        default: return "waveform"
        }
    }
}

// MARK: - Expansion View (Tell Me More Result)

struct ExpansionView: View {
    let expansion: TellMeMoreExpansion
    let onDismiss: () -> Void
    let onPlayAudio: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Header
            HStack {
                Text("More Details")
                    .font(.system(size: 18, weight: .bold))
                    .foregroundColor(.white)

                Spacer()

                Button(action: onDismiss) {
                    Image(systemName: "xmark.circle.fill")
                        .font(.system(size: 24))
                        .foregroundColor(.white.opacity(0.6))
                }
            }

            // Expanded content
            ScrollView {
                VStack(alignment: .leading, spacing: 12) {
                    Text(expansion.expandedContent)
                        .font(.system(size: 15))
                        .foregroundColor(.white.opacity(0.9))
                        .lineSpacing(4)

                    // Sources
                    if let sources = expansion.sources, !sources.isEmpty {
                        VStack(alignment: .leading, spacing: 8) {
                            Text("Sources")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.white.opacity(0.5))
                                .textCase(.uppercase)

                            ForEach(sources) { source in
                                if let urlString = source.url, let url = URL(string: urlString) {
                                    Link(destination: url) {
                                        HStack(spacing: 6) {
                                            Image(systemName: "link")
                                                .font(.system(size: 12))

                                            Text(source.title)
                                                .font(.system(size: 13))
                                                .lineLimit(1)
                                        }
                                        .foregroundColor(.blue)
                                    }
                                } else {
                                    Text(source.title)
                                        .font(.system(size: 13))
                                        .foregroundColor(.white.opacity(0.7))
                                }
                            }
                        }
                        .padding(.top, 8)
                    }
                }
            }

            // Play audio button (if available)
            if expansion.audioUrl != nil {
                Button(action: onPlayAudio) {
                    HStack {
                        Image(systemName: "play.circle.fill")
                            .font(.system(size: 20))

                        Text("Listen to Expansion")
                            .font(.system(size: 15, weight: .semibold))

                        if let duration = expansion.durationSeconds {
                            Text("(\(formatDuration(duration)))")
                                .font(.system(size: 13))
                                .foregroundColor(.white.opacity(0.7))
                        }
                    }
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 14)
                    .background(Theme.Colors.accent)
                    .cornerRadius(12)
                }
            }
        }
        .padding(20)
        .background(
            RoundedRectangle(cornerRadius: 20)
                .fill(Color(white: 0.15))
        )
        .padding(.horizontal, 16)
    }

    private func formatDuration(_ seconds: Int) -> String {
        let minutes = seconds / 60
        let secs = seconds % 60
        return String(format: "%d:%02d", minutes, secs)
    }
}

// MARK: - Preview

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()

        PlaybackControlsOverlay(
            isVisible: .constant(true),
            currentSegment: AudioSegmentInfo(
                id: "1",
                type: "email",
                title: "3 Important Emails",
                startTime: 30,
                endTime: 90,
                content: "Summary of your emails",
                topicId: nil
            ),
            onSkip: { print("Skip") },
            onTellMeMore: { print("Tell me more") }
        )
    }
}
