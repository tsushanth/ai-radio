//
//  QAInputView.swift
//  BriefCast
//
//  Input view for asking questions about content
//

import SwiftUI

struct QAInputView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel: QAInputViewModel

    let contextType: QAContextType
    let contextId: String
    let contextTitle: String

    init(contextType: QAContextType, contextId: String, contextTitle: String) {
        self.contextType = contextType
        self.contextId = contextId
        self.contextTitle = contextTitle
        _viewModel = StateObject(wrappedValue: QAInputViewModel(
            contextType: contextType,
            contextId: contextId,
            contextTitle: contextTitle
        ))
    }

    var body: some View {
        NavigationStack {
            VStack(spacing: 0) {
                // Context header
                HStack {
                    Image(systemName: contextType.icon)
                        .foregroundColor(.accentColor)

                    Text(contextTitle)
                        .font(.subheadline)
                        .lineLimit(1)

                    Spacer()
                }
                .padding()
                .background(Color(.secondarySystemBackground))

                ScrollView {
                    VStack(alignment: .leading, spacing: 20) {
                        // Messages
                        ForEach(viewModel.messages) { message in
                            QAMessageBubble(message: message)
                        }

                        // Loading indicator
                        if viewModel.isLoading {
                            HStack {
                                Spacer()
                                VStack(spacing: 8) {
                                    ProgressView()
                                    Text(viewModel.state.statusText)
                                        .font(.caption)
                                        .foregroundColor(.secondary)
                                }
                                Spacer()
                            }
                            .padding()
                        }

                        // Suggested questions
                        if viewModel.messages.isEmpty && !viewModel.isLoading {
                            VStack(alignment: .leading, spacing: 12) {
                                Text("Ask a question")
                                    .font(.headline)

                                Text("Get more context about what you just heard")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)

                                ForEach(viewModel.suggestedQuestions) { suggestion in
                                    Button(action: {
                                        viewModel.question = suggestion.text
                                        Task { await viewModel.askQuestion() }
                                    }) {
                                        HStack {
                                            Image(systemName: suggestion.icon)
                                                .foregroundColor(.accentColor)
                                                .frame(width: 24)

                                            Text(suggestion.text)
                                                .font(.subheadline)
                                                .foregroundColor(.primary)

                                            Spacer()

                                            Image(systemName: "arrow.right")
                                                .font(.caption)
                                                .foregroundColor(.secondary)
                                        }
                                        .padding()
                                        .background(Color(.secondarySystemBackground))
                                        .cornerRadius(12)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding()
                        }

                        // Follow-up suggestions
                        if let suggestions = viewModel.followUpSuggestions, !suggestions.isEmpty {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Follow-up questions")
                                    .font(.caption)
                                    .fontWeight(.semibold)
                                    .foregroundColor(.secondary)
                                    .textCase(.uppercase)

                                ForEach(suggestions, id: \.self) { suggestion in
                                    Button(action: {
                                        viewModel.question = suggestion
                                        Task { await viewModel.askQuestion() }
                                    }) {
                                        Text(suggestion)
                                            .font(.subheadline)
                                            .foregroundColor(.accentColor)
                                            .padding(.horizontal, 12)
                                            .padding(.vertical, 8)
                                            .background(Color.accentColor.opacity(0.1))
                                            .cornerRadius(16)
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding()
                        }
                    }
                }

                // Input area
                VStack(spacing: 0) {
                    Divider()

                    HStack(spacing: 12) {
                        TextField("Ask a question...", text: $viewModel.question, axis: .vertical)
                            .textFieldStyle(.plain)
                            .lineLimit(1...4)
                            .padding(.horizontal, 16)
                            .padding(.vertical, 12)
                            .background(Color(.secondarySystemBackground))
                            .cornerRadius(24)

                        Button(action: {
                            Task { await viewModel.askQuestion() }
                        }) {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 32))
                                .foregroundColor(viewModel.canAsk ? .accentColor : .gray)
                        }
                        .disabled(!viewModel.canAsk)
                    }
                    .padding()
                }
            }
            .navigationTitle("Ask a Question")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Close") { dismiss() }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Toggle(isOn: $viewModel.includeAudio) {
                        Image(systemName: viewModel.includeAudio ? "speaker.wave.2.fill" : "speaker.wave.2")
                    }
                    .toggleStyle(.button)
                }
            }
        }
    }
}

// MARK: - Message Bubble

struct QAMessageBubble: View {
    let message: QAMessage
    @EnvironmentObject private var audioService: AudioService

