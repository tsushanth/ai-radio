//
//  Theme.swift
//  BriefCast
//
//  Design system for AIRadio app
//

import SwiftUI

struct Theme {

    // MARK: - Colors

    struct Colors {
        static let background = Color.black
        static let cardBackground = Color(hex: "#1C1C1E")
        static let primaryText = Color.white
        static let secondaryText = Color(hex: "#8E8E93")
        static let accent = Color(hex: "#FF6B35") // warm orange

        // Gradient for hero header
        static let heroGradient = LinearGradient(
            colors: [
                Color(hex: "#8B4513"),  // saddle brown
                Color(hex: "#D2691E"),  // chocolate
                Color(hex: "#FF8C00"),  // dark orange
                Color(hex: "#FFD700").opacity(0.3)  // gold fade
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
    }

    // MARK: - Typography

    struct Typography {
        static let largeTitle = Font.system(size: 36, weight: .bold)
        static let title = Font.system(size: 20, weight: .semibold)
        static let body = Font.system(size: 16, weight: .regular)
        static let caption = Font.system(size: 12, weight: .regular)
    }

    // MARK: - Spacing

    struct Spacing {
        static let cardCornerRadius: CGFloat = 16
        static let screenPadding: CGFloat = 16
        static let cardSpacing: CGFloat = 12
        static let sectionSpacing: CGFloat = 24
    }

    // MARK: - Sizing

    struct Sizing {
        static let miniPlayerHeight: CGFloat = 60
        static let tabBarHeight: CGFloat = 80
        static let cardImageHeight: CGFloat = 120
    }
}

// MARK: - Color Extension for Hex

extension Color {
    init(hex: String) {
        let hex = hex.trimmingCharacters(in: CharacterSet.alphanumerics.inverted)
        var int: UInt64 = 0
        Scanner(string: hex).scanHexInt64(&int)
        let a, r, g, b: UInt64
        switch hex.count {
        case 3: // RGB (12-bit)
            (a, r, g, b) = (255, (int >> 8) * 17, (int >> 4 & 0xF) * 17, (int & 0xF) * 17)
        case 6: // RGB (24-bit)
            (a, r, g, b) = (255, int >> 16, int >> 8 & 0xFF, int & 0xFF)
        case 8: // ARGB (32-bit)
            (a, r, g, b) = (int >> 24, int >> 16 & 0xFF, int >> 8 & 0xFF, int & 0xFF)
        default:
            (a, r, g, b) = (1, 1, 1, 0)
        }

        self.init(
            .sRGB,
            red: Double(r) / 255,
            green: Double(g) / 255,
            blue:  Double(b) / 255,
            opacity: Double(a) / 255
        )
    }
}
