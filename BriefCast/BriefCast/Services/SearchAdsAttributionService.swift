//
//  SearchAdsAttributionService.swift
//  BriefCast
//
//  Handles Apple Search Ads attribution data collection and reporting
//  to backend for ASA bid optimization.
//

import Foundation
import AdServices
import UIKit

@MainActor
class SearchAdsAttributionService: ObservableObject {
    static let shared = SearchAdsAttributionService()

    @Published var attributionToken: String?
    @Published var hasReportedAttribution = false

    private let attributionReportedKey = "asa_attribution_reported"
    private let attributionTokenKey = "asa_attribution_token"
    private let installDateKey = "asa_install_date"

    private init() {
        loadCachedState()
    }

    // MARK: - Attribution Fetch

    /// Fetch Apple Search Ads attribution token on first launch
    /// Should be called once during app initialization
    func fetchAttributionIfNeeded() async {
        // Only fetch attribution once per install
        guard !hasReportedAttribution else {
            print("✅ ASA attribution already reported")
            return
        }

        // Check if we already have a token cached
        if let cachedToken = attributionToken {
            print("📦 Using cached ASA attribution token")
            await reportAttributionToBackend(token: cachedToken)
            return
        }

        do {
            // Fetch attribution token from AdServices framework
            // This is available on iOS 14.3+
            if #available(iOS 14.3, *) {
                let token = try AAAttribution.attributionToken()
                self.attributionToken = token

                // Cache the token
                UserDefaults.standard.set(token, forKey: attributionTokenKey)

                // Record install date if not already set
                if UserDefaults.standard.object(forKey: installDateKey) == nil {
                    UserDefaults.standard.set(Date().timeIntervalSince1970, forKey: installDateKey)
                }

                print("✅ ASA attribution token fetched successfully")

                // Post token to Apple to register the conversion. This is
                // required for ASA attribution — without it, the campaign
                // never sees the install/conversion event.
                await Self.postTokenToApple(token: token)

                // Also report to backend for our own bid-optimization pipeline
                await reportAttributionToBackend(token: token)
            } else {
                print("⚠️ AdServices not available (requires iOS 14.3+)")
            }
        } catch {
            // Attribution errors are expected for organic installs
            print("ℹ️ ASA attribution not available: \(error.localizedDescription)")
        }
    }

    /// POST the attribution token to Apple to register the ASA conversion.
    /// Apple returns the campaign/keyword payload, but the side effect of
    /// the POST is what registers the install with the ASA campaign.
    private static func postTokenToApple(token: String) async {
        guard let url = URL(string: "https://api-adservices.apple.com/api/v1/") else { return }
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("text/plain", forHTTPHeaderField: "Content-Type")
        request.httpBody = token.data(using: .utf8)
        do {
            _ = try await URLSession.shared.data(for: request)
            print("✅ ASA attribution token posted to Apple")
        } catch {
            // Silent — Apple may rate-limit or token may be too new
            print("ℹ️ Could not post ASA token to Apple: \(error.localizedDescription)")
        }
    }

    // MARK: - Backend Reporting

    /// Report attribution data to backend for bid optimization
    private func reportAttributionToBackend(token: String) async {
        guard let url = URL(string: "https://ai-radio-backend.fly.dev/api/attribution/apple-search-ads") else {
            print("❌ Invalid backend URL for ASA attribution")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        // Collect device info for attribution
        let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"
        let installTimestamp = UserDefaults.standard.double(forKey: installDateKey)
        let userId = UserDefaults.standard.string(forKey: "linkedAccountEmail")

        var body: [String: Any] = [
            "attribution_token": token,
            "device_id": deviceId,
            "platform": "ios",
            "app_version": Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "unknown",
            "os_version": UIDevice.current.systemVersion,
            "install_timestamp": installTimestamp > 0 ? installTimestamp : Date().timeIntervalSince1970
        ]

        // Include user ID if available (may not be available on first launch)
        if let userId = userId, !userId.isEmpty {
            body["user_id"] = userId
        }

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    print("✅ ASA attribution reported to backend")
                    markAttributionAsReported()
                } else {
                    print("⚠️ Backend returned status \(httpResponse.statusCode) for ASA attribution")
                }
            }
        } catch {
            print("❌ Failed to report ASA attribution: \(error.localizedDescription)")
            // Don't mark as reported so we can retry on next launch
        }
    }

    /// Report user ID linkage after user signs in (for attribution matching)
    func linkUserToAttribution(userId: String) async {
        guard let token = attributionToken else {
            print("ℹ️ No ASA attribution token to link")
            return
        }

        guard let url = URL(string: "https://ai-radio-backend.fly.dev/api/attribution/link-user") else {
            print("❌ Invalid backend URL for attribution user link")
            return
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let deviceId = UIDevice.current.identifierForVendor?.uuidString ?? "unknown"

        let body: [String: Any] = [
            "user_id": userId,
            "device_id": deviceId,
            "attribution_token": token,
            "platform": "ios"
        ]

        do {
            request.httpBody = try JSONSerialization.data(withJSONObject: body)
            let (_, response) = try await URLSession.shared.data(for: request)

            if let httpResponse = response as? HTTPURLResponse {
                if httpResponse.statusCode == 200 || httpResponse.statusCode == 201 {
                    print("✅ User linked to ASA attribution")
                } else {
                    print("⚠️ Backend returned status \(httpResponse.statusCode) for attribution user link")
                }
            }
        } catch {
            print("❌ Failed to link user to attribution: \(error.localizedDescription)")
        }
    }

    // MARK: - State Management

    private func markAttributionAsReported() {
        hasReportedAttribution = true
        UserDefaults.standard.set(true, forKey: attributionReportedKey)
    }

    private func loadCachedState() {
        hasReportedAttribution = UserDefaults.standard.bool(forKey: attributionReportedKey)
        attributionToken = UserDefaults.standard.string(forKey: attributionTokenKey)
    }
}