    var body: some View {
        HStack(alignment: .top) {
            if message.isUser {
                Spacer(minLength: 60)
            }

            VStack(alignment: message.isUser ? .trailing : .leading, spacing: 8) {
                // Message content
                Text(message.content)
                    .font(.body)
                    .padding(12)
                    .background(message.isUser ? Color.accentColor : Color(.secondarySystemBackground))
                    .foregroundColor(message.isUser ? .white : .primary)
                    .cornerRadius(16)

                // Audio play button
                if message.hasAudio, let audioUrl = message.audioUrl {
                    Button(action: { playAudio(url: audioUrl) }) {
                        HStack(spacing: 4) {
                            Image(systemName: "play.circle.fill")
                            Text("Play answer")
                                .font(.caption)
                            if let duration = message.formattedDuration, !duration.isEmpty {
                                Text("(\(duration))")
                                    .font(.caption)
                            }
                        }
                        .foregroundColor(.accentColor)
                    }
                }

                // Sources
                if let sources = message.sources, !sources.isEmpty {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Sources")
                            .font(.caption2)
                            .fontWeight(.semibold)
                            .foregroundColor(.secondary)

                        ForEach(sources) { source in
                            if let url = source.url, let sourceUrl = URL(string: url) {
                                Link(destination: sourceUrl) {
                                    HStack(spacing: 4) {
                                        Image(systemName: "link")
                                            .font(.caption2)
                                        Text(source.title)
                                            .font(.caption)
                                            .lineLimit(1)
                                    }
                                    .foregroundColor(.accentColor)
                                }
                            } else {
                                Text(source.title)
                                    .font(.caption)
                                    .foregroundColor(.secondary)
                            }
                        }
                    }
                    .padding(8)
                    .background(Color(.tertiarySystemBackground))
                    .cornerRadius(8)
                }
            }

            if !message.isUser {
                Spacer(minLength: 60)
            }
        }
        .padding(.horizontal)
    }

    private func playAudio(url: String) {
        let episode = Episode(
            id: message.id,
            userId: "",
            title: "Q&A Answer",
            description: message.content,
            audioUrl: url,
            durationSeconds: message.durationSeconds,
            status: .completed,
            errorMessage: nil,
            generatedAt: Date(),
            createdAt: Date(),
            showId: "qa",
            showName: "Q&A",
            imageColor: "#6366F1",
            progress: 0,
            isCompleted: false,
            lastPlayedAt: nil
        )
        audioService.play(episode: episode)
    }
}

// MARK: - ViewModel

@MainActor
class QAInputViewModel: ObservableObject {
    @Published var question = ""
    @Published var messages: [QAMessage] = []
    @Published var state: QAState = .idle
    @Published var includeAudio = false
    @Published var followUpSuggestions: [String]?

    let contextType: QAContextType
    let contextId: String
    let contextTitle: String

    private var sessionId: String?
    private let qaService = QAService.shared

    var suggestedQuestions: [SuggestedQuestion] {
        SuggestedQuestion.forContext(contextType)
    }

    var isLoading: Bool {
        state.isLoading
    }

    var canAsk: Bool {
        !question.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty && !isLoading
    }

    init(contextType: QAContextType, contextId: String, contextTitle: String) {
        self.contextType = contextType
        self.contextId = contextId
        self.contextTitle = contextTitle
    }

    func askQuestion() async {
        let trimmedQuestion = question.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedQuestion.isEmpty else { return }

        state = .asking
        question = ""

        // Add user message immediately
        let userMessage = QAMessage(
            id: "temp-\(Date().timeIntervalSince1970)",
            sessionId: sessionId ?? "",
            role: .user,
            content: trimmedQuestion,
            audioUrl: nil,
            durationSeconds: nil,
            sources: nil,
            createdAt: ISO8601DateFormatter().string(from: Date())
        )
        messages.append(userMessage)

        state = .answering

        do {
            let result = try await qaService.askQuestion(
                question: trimmedQuestion,
                contextType: contextType,
                contextId: contextId,
                sessionId: sessionId,
                includeAudio: includeAudio
            )

            sessionId = result.session.id
            messages = result.session.messages
            followUpSuggestions = result.suggestedQuestions
            state = .ready(result.answer)

        } catch {
            state = .error(error.localizedDescription)
            // Remove the temporary user message on error
            messages.removeLast()
        }
    }
}

// MARK: - Preview

#Preview {
    QAInputView(
        contextType: .topic,
        contextId: "tech-news",
        contextTitle: "Technology News"
    )
    .environmentObject(AudioService.shared)
}
