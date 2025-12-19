//
//  TabRouter.swift
//  BriefCast
//
//  Custom floating tab bar with pill shape design
//

import SwiftUI

enum Tab: Int, CaseIterable {
    case home = 0
    case profile

    var title: String {
        switch self {
        case .home: return "Home"
        case .profile: return "Profile"
        }
    }

    var icon: String {
        switch self {
        case .home: return "house.fill"
        case .profile: return "person.fill"
        }
    }
}

struct TabRouter: View {
    @Binding var selectedTab: Tab

    var body: some View {
        HStack(spacing: 0) {
            ForEach(Tab.allCases, id: \.self) { tab in
                TabBarButton(
                    tab: tab,
                    isSelected: selectedTab == tab
                ) {
                    withAnimation(.spring(response: 0.3, dampingFraction: 0.7)) {
                        selectedTab = tab
                    }
                }
            }
        }
        .padding(.horizontal, 24)
        .padding(.vertical, 16)
        .background(
            ZStack {
                // Theme-aware background with blur
                Theme.Colors.cardBackground

                // Blur effect
                Rectangle()
                    .fill(.ultraThinMaterial)
                    .opacity(0.6)
            }
        )
        .clipShape(Capsule())
        .overlay(
            Capsule()
                .stroke(Theme.Colors.secondaryText.opacity(0.2), lineWidth: 1)
        )
        .shadow(color: Color.black.opacity(0.2), radius: 20, x: 0, y: 10)
        .padding(.horizontal, 24)
        .padding(.bottom, 16)
    }
}

struct TabBarButton: View {
    let tab: Tab
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            VStack(spacing: 6) {
                // Icon
                Image(systemName: tab.icon)
                    .font(.system(size: isSelected ? 26 : 24, weight: .medium))
                    .foregroundColor(isSelected ? Theme.Colors.accent : Theme.Colors.secondaryText)
                    .scaleEffect(isSelected ? 1.1 : 1.0)

                // Label
                Text(tab.title)
                    .font(.system(size: 11, weight: isSelected ? .semibold : .regular))
                    .foregroundColor(isSelected ? Theme.Colors.accent : Theme.Colors.secondaryText)
            }
            .frame(maxWidth: .infinity)
            .contentShape(Rectangle())
        }
        .buttonStyle(TabButtonStyle())
    }
}

// Custom button style for subtle feedback
struct TabButtonStyle: ButtonStyle {
    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed ? 0.9 : 1.0)
            .animation(.spring(response: 0.2, dampingFraction: 0.6), value: configuration.isPressed)
    }
}

#Preview {
    @Previewable @State var selectedTab: Tab = .home

    VStack {
        Spacer()

        Text("Selected: \(selectedTab.title)")
            .font(.title)
            .foregroundColor(.white)

        Spacer()

        TabRouter(selectedTab: $selectedTab)
    }
    .background(Color.black)
}
