//
//  WinbackOfferView.swift
//  BriefCast (Audexa)
//
//  Winback offer shown to users who dismissed the paywall 3+ times.
//  Audio/news theme — highlights briefing and listening value props.
//

import SwiftUI

struct WinbackOfferView: View {
    @Environment(\.dismiss) private var dismiss
    @State private var subscriptionManager = SubscriptionManager.shared
    @State private var isPurchasing = false
    @State private var showError = false
    @State private var errorMessage = ""

    // Accent color matching Audexa's brand
    private let accent = Color(red: 0.22, green: 0.56, blue: 1.0)

    var body: some View {
        ZStack {
            // Background gradient
            LinearGradient(
                colors: [
                    Color(red: 0.05, green: 0.07, blue: 0.14),
                    Color(red: 0.08, green: 0.12, blue: 0.22)
                ],
                startPoint: .top,
                endPoint: .bottom
            )
            .ignoresSafeArea()

            ScrollView {
                VStack(spacing: 28) {

                    // MARK: - Badge
                    Text("SPECIAL OFFER")
                        .font(.system(size: 12, weight: .bold))
                        .tracking(1.5)
                        .foregroundColor(.white)
                        .padding(.horizontal, 16)
                        .padding(.vertical, 6)
                        .background(
                            Capsule()
                                .fill(accent)
                        )
                        .padding(.top, 40)

                    // MARK: - Icon
                    ZStack {
                        Circle()
                            .fill(accent.opacity(0.15))
                            .frame(width: 90, height: 90)
                        Image(systemName: "headphones")
                            .font(.system(size: 40))
                            .foregroundColor(accent)
                    }

                    // MARK: - Headline
                    VStack(spacing: 8) {
                        Text("Your Daily Briefings Await")
                            .font(.system(size: 30, weight: .bold))
                            .foregroundColor(.white)
                            .multilineTextAlignment(.center)

                        Text("Stay informed with premium audio briefings, tailored to your interests.")
                            .font(.system(size: 16))
                            .foregroundColor(.white.opacity(0.65))
                            .multilineTextAlignment(.center)
                            .padding(.horizontal, 24)
                    }

                    // MARK: - Value Props
                    VStack(spacing: 14) {
                        WinbackFeatureRow(
                            icon: "speaker.slash.fill",
                            title: "Ad-Free Listening",
                            subtitle: "Enjoy uninterrupted briefings every day",
                            accent: accent
                        )
                        WinbackFeatureRow(
                            icon: "waveform",
                            title: "Premium Voices",
                            subtitle: "Natural, expressive AI voices for every story",
                            accent: accent
                        )
                        WinbackFeatureRow(
                            icon: "infinity",
                            title: "Unlimited Topics",
                            subtitle: "Follow as many subjects as you want",
                            accent: accent
                        )
                        WinbackFeatureRow(
                            icon: "arrow.down.circle.fill",
                            title: "Offline Playback",
                            subtitle: "Download and listen without a connection",
                            accent: accent
                        )
                    }
                    .padding(.horizontal, 24)

                    // MARK: - CTA Button
                    Button {
                        purchaseYearly()
                    } label: {
                        HStack {
                            if isPurchasing {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Text("Get Premium Access")
                                    .font(.system(size: 18, weight: .bold))
                            }
                        }
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .frame(height: 60)
                        .background(accent)
                        .cornerRadius(16)
                        .shadow(color: accent.opacity(0.4), radius: 12, y: 6)
                    }
                    .disabled(isPurchasing)
                    .padding(.horizontal, 24)

                    // MARK: - Dismiss
                    Button {
                        dismiss()
                    } label: {
                        Text("No thanks")
                            .font(.system(size: 15, weight: .medium))
                            .foregroundColor(.white.opacity(0.4))
                    }
                    .padding(.bottom, 40)
                }
            }
        }
        .alert("Purchase Failed", isPresented: $showError) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(errorMessage)
        }
    }

    // MARK: - Purchase

    private func purchaseYearly() {
        isPurchasing = true
        Task {
            await subscriptionManager.purchase(productId: SubscriptionManager.yearlyProductId)
            await MainActor.run {
                isPurchasing = false
                if subscriptionManager.isSubscribed {
                    dismiss()
                } else if let msg = subscriptionManager.errorMessage {
                    errorMessage = msg
                    showError = true
                }
            }
        }
    }
}

// MARK: - Feature Row

private struct WinbackFeatureRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let accent: Color

    var body: some View {
        HStack(spacing: 16) {
            ZStack {
                Circle()
                    .fill(accent.opacity(0.15))
                    .frame(width: 48, height: 48)

                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(accent)
            }

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 15, weight: .semibold))
                    .foregroundColor(.white)

                Text(subtitle)
                    .font(.system(size: 13))
                    .foregroundColor(.white.opacity(0.55))
            }

            Spacer()

            Image(systemName: "checkmark.circle.fill")
                .foregroundColor(accent)
                .font(.system(size: 20))
        }
        .padding(14)
        .background(
            RoundedRectangle(cornerRadius: 14)
                .fill(Color.white.opacity(0.06))
        )
    }
}

// MARK: - Preview

#Preview {
    WinbackOfferView()
}
