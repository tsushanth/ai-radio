//
//  PromoOfferSheet.swift
//  BriefCast
//
//  Bottom sheet that surfaces a signed Promotional Offer to lapsed users.
//  Mount via `.promoOffer()` on the root view.
//

import SwiftUI

struct PromoOfferSheet: View {
    @Bindable var manager: PromoOfferManager
    let offer: PromoOfferManager.PendingOffer

    @State private var isPurchasing = false

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "headphones")
                .font(.system(size: 56))
                .foregroundStyle(LinearGradient(
                    colors: [.purple, .pink],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .padding(.top, 32)

            Text("We saved your spot")
                .font(.title2).fontWeight(.bold)

            Text(offer.headline)
                .font(.body)
                .foregroundStyle(.secondary)
                .multilineTextAlignment(.center)
                .padding(.horizontal, 24)

            Spacer()

            Button {
                Task {
                    isPurchasing = true
                    _ = await manager.purchase()
                    isPurchasing = false
                }
            } label: {
                HStack {
                    if isPurchasing {
                        ProgressView().tint(.white)
                    } else {
                        Text("Claim Offer").fontWeight(.semibold)
                    }
                }
                .frame(maxWidth: .infinity)
                .frame(height: 52)
                .background(
                    LinearGradient(colors: [.purple, .pink],
                                   startPoint: .leading, endPoint: .trailing)
                )
                .foregroundStyle(.white)
                .cornerRadius(14)
            }
            .padding(.horizontal, 24)
            .disabled(isPurchasing)

            Button("No thanks") {
                manager.dismiss()
            }
            .foregroundStyle(.secondary)
            .padding(.bottom, 16)
        }
        .padding(.bottom, 24)
        .presentationDetents([.medium])
        .presentationDragIndicator(.visible)
    }
}

extension View {
    /// Mounts a sheet that surfaces a signed Promotional Offer for lapsed
    /// subscribers (including trial-cancellers). Place on the root view.
    func promoOffer() -> some View {
        modifier(PromoOfferModifier())
    }
}

private struct PromoOfferModifier: ViewModifier {
    @State private var manager = PromoOfferManager.shared

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: Binding(
                get: { manager.pendingOffer != nil },
                set: { if !$0 { manager.dismiss() } }
            )) {
                if let offer = manager.pendingOffer {
                    PromoOfferSheet(manager: manager, offer: offer)
                }
            }
            .task {
                // Delay so subscription state restores first, then probe once.
                try? await Task.sleep(nanoseconds: 3_000_000_000)
                await manager.refresh()
            }
    }
}
