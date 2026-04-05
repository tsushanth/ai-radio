import SwiftUI
import PaywallKit

/// Paywall powered by PaywallKit — A/B tested templates with Terms & Privacy links
struct RemotePaywallView: View {
    @Environment(\.dismiss) private var dismiss
    var triggerSource: String = "unknown"

    @ObservedObject private var store = StoreManager.shared

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

    var body: some View {
        PaywallView(
            appId: "audexa",
            appName: "Audexa Premium",
            features: features,
            products: store.paywallProducts,
            theme: theme,
            showWinback: true,
            isDismissible: true,
            onPurchase: { productId in
                let result = await store.purchase(productId: productId)
                if case .purchased = result {
                    await MainActor.run {
                        SubscriptionManager.shared.isSubscribed = true
                        PreferencesService.shared.isSubscribed = true
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
