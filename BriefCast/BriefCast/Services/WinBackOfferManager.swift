//
//  WinBackOfferManager.swift
//  BriefCast
//
//  Surfaces Apple Win-Back Offers to lapsed subscribers (iOS 18+).
//  No server signing needed — Apple validates internally via StoreKit 2.
//
//  Flow:
//   1. Fetch product + its subscription.
//   2. For each subscription Status, read RenewalInfo.eligibleWinBackOfferIDs.
//   3. Filter `subscription.winBackOffers` against those eligible IDs.
//   4. Expose first match via `eligibleOffer` so the UI shows a sheet.
//   5. On user accept, `product.purchase(options: [.winBackOffer(offer)])`.
//

import Foundation
import StoreKit

@available(iOS 18.0, *)
@MainActor
@Observable
final class WinBackOfferManager {
    static let shared = WinBackOfferManager()

    struct EligibleOffer: Identifiable {
        let id: String
        let product: Product
        let offer: Product.SubscriptionOffer
        let headline: String
    }

    /// First eligible Win-Back Offer for any Audexa product, or nil.
    var eligibleOffer: EligibleOffer?

    /// True while a refresh is in flight.
    var isChecking = false

    private init() {}

    /// Look for an eligible offer. Safe to call from any context.
    func refresh() async {
        guard !isChecking else { return }
        isChecking = true
        defer { isChecking = false }

        do {
            let products = try await Product.products(for: SubscriptionManager.allProductIds)
            for product in products {
                guard let sub = product.subscription else { continue }

                // Collect eligible IDs from any past subscription status.
                var eligibleIDs: Set<String> = []
                let statuses = try await sub.status
                for status in statuses {
                    if case .verified(let renewalInfo) = status.renewalInfo {
                        eligibleIDs.formUnion(renewalInfo.eligibleWinBackOfferIDs)
                    }
                }

                guard !eligibleIDs.isEmpty else { continue }

                // Match against this product's configured Win-Back Offers.
                let configuredOffers = sub.winBackOffers
                if let offer = configuredOffers.first(where: { eligibleIDs.contains($0.id ?? "") }) {
                    let id = offer.id ?? ""
                    eligibleOffer = EligibleOffer(
                        id: id,
                        product: product,
                        offer: offer,
                        headline: Self.headline(for: offer)
                    )
                    print("[WinBack] Eligible offer found for \(product.id): \(id)")
                    return
                }
            }
            eligibleOffer = nil
        } catch {
            print("[WinBack] Lookup failed: \(error.localizedDescription)")
        }
    }

    /// Present Apple's purchase sheet for the offer. Returns true on success.
    @discardableResult
    func purchase() async -> Bool {
        guard let eligible = eligibleOffer else { return false }
        do {
            let result = try await eligible.product.purchase(options: [
                .winBackOffer(eligible.offer)
            ])
            switch result {
            case .success(let verification):
                if case .verified(let transaction) = verification {
                    await transaction.finish()
                    eligibleOffer = nil
                    await SubscriptionManager.shared.refreshFromStore()
                    return true
                }
            case .userCancelled, .pending:
                break
            @unknown default:
                break
            }
        } catch {
            print("[WinBack] purchase err: \(error.localizedDescription)")
        }
        return false
    }

    /// Dismiss without purchasing.
    func dismiss() {
        eligibleOffer = nil
    }

    private static func headline(for offer: Product.SubscriptionOffer) -> String {
        let duration: String = {
            let p = offer.period
            let unit: String = {
                switch p.unit {
                case .day:   return "day"
                case .week:  return "week"
                case .month: return "month"
                case .year:  return "year"
                @unknown default: return "period"
                }
            }()
            let plural = p.value > 1 ? "s" : ""
            return "\(p.value) \(unit)\(plural)"
        }()
        let mode = offer.paymentMode
        if mode == .freeTrial {
            return "Come back free for \(duration)"
        } else if mode == .payAsYouGo {
            return "Come back at a discount for \(duration)"
        } else if mode == .payUpFront {
            return "Come back for \(duration) at a special price"
        } else {
            return "A special offer just for you"
        }
    }
}
