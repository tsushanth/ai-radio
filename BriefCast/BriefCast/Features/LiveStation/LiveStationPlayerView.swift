//
//  LiveStationPlayerView.swift
//  BriefCast
//
//  Full-screen player view for a live station
//

import SwiftUI

struct LiveStationPlayerView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: LiveStationPlayerViewModel
    @Environment(AudioService.self) private var audioService

    init(station: LiveStation) {
        _viewModel = StateObject(wrappedValue: LiveStationPlayerViewModel(station: station))
    }

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    viewModel.station.swiftUIColor.opacity(0.3),
                    Color(.systemBackground)
                ],
                startPoint: .top,
                endPoint: .center
            )
            .ignoresSafeArea()

            VStack(spacing: 0) {
                // Navigation header
                HStack {
                    Button(action: { dismiss() }) {
                        Image(systemName: "chevron.down")
                            .font(.title2)
                            .foregroundColor(.primary)
                    }

                    Spacer()

                    // Live indicator
                    if viewModel.isLive {
                        HStack(spacing: 6) {
                            Circle()
                                .fill(.red)
                                .frame(width: 8, height: 8)
                                .modifier(PulsingAnimation())

                            Text("LIVE")
                                .font(.subheadline)
                                .fontWeight(.bold)
                                .foregroundColor(.red)
                        }
                    }

                    Spacer()

                    Button(action: viewModel.share) {
                        Image(systemName: "square.and.arrow.up")
                            .font(.title2)
                            .foregroundColor(.primary)
                    }
                }
                .padding()

                Spacer()

                // Station artwork
                ZStack {
                    Circle()
                        .fill(viewModel.station.swiftUIColor.opacity(0.2))
                        .frame(width: 200, height: 200)

                    Circle()
                        .fill(viewModel.station.swiftUIColor.opacity(0.3))
                        .frame(width: 160, height: 160)

                    Image(systemName: viewModel.station.systemImage)
                        .font(.system(size: 60))
                        .foregroundColor(viewModel.station.swiftUIColor)

                    // Radio waves animation
                    if viewModel.isPlaying {
                        ForEach(0..<3) { index in
                            Circle()
                                .stroke(viewModel.station.swiftUIColor.opacity(0.3), lineWidth: 2)
                                .frame(width: 200 + CGFloat(index * 30), height: 200 + CGFloat(index * 30))
                                .modifier(RadioWaveAnimation(delay: Double(index) * 0.3))
                        }
                    }
                }
                .frame(height: 280)

                // Station info
                VStack(spacing: 8) {
                    Text(viewModel.station.name)
                        .font(.title)
                        .fontWeight(.bold)

                    Text(viewModel.station.category.displayName)
                        .font(.subheadline)
                        .foregroundColor(.secondary)

                    if let episode = viewModel.currentEpisode {
                        Text(episode.title)
                            .font(.headline)
                            .foregroundColor(.primary)
                            .multilineTextAlignment(.center)
                            .padding(.top, 8)
                    }
                }
                .padding(.horizontal)

                Spacer()

                // Headlines
                if let episode = viewModel.currentEpisode, !episode.headlines.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Now Covering")
                            .font(.caption)
                            .fontWeight(.semibold)
                            .foregroundColor(.secondary)
                            .textCase(.uppercase)

                        ForEach(episode.headlines.prefix(3), id: \.self) { headline in
                            HStack(alignment: .top, spacing: 8) {
                                Circle()
                                    .fill(viewModel.station.swiftUIColor)
                                    .frame(width: 6, height: 6)
                                    .padding(.top, 6)

                                Text(headline)
                                    .font(.subheadline)
                                    .foregroundColor(.primary)
                                    .lineLimit(2)
                            }
                        }
                    }
                    .padding()
                    .background(Color(.secondarySystemBackground))
                    .cornerRadius(12)
                    .padding(.horizontal)
                }

                Spacer()

                // Player controls
                VStack(spacing: 16) {
                    // Progress (time until next update)
                    HStack {
                        Text(viewModel.station.nextUpdateText)
                            .font(.caption)
                            .foregroundColor(.secondary)

                        Spacer()

                        Text("\(viewModel.station.listenerCount) listening")
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                    .padding(.horizontal)

                    // Play/Pause button
                    HStack(spacing: 40) {
                        // Skip back (refresh)
                        Button(action: viewModel.refresh) {
                            Image(systemName: "arrow.clockwise")
                                .font(.title)
                                .foregroundColor(.primary)
                        }
                        .disabled(viewModel.isLoading)

                        // Play/Pause
                        Button(action: viewModel.togglePlayback) {
                            ZStack {
                                Circle()
                                    .fill(viewModel.station.swiftUIColor)
                                    .frame(width: 72, height: 72)

                                if viewModel.isLoading {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Image(systemName: viewModel.isPlaying ? "pause.fill" : "play.fill")
                                        .font(.title)
                                        .foregroundColor(.white)
                                }
                            }
                        }
                        .disabled(viewModel.currentEpisode == nil && !viewModel.isLoading)

                        // Volume
                        Button(action: {}) {
                            Image(systemName: "speaker.wave.2")
                                .font(.title)
                                .foregroundColor(.primary)
                        }
                    }
                }
                .padding()
                .padding(.bottom, 20)
            }
        }
        .task {
            await viewModel.tuneIn()
        }
        .onChange(of: audioService.isPlaying) { _, isPlaying in
            viewModel.updatePlayingState(isPlaying)
        }
    }
}

