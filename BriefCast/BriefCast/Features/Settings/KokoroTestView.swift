//
//  KokoroTestView.swift
//  BriefCast
//
//  Debug screen to validate the on-device Kokoro 82M pipeline end-to-end
//  (FluidAudio download → ONNX session load → synth → playback) before
//  wiring it into the production deep-dive / topic flows.
//

import AVFoundation
import SwiftUI

struct KokoroTestView: View {

    @Environment(\.dismiss) private var dismiss
    @ObservedObject private var modelManager = KokoroModelManager.shared

    @State private var selectedVoiceId: String = KokoroVoiceCatalog.entries.first?.id ?? "af_bella"
    @State private var sampleText: String = Self.defaultSampleText
    @State private var ttsState: TtsState = .idle
    @State private var errorMessage: String? = nil
    @State private var player: AVAudioPlayer? = nil
    @State private var generatedFileURL: URL? = nil

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 16) {
                    eligibilityCard
                    modelCard
                    voicePickerCard
                    speakCard
                }
                .padding(16)
            }
            .navigationTitle("On-device test")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Close") { dismiss() }
                }
            }
        }
    }

    // MARK: - Cards

    private var eligibilityCard: some View {
        Card(title: "Device") {
            HStack {
                Image(systemName: KokoroModelManager.isDeviceEligible ? "checkmark.circle.fill" : "xmark.circle.fill")
                    .foregroundColor(KokoroModelManager.isDeviceEligible ? .green : .red)
                Text(KokoroModelManager.isDeviceEligible
                     ? "Eligible (iOS 17+, ≥4 GB RAM)"
                     : "Not eligible — needs iOS 17+ and ≥4 GB RAM")
                    .font(.subheadline)
                Spacer()
            }
        }
    }

    private var modelCard: some View {
        Card(title: "Model") {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: modelStateIcon)
                        .foregroundColor(modelStateColor)
                    Text(modelStateText)
                        .font(.subheadline)
                    Spacer()
                }
                if case .preparing = modelManager.state {
                    ProgressView(value: modelManager.downloadProgress)
                    if !modelManager.phaseDescription.isEmpty {
                        Text(modelManager.phaseDescription)
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                if case .failed(let message) = modelManager.state {
                    Text(message)
                        .font(.caption)
                        .foregroundColor(.red)
                }
                Button(action: downloadTapped) {
                    HStack {
                        Spacer()
                        Text(modelButtonTitle)
                            .fontWeight(.semibold)
                        Spacer()
                    }
                    .padding(.vertical, 12)
                    .background(buttonBackground)
                    .foregroundColor(.white)
                    .cornerRadius(10)
                }
                .disabled(!modelButtonEnabled)
            }
        }
    }

    private var voicePickerCard: some View {
        Card(title: "Voice") {
            VStack(spacing: 4) {
                ForEach(KokoroVoiceCatalog.entries, id: \.id) { entry in
                    Button(action: { selectedVoiceId = entry.id }) {
                        HStack {
                            Image(systemName: selectedVoiceId == entry.id ? "largecircle.fill.circle" : "circle")
                                .foregroundColor(.accentColor)
                            VStack(alignment: .leading, spacing: 2) {
                                Text(entry.displayName).foregroundColor(.primary)
                                Text(entry.language).font(.caption).foregroundColor(.secondary)
                            }
                            Spacer()
                        }
                        .contentShape(Rectangle())
                        .padding(.vertical, 4)
                    }
                }
            }
        }
    }

    private var speakCard: some View {
        Card(title: "Sample text") {
            VStack(spacing: 8) {
                TextEditor(text: $sampleText)
                    .frame(minHeight: 120)
                    .overlay(
                        RoundedRectangle(cornerRadius: 8)
                            .stroke(Color.gray.opacity(0.3), lineWidth: 1)
                    )
                HStack {
                    Image(systemName: ttsStateIcon)
                        .foregroundColor(ttsStateColor)
                    Text(ttsStateText).font(.subheadline)
                    Spacer()
                }
                if let errorMessage {
                    Text(errorMessage).font(.caption).foregroundColor(.red)
                }
                HStack(spacing: 8) {
                    Button(action: speakTapped) {
                        Label("Speak", systemImage: "play.fill").frame(maxWidth: .infinity).padding(.vertical, 10)
                    }
                    .background(speakEnabled ? Color.accentColor : Color.gray.opacity(0.4))
                    .foregroundColor(.white)
                    .cornerRadius(10)
                    .disabled(!speakEnabled)

                    Button(action: stopTapped) {
                        Label("Stop", systemImage: "stop.fill").frame(maxWidth: .infinity).padding(.vertical, 10)
                    }
                    .background(ttsState == .speaking ? Color.red.opacity(0.85) : Color.gray.opacity(0.3))
                    .foregroundColor(.white)
                    .cornerRadius(10)
                    .disabled(ttsState != .speaking)
                }
            }
        }
    }

    // MARK: - Actions

    private func downloadTapped() {
        guard KokoroModelManager.isDeviceEligible else { return }
        Task {
            do {
                try await KokoroPodcastSynthesizer.shared.prepare()
            } catch {
                // KokoroPodcastSynthesizer.prepare() updates KokoroModelManager.shared
                // on failure, so the UI will reflect it via the @ObservedObject.
                // We just log here.
                print("[KokoroTestView] prepare failed: \(error.localizedDescription)")
            }
        }
    }

    private func speakTapped() {
        guard speakEnabled else { return }
        errorMessage = nil
        ttsState = .preparing
        let voiceId = selectedVoiceId
        let text = sampleText
        Task {
            do {
                let result = try await KokoroPodcastSynthesizer.shared.synthesize(
                    segments: [.init(speaker: "host1", text: text)],
                    host1Voice: voiceId,
                    host2Voice: voiceId,
                    speed: 1.0,
                    progress: { _ in /* ignored; KokoroModelManager surfaces progress */ }
                )
                await MainActor.run {
                    self.generatedFileURL = result.fileURL
                    self.playWav(at: result.fileURL)
                }
            } catch {
                await MainActor.run {
                    self.ttsState = .failed
                    self.errorMessage = error.localizedDescription
                }
            }
        }
    }

    private func stopTapped() {
        player?.stop()
        player = nil
        ttsState = .idle
        if let url = generatedFileURL { try? FileManager.default.removeItem(at: url) }
        generatedFileURL = nil
    }

    private func playWav(at url: URL) {
        do {
            try AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
            try AVAudioSession.sharedInstance().setActive(true)
            let p = try AVAudioPlayer(contentsOf: url)
            self.player = p
            p.prepareToPlay()
            p.play()
            ttsState = .speaking
            // No completion delegate wired here — UI returns to .idle when user
            // taps Stop or when the file finishes (we poll briefly).
            pollForCompletion(player: p)
        } catch {
            ttsState = .failed
            errorMessage = "Playback error: \(error.localizedDescription)"
        }
    }

    private func pollForCompletion(player p: AVAudioPlayer) {
        Task {
            while p.isPlaying {
                try? await Task.sleep(nanoseconds: 200_000_000)
            }
            await MainActor.run {
                if self.player === p {
                    self.ttsState = .idle
                    self.player = nil
                    if let url = self.generatedFileURL { try? FileManager.default.removeItem(at: url) }
                    self.generatedFileURL = nil
                }
            }
        }
    }

    // MARK: - State derived

    private var modelStateIcon: String {
        switch modelManager.state {
        case .ready: return "checkmark.circle.fill"
        case .preparing: return "arrow.down.circle.fill"
        case .failed: return "exclamationmark.triangle.fill"
        case .notReady: return "circle"
        }
    }

    private var modelStateColor: Color {
        switch modelManager.state {
        case .ready: return .green
        case .preparing: return .blue
        case .failed: return .red
        case .notReady: return .secondary
        }
    }

    private var modelStateText: String {
        switch modelManager.state {
        case .notReady: return "Not downloaded"
        case .preparing: return "Downloading (\(Int(modelManager.downloadProgress * 100))%)"
        case .ready: return "Ready"
        case .failed(let m): return "Failed — \(m)"
        }
    }

    private var modelButtonTitle: String {
        switch modelManager.state {
        case .ready: return "Ready"
        case .preparing: return "Downloading…"
        case .failed: return "Retry download"
        case .notReady: return "Download model (~250 MB)"
        }
    }

    private var modelButtonEnabled: Bool {
        switch modelManager.state {
        case .preparing, .ready: return false
        default: return KokoroModelManager.isDeviceEligible
        }
    }

    private var buttonBackground: Color {
        modelButtonEnabled ? Color.accentColor : Color.gray.opacity(0.4)
    }

    private var speakEnabled: Bool {
        modelManager.state == .ready
            && ttsState != .speaking
            && !sampleText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
    }

    private var ttsStateIcon: String {
        switch ttsState {
        case .idle: return "circle"
        case .preparing: return "hourglass"
        case .speaking: return "speaker.wave.2.fill"
        case .failed: return "exclamationmark.triangle.fill"
        }
    }

    private var ttsStateColor: Color {
        switch ttsState {
        case .idle: return .secondary
        case .preparing: return .blue
        case .speaking: return .green
        case .failed: return .red
        }
    }

    private var ttsStateText: String {
        switch ttsState {
        case .idle: return "Idle"
        case .preparing: return "Synthesizing on device…"
        case .speaking: return "Playing"
        case .failed: return "Failed"
        }
    }

    private enum TtsState { case idle, preparing, speaking, failed }

    private static let defaultSampleText =
        "On-device Kokoro is ready. Pick a voice and tap speak to hear me synthesize this sentence right on your phone."
}

private struct Card<Content: View>: View {
    let title: String
    @ViewBuilder var content: () -> Content

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text(title).font(.headline)
            content()
        }
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(Color(.secondarySystemBackground))
        .cornerRadius(12)
    }
}
