//
//  DeepDiveInputView.swift
//  BriefCast
//
//  Input view for creating a new Deep Dive research podcast
//

import SwiftUI

struct DeepDiveInputView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var query: String = ""
    @State private var selectedLanguage: SupportedLanguage = .en
    @State private var selectedDuration: Int = 10
    @State private var showLanguagePicker: Bool = false
    @State private var isGenerating: Bool = false
    @State private var generationState: DeepDiveGenerationState = .idle
    @State private var generatedEpisode: DeepDiveEpisode?
    @State private var elapsedSeconds: Int = 0
    @State private var generationStart: Date?
    @FocusState private var isQueryFocused: Bool

    /// Heuristic ETA shown in the progress UI. Deep Dive is now on-device
    /// only — script fetch + Kokoro synthesis runs ~60–120 s on eligible
    /// devices. First-run includes a one-time model download (~250 MB).
    private var etaSecondsEstimate: Int {
        let kokoroReady = KokoroModelManager.shared.state == .ready
        // Cold start adds time for the model download/load on first use.
        return kokoroReady ? 90 : 180
    }

    let onGenerated: (DeepDiveEpisode) -> Void
    let onDismiss: () -> Void
    /// True when the user already has a deep dive in researching/generating state.
    /// When true, this view blocks new submissions and shows a "already running" CTA.
    /// Backend also enforces this via a 409 response.
    let hasInFlightDeepDive: Bool

    init(
        onGenerated: @escaping (DeepDiveEpisode) -> Void,
        onDismiss: @escaping () -> Void,
        hasInFlightDeepDive: Bool = false
    ) {
        self.onGenerated = onGenerated
        self.onDismiss = onDismiss
        self.hasInFlightDeepDive = hasInFlightDeepDive
    }

    private let deepDiveService = DeepDiveService.shared

    // Duration options
    private let durationOptions = [5, 10, 15]

    // Placeholder suggestions
    private let placeholderSuggestions = [
        "The history and future of quantum computing",
        "How does machine learning actually work?",
        "The science behind climate change",
        "Why do we dream?",
        "How the stock market works",
        "The evolution of cryptocurrency"
    ]

    var body: some View {
        NavigationStack {
            ZStack {
                Theme.Colors.background
                    .ignoresSafeArea()

                ScrollView {
                    VStack(spacing: 32) {
                        // Header
                        headerSection

                        // Query input
                        queryInputSection

                        // Suggestions (when query is empty)
                        if query.isEmpty && !isGenerating {
                            suggestionsSection
                        }

                        // Options row
                        optionsSection

                        // Generate button
                        generateButton

                        Spacer(minLength: 100)
                    }
                    .padding(.top, 24)
                }
            }
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: {
                        onDismiss()
                        dismiss()
                    }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(Theme.Colors.primaryText)
                    }
                    .disabled(isGenerating)
                }

                ToolbarItem(placement: .principal) {
                    Text("Deep Dive")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(Theme.Colors.primaryText)
                }
            }
            .sheet(isPresented: $showLanguagePicker) {
                LanguagePickerSheet(
                    selectedLanguage: selectedLanguage,
                    onSelect: { language in
                        selectedLanguage = language
                        showLanguagePicker = false
                    }
                )
                .presentationDetents([.medium])
            }
            .onAppear {
                // Focus the query field after a short delay
                DispatchQueue.main.asyncAfter(deadline: .now() + 0.5) {
                    isQueryFocused = true
                }
            }
        }
    }

    // MARK: - Header Section

    private var headerSection: some View {
        VStack(spacing: 12) {
            // Icon
            ZStack {
                Circle()
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
                    .frame(width: 80, height: 80)

                Image(systemName: "magnifyingglass.circle.fill")
                    .font(.system(size: 40, weight: .medium))
                    .foregroundColor(.white)
            }

            Text("What do you want to learn about?")
                .font(.system(size: 22, weight: .bold))
                .foregroundColor(Theme.Colors.primaryText)
                .multilineTextAlignment(.center)

            Text("Enter any topic and we'll create a research podcast for you")
                .font(.system(size: 14))
                .foregroundColor(Theme.Colors.secondaryText)
                .multilineTextAlignment(.center)
        }
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    // MARK: - Query Input Section

    private var queryInputSection: some View {
        VStack(alignment: .leading, spacing: 8) {
            // Text editor for multi-line input
            ZStack(alignment: .topLeading) {
                if query.isEmpty {
                    Text("e.g., \(placeholderSuggestions.randomElement() ?? "How does AI work?")")
                        .font(.system(size: 16))
                        .foregroundColor(Theme.Colors.secondaryText.opacity(0.5))
                        .padding(.horizontal, 16)
                        .padding(.vertical, 16)
                }

                TextEditor(text: $query)
                    .font(.system(size: 16))
                    .foregroundColor(Theme.Colors.primaryText)
                    .scrollContentBackground(.hidden)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 12)
                    .focused($isQueryFocused)
            }
            .frame(minHeight: 120)
            .background(Theme.Colors.cardBackground)
            .cornerRadius(16)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(
                        isQueryFocused ? Color(hex: DeepDiveEpisode.brandColor) : Color.clear,
                        lineWidth: 2
                    )
            )

            // Character count
            HStack {
                Spacer()
                Text("\(query.count) / 500")
                    .font(.system(size: 12))
                    .foregroundColor(query.count > 500 ? .red : Theme.Colors.secondaryText)
            }
        }
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    // MARK: - Suggestions Section

    private var suggestionsSection: some View {
        VStack(alignment: .leading, spacing: 12) {
            Text("Try asking about...")
                .font(.system(size: 14, weight: .medium))
                .foregroundColor(Theme.Colors.secondaryText)
                .padding(.horizontal, Theme.Spacing.screenPadding)

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 8) {
                    ForEach(placeholderSuggestions, id: \.self) { suggestion in
                        Button(action: {
                            query = suggestion
                            isQueryFocused = false
                        }) {
                            Text(suggestion)
                                .font(.system(size: 13))
                                .foregroundColor(Theme.Colors.primaryText)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 8)
                                .background(Theme.Colors.cardBackground)
                                .cornerRadius(16)
                        }
                    }
                }
                .padding(.horizontal, Theme.Spacing.screenPadding)
            }
        }
    }

    // MARK: - Options Section

    private var optionsSection: some View {
        HStack(spacing: 12) {
            // Language selector
            Button(action: { showLanguagePicker = true }) {
                HStack(spacing: 6) {
                    Text(selectedLanguage.flagEmoji)
                        .font(.system(size: 16))

                    Text(selectedLanguage.displayName)
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.Colors.primaryText)

                    Image(systemName: "chevron.down")
                        .font(.system(size: 10, weight: .medium))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
                .padding(.horizontal, 12)
                .padding(.vertical, 10)
                .background(Theme.Colors.cardBackground)
                .cornerRadius(20)
            }
            .disabled(isGenerating)

            // Duration selector
            HStack(spacing: 4) {
                ForEach(durationOptions, id: \.self) { duration in
                    Button(action: {
                        selectedDuration = duration
                    }) {
                        Text("\(duration) min")
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(
                                selectedDuration == duration
                                    ? .white
                                    : Theme.Colors.primaryText
                            )
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(
                                selectedDuration == duration
                                    ? Color(hex: DeepDiveEpisode.brandColor)
                                    : Theme.Colors.cardBackground
                            )
                            .cornerRadius(16)
                    }
                    .disabled(isGenerating)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    // MARK: - Generate Button

    private var generateButton: some View {
        VStack(spacing: 8) {
            Button(action: generateDeepDive) {
                HStack(spacing: 10) {
                    if isGenerating {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: .white))
                            .scaleEffect(0.9)

                        Text(generationState.progressMessage)
                            .font(.system(size: 16, weight: .semibold))
                    } else {
                        Image(systemName: "wand.and.stars")
                            .font(.system(size: 18, weight: .medium))

                        Text("Generate Deep Dive")
                            .font(.system(size: 16, weight: .semibold))
                    }
                }
                .foregroundColor(.white)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 16)
                .background(
                    isGenerating || !canGenerate
                        ? Color(hex: DeepDiveEpisode.brandColor).opacity(0.5)
                        : Color(hex: DeepDiveEpisode.brandColor)
                )
                .cornerRadius(25)
            }
            .disabled(isGenerating || !canGenerate)

            if isGenerating {
                Text(progressLabel)
                    .font(.system(size: 12, weight: .medium))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .monospacedDigit()
            }
        }
        .padding(.horizontal, Theme.Spacing.screenPadding)
    }

    private var progressLabel: String {
        let eta = etaSecondsEstimate
        let elapsedMin = elapsedSeconds / 60
        let elapsedSec = elapsedSeconds % 60
        let elapsedStr = elapsedMin > 0
            ? "\(elapsedMin)m \(elapsedSec)s"
            : "\(elapsedSec)s"
        let remaining = max(eta - elapsedSeconds, 0)
        let remainingStr = remaining > 60 ? "~\(remaining/60)m" : "~\(remaining)s"
        let kokoroReady = KokoroModelManager.shared.state == .ready
        let path = (kokoroReady && selectedLanguage.rawValue.hasPrefix("en"))
            ? "on-device"
            : "cloud"
        return "\(elapsedStr) elapsed • \(remainingStr) left • \(path)"
    }

    // MARK: - Computed Properties

    private var canGenerate: Bool {
        !query.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty
            && query.count <= 500
            && !hasInFlightDeepDive
    }

    // MARK: - Actions

    private func generateDeepDive() {
        guard canGenerate else { return }

        // Optimistic dismiss: create a placeholder on the client immediately
        // so it appears in the home list right away, then let the network
        // call finish in the background. The placeholder is replaced when
        // the real episode lands (via .deepDiveListChanged notification).
        let placeholder = deepDiveService.startBackgroundGeneration(
            query: query.trimmingCharacters(in: .whitespacesAndNewlines),
            language: selectedLanguage.rawValue,
            targetDurationMinutes: selectedDuration
        )
        onGenerated(placeholder)
        dismiss()
    }
}

// MARK: - Preview

#Preview {
    DeepDiveInputView(
        onGenerated: { _ in },
        onDismiss: {}
    )
}
