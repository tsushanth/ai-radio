//
//  QueueView.swift
//  BriefCast
//
//  Queue management view for topic playback
//

import SwiftUI
import Observation

// MARK: - Queued Topic Model

struct QueuedTopic: Codable, Identifiable {
    let id: String
    let name: String
    let color: String
    let icon: String
    let targetDurationMinutes: Int
    let addedAt: Date

    var swiftUIColor: Color {
        Color(hex: color)
    }
}

// MARK: - Queue View Model

@Observable
@MainActor
class QueueViewModel {
    var queuedTopics: [QueuedTopic] = []

    private static let userDefaultsKey = "topicQueue"

    init() {
        loadQueue()
        removeStaleEntries()
    }

    func loadQueue() {
        guard let data = UserDefaults.standard.data(forKey: Self.userDefaultsKey) else {
            queuedTopics = []
            return
        }
        do {
            let decoder = JSONDecoder()
            decoder.dateDecodingStrategy = .iso8601
            queuedTopics = try decoder.decode([QueuedTopic].self, from: data)
        } catch {
            print("Failed to decode queue: \(error)")
            queuedTopics = []
        }
    }

    /// Remove entries older than 24 hours (stale/stuck items)
    private func removeStaleEntries() {
        let cutoff = Date().addingTimeInterval(-86400) // 24 hours ago
        let before = queuedTopics.count
        queuedTopics.removeAll { $0.addedAt < cutoff }
        if queuedTopics.count != before {
            saveQueue()
        }
    }

    func addToQueue(topic: Topic) {
        // Prevent duplicates
        guard !queuedTopics.contains(where: { $0.id == topic.id }) else { return }

        let queued = QueuedTopic(
            id: topic.id,
            name: topic.name,
            color: topic.color,
            icon: topic.icon,
            targetDurationMinutes: topic.targetDurationMinutes,
            addedAt: Date()
        )
        queuedTopics.append(queued)
        saveQueue()
    }

    func removeFromQueue(topicId: String) {
        queuedTopics.removeAll { $0.id == topicId }
        saveQueue()
    }

    func clearQueue() {
        queuedTopics.removeAll()
        saveQueue()
    }

    func moveItem(from source: IndexSet, to destination: Int) {
        queuedTopics.move(fromOffsets: source, toOffset: destination)
        saveQueue()
    }

    private func saveQueue() {
        do {
            let encoder = JSONEncoder()
            encoder.dateEncodingStrategy = .iso8601
            let data = try encoder.encode(queuedTopics)
            UserDefaults.standard.set(data, forKey: Self.userDefaultsKey)
        } catch {
            print("Failed to encode queue: \(error)")
        }
    }
}

// MARK: - Queue View

struct QueueView: View {
    @Bindable var viewModel: QueueViewModel
    var onPlayTopic: ((QueuedTopic) -> Void)?
    var onPlayAll: (([QueuedTopic]) -> Void)?

    @State private var showClearConfirmation = false

