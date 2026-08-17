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

    /// Backing store for `isSubscribed`. Internal writers (refresh, purchase,
    /// preferences sync) update this directly; the public `isSubscribed`
    /// getter layers the DEBUG paywall-bypass on top.
    private var _isSubscribed: Bool = false

    var isSubscribed: Bool {
        get {
            #if DEBUG
            if Self.debugForcePremiumEnabled { return true }
            #endif
            return _isSubscribed
        }
        set { _isSubscribed = newValue }
    }
    var purchaseInProgress: Bool = false
    var errorMessage: String?

    #if DEBUG
    /// Debug-only paywall bypass. When true, `isSubscribed` reads as true
    /// regardless of real StoreKit state. Persisted in UserDefaults so the
    /// flag survives relaunches during testing. Compiled out of Release
    /// builds entirely so there is no path to it in a shipped app.
    ///
    /// Defaults to ON in DEBUG so reinstalls (which wipe UserDefaults) don't
    /// re-trap the dev behind the paywall. Flip the Profile toggle off to
    /// see the real paywall.
    static let debugForcePremiumKey = "BriefCast.Debug.ForcePremium"

    static var debugForcePremiumEnabled: Bool {
        get {
            if UserDefaults.standard.object(forKey: debugForcePremiumKey) == nil { return true }
            return UserDefaults.standard.bool(forKey: debugForcePremiumKey)
        }
        set { UserDefaults.standard.set(newValue, forKey: debugForcePremiumKey) }
    }
    #endif

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
