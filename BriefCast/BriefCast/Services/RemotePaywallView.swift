import SwiftUI
import PaywallKit
import RatingKit

/// Paywall powered by PaywallKit — A/B tested templates with Terms & Privacy links
struct RemotePaywallView: View {
    @Environment(\.dismiss) private var dismiss
    var triggerSource: String = "unknown"

    @ObservedObject private var store = StoreManager.shared

    /// Server-controlled: false by default (no immediate winback after first dismiss).
    /// PaywallKit-API /resolve can return showWinback: true for repeat dismissers.
    private var showWinback: Bool { ExperimentManager.shared.showWinback() }

    private let features: [PaywallFeature] = [
        PaywallFeature(icon: "speaker.slash.fill", title: "Ad-Free Listening", description: "No audio ad interruptions"),
        PaywallFeature(icon: "bolt.fill", title: "Seamless Playback", description: "Uninterrupted episode streaming"),
        PaywallFeature(icon: "waveform.circle.fill", title: "Premium Voices", description: "Ultra-realistic AI narrators"),
        PaywallFeature(icon: "arrow.down.circle.fill", title: "Offline Downloads", description: "Listen without internet"),
        PaywallFeature(icon: "infinity", title: "Unlimited Topics", description: "Explore all categories"),
        PaywallFeature(icon: "magnifyingglass.circle.fill", title: "Deep Dive", description: "In-depth AI research podcasts"),
    ]

    private let theme = PaywallTheme(
        accent: Color(hex: "#FF6B35"),
        accent2: Color(hex: "#E55A2B")
    )

    private var placement: String {
        PromoCodeManager.shared.activeCode != nil ? "promo_code_onboarding" : "app_open"
    }

    var body: some View {
        PaywallView(
            appId: "audexa",
            placement: placement,
            appName: "Audexa Premium",
            features: features,
            products: store.paywallProducts,
            theme: theme,
            showWinback: showWinback,
            isDismissible: true,
            onPurchase: { productId in
                let result = await store.purchase(productId: productId)
                if case .purchased = result {
                    TikTokHelper.shared.trackEvent("purchase_success", properties: ["product_id": productId])
                    FacebookSDKHelper.shared.logSubscription(price: 0, currency: "USD", productId: productId)
                    await MainActor.run {
                        SubscriptionManager.shared.isSubscribed = true
                        PreferencesService.shared.isSubscribed = true
                        RatingKit.shared.trackPurchase()
                        dismiss()
                    }
                    return true
                }
                return false
            },
            onRestore: {
                await store.restore()
                if store.isPremium {
                    await MainActor.run {
                        SubscriptionManager.shared.isSubscribed = true
                        PreferencesService.shared.isSubscribed = true
                        dismiss()
                    }
                }
            },
            onDismiss: {
                dismiss()
            }
        )
    }
}
