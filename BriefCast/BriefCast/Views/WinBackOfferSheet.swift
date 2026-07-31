//
//  WinBackOfferSheet.swift
//  BriefCast
//
//  Bottom sheet that surfaces an eligible Win-Back Offer (iOS 18+).
//  Mount via `.winBackOffer()` on the root view.
//

import SwiftUI

@available(iOS 18.0, *)
struct WinBackOfferSheet: View {
    @Bindable var manager: WinBackOfferManager
    let offer: WinBackOfferManager.EligibleOffer

    @State private var isPurchasing = false

    var body: some View {
        VStack(spacing: 24) {
            Image(systemName: "gift.fill")
                .font(.system(size: 56))
                .foregroundStyle(LinearGradient(
                    colors: [.purple, .blue],
                    startPoint: .topLeading,
                    endPoint: .bottomTrailing
                ))
                .padding(.top, 32)

            Text("We'd love you back")
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
                    LinearGradient(colors: [.purple, .blue],
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
    /// Mounts a sheet that surfaces an eligible Apple Win-Back Offer.
    /// Place on the root view, after `.ratingPrompt()`. iOS 17 and below
    /// are silently no-ops (the API doesn't exist there).
    func winBackOffer() -> some View {
        modifier(WinBackOfferModifier())
    }
}

private struct WinBackOfferModifier: ViewModifier {
    func body(content: Content) -> some View {
        if #available(iOS 18.0, *) {
            content.modifier(WinBackOfferIOS18Modifier())
        } else {
            content
        }
    }
}

@available(iOS 18.0, *)
private struct WinBackOfferIOS18Modifier: ViewModifier {
    @State private var manager = WinBackOfferManager.shared

    func body(content: Content) -> some View {
        content
            .sheet(isPresented: Binding(
                get: { manager.eligibleOffer != nil },
                set: { if !$0 { manager.dismiss() } }
            )) {
                if let offer = manager.eligibleOffer {
                    WinBackOfferSheet(manager: manager, offer: offer)
                }
            }
            .task {
                // Delay so other state restores first, then probe once.
                try? await Task.sleep(nanoseconds: 2_000_000_000)
                await manager.refresh()
            }
    }
}
