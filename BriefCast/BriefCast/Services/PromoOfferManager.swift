//
//  PromoOfferManager.swift
//  BriefCast
//
//  Presents Apple Promotional Offers to lapsed/lapsing subscribers.
//
//  Unlike Win-Back Offers (which require ≥1 month paid history and ≥1 month
//  lapse — useless for trial-cancellers), Promotional Offers are eligible
//  for anyone who has any subscription history including trials.
//
//  Flow:
//   1. On app launch + foreground, check if user has a recently-expired
//      subscription (trial or paid) via `Transaction.currentEntitlements`
//      and `Product.SubscriptionInfo.status`.
//   2. If found, request a JWT-signed promo offer from PaywallKit-API.
//   3. Surface a sheet inviting the user back at half price.
//   4. On accept, present StoreKit purchase with `.promotionalOffer(...)`.
//

import Foundation
import StoreKit

@MainActor
@Observable
final class PromoOfferManager {
    static let shared = PromoOfferManager()

    struct PendingOffer: Identifiable {
        let id: String
        let product: Product
        let offerID: String
        let keyID: String
        let nonce: UUID
        let timestamp: Int
        let signature: Data
        let headline: String
    }

    /// First eligible promo offer for any Audexa product, or nil.
    var pendingOffer: PendingOffer?

    /// True while a refresh is in flight.
    var isChecking = false

    // Map each product to the promo offer code we want to surface on trial cancel.
    // These offer codes must exist in ASC as Promotional Offers on the matching subscription.
    private static let promoCodeForProduct: [String: String] = [
        "audexa_premium_yearly":  "h51500",  // Half off 1 year
        "audexa_premium_monthly": "h51478",  // Half off 3 months
        "audexa_premium_weekly":  "h78011",  // Half off 4 weeks
    ]

    private let api = URL(string: "https://paywallkit-api.fly.dev")!
    private let bundleId = "com.kreativekoala.briefcast"
    private let snoozeKey = "PromoOfferManager.snoozedUntil"

    private init() {}

    /// Probe for a lapsed subscription and, if found, prepare a signed promo offer.
    /// Safe to call from any context; no-ops if user is currently subscribed or
    /// the offer was recently dismissed.
    func refresh() async {
        guard !isChecking else { return }
        isChecking = true
        defer { isChecking = false }

        // Snooze check: don't pester users who said no in the last 30 days.
        if let snoozedUntil = UserDefaults.standard.object(forKey: snoozeKey) as? Date,
           Date() < snoozedUntil {
            return
        }

        // Skip if user is currently subscribed.
        if SubscriptionManager.shared.isSubscribed { return }

        do {
            let products = try await Product.products(for: SubscriptionManager.allProductIds)
            for product in products {
                guard let sub = product.subscription else { continue }
                guard let promoCode = Self.promoCodeForProduct[product.id] else { continue }

                // Find a recently-expired status for this product (trial or paid).
                let statuses = try await sub.status
                let hasRecentLapse = statuses.contains { status in
                    switch status.state {
                    case .expired, .revoked: return true
                    default: return false
                    }
                }

                if hasRecentLapse {
                    if let pending = await signOffer(product: product, offerCode: promoCode) {
                        pendingOffer = pending
                        print("[PromoOffer] Prepared \(promoCode) for \(product.id)")
                        return
                    }
                }
            }
            pendingOffer = nil
        } catch {
            print("[PromoOffer] Probe failed: \(error.localizedDescription)")
        }
    }

    /// Present Apple's purchase sheet with the signed promo offer applied.
    @discardableResult
    func purchase() async -> Bool {
        guard let pending = pendingOffer else { return false }
        do {
            let result = try await pending.product.purchase(options: [
                .promotionalOffer(
                    offerID: pending.offerID,
                    keyID: pending.keyID,
                    nonce: pending.nonce,
                    signature: pending.signature,
                    timestamp: pending.timestamp
                )
            ])
            switch result {
            case .success(let verification):
                if case .verified(let transaction) = verification {
                    await transaction.finish()
                    pendingOffer = nil
                    UserDefaults.standard.removeObject(forKey: snoozeKey)
                    await SubscriptionManager.shared.refreshFromStore()
                    return true
                }
            case .userCancelled, .pending:
                break
            @unknown default:
                break
            }
        } catch {
            print("[PromoOffer] purchase err: \(error.localizedDescription)")
        }
        return false
    }

    /// User tapped "No thanks" — snooze for 30 days.
    func dismiss() {
        let snoozeUntil = Date().addingTimeInterval(30 * 24 * 60 * 60)
        UserDefaults.standard.set(snoozeUntil, forKey: snoozeKey)
        pendingOffer = nil
    }

    // MARK: - Private

    private func signOffer(product: Product, offerCode: String) async -> PendingOffer? {
        let appUsername = UUID().uuidString // anonymous — PaywallKit-API doesn't require user identity
        var req = URLRequest(url: api.appendingPathComponent("sign-promo"))
        req.httpMethod = "POST"
        req.setValue("application/json", forHTTPHeaderField: "Content-Type")
        req.httpBody = try? JSONSerialization.data(withJSONObject: [
            "bundleId": bundleId,
            "productId": product.id,
            "offerCode": offerCode,
            "applicationUsername": appUsername,
        ])
        do {
            let (data, response) = try await URLSession.shared.data(for: req)
            guard let http = response as? HTTPURLResponse, http.statusCode == 200 else {
                print("[PromoOffer] sign-promo HTTP non-200")
                return nil
            }
            guard let payload = try JSONSerialization.jsonObject(with: data) as? [String: Any],
                  let keyId = payload["keyIdentifier"] as? String,
                  let nonceStr = payload["nonce"] as? String,
                  let nonce = UUID(uuidString: nonceStr),
                  let timestamp = payload["timestamp"] as? Int,
                  let sigBase64 = payload["signature"] as? String,
                  let sigData = Data(base64Encoded: sigBase64) else {
                print("[PromoOffer] sign-promo: malformed response")
                return nil
            }
            return PendingOffer(
                id: offerCode,
                product: product,
                offerID: offerCode,
                keyID: keyId,
                nonce: nonce,
                timestamp: timestamp,
                signature: sigData,
                headline: "Come back at half price"
            )
        } catch {
            print("[PromoOffer] sign-promo error: \(error.localizedDescription)")
            return nil
        }
    }
}
