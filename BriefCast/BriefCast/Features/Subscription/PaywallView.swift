//
//  PaywallView.swift
//  BriefCast
//
//  Legacy paywall - now wraps RemotePaywallView (PaywallKit)
//

import SwiftUI

struct LegacyPaywallView: View {
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        RemotePaywallView(triggerSource: "legacy")
    }
}
