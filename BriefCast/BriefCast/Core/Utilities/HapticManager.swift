//
//  HapticManager.swift
//  BriefCast
//
//  Haptic feedback manager with accessibility support
//

import UIKit

final class HapticManager {
    static let shared = HapticManager()

    private let impactLight = UIImpactFeedbackGenerator(style: .light)
    private let impactMedium = UIImpactFeedbackGenerator(style: .medium)
    private let impactHeavy = UIImpactFeedbackGenerator(style: .heavy)
    private let selectionGenerator = UISelectionFeedbackGenerator()
    private let notification = UINotificationFeedbackGenerator()

    private var isHapticsEnabled: Bool {
        // Respect reduce motion accessibility setting
        !UIAccessibility.isReduceMotionEnabled
    }

    private init() {
        // Prepare generators for lower latency
        prepare()
    }

    // MARK: - Preparation

    func prepare() {
        guard isHapticsEnabled else { return }
        impactLight.prepare()
        impactMedium.prepare()
        impactHeavy.prepare()
        selectionGenerator.prepare()
        notification.prepare()
    }

    // MARK: - Impact Feedback

    /// Light impact - Use for subtle interactions (tab switches, slider movements)
    func light() {
        guard isHapticsEnabled else { return }
        impactLight.impactOccurred()
    }

    /// Medium impact - Use for primary actions (button presses, play/pause)
    func medium() {
        guard isHapticsEnabled else { return }
        impactMedium.impactOccurred()
    }

    /// Heavy impact - Use for important or destructive actions
    func heavy() {
        guard isHapticsEnabled else { return }
        impactHeavy.impactOccurred()
    }

    // MARK: - Selection Feedback

    /// Selection changed - Use for scrolling through items, picker changes
    func selection() {
        guard isHapticsEnabled else { return }
        selectionGenerator.selectionChanged()
    }

    // MARK: - Notification Feedback

    /// Success notification - Use for successful operations
    func success() {
        guard isHapticsEnabled else { return }
        notification.notificationOccurred(.success)
    }

    /// Warning notification - Use for warnings
    func warning() {
        guard isHapticsEnabled else { return }
        notification.notificationOccurred(.warning)
    }

    /// Error notification - Use for errors
    func error() {
        guard isHapticsEnabled else { return }
        notification.notificationOccurred(.error)
    }
}

// MARK: - SwiftUI View Extension

import SwiftUI

extension View {
    /// Add haptic feedback on tap
    func hapticFeedback(_ style: HapticStyle = .light) -> some View {
        self.onTapGesture {
            switch style {
            case .light:
                HapticManager.shared.light()
            case .medium:
                HapticManager.shared.medium()
            case .heavy:
                HapticManager.shared.heavy()
            case .selection:
                HapticManager.shared.selection()
            }
        }
    }
}

enum HapticStyle {
    case light
    case medium
    case heavy
    case selection
}
