//
//  View+Extensions.swift
//  BriefCast
//
//  View extensions for common modifiers
//

import SwiftUI

extension View {
    /// Apply card styling with background and corner radius
    func cardStyle() -> some View {
        self
            .background(Theme.Colors.cardBackground)
            .cornerRadius(Theme.Spacing.cardCornerRadius)
    }

    /// Apply screen padding
    func screenPadding() -> some View {
        self.padding(Theme.Spacing.screenPadding)
    }
}
