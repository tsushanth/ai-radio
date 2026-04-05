import SwiftUI

/// Bottom sheet offering free users a choice: watch an ad or subscribe to unlock Deep Dive.
struct DeepDiveAdChoiceSheet: View {
    let onWatchAd: () -> Void
    let onSubscribe: () -> Void

    @ObservedObject private var adManager = AdManager.shared

    var body: some View {
        VStack(spacing: 20) {
            // Header
            VStack(spacing: 8) {
                Image(systemName: "sparkles")
                    .font(.system(size: 32))
                    .foregroundStyle(
                        LinearGradient(
                            colors: [Color(hex: "#FF6B35"), Color(hex: "#E55A2B")],
                            startPoint: .top, endPoint: .bottom)
                    )

                Text("Unlock Deep Dive")
                    .font(.system(size: 22, weight: .bold))

                Text("In-depth AI research on any topic")
                    .font(.system(size: 14))
                    .foregroundColor(.secondary)
            }
            .padding(.top, 8)

            // Option 1: Watch Ad
            Button(action: onWatchAd) {
                HStack(spacing: 12) {
                    Image(systemName: "play.rectangle.fill")
                        .font(.system(size: 20))
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Watch a Short Ad")
                            .font(.system(size: 16, weight: .semibold))
                        Text("Unlock one Deep Dive for free")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                }
                .padding(16)
                .background(Color(.systemGray6))
                .cornerRadius(14)
            }
            .buttonStyle(.plain)
            .disabled(!adManager.rewardedReady)
            .opacity(adManager.rewardedReady ? 1 : 0.5)

            // Option 2: Subscribe
            Button(action: onSubscribe) {
                HStack(spacing: 12) {
                    Image(systemName: "crown.fill")
                        .font(.system(size: 20))
                        .foregroundColor(.orange)
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Go Premium")
                            .font(.system(size: 16, weight: .semibold))
                        Text("Unlimited Deep Dives, ad-free")
                            .font(.system(size: 12))
                            .foregroundColor(.secondary)
                    }
                    Spacer()
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14))
                        .foregroundColor(.secondary)
                }
                .padding(16)
                .background(
                    LinearGradient(
                        colors: [Color(hex: "#FF6B35").opacity(0.1), Color(hex: "#E55A2B").opacity(0.05)],
                        startPoint: .leading, endPoint: .trailing)
                )
                .overlay(
                    RoundedRectangle(cornerRadius: 14)
                        .stroke(Color(hex: "#FF6B35").opacity(0.3), lineWidth: 1)
                )
                .cornerRadius(14)
            }
            .buttonStyle(.plain)
        }
        .padding(.horizontal, 20)
        .padding(.bottom, 16)
    }
}
