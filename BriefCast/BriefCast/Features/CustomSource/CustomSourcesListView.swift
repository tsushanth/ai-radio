//
//  CustomSourcesListView.swift
//  BriefCast
//
//  List view for managing custom sources
//

import SwiftUI

struct CustomSourcesListView: View {
    @StateObject private var viewModel = CustomSourcesListViewModel()
    @State private var showAddSource = false

    var body: some View {
        NavigationStack {
            Group {
                if viewModel.sources.isEmpty && !viewModel.isLoading {
                    emptyState
                } else {
                    sourcesList
                }
            }
            .navigationTitle("My Sources")
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button(action: { showAddSource = true }) {
                        Image(systemName: "plus")
                    }
                }
            }
            .sheet(isPresented: $showAddSource) {
                AddSourceView()
            }
            .onChange(of: showAddSource) { _, isPresented in
                if !isPresented {
                    Task { await viewModel.loadSources() }
                }
            }
            .task {
                await viewModel.loadSources()
            }
            .refreshable {
                await viewModel.loadSources()
            }
        }
    }

    // MARK: - Empty State

    private var emptyState: some View {
        VStack(spacing: 20) {
            Image(systemName: "plus.rectangle.on.folder")
                .font(.system(size: 60))
                .foregroundColor(.secondary)

            Text("No Custom Sources")
                .font(.title2)
                .fontWeight(.semibold)

            Text("Add RSS feeds, newsletters, or websites to include their content in your daily brief.")
                .font(.subheadline)
                .foregroundColor(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 40)

            Button(action: { showAddSource = true }) {
                Label("Add Your First Source", systemImage: "plus")
                    .padding(.horizontal, 20)
                    .padding(.vertical, 12)
            }
            .buttonStyle(.borderedProminent)
        }
    }

    // MARK: - Sources List

    private var sourcesList: some View {
        List {
            ForEach(viewModel.sources) { source in
                NavigationLink(destination: CustomSourceDetailView(source: source)) {
                    SourceRow(source: source)
                }
                .swipeActions(edge: .trailing, allowsFullSwipe: true) {
                    Button(role: .destructive) {
                        Task { await viewModel.deleteSource(source) }
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }

                    Button {
                        Task { await viewModel.toggleSource(source) }
                    } label: {
                        Label(
                            source.isActive ? "Pause" : "Resume",
                            systemImage: source.isActive ? "pause" : "play"
                        )
                    }
                    .tint(.orange)
                }
                .swipeActions(edge: .leading) {
                    Button {
                        Task { await viewModel.refreshSource(source) }
                    } label: {
                        Label("Refresh", systemImage: "arrow.clockwise")
                    }
                    .tint(.blue)
                }
            }
        }
        .listStyle(.insetGrouped)
        .overlay {
            if viewModel.isLoading && viewModel.sources.isEmpty {
                ProgressView()
            }
        }
    }
}

// MARK: - Source Row

struct SourceRow: View {
    let source: CustomSource

    var body: some View {
        HStack(spacing: 12) {
            // Icon
            ZStack {
                RoundedRectangle(cornerRadius: 10)
                    .fill(source.swiftUIColor.opacity(0.2))
                    .frame(width: 44, height: 44)

                Image(systemName: source.systemImage)
                    .font(.system(size: 18))
                    .foregroundColor(source.swiftUIColor)
            }

            // Info
            VStack(alignment: .leading, spacing: 4) {
                HStack {
                    Text(source.name)
                        .font(.headline)
                        .lineLimit(1)

                    if !source.isActive {
                        Text("Paused")
                            .font(.caption2)
                            .foregroundColor(.orange)
                            .padding(.horizontal, 6)
                            .padding(.vertical, 2)
                            .background(Color.orange.opacity(0.2))
                            .cornerRadius(4)
                    }
                }

                HStack {
                    Text(source.sourceType.displayName)
                        .font(.caption)
                        .foregroundColor(.secondary)

                    Text("·")
                        .foregroundColor(.secondary)

                    Text("\(source.itemCount) items")
                        .font(.caption)
                        .foregroundColor(.secondary)
                }

                Text(source.formattedLastFetch)
                    .font(.caption2)
                    .foregroundColor(.tertiary)
            }

            Spacer()

            // Status indicator
            statusIndicator
        }
        .padding(.vertical, 4)
    }

