//
//  GoogleOAuthHelper.swift
//  BriefCast
//
//  Google OAuth helper for Gmail and Calendar access
//

import Foundation
import GoogleSignIn
import UIKit

/// Errors that can occur during Google OAuth flow
enum GoogleOAuthError: LocalizedError {
    case permissionDenied(message: String)
    case noViewController
    case noEmail
    case noScopes

    var errorDescription: String? {
        switch self {
        case .permissionDenied(let message):
            return message
        case .noViewController:
            return "Unable to present sign-in screen"
        case .noEmail:
            return "No email found in Google profile"
        case .noScopes:
            return "No permissions were requested"
        }
    }
}

@MainActor
class GoogleOAuthHelper {

    /// OAuth scopes for Gmail and Calendar access
    /// Using gmail.modify as it's the verified scope in our Google Cloud project
    private let gmailScopes = [
        "https://www.googleapis.com/auth/gmail.modify"
    ]

    private let calendarScopes = [
        "https://www.googleapis.com/auth/calendar.readonly"
    ]

    /// Get the topmost view controller to present from
    /// This handles cases where sheets/modals are presented
    private func getTopViewController() -> UIViewController? {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootViewController = windowScene.windows.first?.rootViewController else {
            return nil
        }

        // Traverse to find the topmost presented view controller
        var topController = rootViewController
        while let presentedController = topController.presentedViewController {
            topController = presentedController
        }

        return topController
    }

    /// Request OAuth access for Gmail and/or Calendar
    /// - Parameters:
    ///   - includeEmail: Request Gmail access
    ///   - includeCalendar: Request Calendar access
    /// - Returns: Tuple containing email, access token, and refresh token
    func requestAccess(includeEmail: Bool = true, includeCalendar: Bool = false) async throws -> (email: String, accessToken: String, refreshToken: String?) {
        guard let presentingViewController = getTopViewController() else {
            throw NSError(domain: "GoogleOAuth", code: -1, userInfo: [NSLocalizedDescriptionKey: "No view controller available to present from"])
        }

        // Build scopes array
        var scopes: [String] = []
        if includeEmail {
            scopes.append(contentsOf: gmailScopes)
        }
        if includeCalendar {
            scopes.append(contentsOf: calendarScopes)
        }

        guard !scopes.isEmpty else {
            throw NSError(domain: "GoogleOAuth", code: -2, userInfo: [NSLocalizedDescriptionKey: "No scopes requested"])
        }

        // Configure Google Sign-In with verified iOS client ID
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(clientID: "517355381306-4lphf7btejm7at9sq4l5a5uc1t2aig4s.apps.googleusercontent.com")

        // Sign out first to ensure we get a fresh token with all requested scopes
        // This forces a new OAuth flow with the requested scopes
        GIDSignIn.sharedInstance.signOut()

        print("🔐 Starting Google OAuth flow...")
        print("   Presenting from: \(type(of: presentingViewController))")
        print("   Requested scopes: \(scopes)")

        // Sign in with all scopes from the start
        // Use the topmost view controller to avoid presentation conflicts
        let signInResult = try await GIDSignIn.sharedInstance.signIn(
            withPresenting: presentingViewController,
            hint: nil,
            additionalScopes: scopes
        )
        let user = signInResult.user

        guard let email = user.profile?.email else {
            throw NSError(domain: "GoogleOAuth", code: -3, userInfo: [NSLocalizedDescriptionKey: "No email in profile"])
        }

        let accessToken = user.accessToken.tokenString
        let refreshToken = user.refreshToken.tokenString

        print("✅ Google OAuth success: \(email)")
        print("   Granted scopes: \(user.grantedScopes ?? [])")

        // Verify that required scopes were actually granted
        // Users can uncheck permissions during the OAuth flow
        let grantedScopes = user.grantedScopes ?? []

        // Check if Gmail scope was requested but not granted
        if includeEmail {
            let hasGmailScope = grantedScopes.contains { scope in
                gmailScopes.contains(scope)
            }
            if !hasGmailScope {
                print("❌ Gmail permission was NOT granted by user")
                throw GoogleOAuthError.permissionDenied(
                    message: "Gmail access was not granted. Please try again and make sure to check the box that allows access to your email."
                )
            }
        }

        // Check if Calendar scope was requested but not granted
        if includeCalendar {
            let hasCalendarScope = grantedScopes.contains { scope in
                calendarScopes.contains(scope)
            }
            if !hasCalendarScope {
                print("❌ Calendar permission was NOT granted by user")
                throw GoogleOAuthError.permissionDenied(
                    message: "Calendar access was not granted. Please try again and make sure to check the box that allows access to your calendar."
                )
            }
        }

        print("✅ All requested permissions were granted")

        return (email: email, accessToken: accessToken, refreshToken: refreshToken)
    }

    /// Revoke Google OAuth access
    /// This signs out locally and attempts to revoke tokens with Google
    func revokeAccess() async throws {
        // First, sign out locally (this always succeeds)
        GIDSignIn.sharedInstance.signOut()

        // Try to disconnect from Google servers (revoke tokens)
        // This can fail if there's no active session or tokens are already revoked
        do {
            try await GIDSignIn.sharedInstance.disconnect()
            print("✅ Successfully disconnected from Google")
        } catch {
            // If disconnect fails with 400, it likely means:
            // - Token is already invalid/revoked
            // - There's no active Google session
            // This is fine - the local signOut already cleared credentials
            print("⚠️ Google disconnect returned error (token may already be invalid): \(error)")
            // Don't rethrow - local sign out was successful which is what matters
        }
    }
}
