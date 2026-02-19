//
//  SubscriptionManager.swift
//  BriefCast
//
//  StoreKit 2 subscription manager for ad-free premium
//

import Foundation
import StoreKit

@MainActor
@Observable
class SubscriptionManager {
    static let shared = SubscriptionManager()

    // MARK: - Product IDs

    static let monthlyProductId = "audexa_premium_monthly"
    static let yearlyProductId = "audexa_premium_yearly"

    private static let productIds: Set<String> = [
        monthlyProductId,
        yearlyProductId
    ]

    // MARK: - Published State

    var isSubscribed: Bool = false
    var availableProducts: [Product] = []
    var purchaseInProgress: Bool = false
    var errorMessage: String?

    // MARK: - Private

    private var transactionListener: Task<Void, Never>?
    private let preferencesService = PreferencesService.shared

    private init() {
        // Restore cached state immediately
        isSubscribed = preferencesService.isSubscribed

        // Start listening for transaction updates
        transactionListener = listenForTransactions()

        // Load products and check entitlements
        Task {
            await loadProducts()
            await checkCurrentEntitlements()
        }
    }

    // MARK: - Load Products

    func loadProducts() async {
        do {
            let products = try await Product.products(for: Self.productIds)
            // Sort: yearly first, then monthly
            availableProducts = products.sorted { p1, _ in
                p1.id == Self.yearlyProductId
            }
        } catch {
            print("[SubscriptionManager] Failed to load products: \(error)")
            errorMessage = "Failed to load subscription options"
        }
    }

    // MARK: - Purchase

    func purchase(_ product: Product) async {
        purchaseInProgress = true
        errorMessage = nil

        do {
            let result = try await product.purchase()

            switch result {
            case .success(let verification):
                let transaction = try checkVerification(verification)
                await updateSubscriptionStatus(from: transaction)
                await transaction.finish()

            case .userCancelled:
                break

            case .pending:
                // Transaction requires approval (e.g., Ask to Buy)
                break

            @unknown default:
                break
            }
        } catch {
            print("[SubscriptionManager] Purchase failed: \(error)")
            errorMessage = "Purchase failed. Please try again."
        }

        purchaseInProgress = false
    }

    // MARK: - Restore Purchases

    func restorePurchases() async {
        purchaseInProgress = true
        errorMessage = nil

        // Sync with App Store
        do {
            try await AppStore.sync()
        } catch {
            print("[SubscriptionManager] Sync failed: \(error)")
        }

        await checkCurrentEntitlements()
        purchaseInProgress = false

        if !isSubscribed {
            errorMessage = "No active subscription found"
        }
    }

    // MARK: - Check Current Entitlements

    func checkCurrentEntitlements() async {
        var hasActiveSubscription = false

        for await result in Transaction.currentEntitlements {
            if let transaction = try? checkVerification(result) {
                if Self.productIds.contains(transaction.productID) {
                    hasActiveSubscription = true
                    break
                }
            }
        }

        isSubscribed = hasActiveSubscription
        preferencesService.isSubscribed = hasActiveSubscription
    }

    // MARK: - Transaction Listener

    private func listenForTransactions() -> Task<Void, Never> {
        Task.detached { [weak self] in
            for await result in Transaction.updates {
                if let transaction = try? await self?.checkVerification(result) {
                    await self?.updateSubscriptionStatus(from: transaction)
                    await transaction.finish()
                }
            }
        }
    }

    // MARK: - Helpers

    private func checkVerification<T>(_ result: VerificationResult<T>) throws -> T {
        switch result {
        case .verified(let value):
            return value
        case .unverified(_, let error):
            throw error
        }
    }

    private func updateSubscriptionStatus(from transaction: Transaction) async {
        let active = transaction.revocationDate == nil
            && (transaction.expirationDate ?? .distantFuture) > Date()

        isSubscribed = active
        preferencesService.isSubscribed = active

        // Server-side verification (fire and forget)
        Task {
            await verifyWithServer(transaction: transaction)
        }
    }

    private func verifyWithServer(transaction: Transaction) async {
        let apiService = APIService.shared
        do {
            // Send transaction ID + product ID for server-side verification
            let receiptData = String(transaction.originalID)
            try await apiService.verifyIOSSubscription(receiptData: receiptData)
        } catch {
            print("[SubscriptionManager] Server verification failed: \(error)")
            // Local state is already updated - server will catch up later
        }
    }

    // MARK: - Product Helpers

    var monthlyProduct: Product? {
        availableProducts.first { $0.id == Self.monthlyProductId }
    }

    var yearlyProduct: Product? {
        availableProducts.first { $0.id == Self.yearlyProductId }
    }
}
