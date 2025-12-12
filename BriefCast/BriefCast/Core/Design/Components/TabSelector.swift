//
//  TabSelector.swift
//  BriefCast
//
//  "For You" / "Discover" toggle component with animated underline
//

import SwiftUI

struct TabSelector: View {
    @Binding var selectedTab: Int
    let tabs: [String]
    @Namespace private var animation

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Array(tabs.enumerated()), id: \.offset) { index, tab in
                VStack(spacing: 8) {
                    Button(action: {
                        // Haptic feedback
                        HapticManager.shared.selection()

                        // Animate tab change
                        if !UIAccessibility.isReduceMotionEnabled {
                            withAnimation(.spring(response: 0.3, dampingFraction: 0.8)) {
                                selectedTab = index
                            }
                        } else {
                            selectedTab = index
                        }
                    }) {
                        Text(tab)
                            .font(.system(size: 18, weight: selectedTab == index ? .bold : .medium))
                            .foregroundColor(selectedTab == index ? Theme.Colors.primaryText : Theme.Colors.secondaryText)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 8)
                            .contentTransition(.interpolate)
                    }
                    .accessibilityLabel("\(tab) tab")
                    .accessibilityHint(selectedTab == index ? "Selected" : "Double tap to switch")

                    // Underline indicator
                    Rectangle()
                        .fill(selectedTab == index ? Theme.Colors.accent : Color.clear)
                        .frame(height: 3)
                        .matchedGeometryEffect(
                            id: selectedTab == index ? "underline" : "",
                            in: animation,
                            isSource: selectedTab == index
                        )
                        .cornerRadius(1.5)
                }
            }
        }
        .padding(.horizontal, Theme.Spacing.screenPadding)
        .accessibilityElement(children: .contain)
    }
}

#Preview {
    @Previewable @State var selectedTab = 0

    VStack(spacing: 32) {
        TabSelector(selectedTab: $selectedTab, tabs: ["For You", "Discover"])

        // Example content to show tab switching
        Group {
            if selectedTab == 0 {
                Text("For You Content")
                    .font(.title)
                    .foregroundColor(Theme.Colors.primaryText)
            } else {
                Text("Discover Content")
                    .font(.title)
                    .foregroundColor(Theme.Colors.primaryText)
            }
        }
        .frame(maxWidth: .infinity, maxHeight: 200)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(16)
        .padding(.horizontal, Theme.Spacing.screenPadding)

        Spacer()
    }
    .background(Theme.Colors.background)
}
