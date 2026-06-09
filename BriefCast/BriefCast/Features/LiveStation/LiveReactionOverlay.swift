//
//  LiveReactionOverlay.swift
//  BriefCast
//
//  Floating emoji reactions for the live station player.
//  Uses Supabase Realtime broadcast — ephemeral, no DB writes.
//

import SwiftUI
import Supabase

// MARK: - Models

struct FloatingEmoji: Identifiable {
    let id = UUID()
    let emoji: String
    let xFraction: CGFloat   // 0.1 … 0.9
}

struct ChatMessage: Identifiable {
    let id: UUID
    let username: String
    let text: String
    let isRequest: Bool
    let timestamp: Date
}

// MARK: - ViewModel

@MainActor
class LiveReactionViewModel: ObservableObject {
    @Published var floatingEmojis: [FloatingEmoji] = []
    @Published var chatMessages: [ChatMessage] = []

    let emojis = ["🔥", "❤️", "😂", "🎵", "👏", "🤯"]

    private var channel: RealtimeChannelV2?
    private var reactionListenerTask: Task<Void, Never>?
    private var chatListenerTask: Task<Void, Never>?
    private var lastSendTime: Date = .distantPast
    private let rateLimitSeconds: TimeInterval = 0.33   // ~3/sec
    private let maxChatMessages = 50

    // MARK: Lifecycle

    func connect() async {
        NSLog("📡 LiveReaction: connecting to radio:live...")
        let ch = SupabaseManager.shared.client.channel("radio:live") {
            $0.broadcast.receiveOwnBroadcasts = true
        }
        self.channel = ch

        reactionListenerTask = Task { [weak self] in
            NSLog("📡 LiveReaction: listening for reaction broadcasts...")
            for await message in ch.broadcastStream(event: "reaction") {
                guard let self else { return }
                NSLog("📡 LiveReaction: received broadcast: \(message)")
                if case .string(let emoji) = message["emoji"] {
                    Task { await self.showEmoji(emoji) }
                } else if case .object(let payload) = message["payload"],
                          case .string(let emoji) = payload["emoji"] {
                    Task { await self.showEmoji(emoji) }
                }
            }
            NSLog("📡 LiveReaction: reaction broadcast stream ended")
        }

        chatListenerTask = Task { [weak self] in
            NSLog("📡 LiveChat: listening for chat broadcasts...")
            for await message in ch.broadcastStream(event: "chat") {
                guard let self else { return }
                var text = ""
                var username = "Listener"

                // Parse from top-level or nested payload
                if case .string(let t) = message["text"] {
                    text = t
                } else if case .object(let payload) = message["payload"],
                          case .string(let t) = payload["text"] {
                    text = t
                }

                if case .string(let u) = message["username"] {
                    username = u
                } else if case .object(let payload) = message["payload"],
                          case .string(let u) = payload["username"] {
                    username = u
                }

                guard !text.isEmpty else { continue }

                let isRequest = text.range(of: "@audexa", options: .caseInsensitive) != nil
                let chatMsg = ChatMessage(
                    id: UUID(),
                    username: username,
                    text: text,
                    isRequest: isRequest,
                    timestamp: Date()
                )

                Task { @MainActor in
                    self.chatMessages.append(chatMsg)
                    if self.chatMessages.count > self.maxChatMessages {
                        self.chatMessages.removeFirst(self.chatMessages.count - self.maxChatMessages)
                    }
                }
            }
            NSLog("📡 LiveChat: chat broadcast stream ended")
        }

        do {
            await ch.subscribe()
            NSLog("📡 LiveReaction: subscribed successfully, status: \(ch.status)")
        } catch {
            NSLog("📡 LiveReaction: subscribe failed: \(error)")
        }
    }

    func disconnect() async {
        reactionListenerTask?.cancel()
        reactionListenerTask = nil
        chatListenerTask?.cancel()
        chatListenerTask = nil
        await channel?.unsubscribe()
    }

    func send(_ emoji: String, username: String = "Listener") {
        let now = Date()
        guard now.timeIntervalSince(lastSendTime) >= rateLimitSeconds else {
            NSLog("📡 LiveReaction: rate limited")
            return
        }
        lastSendTime = now

        // Show floating emoji immediately (don't wait for broadcast echo)
        Task { await showEmoji(emoji) }

        Task {
            do {
                try await channel?.broadcast(
                    event: "reaction",
                    message: [
                        "emoji": AnyJSON.string(emoji),
                        "username": AnyJSON.string(username)
                    ]
                )
            } catch {
                NSLog("📡 LiveReaction: send failed: \(error)")
            }
        }
    }

    /// Returns nil if clean, or a rejection reason string
    private func moderateMessage(_ text: String) -> String? {
        let lower = text.lowercased()

        // Profanity/slur blocklist (common terms — not exhaustive but catches the worst)
        let blocked = [
            "fuck", "shit", "bitch", "ass hole", "asshole", "nigger", "nigga", "faggot",
            "cunt", "dick", "cock", "pussy", "slut", "whore", "retard", "kys",
            "kill yourself", "rape", "porn", "hentai", "nude"
        ]
        for word in blocked {
            if lower.contains(word) {
                return "Message blocked: inappropriate language"
            }
        }

        // PII detection — phone numbers (7+ consecutive digits)
        let phonePattern = #"\b\d[\d\s\-\(\)]{6,}\d\b"#
        if lower.range(of: phonePattern, options: .regularExpression) != nil {
            return "Message blocked: please don't share phone numbers"
        }

        // Email addresses
        let emailPattern = #"[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}"#
        if lower.range(of: emailPattern, options: .regularExpression) != nil {
            return "Message blocked: please don't share email addresses"
        }

        // SSN pattern
        let ssnPattern = #"\b\d{3}-\d{2}-\d{4}\b"#
        if lower.range(of: ssnPattern, options: .regularExpression) != nil {
            return "Message blocked: please don't share personal ID numbers"
        }

        // Credit card pattern (16 digits with optional separators)
        let ccPattern = #"\b\d{4}[\s\-]?\d{4}[\s\-]?\d{4}[\s\-]?\d{4}\b"#
        if lower.range(of: ccPattern, options: .regularExpression) != nil {
            return "Message blocked: please don't share card numbers"
        }

        return nil
    }

