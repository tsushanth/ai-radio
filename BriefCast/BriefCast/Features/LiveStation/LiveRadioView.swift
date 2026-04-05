import SwiftUI
import Supabase

// MARK: - Queue Models & Service

struct RadioQueueSegment: Identifiable, Decodable, Equatable {
    var id: String { filename }
    let filename: String
    let segment_type: String
    let topic_name: String
    let created_at: String

    var segmentLabel: String {
        switch segment_type {
        case "headlines": return "Headlines"
        case "deep_dive": return "Deep Dive"
        case "listener_request": return "Request"
        default: return segment_type.replacingOccurrences(of: "_", with: " ").capitalized
        }
    }

    var badgeColor: Color {
        switch segment_type {
        case "headlines": return .blue
        case "deep_dive": return .purple
        case "listener_request": return .orange
        default: return .gray
        }
    }
}

struct NowPlaying: Decodable {
    let source: String?
    let topic_name: String?
    let segment_type: String?
    let track: String?
    let remaining_seconds: Double?
}

private struct RadioStatusResponse: Decodable {
    let ready_queue: [RadioQueueSegment]
    let now_playing: NowPlaying?
}

@MainActor
final class RadioQueueService: ObservableObject {
    @Published var queue: [RadioQueueSegment] = []
    @Published var nowPlaying: NowPlaying?
    @Published var isLoading = false

    private var pollTimer: Timer?

    /// Language code to filter queue by (e.g. "en", "fr", "es")
    var languageCode: String = "en"

    private var statusURL: URL {
        URL(string: "http://178.156.192.31:8081/api/status?lang=\(languageCode)")!
    }

    func startPolling() {
        fetchQueue()
        pollTimer = Timer.scheduledTimer(withTimeInterval: 10, repeats: true) { [weak self] _ in
            Task { @MainActor [weak self] in
                self?.fetchQueue()
            }
        }
    }

    func stopPolling() {
        pollTimer?.invalidate()
        pollTimer = nil
    }

    private func fetchQueue() {
        isLoading = queue.isEmpty
        let langPrefix = "[\(languageCode)] "
        Task {
            do {
                let (data, _) = try await URLSession.shared.data(from: statusURL)
                let response = try JSONDecoder().decode(RadioStatusResponse.self, from: data)
                withAnimation(.easeInOut(duration: 0.3)) {
                    // Filter to current language and strip the tag prefix
                    self.queue = response.ready_queue
                        .filter { $0.topic_name.hasPrefix(langPrefix) || (!$0.topic_name.hasPrefix("[") && self.languageCode == "en") }
                        .map { seg in
                            var s = seg
                            if s.topic_name.hasPrefix(langPrefix) {
                                s = RadioQueueSegment(
                                    filename: seg.filename,
                                    segment_type: seg.segment_type,
                                    topic_name: String(seg.topic_name.dropFirst(langPrefix.count)),
                                    created_at: seg.created_at
                                )
                            }
                            return s
                        }
                    self.nowPlaying = response.now_playing
                }
            } catch {
                print("[RadioQueue] fetch error: \(error.localizedDescription)")
            }
            self.isLoading = false
        }
    }
}

// MARK: - LiveRadioView

struct LiveRadioView: View {
    @Environment(AudioService.self) private var audioService
    @Environment(\.dismiss) private var dismiss
    @State private var isPlaying = false
    @State private var chatText = ""
    @State private var isAnonymous = UserDefaults.standard.bool(forKey: "liveRadioChatAnonymous")
    @StateObject private var reactionVM = LiveReactionViewModel()
    @StateObject private var queueService = RadioQueueService()

    // Ad break state
    @State private var showAdBreak = false
    @State private var adCountdown = 15
    @State private var adTimer: Timer?
    @State private var adBreakTimer: Timer?
    @State private var showAdPaywall = false
    private let adIntervalSeconds: TimeInterval = 15 * 60 // 15 minutes between ad breaks
    private var isSubscribed: Bool { SubscriptionManager.shared.isSubscribed }

    let streamURL: String
    let stationName: String

    /// Language code derived from stream URL (e.g. "fr" from "/stream-fr", "en" for default "/stream")
    private var languageCode: String {
        if let suffix = streamURL.split(separator: "-").last, suffix.count == 2 {
            return String(suffix)
        }
        return "en"
    }

    init(streamURL: String = "https://radio.audexa.app/stream", stationName: String = "Audexa Radio") {
        self.streamURL = streamURL
        self.stationName = stationName
    }

