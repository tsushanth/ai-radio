//
//  DeepDiveDetailView.swift
//  BriefCast
//
//  Detail view for a Deep Dive episode with player controls and sources
//

import SwiftUI

struct DeepDiveDetailView: View {
    let initialDeepDive: DeepDiveEpisode
    let onDismiss: () -> Void

    @State private var viewModel: DeepDiveDetailViewModel
    @State private var playbackTimer: Timer?

    init(deepDive: DeepDiveEpisode, onDismiss: @escaping () -> Void) {
        self.initialDeepDive = deepDive
        self.onDismiss = onDismiss
        self._viewModel = State(initialValue: DeepDiveDetailViewModel(deepDive: deepDive))
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header with query
                    headerSection

                    // Status/Player section
                    if viewModel.deepDive.status.isInProgress || viewModel.isRegenerating {
                        generatingView
                    } else if viewModel.canPlay {
                        playerControls
                    } else if viewModel.deepDive.status == .failed {
                        errorView
                    }

                    // Regenerate button (when not generating)
                    if viewModel.canPlay && !viewModel.isRegenerating {
                        regenerateButton
                    }

                    // Sources section
                    if !viewModel.deepDive.sources.isEmpty {
                        sourcesSection
                    }

                    Spacer(minLength: 100)
                }
                .padding(.top, 16)
            }
            .background(Theme.Colors.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: onDismiss) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(Theme.Colors.primaryText)
                    }
                }

                ToolbarItem(placement: .principal) {
                    Text("Deep Dive")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(Theme.Colors.primaryText)
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    // Share button
                    Button(action: shareDeepDive) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(Theme.Colors.primaryText)
                    }
                }
            }
        }
        .onAppear {
            startPlaybackTimer()
        }
        .onDisappear {
            stopPlaybackTimer()
        }
    }

    // MARK: - Playback Timer

    private func startPlaybackTimer() {
        playbackTimer?.invalidate()
        playbackTimer = Timer.scheduledTimer(withTimeInterval: 0.5, repeats: true) { [viewModel] _ in
            Task { @MainActor in
                viewModel.syncPlaybackState()
            }
        }
    }

    private func stopPlaybackTimer() {
        playbackTimer?.invalidate()
        playbackTimer = nil
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 16) {
            // Icon with gradient background
            ZStack {
                RoundedRectangle(cornerRadius: 24)
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
                    .frame(width: 160, height: 160)

                Image(systemName: "magnifyingglass.circle.fill")
                    .font(.system(size: 64, weight: .medium))
                    .foregroundColor(.white)
            }

            // Query/Title
            VStack(spacing: 8) {
                Text(viewModel.deepDive.title)
                    .font(.system(size: 20, weight: .bold))
                    .foregroundColor(Theme.Colors.primaryText)
                    .multilineTextAlignment(.center)

                Text("\"\(viewModel.deepDive.query)\"")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .italic()

                HStack(spacing: 8) {
                    if viewModel.deepDive.status == .completed {
                        Text(viewModel.deepDive.formattedDate)
                            .font(.system(size: 13))
                            .foregroundColor(Theme.Colors.secondaryText)

                        if let _ = viewModel.deepDive.durationSeconds {
                            Text("•")
                                .foregroundColor(Theme.Colors.secondaryText)

                            Text(viewModel.deepDive.formattedDuration)
                                .font(.system(size: 13, weight: .medium))
                                .foregroundColor(Color(hex: DeepDiveEpisode.brandColor))
                        }
                    }
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    // MARK: - Player Controls

    private var playerControls: some View {
        VStack(spacing: 16) {
            // Progress slider
            VStack(spacing: 4) {
                Slider(
                    value: Binding(
                        get: { viewModel.currentTime },
                        set: { viewModel.seek(to: $0) }
                    ),
                    in: 0...max(viewModel.duration, 1)
                )
                .tint(Color(hex: DeepDiveEpisode.brandColor))

                HStack {
                    Text(viewModel.formattedCurrentTime)
                        .font(.system(size: 12))
                        .foregroundColor(Theme.Colors.secondaryText)

                    Spacer()

                    Text(viewModel.formattedDuration)
                        .font(.system(size: 12))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
            }

            // Control buttons
            HStack(spacing: 32) {
                // Skip backward
                Button(action: { viewModel.skipBackward() }) {
                    Image(systemName: "gobackward.15")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundColor(Theme.Colors.primaryText)
                }

                // Play/Pause — locks out while the on-device synth is
                // preparing audio so rapid taps don't re-enter the pipeline.
                // During prep, the button becomes a circular progress ring
                // with the live percentage so users see actual movement
                // instead of a blank spinner for the 60–180s wait.
                Button(action: { viewModel.togglePlayPause() }) {
                    ZStack {
                        Circle()
                            .fill(Color(hex: DeepDiveEpisode.brandColor)
                                .opacity(viewModel.isPreparingPlayback ? 0.5 : 1))
                            .frame(width: 64, height: 64)

                        if viewModel.isPreparingPlayback {
                            // Progress ring around the button perimeter
                            Circle()
                                .stroke(Color.white.opacity(0.25), lineWidth: 3)
                                .frame(width: 60, height: 60)
                            Circle()
                                .trim(from: 0, to: max(0.02, viewModel.synthProgress))
                                .stroke(Color.white, style: StrokeStyle(lineWidth: 3, lineCap: .round))
                                .frame(width: 60, height: 60)
                                .rotationEffect(.degrees(-90))
                                .animation(.easeInOut(duration: 0.25), value: viewModel.synthProgress)
                            Text("\(Int(viewModel.synthProgress * 100))%")
                                .font(.system(size: 13, weight: .bold).monospacedDigit())
                                .foregroundColor(.white)
                        } else {
                            Image(systemName: viewModel.isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: 28, weight: .medium))
                                .foregroundColor(.white)
                                .offset(x: viewModel.isPlaying ? 0 : 2) // Center play icon
                        }
                    }
                }
                .disabled(viewModel.isPreparingPlayback)

                // Skip forward
                Button(action: { viewModel.skipForward() }) {
                    Image(systemName: "goforward.15")
                        .font(.system(size: 28, weight: .medium))
                        .foregroundColor(Theme.Colors.primaryText)
                }
            }

            // Synth phase label — visible only during on-device prep so
            // users see textual status ("Synthesizing segment 3 of 14…")
            // alongside the percentage on the play button.
            if viewModel.isPreparingPlayback && !viewModel.synthMessage.isEmpty {
                Text(viewModel.synthMessage)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .lineLimit(1)
                    .padding(.top, 4)
            }
        }
        .padding(.horizontal, Theme.Spacing.screenPadding)
        .padding(.vertical, 16)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(16)
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    // MARK: - Generating View

    private var generatingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .progressViewStyle(CircularProgressViewStyle(tint: Color(hex: DeepDiveEpisode.brandColor)))
                .scaleEffect(1.5)

            Text(viewModel.isRegenerating ? "Regenerating..." : viewModel.deepDive.status.displayText)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.Colors.primaryText)

            Text("This may take a few minutes")
                .font(.system(size: 14))
                .foregroundColor(Theme.Colors.secondaryText)
        }
        .padding(.vertical, 40)
        .frame(maxWidth: .infinity)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(16)
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    // MARK: - Error View

    private var errorView: some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.system(size: 40))
                .foregroundColor(.orange)

            Text("Generation Failed")
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.Colors.primaryText)

            if let error = viewModel.deepDive.errorMessage {
                Text(error)
                    .font(.system(size: 14))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
            }

            Button(action: {
                Task {
                    await viewModel.regenerate()
                }
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise")
                    Text("Try Again")
                }
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(.white)
                .padding(.horizontal, 20)
                .padding(.vertical, 10)
                .background(Color(hex: DeepDiveEpisode.brandColor))
                .cornerRadius(20)
            }
            .padding(.top, 8)
        }
        .padding(.vertical, 32)
        .frame(maxWidth: .infinity)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(16)
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    // MARK: - Regenerate Button

    private var regenerateButton: some View {
        VStack(spacing: 8) {
            Button(action: {
                Task {
                    await viewModel.regenerate()
                }
            }) {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 14, weight: .medium))

                    Text("Regenerate")
                        .font(.system(size: 14, weight: .medium))
                }
                .foregroundColor(Theme.Colors.secondaryText)
                .padding(.horizontal, 16)
                .padding(.vertical, 10)
                .background(Theme.Colors.cardBackground)
                .cornerRadius(20)
            }

            Text("Generate a fresh take on this topic")
                .font(.system(size: 12))
                .foregroundColor(Theme.Colors.secondaryText.opacity(0.7))
        }
    }

    // MARK: - Sources Section

    private var sourcesSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Button(action: {
                withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                    viewModel.showSources.toggle()
                }
            }) {
                HStack {
                    Text("Sources (\(viewModel.deepDive.sources.count))")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(Theme.Colors.primaryText)

                    Spacer()

                    Image(systemName: viewModel.showSources ? "chevron.up" : "chevron.down")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
            }
            .padding(.horizontal, Theme.Spacing.screenPadding)

            if viewModel.showSources {
                VStack(spacing: 8) {
                    ForEach(viewModel.deepDive.sources) { source in
                        SourceCitationRow(source: source)
                    }
                }
                .padding(.horizontal, Theme.Spacing.screenPadding)
                .transition(.opacity.combined(with: .move(edge: .top)))
            }
        }
    }

    // MARK: - Actions

    private func shareDeepDive() {
        let text = "Check out this Deep Dive: \"\(viewModel.deepDive.query)\" - Generated by Audexa"
        let activityController = UIActivityViewController(activityItems: [text], applicationActivities: nil)

        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootViewController = windowScene.windows.first?.rootViewController {
            rootViewController.present(activityController, animated: true)
        }
    }
}

