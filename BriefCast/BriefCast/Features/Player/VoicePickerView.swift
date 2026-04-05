//
//  VoicePickerView.swift
//  BriefCast
//
//  Voice selection sheet for changing podcast host voices
//

import SwiftUI

struct VoicePickerView: View {
    @Environment(\.dismiss) private var dismiss
    @Bindable var voiceService: VoiceService

    @Binding var selectedHost1Voice: String?
    @Binding var selectedHost2Voice: String?

    @State private var selectedProvider: TTSProvider = .openai
    @State private var isLoading = false
    @State private var selectedTab: VoiceTab = .pairs
    @State private var showPremiumVoicesPaywall = false

    enum VoiceTab: String, CaseIterable {
        case pairs = "Pairs"
        case individual = "Individual"
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Provider selector
                providerSelector

                // Tab selector
                tabSelector

                // Content
                if isLoading {
                    loadingView
                } else {
                    contentView
                }
            }
            .background(Color(UIColor.systemGroupedBackground))
            .navigationTitle("Voice Settings")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") {
                        dismiss()
                    }
                }
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
        }
        .task {
            await loadVoices()
        }
        .sheet(isPresented: $showPremiumVoicesPaywall) {
            RemotePaywallView(triggerSource: "premium_voices")
        }
    }

    // MARK: - Provider Selector

    private var providerSelector: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 12) {
                ForEach(TTSProvider.allCases, id: \.self) { provider in
                    ProviderChip(
                        provider: provider,
                        isSelected: selectedProvider == provider
                    ) {
                        // Gate ElevenLabs (premium) voices behind subscription
                        if provider == .elevenlabs && !SubscriptionManager.shared.isSubscribed {
                            showPremiumVoicesPaywall = true
                            return
                        }
                        withAnimation(.easeInOut(duration: 0.2)) {
                            selectedProvider = provider
                        }
                        Task {
                            await loadVoices()
                        }
                    }
                }
            }
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
        }
        .background(Color(UIColor.secondarySystemGroupedBackground))
    }

    // MARK: - Tab Selector

    private var tabSelector: some View {
        Picker("Voice Selection", selection: $selectedTab) {
            ForEach(VoiceTab.allCases, id: \.self) { tab in
                Text(tab.rawValue).tag(tab)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
    }

    // MARK: - Content View

    @ViewBuilder
    private var contentView: some View {
        switch selectedTab {
        case .pairs:
            voicePairsView
        case .individual:
            individualVoicesView
        }
    }

    // MARK: - Voice Pairs View

    private var voicePairsView: some View {
        ScrollView {
            LazyVStack(spacing: 12) {
                let filteredPairs = voiceService.voicePairs.filter {
                    $0.provider == selectedProvider.rawValue
                }

                if filteredPairs.isEmpty {
                    emptyStateView(message: "No voice pairs available for \(selectedProvider.displayName)")
                } else {
                    ForEach(filteredPairs) { pair in
                        VoicePairCard(
                            pair: pair,
                            isSelected: selectedHost1Voice == pair.host1.id && selectedHost2Voice == pair.host2.id
                        ) {
                            selectedHost1Voice = pair.host1.id
                            selectedHost2Voice = pair.host2.id
                        }
                    }
                }
            }
            .padding(16)
        }
    }

    // MARK: - Individual Voices View

    private var individualVoicesView: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                // Host 1 selection
                VStack(alignment: .leading, spacing: 8) {
                    Text("Host 1 Voice")
                        .font(.headline)
                        .foregroundColor(.primary)

                    let providerVoices = voiceService.voices(for: selectedProvider)

                    if providerVoices.isEmpty {
                        emptyStateView(message: "No voices available")
                    } else {
                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 10) {
                            ForEach(providerVoices) { voice in
                                VoiceCard(
                                    voice: voice,
                                    isSelected: selectedHost1Voice == voice.id
                                ) {
                                    selectedHost1Voice = voice.id
                                }
                            }
                        }
                    }
                }

                Divider()

                // Host 2 selection
                VStack(alignment: .leading, spacing: 8) {
                    Text("Host 2 Voice")
                        .font(.headline)
                        .foregroundColor(.primary)

                    let providerVoices = voiceService.voices(for: selectedProvider)

                    if providerVoices.isEmpty {
                        emptyStateView(message: "No voices available")
                    } else {
                        LazyVGrid(columns: [
                            GridItem(.flexible()),
                            GridItem(.flexible())
                        ], spacing: 10) {
                            ForEach(providerVoices) { voice in
                                VoiceCard(
                                    voice: voice,
                                    isSelected: selectedHost2Voice == voice.id
                                ) {
                                    selectedHost2Voice = voice.id
                                }
                            }
                        }
                    }
                }
            }
            .padding(16)
        }
    }

    // MARK: - Loading View

    private var loadingView: some View {
        VStack(spacing: 16) {
            ProgressView()
                .scaleEffect(1.2)
            Text("Loading voices...")
                .font(.subheadline)
                .foregroundColor(.secondary)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Empty State

    private func emptyStateView(message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "waveform.slash")
                .font(.system(size: 40))
                .foregroundColor(.secondary)
            Text(message)
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
        }
        .frame(maxWidth: .infinity)
        .padding(.vertical, 40)
    }

    // MARK: - Load Voices

    private func loadVoices() async {
        isLoading = true
        defer { isLoading = false }

        do {
            try await voiceService.fetchVoices(provider: selectedProvider, forceRefresh: true)
            try await voiceService.fetchVoicePairs(provider: selectedProvider)
        } catch {
            print("Failed to load voices: \(error)")
        }
    }
}