    var body: some View {
        ZStack {
            Theme.Colors.background
                .ignoresSafeArea()

            if viewModel.queuedTopics.isEmpty {
                emptyStateView
            } else {
                VStack(spacing: 0) {
                    queueList
                    footerButtons
                }
            }
        }
        .navigationTitle("Your Queue")
        .navigationBarTitleDisplayMode(.large)
        .confirmationDialog(
            "Clear Queue",
            isPresented: $showClearConfirmation,
            titleVisibility: .visible
        ) {
            Button("Clear All", role: .destructive) {
                withAnimation {
                    viewModel.clearQueue()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("This will remove all topics from your queue.")
        }
    }

    // MARK: - Empty State

    private var emptyStateView: some View {
        VStack(spacing: 16) {
            Image(systemName: "list.bullet.rectangle.portrait")
                .font(.system(size: 56))
                .foregroundColor(Theme.Colors.secondaryText.opacity(0.5))

            Text("Your queue is empty")
                .font(.system(size: 20, weight: .semibold))
                .foregroundColor(Theme.Colors.primaryText)

            Text("Add topics from the home screen")
                .font(.system(size: 15))
                .foregroundColor(Theme.Colors.secondaryText)
        }
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    // MARK: - Queue List

    private var queueList: some View {
        List {
            ForEach(Array(viewModel.queuedTopics.enumerated()), id: \.element.id) { index, topic in
                QueueRow(
                    index: index + 1,
                    topic: topic,
                    onPlay: {
                        onPlayTopic?(topic)
                    }
                )
                .listRowBackground(Theme.Colors.background)
                .listRowSeparatorTint(Theme.Colors.secondaryText.opacity(0.2))
            }
            .onDelete { indexSet in
                withAnimation {
                    for index in indexSet {
                        viewModel.removeFromQueue(topicId: viewModel.queuedTopics[index].id)
                    }
                }
            }
            .onMove { source, destination in
                viewModel.moveItem(from: source, to: destination)
            }
        }
        .listStyle(.plain)
        .scrollContentBackground(.hidden)
        .environment(\.editMode, .constant(.active))
    }

    // MARK: - Footer Buttons

    private var footerButtons: some View {
        VStack(spacing: 12) {
            Divider()
                .background(Theme.Colors.secondaryText.opacity(0.2))

            // Total duration summary
            let totalMinutes = viewModel.queuedTopics.reduce(0) { $0 + $1.targetDurationMinutes }
            Text("\(viewModel.queuedTopics.count) topic\(viewModel.queuedTopics.count == 1 ? "" : "s") \u{00B7} \(totalMinutes) min")
                .font(.system(size: 13))
                .foregroundColor(Theme.Colors.secondaryText)

            // Play All
            Button {
                if let first = viewModel.queuedTopics.first {
                    if let onPlayAll {
                        onPlayAll(viewModel.queuedTopics)
                    } else {
                        onPlayTopic?(first)
                    }
                }
            } label: {
                HStack(spacing: 8) {
                    Image(systemName: "play.fill")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Play All")
                        .font(.system(size: 16, weight: .semibold))
                }
                .frame(maxWidth: .infinity)
                .padding(.vertical, 14)
                .background(Theme.Colors.accent)
                .foregroundColor(.white)
                .cornerRadius(12)
            }

            // Clear Queue
            Button {
                showClearConfirmation = true
            } label: {
                Text("Clear Queue")
                    .font(.system(size: 15, weight: .medium))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 10)
            }
        }
        .padding(.horizontal, Theme.Spacing.screenPadding)
        .padding(.bottom, 8)
        .background(Theme.Colors.background)
    }
}

// MARK: - Queue Row

private struct QueueRow: View {
    let index: Int
    let topic: QueuedTopic
    let onPlay: () -> Void

    var body: some View {
        HStack(spacing: 14) {
            // Index number
            Text("\(index)")
                .font(.system(size: 14, weight: .medium).monospacedDigit())
                .foregroundColor(Theme.Colors.secondaryText)
                .frame(width: 22, alignment: .center)

            // Colored circle with topic icon
            ZStack {
                Circle()
                    .fill(topic.swiftUIColor)
                    .frame(width: 44, height: 44)

                Image(systemName: topicIcon(topic.icon))
                    .font(.system(size: 18))
                    .foregroundColor(.white)
            }

            // Topic name and duration
            VStack(alignment: .leading, spacing: 3) {
                Text(topic.name)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(Theme.Colors.primaryText)
                    .lineLimit(1)

                Text("\(topic.targetDurationMinutes) min")
                    .font(.system(size: 13))
                    .foregroundColor(Theme.Colors.secondaryText)
            }

            Spacer()

            // Play button
            Button(action: onPlay) {
                Image(systemName: "play.circle.fill")
                    .font(.system(size: 32))
                    .foregroundColor(Theme.Colors.accent)
            }
            .buttonStyle(.plain)
        }
        .padding(.vertical, 4)
    }

    private func topicIcon(_ icon: String) -> String {
        switch icon.lowercased() {
        case "laptopcomputer", "laptop", "computer":
            return "laptopcomputer"
        case "newspaper", "newspaper.fill":
            return "newspaper"
        case "sportscourt", "sportscourt.fill", "sports":
            return "sportscourt"
        case "building.columns", "building.columns.fill":
            return "building.columns.fill"
        case "globe.americas.fill", "globe":
            return "globe.americas.fill"
        case "brain.head.profile", "brain":
            return "brain.head.profile"
        case "chart.line.uptrend.xyaxis", "chart":
            return "chart.line.uptrend.xyaxis"
        case "dollarsign.circle.fill", "dollar":
            return "dollarsign.circle.fill"
        case "sparkles":
            return "sparkles"
        case "atom":
            return "atom"
        case "heart.fill", "heart":
            return "heart.fill"
        case "gamecontroller.fill", "gamecontroller":
            return "gamecontroller.fill"
        default:
            return "radio"
        }
    }
}

// MARK: - Preview

#Preview {
    NavigationStack {
        QueueView(viewModel: QueueViewModel())
    }
}