    @Published var moderationError: String?

    func sendChat(_ text: String, username: String) {
        let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmed.isEmpty else { return }

        // Moderate before sending
        if let rejection = moderateMessage(trimmed) {
            NSLog("📡 LiveChat: blocked — \(rejection)")
            moderationError = rejection
            return
        }
        moderationError = nil

        NSLog("📡 LiveChat: sending message...")
        Task {
            do {
                try await channel?.broadcast(
                    event: "chat",
                    message: [
                        "text": AnyJSON.string(trimmed),
                        "username": AnyJSON.string(username)
                    ]
                )
                NSLog("📡 LiveChat: sent message successfully")
            } catch {
                NSLog("📡 LiveChat: send failed: \(error)")
            }

            // If contains @audexa, POST the request topic
            if let range = trimmed.range(of: "@audexa", options: .caseInsensitive) {
                let afterTag = String(trimmed[range.upperBound...])
                    .trimmingCharacters(in: .whitespacesAndNewlines)
                let topic = afterTag.isEmpty ? trimmed : afterTag
                await postRequestTopic(topic, username: username)
            }
        }
    }

    /// Submit a topic to the live queue without going through chat.
    /// Used by the dedicated "Request Topic" button. Same effect as `@audexa`
    /// in chat, but bypasses the chat broadcast.
    func submitTopicRequest(_ topic: String, username: String) async {
        await postRequestTopic(topic, username: username)
    }

    // MARK: Private

    private func postRequestTopic(_ topic: String, username: String) async {
        guard var components = URLComponents(string: "http://178.156.192.31:8081/api/request-topic") else { return }
        components.queryItems = [URLQueryItem(name: "topic", value: topic)]
        guard let url = components.url else { return }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"

        do {
            let (data, response) = try await URLSession.shared.data(for: request)
            if let http = response as? HTTPURLResponse, http.statusCode == 200,
               let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
               let position = json["position"] as? Int,
               let waitMinutes = json["estimated_wait_minutes"] as? Double {
                // Broadcast acknowledgment to all listeners
                try? await channel?.broadcast(
                    event: "chat",
                    message: [
                        "text": AnyJSON.string("🎙️ Request queued: \"\(topic)\" — position #\(position), ~\(Int(waitMinutes)) min wait"),
                        "username": AnyJSON.string("Audexa Radio")
                    ]
                )
                NSLog("📡 LiveChat: request queued at position \(position)")
            } else {
                NSLog("📡 LiveChat: request-topic unexpected response")
            }
        } catch {
            NSLog("📡 LiveChat: request-topic failed: \(error)")
        }
    }

    private func showEmoji(_ emoji: String) async {
        let item = FloatingEmoji(
            emoji: emoji,
            xFraction: CGFloat.random(in: 0.1...0.9)
        )
        floatingEmojis.append(item)

        try? await Task.sleep(nanoseconds: 3_000_000_000)
        floatingEmojis.removeAll { $0.id == item.id }
    }
}

// MARK: - Overlay View

struct LiveReactionOverlay: View {
    @ObservedObject var viewModel: LiveReactionViewModel
    var username: String = "Listener"

    var body: some View {
        VStack {
            Spacer()

            // Non-interactive floating emojis (overlaid but non-blocking)
            ZStack {
                GeometryReader { geo in
                    ForEach(viewModel.floatingEmojis) { item in
                        FloatingEmojiItem(
                            emoji: item.emoji,
                            x: geo.size.width * item.xFraction,
                            startY: geo.size.height * 0.75
                        )
                    }
                }
            }
            .allowsHitTesting(false)
            .frame(height: 200)

            // Emoji picker pill
            HStack(spacing: 18) {
                ForEach(viewModel.emojis, id: \.self) { emoji in
                    Button { viewModel.send(emoji, username: username) } label: {
                        Text(emoji).font(.system(size: 28))
                    }
                    .buttonStyle(EmojiButtonStyle())
                }
            }
            .padding(.horizontal, 24)
            .padding(.vertical, 12)
            .background(.ultraThinMaterial)
            .clipShape(Capsule())
            .padding(.bottom, 12)
        }
    }
}

// MARK: - Floating Emoji Item

private struct FloatingEmojiItem: View {
    let emoji: String
    let x: CGFloat
    let startY: CGFloat

    @State private var yOffset: CGFloat = 0
    @State private var opacity: Double = 1

    var body: some View {
        Text(emoji)
            .font(.system(size: 34))
            .position(x: x, y: startY + yOffset)
            .opacity(opacity)
            .onAppear {
                withAnimation(.easeOut(duration: 2.5)) {
                    yOffset = -190
                }
                withAnimation(.easeIn(duration: 1.0).delay(1.5)) {
                    opacity = 0
                }
            }
    }
}

// MARK: - Emoji Button Style

private struct EmojiButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 1.4 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
    }
}