// MARK: - Radio Wave Animation

struct RadioWaveAnimation: ViewModifier {
    let delay: Double
    @State private var scale: CGFloat = 1.0
    @State private var opacity: Double = 0.5

    func body(content: Content) -> some View {
        content
            .scaleEffect(scale)
            .opacity(opacity)
            .onAppear {
                withAnimation(.easeOut(duration: 2.0).repeatForever(autoreverses: false).delay(delay)) {
                    scale = 1.5
                    opacity = 0
                }
            }
    }
}

// MARK: - ViewModel

@MainActor
class LiveStationPlayerViewModel: ObservableObject {
    @Published var station: LiveStation
    @Published var currentEpisode: LiveStationEpisode?
    @Published var isPlaying = false
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let liveStationService = LiveStationService.shared
    private let audioService = AudioService.shared

    var isLive: Bool {
        station.isLive
    }

    init(station: LiveStation) {
        self.station = station
        self.currentEpisode = station.currentEpisode
    }

    func tuneIn() async {
        guard currentEpisode == nil else { return }

        isLoading = true
        errorMessage = nil

        do {
            let result = try await liveStationService.tuneIn(stationId: station.id)
            station = result.station
            currentEpisode = result.episode

            // Auto-play
            play()
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func togglePlayback() {
        if isPlaying {
            pause()
        } else {
            play()
        }
    }

    func play() {
        guard let episode = currentEpisode,
              let audioUrl = episode.audioUrl else { return }

        let playableEpisode = Episode(
            id: episode.id,
            userId: "",
            title: episode.title,
            description: episode.description,
            audioUrl: audioUrl,
            durationSeconds: episode.durationSeconds,
            status: .completed,
            errorMessage: nil,
            generatedAt: Date(),
            createdAt: Date(),
            showId: station.id,
            showName: station.name,
            imageColor: station.color,
            progress: 0,
            isCompleted: false,
            lastPlayedAt: nil
        )

        audioService.play(episode: playableEpisode)
        isPlaying = true
    }

    func pause() {
        audioService.pause()
        isPlaying = false
    }

    func refresh() {
        Task {
            isLoading = true
            do {
                station = try await liveStationService.refreshStation(stationId: station.id)
                currentEpisode = station.currentEpisode
                play()
            } catch {
                errorMessage = error.localizedDescription
            }
            isLoading = false
        }
    }

    func updatePlayingState(_ isPlaying: Bool) {
        self.isPlaying = isPlaying
    }

    func share() {
        // Implement share functionality
    }
}

// MARK: - Preview

#Preview {
    LiveStationPlayerView(station: .preview)
        .environment(AudioService.shared)
}
