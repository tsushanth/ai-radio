//
//  AccessibilityHelper.swift
//  BriefCast
//
//  Accessibility utilities and helpers for VoiceOver and Dynamic Type
//

import SwiftUI

// MARK: - Accessibility Helper

struct AccessibilityHelper {
    /// Check if VoiceOver is running
    static var isVoiceOverRunning: Bool {
        UIAccessibility.isVoiceOverRunning
    }

    /// Check if reduce motion is enabled
    static var isReduceMotionEnabled: Bool {
        UIAccessibility.isReduceMotionEnabled
    }

    /// Check if reduce transparency is enabled
    static var isReduceTransparencyEnabled: Bool {
        UIAccessibility.isReduceTransparencyEnabled
    }

    /// Check if increase contrast is enabled
    static var isDarkerSystemColorsEnabled: Bool {
        UIAccessibility.isDarkerSystemColorsEnabled
    }

    /// Check if user prefers bold text
    static var isBoldTextEnabled: Bool {
        UIAccessibility.isBoldTextEnabled
    }

    /// Post accessibility announcement
    static func announce(_ message: String, delay: TimeInterval = 0) {
        DispatchQueue.main.asyncAfter(deadline: .now() + delay) {
            UIAccessibility.post(
                notification: .announcement,
                argument: message
            )
        }
    }

    /// Post screen changed notification (for major navigation changes)
    static func screenChanged(newElement: Any? = nil) {
        UIAccessibility.post(
            notification: .screenChanged,
            argument: newElement
        )
    }

    /// Post layout changed notification (for minor UI updates)
    static func layoutChanged(newElement: Any? = nil) {
        UIAccessibility.post(
            notification: .layoutChanged,
            argument: newElement
        )
    }
}

// MARK: - Dynamic Type Helpers

extension Font {
    /// Get scaled font that respects Dynamic Type
    static func scaledFont(size: CGFloat, weight: Font.Weight = .regular) -> Font {
        .system(size: size, weight: weight)
    }

    /// Get title font with Dynamic Type support
    static var accessibleTitle: Font {
        .system(.title, design: .default, weight: .bold)
    }

    /// Get headline font with Dynamic Type support
    static var accessibleHeadline: Font {
        .system(.headline, design: .default)
    }

    /// Get body font with Dynamic Type support
    static var accessibleBody: Font {
        .system(.body, design: .default)
    }

    /// Get caption font with Dynamic Type support
    static var accessibleCaption: Font {
        .system(.caption, design: .default)
    }
}

// MARK: - Accessibility View Modifiers

extension View {
    /// Add accessibility traits
    func accessibilityTraits(_ traits: AccessibilityTraits...) -> some View {
        var combined = AccessibilityTraits()
        for trait in traits {
            _ = combined.insert(trait)
        }
        return self.accessibilityAddTraits(combined)
    }

    /// Remove accessibility traits
    func accessibilityRemoveTraits(_ traits: AccessibilityTraits...) -> some View {
        var combined = AccessibilityTraits()
        for trait in traits {
            _ = combined.insert(trait)
        }
        return self.accessibilityRemoveTraits(combined)
    }

    /// Make view a button for VoiceOver
    func accessibilityButton(label: String, hint: String? = nil) -> some View {
        self
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
            .accessibilityHint(hint ?? "")
    }

