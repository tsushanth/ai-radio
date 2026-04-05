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
    @State private var showPlaybackControls = true
    @State private var currentExpansion: TellMeMoreExpansion?
    @State private var isLoadingExpansion = false
    @State private var showQAInput = false
    @State private var showSpeedPaywall = false

    let episode: Episode
    var voiceService = VoiceService.shared
    private let interactionService = PlaybackInteractionService.shared

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

                        // Sleep timer button
                        Menu {
                            if viewModel.sleepTimerRemaining != nil {
                                Button("Cancel Timer", role: .destructive) {
                                    viewModel.cancelSleepTimer()
                                }
                            }
                            Button("5 min") { viewModel.startSleepTimer(minutes: 5) }
                            Button("10 min") { viewModel.startSleepTimer(minutes: 10) }
                            Button("15 min") { viewModel.startSleepTimer(minutes: 15) }
                            Button("30 min") { viewModel.startSleepTimer(minutes: 30) }
                            Button("60 min") { viewModel.startSleepTimer(minutes: 60) }
                        } label: {
                            HStack(spacing: 4) {
                                Image(systemName: "moon.zzz")
                                    .font(.system(size: 14))
                                if let timerText = viewModel.formatSleepTimer() {
                                    Text(timerText)
                                        .font(.system(size: 12, weight: .semibold))
                                }
                            }
                            .foregroundColor(viewModel.sleepTimerRemaining != nil ? Theme.Colors.accent : .white.opacity(0.8))
                            .padding(.horizontal, 10)
                            .padding(.vertical, 6)
                            .background(Color.white.opacity(0.2))
                            .cornerRadius(8)
                        }

                        // Playback speed button
                        Menu {
                            Button("0.5x") { setSpeedIfAllowed(0.5) }
                            Button("0.75x") { setSpeedIfAllowed(0.75) }
                            Button("1.0x") { viewModel.setPlaybackSpeed(1.0) }
                            Button("1.25x") { setSpeedIfAllowed(1.25) }
                            Button("1.5x") { setSpeedIfAllowed(1.5) }
                            Button("2.0x") { setSpeedIfAllowed(2.0) }
                        } label: {
                            Text("\(String(format: "%.2g", viewModel.playbackSpeed))x")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(viewModel.playbackSpeed != 1.0 ? Theme.Colors.accent : .white.opacity(0.8))
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

                    // Skip and Tell Me More controls
                    HStack(spacing: 16) {
                        // Skip button
                        Button(action: handleSkip) {
                            HStack(spacing: 6) {
                                Image(systemName: "forward.fill")
                                    .font(.system(size: 14))
                                Text("Skip")
                                    .font(.system(size: 15, weight: .semibold))
                            }
                            .foregroundColor(.white)
                            .padding(.horizontal, 20)
                            .padding(.vertical, 12)
                            .background(Color.white.opacity(0.2))
                            .cornerRadius(24)
                        }

                        // Tell Me More button
                        Button(action: handleTellMeMore) {
                            HStack(spacing: 6) {
                                if isLoadingExpansion {
                                    ProgressView()
                                        .progressViewStyle(CircularProgressViewStyle(tint: .black))
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
                            .background(Color.white)
                            .cornerRadius(24)
                        }
                        .disabled(isLoadingExpansion)
                    }
                    .padding(.horizontal, 24)

                    // "Tap to ask" button - opens Q&A
                    Button(action: { showQAInput = true }) {
                        HStack(spacing: 8) {
                            Image(systemName: "waveform.circle")
                                .font(.system(size: 20))

                            Text("Tap to ask a question")
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
        .sheet(isPresented: $showQAInput) {
            QAInputView(
                contextType: .topic,
                contextId: episode.id,
                contextTitle: episode.title
            )
            .environment(AudioService.shared)
        }
        .sheet(item: $currentExpansion) { expansion in
            ExpansionSheet(expansion: expansion) {
                currentExpansion = nil
            }
            .environment(AudioService.shared)
        }
        .sheet(isPresented: $showSpeedPaywall) {
            RemotePaywallView(triggerSource: "playback_speed")
        }
    }

    // MARK: - Actions

    /// Only allow non-1.0x speeds for premium users
    private func setSpeedIfAllowed(_ speed: Float) {
        if SubscriptionManager.shared.isSubscribed {
            viewModel.setPlaybackSpeed(speed)
        } else {
            showSpeedPaywall = true
        }
    }

    private func handleSkip() {
        Task {
            await interactionService.recordSkip(
                contextType: episode.showId ?? "topic",
                contextId: episode.id,
                segmentType: nil,
                segmentIndex: viewModel.currentSegmentIndex,
                timestamp: viewModel.currentTime
            )

            // Skip forward to next segment or 30 seconds
            viewModel.skipForward(30)
        }
    }

    private func handleTellMeMore() {
        guard !isLoadingExpansion else { return }

        isLoadingExpansion = true
        viewModel.pause()

        Task {
            let expansion = await interactionService.recordTellMeMore(
                contextType: "topic",
                contextId: episode.id,
                segmentType: nil,
                segmentIndex: viewModel.currentSegmentIndex,
                timestamp: viewModel.currentTime
            )

            await MainActor.run {
                isLoadingExpansion = false
                if let expansion = expansion {
                    currentExpansion = expansion
                } else {
                    // Resume playback if no expansion returned
                    viewModel.play()
                }
            }
        }
    }
}

// MARK: - Expansion Sheet

struct ExpansionSheet: View {
    let expansion: TellMeMoreExpansion
    let onDismiss: () -> Void

    @Environment(AudioService.self) private var audioService

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 20) {
                    // Expanded content
                    Text(expansion.expandedContent)
                        .font(.body)
                        .lineSpacing(6)
                        .foregroundColor(.primary)

                    // Play audio button
                    if let audioUrl = expansion.audioUrl {
                        Button(action: { playExpansionAudio(url: audioUrl) }) {
                            HStack {
                                Image(systemName: "play.circle.fill")
                                    .font(.system(size: 24))

                                VStack(alignment: .leading) {
                                    Text("Listen to Expansion")
                                        .font(.headline)

                                    if let duration = expansion.durationSeconds {
                                        Text("\(duration / 60):\(String(format: "%02d", duration % 60))")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }

                                Spacer()

                                Image(systemName: "chevron.right")
                                    .foregroundColor(.secondary)
                            }
                            .padding()
                            .background(Color(.secondarySystemBackground))
                            .cornerRadius(12)
                        }
                        .buttonStyle(.plain)
                    }

                    // Sources
                    if let sources = expansion.sources, !sources.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Sources")
                                .font(.headline)

                            ForEach(sources) { source in
                                VStack(alignment: .leading, spacing: 4) {
                                    if let urlString = source.url, let url = URL(string: urlString) {
                                        Link(destination: url) {
                                            HStack {
                                                Image(systemName: "link")
                                                    .foregroundColor(.accentColor)
                                                Text(source.title)
                                                    .foregroundColor(.accentColor)
                                            }
                                        }
                                    } else {
                                        Text(source.title)
                                            .font(.subheadline)
                                            .fontWeight(.medium)
                                    }

                                    if let snippet = source.snippet {
                                        Text(snippet)
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }
                                .padding()
                                .frame(maxWidth: .infinity, alignment: .leading)
                                .background(Color(.tertiarySystemBackground))
                                .cornerRadius(8)
                            }
                        }
                    }
                }
                .padding()
            }
            .navigationTitle("More Details")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") { onDismiss() }
                }
            }
        }
    }

    private func playExpansionAudio(url: String) {
        let episode = Episode(
            id: expansion.id,
            userId: "",
            title: "Expanded Content",
            description: expansion.expandedContent.prefix(100) + "...",
            audioUrl: url,
            durationSeconds: expansion.durationSeconds,
            status: .completed,
            errorMessage: nil,
            generatedAt: Date(),
            createdAt: Date(),
            showId: "expansion",
            showName: "Tell Me More",
            imageColor: "#6366F1",
            progress: 0,
            isCompleted: false,
            lastPlayedAt: nil
        )
        audioService.play(episode: episode)
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
