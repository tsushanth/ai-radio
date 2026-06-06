import Foundation

/// Fetches radio stream config from backend so URLs can change without app updates.
final class RadioConfig: @unchecked Sendable {
    static let shared = RadioConfig()

    private(set) var baseURL: String = "https://radio.audexa.app" // fallback
    private let apiBase = "https://ai-radio-backend.fly.dev/api"

    private init() {}

    /// Fetch config from backend. Call once at app startup.
    func fetch() {
        Task.detached(priority: .utility) {
            guard let url = URL(string: "\(self.apiBase)/config") else { return }
            do {
                let (data, _) = try await URLSession.shared.data(from: url)
                if let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any],
                   let config = json["data"] as? [String: Any],
                   let streamBase = config["radioStreamBaseURL"] as? String,
                   !streamBase.isEmpty {
                    self.baseURL = streamBase
                }
            } catch {
                // Keep fallback
            }
        }
    }
}
