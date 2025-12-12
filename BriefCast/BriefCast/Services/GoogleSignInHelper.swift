//
//  GoogleSignInHelper.swift
//  BriefCast
//
//  Google Sign-In authentication helper
//

import Foundation
import GoogleSignIn

@MainActor
class GoogleSignInHelper {

    /// Start Google Sign-In flow
    func signIn() async throws -> (idToken: String, accessToken: String) {
        guard let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
              let rootViewController = windowScene.windows.first?.rootViewController else {
            throw NSError(domain: "GoogleSignIn", code: -1, userInfo: [NSLocalizedDescriptionKey: "No root view controller"])
        }

        // Configure Google Sign-In
        GIDSignIn.sharedInstance.configuration = GIDConfiguration(
            clientID: "517355381306-4lphf7btejm7at9sq4l5a5uc1t2aig4s.apps.googleusercontent.com"
        )

        let result = try await GIDSignIn.sharedInstance.signIn(
            withPresenting: rootViewController,
            hint: nil,
            additionalScopes: []
        )

        guard let idToken = result.user.idToken?.tokenString else {
            throw NSError(domain: "GoogleSignIn", code: -2, userInfo: [NSLocalizedDescriptionKey: "Missing ID token"])
        }

        let accessToken = result.user.accessToken.tokenString

        return (idToken: idToken, accessToken: accessToken)
    }

    /// Restore previous sign-in
    func restorePreviousSignIn() async throws -> (idToken: String, accessToken: String) {
        let result = try await GIDSignIn.sharedInstance.restorePreviousSignIn()

        guard let idToken = result.idToken?.tokenString else {
            throw NSError(domain: "GoogleSignIn", code: -3, userInfo: [NSLocalizedDescriptionKey: "Missing ID token from restored session"])
        }

        let accessToken = result.accessToken.tokenString

        return (idToken: idToken, accessToken: accessToken)
    }

    /// Sign out
    func signOut() {
        GIDSignIn.sharedInstance.signOut()
    }
}
