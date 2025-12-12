//
//  GoogleOAuthHelper.swift
//  BriefCast
//
//  Google OAuth helper for Gmail and Calendar access
//

import Foundation
import GoogleSignIn

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

    /// Request OAuth access for Gmail and Calendar
    func requestAccess(includeEmail: Bool = true, includeCalendar: Bool = true) async throws -> (email: String, accessToken: String, refreshToken: String?) {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootViewController = windowScene.windows.first?.rootViewController else {
            throw NSError(domain: "GoogleOAuth", code: -1, userInfo: [NSLocalizedDescriptionKey: "No root view controller"])
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

        // Always do a fresh sign-in with scopes to avoid addScopes issues
        // Sign out first to ensure we get a fresh token with all requested scopes
        GIDSignIn.sharedInstance.signOut()

        // Sign in with all scopes from the start
        let signInResult = try await GIDSignIn.sharedInstance.signIn(
            withPresenting: rootViewController,
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

        return (email: email, accessToken: accessToken, refreshToken: refreshToken)
    }

    /// Revoke Google OAuth access
    func revokeAccess() async throws {
        try await GIDSignIn.sharedInstance.disconnect()
    }
}
