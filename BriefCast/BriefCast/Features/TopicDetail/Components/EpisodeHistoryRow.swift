//
//  EpisodeHistoryRow.swift
//  BriefCast
//
//  Row component for displaying episode in history list
//

import SwiftUI

struct EpisodeHistoryRow: View {
    let episode: TopicEpisode
    let topicColor: Color
    let isCurrentlyPlaying: Bool
    let onTap: () -> Void

    var body: some View {
        Button(action: onTap) {
            HStack(spacing: 12) {
                // Play indicator / date icon
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(topicColor.opacity(0.2))
                        .frame(width: 44, height: 44)

                    if isCurrentlyPlaying {
                        // Now playing indicator
                        Image(systemName: "waveform")
                            .font(.system(size: 18, weight: .medium))
                            .foregroundColor(topicColor)
                            .symbolEffect(.variableColor.iterative)
                    } else if episode.status == .completed {
                        Image(systemName: "play.fill")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(topicColor)
                    } else {
                        Image(systemName: "clock")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(Theme.Colors.secondaryText)
                    }
                }

                // Episode info
                VStack(alignment: .leading, spacing: 4) {
                    Text(episode.formattedDate)
                        .font(.system(size: 15, weight: .medium))
                        .foregroundColor(isCurrentlyPlaying ? topicColor : Theme.Colors.primaryText)
                        .lineLimit(1)

                    HStack(spacing: 8) {
                        // Duration
                        if let seconds = episode.durationSeconds {
                            Text("\(seconds / 60) min")
                                .font(.system(size: 13))
                                .foregroundColor(Theme.Colors.secondaryText)
                        }

                        // Status indicator for non-completed
                        if episode.status != .completed {
                            Text(statusText)
                                .font(.system(size: 12, weight: .medium))
                                .foregroundColor(statusColor)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(statusColor.opacity(0.15))
                                .cornerRadius(4)
                        }

                        // Play count
                        if episode.playCount > 0 {
                            HStack(spacing: 2) {
                                Image(systemName: "play.circle")
                                    .font(.system(size: 11))
                                Text("\(episode.playCount)")
                                    .font(.system(size: 12))
                            }
                            .foregroundColor(Theme.Colors.secondaryText)
                        }
                    }
                }

                Spacer()

                // Chevron
                if episode.status == .completed {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
            }
            .padding(.vertical, 12)
            .padding(.horizontal, 16)
            .background(
                RoundedRectangle(cornerRadius: 12)
                    .fill(isCurrentlyPlaying ? topicColor.opacity(0.1) : Theme.Colors.cardBackground)
            )
        }
        .buttonStyle(PlainButtonStyle())
        .disabled(episode.status != .completed)
        .opacity(episode.status == .completed ? 1 : 0.6)
    }

    private var statusText: String {
        switch episode.status {
        case .generating: return "Generating..."
        case .failed: return "Failed"
        case .notGenerated: return "Not generated"
        case .completed: return ""
        }
    }

    private var statusColor: Color {
        switch episode.status {
        case .generating: return .orange
        case .failed: return .red
        case .notGenerated: return Theme.Colors.secondaryText
        case .completed: return .green
        }
    }
}

#Preview {
    ZStack {
        Color.black.ignoresSafeArea()

        VStack(spacing: 12) {
            EpisodeHistoryRow(
                episode: TopicEpisode.preview,
                topicColor: Theme.Colors.accent,
                isCurrentlyPlaying: true,
                onTap: {}
            )

            EpisodeHistoryRow(
                episode: TopicEpisode.preview,
                topicColor: Theme.Colors.accent,
                isCurrentlyPlaying: false,
                onTap: {}
            )
        }
        .padding()
    }
}

// MARK: - Preview Helper

extension TopicEpisode {
    static var preview: TopicEpisode {
        let json = """
        {
            "id": "ai-ml-2025-12-11-en",
            "topicId": "ai-ml",
            "date": "2025-12-11",
            "status": "completed",
            "title": "AI & Machine Learning - December 11",
            "description": "Latest AI news",
            "audioUrl": "https://example.com/audio.mp3",
            "durationSeconds": 180,
            "generatedAt": "2025-12-11T10:00:00Z",
            "playCount": 5,
            "language": "en"
        }
        """.data(using: .utf8)!

        return try! JSONDecoder().decode(TopicEpisode.self, from: json)
    }
}
