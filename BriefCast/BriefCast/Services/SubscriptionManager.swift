//
//  SubscriptionManager.swift
//  BriefCast
//
//  StoreKit 2 subscription manager for ad-free premium
//  Powered by PaywallKit's StoreManager
//

import Foundation
import StoreKit
import PaywallKit

@MainActor
@Observable
class SubscriptionManager {
    static let shared = SubscriptionManager()

    // MARK: - Product IDs

    static let monthlyProductId = "audexa_premium_monthly"
    static let yearlyProductId = "audexa_premium_yearly"

    static let allProductIds: [String] = [
        monthlyProductId,
        yearlyProductId
    ]

    // MARK: - Published State

    var isSubscribed: Bool = false
    var purchaseInProgress: Bool = false
    var errorMessage: String?

    // MARK: - Private

    private let preferencesService = PreferencesService.shared
    private let store = StoreManager.shared

    private init() {
        // Restore cached state immediately
        isSubscribed = preferencesService.isSubscribed || store.isPremium
    }

    // MARK: - Configuration

    /// Call once at app startup to configure StoreManager with product IDs
    func configure() {
        store.configure(productIds: Self.allProductIds)

        // Observe StoreManager's isPremium changes
        Task {
            // Initial sync
            await refreshFromStore()
        }
    }

    // MARK: - Refresh from StoreManager

    func refreshFromStore() async {
        await store.refreshSubscriptionStatus()
        let premium = store.isPremium
        isSubscribed = premium
        preferencesService.isSubscribed = premium
    }

    // MARK: - Purchase

    func purchase(productId: String) async {
        purchaseInProgress = true
        errorMessage = nil

        let result = await store.purchase(productId: productId)

        switch result {
        case .purchased:
            isSubscribed = true
            preferencesService.isSubscribed = true
            TikTokHelper.shared.trackEvent("purchase_success", properties: ["product_id": productId])
            FacebookSDKHelper.shared.logSubscription(price: 0, currency: "USD", productId: productId)
        case .cancelled:
            break
        case .pending:
            break
        case .failed(let error):
            print("[SubscriptionManager] Purchase failed: \(error)")
            errorMessage = "Purchase failed. Please try again."
        }

        purchaseInProgress = false
    }

    // MARK: - Restore Purchases

    func restorePurchases() async {
        purchaseInProgress = true
        errorMessage = nil

        await store.restore()

        let premium = store.isPremium
        isSubscribed = premium
        preferencesService.isSubscribed = premium

        if !isSubscribed {
            errorMessage = "No active subscription found"
        }

        purchaseInProgress = false
    }

    // MARK: - Check Current Entitlements

    func checkCurrentEntitlements() async {
        await refreshFromStore()
    }

    // MARK: - Product Helpers

    var paywallProducts: [PaywallProduct] {
        store.paywallProducts
    }
}
