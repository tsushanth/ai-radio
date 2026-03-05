//
//  PaywallView.swift
//  BriefCast
//
//  Ad-free subscription paywall
//

import SwiftUI
import StoreKit

struct LegacyPaywallView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var subscriptionManager = SubscriptionManager.shared
    @State private var selectedProductId = SubscriptionManager.yearlyProductId

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 24) {
                    Spacer().frame(height: 16)

                    // Header
                    VStack(spacing: 8) {
                        Text("Go Ad-Free")
                            .font(.system(size: 32, weight: .bold))
                            .foregroundColor(Theme.Colors.primaryText)

                        Text("Enjoy uninterrupted listening")
                            .font(.system(size: 18))
                            .foregroundColor(Theme.Colors.secondaryText)
                    }

                    Spacer().frame(height: 8)

                    // Features
                    VStack(spacing: 14) {
                        FeatureRow(icon: "speaker.slash.fill", text: "No audio ad interruptions")
                        FeatureRow(icon: "bolt.fill", text: "Seamless episode playback")
                        FeatureRow(icon: "heart.fill", text: "Support indie development")
                    }
                    .padding(.horizontal, 24)

                    Spacer().frame(height: 8)

                    if subscriptionManager.isSubscribed {
                        // Already subscribed badge
                        HStack(spacing: 12) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 24))
                                .foregroundColor(Theme.Colors.accent)

                            Text("You're an Ad-Free subscriber!")
                                .font(.system(size: 17, weight: .semibold))
                                .foregroundColor(Theme.Colors.primaryText)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(20)
                        .background(Theme.Colors.accent.opacity(0.15))
                        .cornerRadius(16)
                        .padding(.horizontal, 24)
                    } else {
                        // Pricing cards
                        VStack(spacing: 12) {
                            if let yearly = subscriptionManager.yearlyProduct {
                                PricingCard(
                                    product: yearly,
                                    label: "Yearly",
                                    badge: "Save 58%",
                                    isSelected: selectedProductId == SubscriptionManager.yearlyProductId,
                                    onSelect: {
                                        selectedProductId = SubscriptionManager.yearlyProductId
                                    }
                                )
                            }

                            if let monthly = subscriptionManager.monthlyProduct {
                                PricingCard(
                                    product: monthly,
                                    label: "Monthly",
                                    badge: nil,
                                    isSelected: selectedProductId == SubscriptionManager.monthlyProductId,
                                    onSelect: {
                                        selectedProductId = SubscriptionManager.monthlyProductId
                                    }
                                )
                            }
                        }
                        .padding(.horizontal, 24)

                        // Subscribe button
                        Button(action: {
                            Task {
                                let product = subscriptionManager.availableProducts.first {
                                    $0.id == selectedProductId
                                }
                                if let product {
                                    await subscriptionManager.purchase(product)
                                    if subscriptionManager.isSubscribed {
                                        dismiss()
                                    }
                                }
                            }
                        }) {
                            Group {
                                if subscriptionManager.purchaseInProgress {
                                    ProgressView()
                                        .tint(.white)
                                } else {
                                    Text("Subscribe")
                                        .font(.system(size: 18, weight: .bold))
                                }
                            }
                            .frame(maxWidth: .infinity)
                            .frame(height: 56)
                            .background(Theme.Colors.accent)
                            .foregroundColor(.white)
                            .cornerRadius(16)
                        }
                        .disabled(subscriptionManager.purchaseInProgress || subscriptionManager.availableProducts.isEmpty)
                        .padding(.horizontal, 24)

                        // Restore purchases
                        Button(action: {
                            Task {
                                await subscriptionManager.restorePurchases()
                                if subscriptionManager.isSubscribed {
                                    dismiss()
                                }
                            }
                        }) {
                            Text("Restore Purchases")
                                .font(.system(size: 15))
                                .foregroundColor(Theme.Colors.secondaryText)
                        }

                        // Error message
                        if let error = subscriptionManager.errorMessage {
                            Text(error)
                                .font(.system(size: 14))
                                .foregroundColor(.red)
                                .multilineTextAlignment(.center)
                                .padding(.horizontal, 24)
                        }

                        // Fine print
                        Text("Payment will be charged to your Apple ID account. Subscription automatically renews unless cancelled at least 24 hours before the end of the current period.")
                            .font(.system(size: 11))
                            .foregroundColor(Theme.Colors.secondaryText.opacity(0.7))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 32)
                    }

                    Spacer().frame(height: 32)
                }
            }
            .background(Theme.Colors.background)
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button(action: { dismiss() }) {
                        Image(systemName: "xmark")
                            .font(.system(size: 16, weight: .semibold))
                            .foregroundColor(Theme.Colors.primaryText)
                    }
                }
            }
        }
    }
}

// MARK: - Feature Row

private struct FeatureRow: View {
    let icon: String
    let text: String

    var body: some View {
        HStack(spacing: 16) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(Theme.Colors.accent)
                .frame(width: 24)

            Text(text)
                .font(.system(size: 17))
                .foregroundColor(Theme.Colors.primaryText)

            Spacer()
        }
    }
}

// MARK: - Pricing Card

private struct PricingCard: View {
    let product: Product
    let label: String
    let badge: String?
    let isSelected: Bool
    let onSelect: () -> Void

    var body: some View {
        Button(action: onSelect) {
            HStack(spacing: 12) {
                // Radio button
                Circle()
                    .strokeBorder(isSelected ? Theme.Colors.accent : Theme.Colors.secondaryText, lineWidth: 2)
                    .frame(width: 22, height: 22)
                    .overlay(
                        Circle()
                            .fill(isSelected ? Theme.Colors.accent : Color.clear)
                            .frame(width: 12, height: 12)
                    )

                // Label + badge
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 8) {
                        Text(label)
                            .font(.system(size: 17, weight: .bold))
                            .foregroundColor(Theme.Colors.primaryText)

                        if let badge {
                            Text(badge)
                                .font(.system(size: 12, weight: .bold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 8)
                                .padding(.vertical, 2)
                                .background(Theme.Colors.accent)
                                .cornerRadius(6)
                        }
                    }
                }

                Spacer()

                // Price
                Text(product.displayPrice + periodLabel)
                    .font(.system(size: 17, weight: .bold))
                    .foregroundColor(isSelected ? Theme.Colors.accent : Theme.Colors.primaryText)
            }
            .padding(20)
            .background(isSelected ? Theme.Colors.accent.opacity(0.08) : Theme.Colors.cardBackground)
            .overlay(
                RoundedRectangle(cornerRadius: 16)
                    .stroke(isSelected ? Theme.Colors.accent : Theme.Colors.secondaryText.opacity(0.3), lineWidth: 2)
            )
            .cornerRadius(16)
        }
        .buttonStyle(.plain)
    }

    private var periodLabel: String {
        if let subscription = product.subscription {
            switch subscription.subscriptionPeriod.unit {
            case .year: return "/year"
            case .month: return "/month"
            case .week: return "/week"
            case .day: return "/day"
            @unknown default: return ""
            }
        }
        return ""
    }
}
