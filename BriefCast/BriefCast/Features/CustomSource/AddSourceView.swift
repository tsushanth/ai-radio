//
//  AddSourceView.swift
//  BriefCast
//
//  View for adding a new custom source
//

import SwiftUI

struct AddSourceView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = AddSourceViewModel()

    var body: some View {
        NavigationStack {
            Form {
                // Source type picker
                Section {
                    ForEach(CustomSourceType.allCases, id: \.self) { type in
                        Button(action: { viewModel.selectedType = type }) {
                            HStack {
                                Image(systemName: type.icon)
                                    .foregroundColor(.accentColor)
                                    .frame(width: 28)

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(type.displayName)
                                        .font(.body)
                                        .foregroundColor(.primary)

                                    Text(type.description)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }

                                Spacer()

                                if viewModel.selectedType == type {
                                    Image(systemName: "checkmark")
                                        .foregroundColor(.accentColor)
                                }
                            }
                        }
                        .buttonStyle(.plain)
                    }
                } header: {
                    Text("Source Type")
                }

                // URL input
                Section {
                    TextField(viewModel.selectedType.placeholder, text: $viewModel.url)
                        .textInputAutocapitalization(.never)
                        .autocorrectionDisabled()
                        .keyboardType(viewModel.selectedType == .newsletter ? .emailAddress : .URL)
                        .onChange(of: viewModel.url) { _, _ in
                            viewModel.validationResult = nil
                        }

                    if viewModel.isValidating {
                        HStack {
                            ProgressView()
                            Text("Validating...")
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }

                    if let result = viewModel.validationResult {
                        if result.isValid {
                            HStack {
                                Image(systemName: "checkmark.circle.fill")
                                    .foregroundColor(.green)
                                VStack(alignment: .leading) {
                                    if let name = result.suggestedName {
                                        Text(name)
                                            .font(.subheadline)
                                    }
                                    if let count = result.itemCount {
                                        Text("\(count) items found")
                                            .font(.caption)
                                            .foregroundColor(.secondary)
                                    }
                                }
                            }
                        } else {
                            HStack {
                                Image(systemName: "xmark.circle.fill")
                                    .foregroundColor(.red)
                                Text(result.error ?? "Invalid source")
                                    .font(.caption)
                                    .foregroundColor(.red)
                            }
                        }
                    }
                } header: {
                    Text("URL")
                } footer: {
                    Text(viewModel.selectedType.description)
                }

                // Custom name (optional)
                Section {
                    TextField("Auto-detect name", text: $viewModel.customName)
                } header: {
                    Text("Name (Optional)")
                } footer: {
                    Text("Leave blank to use the detected name")
                }

                // Add button
                Section {
                    Button(action: {
                        Task { await viewModel.addSource() }
                    }) {
                        HStack {
                            Spacer()
                            if viewModel.isAdding {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Text("Add Source")
                            }
                            Spacer()
                        }
                    }
                    .disabled(!viewModel.canAdd)
                    .listRowBackground(viewModel.canAdd ? Color.accentColor : Color.gray)
                    .foregroundColor(.white)
                }

                // Error message
                if let error = viewModel.errorMessage {
                    Section {
                        Text(error)
                            .font(.caption)
                            .foregroundColor(.red)
                    }
                }
            }
            .navigationTitle("Add Source")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Validate") {
                        Task { await viewModel.validate() }
                    }
                    .disabled(viewModel.url.isEmpty || viewModel.isValidating)
                }
            }
            .onChange(of: viewModel.didAddSource) { _, added in
                if added { dismiss() }
            }
        }
    }
}

// MARK: - ViewModel

@MainActor
class AddSourceViewModel: ObservableObject {
    @Published var selectedType: CustomSourceType = .rss
    @Published var url = ""
    @Published var customName = ""
    @Published var isValidating = false
    @Published var isAdding = false
    @Published var validationResult: CustomSourceValidateData?
    @Published var errorMessage: String?
    @Published var didAddSource = false

    private let sourceService = CustomSourceService.shared

    var canAdd: Bool {
        !url.isEmpty && !isAdding && (validationResult?.isValid ?? false)
    }

    func validate() async {
        guard !url.isEmpty else { return }

        isValidating = true
        errorMessage = nil

        do {
            validationResult = try await sourceService.validateSource(url: url, sourceType: selectedType)
        } catch {
            errorMessage = error.localizedDescription
        }

        isValidating = false
    }

    func addSource() async {
        guard canAdd else { return }

        isAdding = true
        errorMessage = nil

        do {
            let name = customName.isEmpty ? nil : customName
            _ = try await sourceService.addSource(url: url, sourceType: selectedType, name: name)
            didAddSource = true
        } catch {
            errorMessage = error.localizedDescription
        }

        isAdding = false
    }
}

// MARK: - Preview

#Preview {
    AddSourceView()
}
