//
//  PaywallCoordinator.swift
//  BriefCast (Audexa)
//
//  Tracks paywall dismisses and determines when to show the winback offer.
//  Uses UserDefaults to persist dismiss count and cooldown timestamps.
//

import Foundation
import Combine

/// Tracks paywall dismisses and determines when to show the winback offer.
@MainActor
final class PaywallCoordinator: ObservableObject {

    static let shared = PaywallCoordinator()

    // MARK: - Published

    @Published var showWinbackOffer = false

    // MARK: - UserDefaults Keys

    private enum Keys {
        static let dismissCount = "com.kreativekoala.audexa.paywallDismissCount"
        static let lastDismissDate = "com.kreativekoala.audexa.paywallLastDismissDate"
        static let lastWinbackShownDate = "com.kreativekoala.audexa.lastWinbackShownDate"
    }

    // MARK: - Configuration

    /// Number of paywall dismisses required before showing winback
    private let requiredDismisses = 3

    /// Minimum seconds between the last dismiss and showing the winback (1 day)
    private let cooldownInterval: TimeInterval = 86_400

    // MARK: - Computed

    var paywallDismissCount: Int {
        get { UserDefaults.standard.integer(forKey: Keys.dismissCount) }
        set { UserDefaults.standard.set(newValue, forKey: Keys.dismissCount) }
    }

    private var lastDismissDate: Date? {
        get {
            let ti = UserDefaults.standard.double(forKey: Keys.lastDismissDate)
            return ti > 0 ? Date(timeIntervalSince1970: ti) : nil
        }
        set {
            if let date = newValue {
                UserDefaults.standard.set(date.timeIntervalSince1970, forKey: Keys.lastDismissDate)
            }
        }
    }

    private var lastWinbackShownDate: Date? {
        get {
            let ti = UserDefaults.standard.double(forKey: Keys.lastWinbackShownDate)
            return ti > 0 ? Date(timeIntervalSince1970: ti) : nil
        }
        set {
            if let date = newValue {
                UserDefaults.standard.set(date.timeIntervalSince1970, forKey: Keys.lastWinbackShownDate)
            }
        }
    }

    // MARK: - Init

    private init() {}

    // MARK: - Public

    /// Call when the user dismisses a paywall.
    func trackDismiss() {
        paywallDismissCount += 1
        lastDismissDate = Date()
    }

    /// Evaluate whether the winback offer should be displayed.
    /// Typically called when the app enters foreground.
    func checkWinbackEligibility() {
        guard paywallDismissCount >= requiredDismisses else { return }

        // Ensure at least 1 day has passed since last dismiss
        if let lastDismiss = lastDismissDate {
            guard Date().timeIntervalSince(lastDismiss) >= cooldownInterval else { return }
        }

        // Don't show more than once per day
        if let lastShown = lastWinbackShownDate,
           Calendar.current.isDateInToday(lastShown) {
            return
        }

        showWinbackOffer = true
        lastWinbackShownDate = Date()
    }
}