    @ViewBuilder
    private var statusIndicator: some View {
        switch source.status {
        case .active:
            Circle()
                .fill(.green)
                .frame(width: 8, height: 8)
        case .paused:
            Circle()
                .fill(.orange)
                .frame(width: 8, height: 8)
        case .error:
            Image(systemName: "exclamationmark.triangle.fill")
                .foregroundColor(.red)
                .font(.caption)
        case .pending:
            ProgressView()
                .scaleEffect(0.7)
        }
    }
}

// MARK: - ViewModel

@MainActor
class CustomSourcesListViewModel: ObservableObject {
    @Published var sources: [CustomSource] = []
    @Published var isLoading = false
    @Published var errorMessage: String?

    private let sourceService = CustomSourceService.shared

    func loadSources() async {
        isLoading = true

        do {
            sources = try await sourceService.fetchSourcesWithCache { cached in
                self.sources = cached
            }
        } catch {
            errorMessage = error.localizedDescription
        }

        isLoading = false
    }

    func deleteSource(_ source: CustomSource) async {
        do {
            try await sourceService.deleteSource(sourceId: source.id)
            sources.removeAll { $0.id == source.id }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func toggleSource(_ source: CustomSource) async {
        do {
            let updated = try await sourceService.toggleSource(sourceId: source.id, isActive: !source.isActive)
            if let index = sources.firstIndex(where: { $0.id == source.id }) {
                sources[index] = updated
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func refreshSource(_ source: CustomSource) async {
        do {
            let result = try await sourceService.refreshSource(sourceId: source.id)
            if let index = sources.firstIndex(where: { $0.id == source.id }) {
                sources[index] = result.source
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

// MARK: - Source Detail View (Placeholder)

struct CustomSourceDetailView: View {
    let source: CustomSource
    @StateObject private var viewModel: CustomSourceDetailViewModel

    init(source: CustomSource) {
        self.source = source
        _viewModel = StateObject(wrappedValue: CustomSourceDetailViewModel(source: source))
    }

    var body: some View {
        List {
            // Source info section
            Section {
                HStack {
                    Text("Type")
                    Spacer()
                    Text(source.sourceType.displayName)
                        .foregroundColor(.secondary)
                }

                HStack {
                    Text("Status")
                    Spacer()
                    Text(source.status.displayText)
                        .foregroundColor(source.status.color)
                }

                HStack {
                    Text("Last Updated")
                    Spacer()
                    Text(source.formattedLastFetch)
                        .foregroundColor(.secondary)
                }

                HStack {
                    Text("Items")
                    Spacer()
                    Text("\(source.itemCount)")
                        .foregroundColor(.secondary)
                }
            } header: {
                Text("Source Info")
            }

            // Items section
            Section {
                if viewModel.isLoading {
                    HStack {
                        Spacer()
                        ProgressView()
                        Spacer()
                    }
                } else if viewModel.items.isEmpty {
                    Text("No items yet")
                        .foregroundColor(.secondary)
                } else {
                    ForEach(viewModel.items) { item in
                        VStack(alignment: .leading, spacing: 4) {
                            Text(item.title)
                                .font(.subheadline)
                                .lineLimit(2)

                            if let author = item.author {
                                Text(author)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }

                            Text(item.formattedDate)
                                .font(.caption2)
                                .foregroundColor(.tertiary)
                        }
                        .padding(.vertical, 4)
                    }
                }
            } header: {
                Text("Recent Items")
            }
        }
        .navigationTitle(source.name)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItem(placement: .navigationBarTrailing) {
                Button(action: {
                    Task { await viewModel.refresh() }
                }) {
                    Image(systemName: "arrow.clockwise")
                }
            }
        }
        .task {
            await viewModel.loadItems()
        }
    }
}

// MARK: - Detail ViewModel

@MainActor
class CustomSourceDetailViewModel: ObservableObject {
    @Published var items: [CustomSourceItem] = []
    @Published var isLoading = false

    let source: CustomSource
    private let sourceService = CustomSourceService.shared

    init(source: CustomSource) {
        self.source = source
    }

    func loadItems() async {
        isLoading = true

        do {
            let detail = try await sourceService.getSourceDetail(sourceId: source.id)
            items = detail.items
        } catch {
            print("Failed to load items: \(error)")
        }

        isLoading = false
    }

    func refresh() async {
        isLoading = true

        do {
            _ = try await sourceService.refreshSource(sourceId: source.id)
            await loadItems()
        } catch {
            print("Failed to refresh: \(error)")
        }

        isLoading = false
    }
}

// MARK: - Preview

#Preview {
    CustomSourcesListView()
}
