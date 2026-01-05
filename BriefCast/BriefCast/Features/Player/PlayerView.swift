//
//  PlayerView.swift
//  BriefCast
//
//  Full screen player with live transcript
//

import SwiftUI

struct PlayerView: View {
    @State private var viewModel = PlayerViewModel()
    @Environment(\.dismiss) private var dismiss
    @State private var showTranscript = true
    @State private var showVoicePicker = false
    @State private var selectedHost1Voice: String?
    @State private var selectedHost2Voice: String?

    let episode: Episode
    var voiceService = VoiceService.shared

    var body: some View {
        ZStack {
            // Warm gradient background
            LinearGradient(
                colors: [
                    Color(hex: "#8B4513"),
                    Color(hex: "#D2691E"),
                    Color(hex: "#FF8C00"),
                    Color.black
                ],
                startPoint: .topLeading,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            ScrollView(showsIndicators: false) {
                VStack(spacing: 24) {
                    // Close button
                    HStack {
                        Button(action: { dismiss() }) {
                            Image(systemName: "chevron.down.circle.fill")
                                .font(.system(size: 32))
                                .foregroundColor(.white.opacity(0.8))
                        }

                        Spacer()

                        // Voice picker button
                        Button(action: { showVoicePicker = true }) {
                            HStack(spacing: 4) {
                                Image(systemName: "waveform")
                                    .font(.system(size: 14))
                                Text("Voice")
                                    .font(.system(size: 14, weight: .semibold))
                            }
                            .foregroundColor(.white.opacity(0.8))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.white.opacity(0.2))
                            .cornerRadius(8)
                        }

                        // Playback speed button
                        Menu {
                            Button("1.0x") { viewModel.setPlaybackSpeed(1.0) }
                            Button("1.25x") { viewModel.setPlaybackSpeed(1.25) }
                            Button("1.5x") { viewModel.setPlaybackSpeed(1.5) }
                            Button("2.0x") { viewModel.setPlaybackSpeed(2.0) }
                        } label: {
                            Text("\(String(format: "%.2f", viewModel.playbackSpeed))x")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white.opacity(0.8))
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Color.white.opacity(0.2))
                                .cornerRadius(8)
                        }
                    }
                    .padding(.horizontal, 20)
                    .padding(.top, 16)

                    // Large artwork area
                    RoundedRectangle(cornerRadius: 24)
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
                        .frame(width: 320, height: 320)
                        .overlay(
                            Image(systemName: "waveform.circle.fill")
                                .font(.system(size: 100))
                                .foregroundColor(.white.opacity(0.9))
                        )
                        .shadow(color: Color.black.opacity(0.3), radius: 20, x: 0, y: 10)

                    // Episode title and show name
                    VStack(spacing: 8) {
                        Text(episode.title)
                            .font(.system(size: 24, weight: .bold))
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)

                        Text(episode.description)
                            .font(.system(size: 16, weight: .regular))
                            .foregroundColor(.white.opacity(0.7))
                            .multilineTextAlignment(.center)
                            .lineLimit(2)
                    }
                    .padding(.horizontal, 24)

                    // Progress bar
                    VStack(spacing: 8) {
                        Slider(
                            value: Binding(
                                get: { viewModel.currentTime },
                                set: { viewModel.seek(to: $0) }
                            ),
                            in: 0...max(viewModel.duration, 1)
                        )
                        .tint(Theme.Colors.accent)

                        HStack {
                            Text(viewModel.formatTime(viewModel.currentTime))
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.white.opacity(0.7))

                            Spacer()

                            Text(viewModel.formatTime(viewModel.duration))
                                .font(.system(size: 14, weight: .medium))
                                .foregroundColor(.white.opacity(0.7))
                        }
                    }
                    .padding(.horizontal, 24)

                    // Main playback controls
                    HStack(spacing: 60) {
                        // Skip back 15s
                        Button(action: { viewModel.skipBackward() }) {
                            Image(systemName: "gobackward.15")
                                .font(.system(size: 36, weight: .semibold))
                                .foregroundColor(.white)
                        }

                        // Play/Pause (large, centered)
                        Button(action: { viewModel.togglePlayPause() }) {
                            Image(systemName: viewModel.isPlaying ? "pause.circle.fill" : "play.circle.fill")
                                .font(.system(size: 80))
                                .foregroundColor(Theme.Colors.accent)
                        }
                        .buttonStyle(ScaleButtonStyle())

                        // Skip forward 15s
                        Button(action: { viewModel.skipForward() }) {
                            Image(systemName: "goforward.15")
                                .font(.system(size: 36, weight: .semibold))
                                .foregroundColor(.white)
                        }
                    }
                    .padding(.vertical, 8)

                    // "Tap to ask" button (future feature)
                    Button(action: {
                        print("Tap to ask - voice interaction")
                    }) {
                        HStack(spacing: 8) {
                            Image(systemName: "waveform.circle")
                                .font(.system(size: 20))

                            Text("Tap to ask")
                                .font(.system(size: 16, weight: .semibold))
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(Color.white.opacity(0.15))
                        .cornerRadius(12)
                    }
                    .padding(.horizontal, 24)

                    // Live transcript toggle
                    Button(action: {
                        withAnimation(.spring(response: 0.3)) {
                            showTranscript.toggle()
                        }
                    }) {
                        HStack {
                            Text("Live Transcript")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)

                            Spacer()

                            Image(systemName: showTranscript ? "chevron.up" : "chevron.down")
                                .foregroundColor(.white.opacity(0.7))
                        }
                        .padding(.horizontal, 24)
                        .padding(.vertical, 12)
                    }

                    // Live transcript view
                    if showTranscript {
                        TranscriptView(
                            segments: viewModel.transcript,
                            currentIndex: viewModel.currentSegmentIndex
                        )
                        .frame(height: 200)
                        .padding(.horizontal, 24)
                        .transition(.opacity.combined(with: .move(edge: .top)))
                    }
                }
                .padding(.bottom, 40)
            }
        }
        .onAppear {
            viewModel.loadEpisode(episode)
        }
        .sheet(isPresented: $showVoicePicker) {
            VoicePickerView(
                voiceService: voiceService,
                selectedHost1Voice: $selectedHost1Voice,
                selectedHost2Voice: $selectedHost2Voice
            )
        }
    }
}

// MARK: - Transcript View

struct TranscriptView: View {
    let segments: [TranscriptSegment]
    let currentIndex: Int

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 12) {
                ForEach(Array(segments.enumerated()), id: \.element.id) { index, segment in
                    HStack(alignment: .top, spacing: 8) {
                        // Speaker indicator
                        Circle()
                            .fill(segment.speaker == "host1" ? Color.blue : Color.purple)
                            .frame(width: 8, height: 8)
                            .padding(.top, 6)

                        // Transcript text
                        Text(segment.text)
                            .font(.system(size: 15, weight: index == currentIndex ? .semibold : .regular))
                            .foregroundColor(index == currentIndex ? .white : .white.opacity(0.6))
                            .lineLimit(nil)
                    }
                    .padding(.vertical, 4)
                }
            }
            .padding(16)
        }
        .background(
            RoundedRectangle(cornerRadius: 16)
                .fill(Color.black.opacity(0.3))
        )
    }
}

#Preview {
    PlayerView(episode: .mock)
}