    private var displayUsername: String {
        if isAnonymous { return "Listener" }
        return "Guest"
    }

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [Color(red: 0.1, green: 0.04, blue: 0.04), Color(red: 0.05, green: 0.05, blue: 0.05)],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            ScrollView(.vertical, showsIndicators: false) {
                VStack(spacing: 16) {
                    // Top bar
                    HStack {
                        Text("● LIVE")
                            .font(.caption.bold())
                            .foregroundColor(.white)
                            .padding(.horizontal, 10)
                            .padding(.vertical, 4)
                            .background(Color.red)
                            .cornerRadius(4)

                        Spacer()

                        Button {
                            audioService.pause()
                            dismiss()
                        } label: {
                            Image(systemName: "xmark.circle.fill")
                                .font(.title)
                                .foregroundColor(.white.opacity(0.8))
                                .frame(width: 44, height: 44)
                        }
                        .buttonStyle(.plain)
                    }
                    .padding(.horizontal, 24)
                    .padding(.top, 8)

                    // Station info
                    Text("📻").font(.system(size: 64))
                    Text(stationName)
                        .font(.system(size: 24, weight: .bold))
                        .foregroundColor(.white)
                    Text("AI-powered 24/7 news and talk")
                        .font(.caption)
                        .foregroundColor(.white.opacity(0.5))

                    // Play/Pause
                    Button {
                        togglePlayback()
                    } label: {
                        ZStack {
                            Circle().fill(Color.red).frame(width: 64, height: 64)
                            Image(systemName: isPlaying ? "pause.fill" : "play.fill")
                                .font(.system(size: 24))
                                .foregroundColor(.white)
                        }
                        .contentShape(Circle())
                    }
                    .buttonStyle(.plain)
                    .padding(.vertical, 8)

                    // Now Playing
                    if let np = queueService.nowPlaying {
                        nowPlayingBar(np)
                    }

                    // Up Next
                    let programSegments = queueService.queue.filter { $0.segment_type != "listener_request" }
                    if !programSegments.isEmpty {
                        queueList(title: "Up Next", icon: "list.bullet", segments: Array(programSegments.prefix(5)))
                    }

                    // Requests
                    let requestSegments = queueService.queue.filter { $0.segment_type == "listener_request" }
                    if !requestSegments.isEmpty {
                        queueList(title: "Requests", icon: "mic.fill", segments: requestSegments)
                    }

                    // Chat
                    chatSection

                    // Request hint
                    HStack(spacing: 4) {
                        Image(systemName: "mic.fill").font(.system(size: 9)).foregroundColor(.orange.opacity(0.7))
                        Text("Type").foregroundColor(.white.opacity(0.35))
                        Text("@audexa").foregroundColor(.orange.opacity(0.7)).fontWeight(.semibold)
                        Text("+ topic to add to the live queue").foregroundColor(.white.opacity(0.35))
                    }
                    .font(.system(size: 10))
                    .padding(.horizontal, 24)

                    // Call-in banner
                    Button {
                        if let url = URL(string: "tel:+18333981230") {
                            UIApplication.shared.open(url)
                        }
                    } label: {
                        HStack(spacing: 6) {
                            Image(systemName: "phone.fill")
                                .font(.system(size: 12))
                                .foregroundColor(.green)
                            Text("Call to request a topic:")
                                .font(.system(size: 12))
                                .foregroundColor(.white.opacity(0.7))
                            Text("+1 (833) 398-1230")
                                .font(.system(size: 12, weight: .semibold))
                                .foregroundColor(.green)
                        }
                        .padding(.horizontal, 14)
                        .padding(.vertical, 8)
                        .background(Color.green.opacity(0.12))
                        .cornerRadius(10)
                    }
                    .buttonStyle(.plain)
                    .padding(.horizontal, 24)

                    // Chat input
                    HStack(spacing: 8) {
                        TextField("", text: $chatText, prompt: Text("Chat or @audexa climate change...").foregroundColor(.white.opacity(0.4)))
                            .font(.system(size: 13))
                            .foregroundColor(.white)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(Color.white.opacity(0.12))
                            .cornerRadius(18)
                            .onSubmit { sendChatMessage() }

                        Button { sendChatMessage() } label: {
                            Image(systemName: "arrow.up.circle.fill")
                                .font(.system(size: 28))
                                .foregroundColor(chatText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? .white.opacity(0.2) : .orange)
                        }
                        .buttonStyle(.plain)
                        .disabled(chatText.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    }
                    .padding(.horizontal, 24)

                    if let error = reactionVM.moderationError {
                        Text(error).font(.caption2).foregroundColor(.red).padding(.horizontal, 24)
                    }

                    // Emoji reactions handled by LiveReactionOverlay

                    Spacer().frame(height: 20)
                }
            }

            // Floating emoji reactions + picker
            LiveReactionOverlay(viewModel: reactionVM, username: displayUsername)

            // Ad break overlay
            if showAdBreak {
                adBreakOverlay
            }
        }
        .task {
            await reactionVM.connect()
        }
        .onDisappear {
            Task { await reactionVM.disconnect() }
            queueService.stopPolling()
            stopAdTimer()
        }
        .onAppear {
            queueService.languageCode = languageCode
            queueService.startPolling()
            startAdTimerIfNeeded()
        }
        .onChange(of: audioService.isPlaying) { _, playing in
            isPlaying = playing
        }
        .fullScreenCover(isPresented: $showAdPaywall) {
            RemotePaywallView(triggerSource: "radio_ad_break")
        }
    }

    // MARK: - Now Playing

    private func nowPlayingBar(_ np: NowPlaying) -> some View {
        HStack(spacing: 8) {
            Text("NOW")
                .font(.system(size: 9, weight: .heavy))
                .foregroundColor(.white)
                .padding(.horizontal, 5)
                .padding(.vertical, 2)
                .background(Color.red.opacity(0.8))
                .cornerRadius(3)

            if np.source == "music" {
                Image(systemName: "music.note").font(.caption).foregroundColor(.white.opacity(0.5))
                Text("Music").font(.system(size: 13, weight: .semibold)).foregroundColor(.white)
            } else if let topic = np.topic_name, !topic.isEmpty {
                let displayTopic = topic.hasPrefix("[") ? String(topic.drop(while: { $0 != " " }).dropFirst()) : topic
                Text(displayTopic).font(.system(size: 13, weight: .semibold)).foregroundColor(.white).lineLimit(1)
            }

            Spacer()

            if let remaining = np.remaining_seconds, remaining > 0 {
                Text("\(Int(remaining / 60)):\(String(format: "%02d", Int(remaining) % 60))")
                    .font(.system(size: 11).monospacedDigit())
                    .foregroundColor(.white.opacity(0.4))
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 6)
        .background(Color.white.opacity(0.06))
        .cornerRadius(8)
        .padding(.horizontal, 24)
    }

    // MARK: - Queue List

    private func queueList(title: String, icon: String, segments: [RadioQueueSegment]) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            HStack {
                Image(systemName: icon).font(.caption).foregroundColor(.white.opacity(0.5))
                Text(title).font(.caption.bold()).foregroundColor(.white.opacity(0.7))
                Text("\(segments.count)")
                    .font(.caption2.bold()).foregroundColor(.white.opacity(0.4))
                    .padding(.horizontal, 6).padding(.vertical, 2)
                    .background(Color.white.opacity(0.1)).cornerRadius(4)
                Spacer()
            }
            .padding(.horizontal, 24)

            ForEach(Array(segments.enumerated()), id: \.element.id) { index, segment in
                HStack(spacing: 8) {
                    Text("\(index + 1)")
                        .font(.system(size: 10, weight: .semibold).monospacedDigit())
                        .foregroundColor(.white.opacity(0.35))
                        .frame(width: 20)
                    Text(segment.topic_name)
                        .font(.system(size: 12)).foregroundColor(.white.opacity(0.6)).lineLimit(1)
                    Spacer()
                    Text(segment.segmentLabel)
                        .font(.system(size: 9, weight: .semibold))
                        .foregroundColor(.white.opacity(0.9))
                        .padding(.horizontal, 5).padding(.vertical, 2)
                        .background(segment.badgeColor.opacity(0.5)).cornerRadius(3)
                }
                .padding(.horizontal, 24)
            }
        }
    }

    // MARK: - Chat

    private var chatSection: some View {
        VStack(alignment: .leading, spacing: 4) {
            if !reactionVM.chatMessages.isEmpty {
                HStack {
                    Image(systemName: "bubble.left.fill").font(.caption).foregroundColor(.white.opacity(0.5))
                    Text("Chat").font(.caption.bold()).foregroundColor(.white.opacity(0.7))
                    Spacer()
                }
                .padding(.horizontal, 24)

                ScrollView(.vertical, showsIndicators: false) {
                    VStack(alignment: .leading, spacing: 4) {
                        ForEach(reactionVM.chatMessages.suffix(8)) { msg in
                            HStack(alignment: .top, spacing: 6) {
                                Text(msg.username).font(.system(size: 11, weight: .bold)).foregroundColor(.white.opacity(0.7))
                                Text(msg.text).font(.system(size: 11)).foregroundColor(msg.isRequest ? .orange : .white.opacity(0.5)).lineLimit(2)
                            }
                        }
                    }
                    .padding(.horizontal, 24)
                }
                .frame(maxHeight: 80)
            }
        }
    }

    // MARK: - Actions

    private func sendChatMessage() {
        let text = chatText.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { return }
        reactionVM.sendChat(text, username: displayUsername)
        if reactionVM.moderationError == nil { chatText = "" }
    }

    private func startStream() {
        guard !streamURL.isEmpty, let url = URL(string: streamURL) else {
            print("📻 No stream URL set, skipping autoplay")
            return
        }
        let name = stationName.isEmpty ? "Audexa Radio" : stationName
        print("📻 Starting stream: \(streamURL) (\(name))")
        audioService.playStream(url: url, title: name, showName: name)
    }

    private func togglePlayback() {
        if isPlaying {
            audioService.pause()
            stopAdTimer()
        } else {
            startStream()
            startAdTimerIfNeeded()
        }
    }

    // MARK: - Ad Break

    private var adBreakOverlay: some View {
        ZStack {
            Color.black.opacity(0.85).ignoresSafeArea()

            VStack(spacing: 24) {
                Spacer()

                // Ad indicator
                VStack(spacing: 12) {
                    Image(systemName: "speaker.wave.2.fill")
                        .font(.system(size: 40))
                        .foregroundColor(.white.opacity(0.6))

                    Text("Ad Break")
                        .font(.system(size: 22, weight: .bold))
                        .foregroundColor(.white)

                    Text("Resuming in \(adCountdown)s")
                        .font(.system(size: 16).monospacedDigit())
                        .foregroundColor(.white.opacity(0.5))

                    // Progress bar
                    GeometryReader { geo in
                        ZStack(alignment: .leading) {
                            Capsule()
                                .fill(Color.white.opacity(0.15))
                                .frame(height: 4)
                            Capsule()
                                .fill(Color.red)
                                .frame(width: geo.size.width * CGFloat(15 - adCountdown) / 15.0, height: 4)
                                .animation(.linear(duration: 1), value: adCountdown)
                        }
                    }
                    .frame(height: 4)
                    .padding(.horizontal, 40)
                }

                Spacer()

                // Go Ad-Free CTA
                VStack(spacing: 12) {
                    Button {
                        showAdPaywall = true
                    } label: {
                        HStack(spacing: 8) {
                            Image(systemName: "wand.and.stars")
                            Text("Go Ad-Free")
                                .fontWeight(.bold)
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(
                            LinearGradient(
                                colors: [Color(hex: "#FF6B35"), Color(hex: "#E55A2B")],
                                startPoint: .leading, endPoint: .trailing)
                        )
                        .cornerRadius(14)
                    }

                    Text("No interruptions, ever.")
                        .font(.system(size: 13))
                        .foregroundColor(.white.opacity(0.4))
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 40)
            }
        }
        .transition(.opacity)
    }

    // MARK: - Ad Timer

    private func startAdTimerIfNeeded() {
        guard !isSubscribed else { return }
        stopAdTimer()

        adTimer = Timer.scheduledTimer(withTimeInterval: adIntervalSeconds, repeats: true) { _ in
            Task { @MainActor in
                triggerAdBreak()
            }
        }
    }

    private func stopAdTimer() {
        adTimer?.invalidate()
        adTimer = nil
        adBreakTimer?.invalidate()
        adBreakTimer = nil
    }

    private func triggerAdBreak() {
        guard isPlaying, !isSubscribed else { return }

        // Pause stream
        audioService.pause()

        // Try showing a real interstitial ad first
        if AdManager.shared.showInterstitial() {
            // Ad is showing — resume stream when it dismisses
            // Don't call startStream() as that would restart ad timer
            DispatchQueue.main.asyncAfter(deadline: .now() + 1) {
                self.startStream()
                // Don't restart ad timer — it's already running with repeats:true
            }
            return
        }

        // Fallback: countdown overlay if no ad loaded
        adCountdown = 15
        withAnimation { showAdBreak = true }

        adBreakTimer = Timer.scheduledTimer(withTimeInterval: 1, repeats: true) { _ in
            Task { @MainActor in
                adCountdown -= 1
                if adCountdown <= 0 {
                    endAdBreak()
                }
            }
        }
    }

    private func endAdBreak() {
        adBreakTimer?.invalidate()
        adBreakTimer = nil
        withAnimation { showAdBreak = false }

        // Resume stream
        startStream()
    }
}

// MARK: - Emoji Button Style

private struct EmojiScaleStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 1.4 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
    }
}
