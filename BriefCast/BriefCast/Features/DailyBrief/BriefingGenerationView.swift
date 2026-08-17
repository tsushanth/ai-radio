//
//  BriefingGenerationView.swift
//  BriefCast
//
//  Modal shown while DailyBriefingGenerator runs. Reports script fetch +
//  on-device synthesis progress. On success, hands the resulting WAV URL
//  back to the caller via `onCompleted` so it can be queued in the player.
//

import SwiftUI

struct BriefingGenerationView: View {
    @Environment(\.dismiss) private var dismiss
    let onCompleted: (DailyBriefingGenerator.Result) -> Void

    @State private var fraction: Double = 0
    @State private var message: String = "Preparing…"
    @State private var failureMessage: String?
    @State private var isRunning = false
    @State private var task: Task<Void, Never>?

    var body: some View {
        NavigationStack {
            VStack(spacing: 28) {
                Spacer()

                if let err = failureMessage {
                    failureView(err)
                } else {
                    progressView
                }

                Spacer()
            }
            .padding(.horizontal, 32)
            .frame(maxWidth: .infinity, maxHeight: .infinity)
            .navigationTitle("Generating Briefing")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .topBarLeading) {
                    Button("Cancel") {
                        task?.cancel()
                        dismiss()
                    }
                }
            }
        }
        .task { await runOnce() }
    }

    @ViewBuilder
    private var progressView: some View {
        VStack(spacing: 18) {
            Image(systemName: "waveform.circle.fill")
                .resizable()
                .scaledToFit()
                .frame(width: 88, height: 88)
                .foregroundStyle(.tint)
                .symbolEffect(.pulse)
            ProgressView(value: fraction, total: 1.0)
                .progressViewStyle(.linear)
                .tint(.orange)
            Text(message)
                .font(.subheadline)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            Text("\(Int(fraction * 100))%")
                .font(.title3.monospacedDigit())
                .foregroundStyle(.primary)
        }
    }

    @ViewBuilder
    private func failureView(_ message: String) -> some View {
        VStack(spacing: 16) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle).foregroundStyle(.orange)
            Text("Couldn't generate briefing").font(.headline)
            Text(message).font(.footnote).foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
            HStack(spacing: 12) {
                Button("Close") { dismiss() }
                    .buttonStyle(.bordered)
                Button("Retry") {
                    failureMessage = nil
                    fraction = 0
                    Task { await runOnce() }
                }
                .buttonStyle(.borderedProminent)
            }
            .padding(.top, 8)
        }
    }

    private func runOnce() async {
        guard !isRunning else { return }
        isRunning = true
        defer { isRunning = false }

        task = Task { @MainActor in
            do {
                let result = try await DailyBriefingGenerator.shared.generateToday(
                    progress: { snapshot in
                        Task { @MainActor in
                            self.fraction = snapshot.fraction
                            self.message = snapshot.message
                        }
                    }
                )
                onCompleted(result)
                dismiss()
            } catch is CancellationError {
                // User cancelled — modal already dismissed.
            } catch {
                await MainActor.run {
                    failureMessage = error.localizedDescription
                }
            }
        }
        await task?.value
    }
}

#Preview {
    BriefingGenerationView(onCompleted: { _ in })
}