// MARK: - Source Citation Row

struct SourceCitationRow: View {
    let source: DeepDiveSource

    var body: some View {
        Button(action: openSource) {
            HStack(alignment: .top, spacing: 12) {
                // Domain icon
                ZStack {
                    RoundedRectangle(cornerRadius: 8)
                        .fill(Theme.Colors.cardBackground)
                        .frame(width: 40, height: 40)

                    Image(systemName: "link")
                        .font(.system(size: 16))
                        .foregroundColor(Color(hex: DeepDiveEpisode.brandColor))
                }

                VStack(alignment: .leading, spacing: 4) {
                    Text(source.title)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.Colors.primaryText)
                        .lineLimit(2)
                        .multilineTextAlignment(.leading)

                    Text(source.domain)
                        .font(.system(size: 12))
                        .foregroundColor(Color(hex: DeepDiveEpisode.brandColor))

                    if let snippet = source.snippet, !snippet.isEmpty {
                        Text(snippet)
                            .font(.system(size: 12))
                            .foregroundColor(Theme.Colors.secondaryText)
                            .lineLimit(2)
                            .multilineTextAlignment(.leading)
                    }
                }

                Spacer()

                Image(systemName: "arrow.up.right")
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.Colors.secondaryText)
            }
            .padding(12)
            .background(Theme.Colors.cardBackground)
            .cornerRadius(12)
        }
        .buttonStyle(PlainButtonStyle())
    }

    private func openSource() {
        if let url = URL(string: source.url) {
            UIApplication.shared.open(url)
        }
    }
}

// MARK: - Preview

#Preview {
    DeepDiveDetailView(
        deepDive: DeepDiveEpisode.preview,
        onDismiss: {}
    )
}