// MARK: - Provider Chip

struct ProviderChip: View {
    let provider: TTSProvider
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 6) {
                Image(systemName: provider.icon)
                    .font(.system(size: 14))
                Text(provider.displayName)
                    .font(.system(size: 14, weight: .medium))
            }
            .padding(.horizontal, 14)
            .padding(.vertical, 8)
            .background(isSelected ? Theme.Colors.accent : Color(UIColor.tertiarySystemFill))
            .foregroundColor(isSelected ? .white : .primary)
            .cornerRadius(20)
        }
    }
}

// MARK: - Voice Pair Card

struct VoicePairCard: View {
    let pair: VoicePair
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 12) {
                HStack {
                    Text(pair.name)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(.primary)

                    Spacer()

                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(Theme.Colors.accent)
                    }
                }

                Text(pair.description)
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
                    .lineLimit(2)

                HStack(spacing: 16) {
                    VoiceBadge(voice: pair.host1, label: "Host 1")
                    VoiceBadge(voice: pair.host2, label: "Host 2")
                }
            }
            .padding(16)
            .background(Color(UIColor.secondarySystemGroupedBackground))
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isSelected ? Theme.Colors.accent : Color.clear, lineWidth: 2)
            )
        }
        .buttonStyle(.plain)
    }
}

// MARK: - Voice Badge

struct VoiceBadge: View {
    let voice: Voice
    let label: String

    var body: some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(label)
                .font(.system(size: 11, weight: .medium))
                .foregroundColor(.secondary)
                .textCase(.uppercase)

            HStack(spacing: 4) {
                Image(systemName: voice.genderIcon)
                    .font(.system(size: 12))
                Text(voice.name)
                    .font(.system(size: 13, weight: .medium))
            }
            .foregroundColor(.primary)
        }
    }
}

// MARK: - Voice Card

struct VoiceCard: View {
    let voice: Voice
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(alignment: .leading, spacing: 8) {
                HStack {
                    Image(systemName: voice.genderIcon)
                        .font(.system(size: 14))
                        .foregroundColor(isSelected ? .white : .secondary)

                    Spacer()

                    if isSelected {
                        Image(systemName: "checkmark.circle.fill")
                            .foregroundColor(.white)
                    }
                }

                Text(voice.name)
                    .font(.system(size: 14, weight: .semibold))
                    .foregroundColor(isSelected ? .white : .primary)
                    .lineLimit(1)

                Text(voice.displayGender)
                    .font(.system(size: 12))
                    .foregroundColor(isSelected ? .white.opacity(0.8) : .secondary)

                if let description = voice.description {
                    Text(description)
                        .font(.system(size: 11))
                        .foregroundColor(isSelected ? .white.opacity(0.7) : .secondary)
                        .lineLimit(2)
                }
            }
            .padding(12)
            .frame(maxWidth: .infinity, alignment: .leading)
            .background(isSelected ? Theme.Colors.accent : Color(UIColor.secondarySystemGroupedBackground))
            .cornerRadius(10)
        }
        .buttonStyle(.plain)
    }
}

#Preview {
    VoicePickerView(
        voiceService: VoiceService.shared,
        selectedHost1Voice: .constant("openai:nova"),
        selectedHost2Voice: .constant("openai:onyx")
    )
}
