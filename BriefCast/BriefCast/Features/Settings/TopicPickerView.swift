//
//  TopicPickerView.swift
//  BriefCast
//
//  Multi-select picker over TopicService.cachedTopics. Toggles are persisted
//  through `UserTopicPreferences` so the selection survives navigation +
//  app launches.
//

import SwiftUI

struct TopicPickerView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var topicsData: TopicsData?
    @State private var isLoading = false
    @State private var loadError: String?
    private let prefs = UserTopicPreferences.shared

    var body: some View {
        Group {
            if let data = topicsData, !data.topics.isEmpty {
                topicList(data)
            } else if isLoading {
                ProgressView("Loading topics…")
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            } else if let err = loadError {
                errorState(err)
            } else {
                ProgressView()
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
            }
        }
        .navigationTitle("Briefing Topics")
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Button("Done") { dismiss() }
            }
        }
        .task {
            await loadTopics()
        }
    }

    @ViewBuilder
    private func topicList(_ data: TopicsData) -> some View {
        List {
            Section {
                Text(prefs.isEmpty
                     ? "Pick topics to include in your daily briefing."
                     : "\(prefs.count) topic\(prefs.count == 1 ? "" : "s") selected.")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }

            ForEach(groupedByCategory(data.topics), id: \.category) { group in
                Section(group.category.displayName) {
                    ForEach(group.topics, id: \.id) { topic in
                        row(for: topic)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
    }

    @ViewBuilder
    private func row(for topic: Topic) -> some View {
        Button {
            prefs.toggle(topic.id)
        } label: {
            HStack(spacing: 12) {
                Image(systemName: topic.systemImage)
                    .font(.system(size: 18))
                    .foregroundStyle(topic.swiftUIColor)
                    .frame(width: 28)
                VStack(alignment: .leading, spacing: 2) {
                    Text(topic.name).font(.body).foregroundStyle(.primary)
                    Text(topic.description).font(.caption).foregroundStyle(.secondary).lineLimit(2)
                }
                Spacer()
                if prefs.isSelected(topic.id) {
                    Image(systemName: "checkmark.circle.fill")
                        .foregroundStyle(.tint)
                } else {
                    Image(systemName: "circle")
                        .foregroundStyle(.secondary)
                }
            }
        }
        .buttonStyle(.plain)
    }

    @ViewBuilder
    private func errorState(_ message: String) -> some View {
        VStack(spacing: 12) {
            Image(systemName: "exclamationmark.triangle.fill")
                .font(.largeTitle).foregroundStyle(.orange)
            Text("Couldn't load topics").font(.headline)
            Text(message).font(.caption).foregroundStyle(.secondary)
            Button("Retry") { Task { await loadTopics() } }
                .buttonStyle(.borderedProminent)
        }
        .padding()
        .frame(maxWidth: .infinity, maxHeight: .infinity)
    }

    private struct CategoryGroup {
        let category: TopicCategory
        let topics: [Topic]
    }

    private func groupedByCategory(_ topics: [Topic]) -> [CategoryGroup] {
        let active = topics.filter { $0.isActive }
        let grouped = Dictionary(grouping: active, by: \.category)
        return TopicCategory.allCases.compactMap { cat in
            guard let list = grouped[cat], !list.isEmpty else { return nil }
            return CategoryGroup(category: cat, topics: list.sorted { $0.name < $1.name })
        }
    }

    private func loadTopics() async {
        // Show cache first to feel instant.
        if let cached = TopicService.shared.getCachedTopics() {
            topicsData = cached
        }
        isLoading = topicsData == nil
        loadError = nil
        do {
            let fresh = try await TopicService.shared.fetchTopics()
            topicsData = fresh
            isLoading = false
        } catch {
            isLoading = false
            // Only surface error if we have nothing to show.
            if topicsData == nil {
                loadError = error.localizedDescription
            }
        }
    }
}

#Preview {
    NavigationStack { TopicPickerView() }
}
