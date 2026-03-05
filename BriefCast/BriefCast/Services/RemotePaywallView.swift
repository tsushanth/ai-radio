import SwiftUI
import RevenueCatUI
import RevenueCat

/// Remote paywall powered by RevenueCatUI — design & pricing controlled from RC dashboard
struct RemotePaywallView: View {
    @Environment(\.dismiss) private var dismiss
    var triggerSource: String = "unknown"

    var body: some View {
        PaywallView(displayCloseButton: true)
            .onPurchaseCompleted { customerInfo in
                dismiss()
            }
            .onRestoreCompleted { customerInfo in
                if customerInfo.entitlements["premium"]?.isActive == true {
                    dismiss()
                }
            }
            .onAppear {
                Purchases.shared.attribution.setAttributes([
                    "last_paywall_source": triggerSource,
                    "last_paywall_date": ISO8601DateFormatter().string(from: Date())
                ])
            }
    }
}