    /// Make view a header for VoiceOver
    func accessibilityHeader(label: String) -> some View {
        self
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isHeader)
    }

    /// Set accessibility value that changes
    func accessibilityValue(current: String, min: String? = nil, max: String? = nil) -> some View {
        var value = current
        if let min = min, let max = max {
            value = "\(current), minimum \(min), maximum \(max)"
        }
        return self.accessibilityValue(value)
    }

    /// Add accessibility action
    func accessibilityCustomAction(
        named name: String,
        action: @escaping () -> Void
    ) -> some View {
        self.accessibilityAction(named: name) {
            action()
        }
    }

    /// Conditional animation based on reduce motion
    func conditionalAnimation<V: Equatable>(
        _ animation: Animation?,
        value: V
    ) -> some View {
        if AccessibilityHelper.isReduceMotionEnabled {
            return AnyView(self)
        } else {
            return AnyView(self.animation(animation, value: value))
        }
    }

    /// Reduce opacity if reduce transparency is enabled
    func conditionalOpacity(_ opacity: Double) -> some View {
        if AccessibilityHelper.isReduceTransparencyEnabled {
            return self.opacity(1.0)
        } else {
            return self.opacity(opacity)
        }
    }

    /// Reduce blur if reduce transparency is enabled
    func conditionalBlur(radius: CGFloat) -> some View {
        if AccessibilityHelper.isReduceTransparencyEnabled {
            return AnyView(self)
        } else {
            return AnyView(self.blur(radius: radius))
        }
    }

    /// Increase contrast if needed
    @ViewBuilder
    func conditionalContrast(_ contrast: Double) -> some View {
        if AccessibilityHelper.isDarkerSystemColorsEnabled {
            self.contrast(contrast)
        } else {
            self
        }
    }
}

// MARK: - Time Formatting for Accessibility

extension TimeInterval {
    /// Format time interval for VoiceOver
    var accessibleTimeString: String {
        let hours = Int(self) / 3600
        let minutes = (Int(self) % 3600) / 60
        let seconds = Int(self) % 60

        var components: [String] = []

        if hours > 0 {
            components.append("\(hours) \(hours == 1 ? "hour" : "hours")")
        }
        if minutes > 0 {
            components.append("\(minutes) \(minutes == 1 ? "minute" : "minutes")")
        }
        if seconds > 0 || components.isEmpty {
            components.append("\(seconds) \(seconds == 1 ? "second" : "seconds")")
        }

        return components.joined(separator: ", ")
    }
}

// MARK: - Date Formatting for Accessibility

extension Date {
    /// Format date for VoiceOver
    var accessibleDateString: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .none
        return formatter.string(from: self)
    }

    /// Format date with time for VoiceOver
    var accessibleDateTimeString: String {
        let formatter = DateFormatter()
        formatter.dateStyle = .long
        formatter.timeStyle = .short
        return formatter.string(from: self)
    }

    /// Format relative date for VoiceOver (e.g., "2 hours ago")
    var accessibleRelativeString: String {
        let formatter = RelativeDateTimeFormatter()
        formatter.unitsStyle = .full
        return formatter.localizedString(for: self, relativeTo: Date())
    }
}

// MARK: - Number Formatting for Accessibility

extension Int {
    /// Format large numbers for VoiceOver (e.g., "1,234" or "1.2 thousand")
    var accessibleNumberString: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .decimal
        return formatter.string(from: NSNumber(value: self)) ?? "\(self)"
    }
}

extension Double {
    /// Format percentage for VoiceOver
    var accessiblePercentageString: String {
        let formatter = NumberFormatter()
        formatter.numberStyle = .percent
        formatter.maximumFractionDigits = 0
        return formatter.string(from: NSNumber(value: self)) ?? "\(Int(self * 100))%"
    }
}

// MARK: - Accessibility Identifiers

struct AccessibilityID {
    // Tab Bar
    static let tabBarHome = "tab_bar_home"
    static let tabBarProfile = "tab_bar_profile"
    static let tabBarCreate = "tab_bar_create"

    // Player
    static let playButton = "play_button"
    static let pauseButton = "pause_button"
    static let skipForward = "skip_forward_button"
    static let skipBackward = "skip_backward_button"
    static let playbackSpeed = "playback_speed_button"

    // Cards
    static func showCard(id: String) -> String { "show_card_\(id)" }
    static func episodeCard(id: String) -> String { "episode_card_\(id)" }

    // Actions
    static let generateButton = "generate_button"
    static let bookmarkButton = "bookmark_button"
    static let menuButton = "menu_button"
}
