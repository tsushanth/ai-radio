//
//  AuthService.swift
//  BriefCast
//
//  Authentication service - Google/Apple Sign-In with Supabase
//

import Foundation
import AuthenticationServices
import Supabase
import GoogleSignIn

@MainActor
class AuthService: ObservableObject {
    @Published var isAuthenticated: Bool = false
    @Published var currentUser: User?

    private let apiService = APIService.shared
    private let supabaseClient = SupabaseManager.shared
    private let appleSignInHelper = AppleSignInHelper()
    private let googleSignInHelper = GoogleSignInHelper()
    private let googleOAuthHelper = GoogleOAuthHelper()

    // MARK: - Sign In

    func signInWithApple() async throws {
        // Get Apple credentials
        let (idToken, nonce) = try await appleSignInHelper.signIn()

        // Sign in with Supabase
        let session = try await supabaseClient.signInWithApple(idToken: idToken, nonce: nonce)

        // Create user from session
        currentUser = try await createUserFromSession(session)
        isAuthenticated = true

        // Save auth token
        await saveAuthToken(session.accessToken)
    }

    func signInWithGoogle() async throws {
        // Use basic Google Sign-In for authentication only (no Gmail permissions)
        // Gmail permissions will be requested separately during onboarding
        let (idToken, accessToken) = try await googleSignInHelper.signIn()

        // Sign in with Supabase using the ID token
        let session = try await supabaseClient.signInWithGoogle(idToken: idToken, accessToken: accessToken)

        // Create user from session
        currentUser = try await createUserFromSession(session)
        isAuthenticated = true

        // Save auth token
        await saveAuthToken(session.accessToken)

        print("✅ Signed in with Google (Gmail permissions will be requested in onboarding)")
    }

    // MARK: - Sign Out

    func signOut() async {
        // Sign out from Supabase
        try? await supabaseClient.signOut()

        // Sign out from Google if needed
        googleSignInHelper.signOut()

        // Clear local state
        isAuthenticated = false
        currentUser = nil
        await apiService.setAuthToken("")
    }

    // MARK: - Delete Account

    func deleteAccount() async throws {
        guard let user = currentUser else {
            throw NSError(domain: "AuthService", code: -1, userInfo: [NSLocalizedDescriptionKey: "No user logged in"])
        }

        let userId = user.email
        let isGuestUser = userId.isEmpty || user.id.hasPrefix("guest_")

        // 1. Call backend to delete all user data (skip for guest users who have no server data)
        if !isGuestUser {
            guard let encodedUserId = userId.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed),
                  !encodedUserId.isEmpty,
                  let url = URL(string: "https://ai-radio-backend-917362189743.us-central1.run.app/api/user/\(encodedUserId)") else {
                throw NSError(domain: "AuthService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
            }

            var request = URLRequest(url: url)
            request.httpMethod = "DELETE"
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")

            let (data, response) = try await URLSession.shared.data(for: request)

            guard let httpResponse = response as? HTTPURLResponse else {
                throw NSError(domain: "AuthService", code: -2, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
            }

            guard httpResponse.statusCode == 200 else {
                let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
                throw NSError(domain: "AuthService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Failed to delete account: \(errorBody)"])
            }
        } else {
            print("👤 Guest user - skipping backend delete (no server data)")
        }

        // 2. Revoke Google OAuth if connected
        try? await googleOAuthHelper.revokeAccess()

        // 3. Sign out from Supabase
        try? await supabaseClient.signOut()

        // 4. Clear all local data
        clearAllLocalData()

        // 5. Sign out from Google
        googleSignInHelper.signOut()

        // 6. Update state
        isAuthenticated = false
        currentUser = nil
        await apiService.setAuthToken("")

        print("✅ Account deleted successfully")
    }

    private func clearAllLocalData() {
        // Clear all UserDefaults related to the app
        let keysToRemove = [
            "hasLinkedGoogleAccount",
            "linkedAccountEmail",
            "linkedAccountProvider",
            "hasLinkedCalendar",
            "hasCompletedOnboarding",
            "bookmarkedTopicIds",
            "hiddenTopicIds",
            "preferredLanguage",
            "isGuestUser",
            "guestUserId",
            "cachedDailyBriefEpisode"
        ]

        for key in keysToRemove {
            UserDefaults.standard.removeObject(forKey: key)
        }

        UserDefaults.standard.synchronize()
        print("✅ Local data cleared")
    }

    // MARK: - Session Management

    func restoreSession() async {
        // Check if there's an existing Supabase session
        guard let session = await supabaseClient.session else {
            return
        }

        // Restore user from session
        do {
            currentUser = try await createUserFromSession(session)
            isAuthenticated = true
            await saveAuthToken(session.accessToken)
        } catch {
            print("Failed to restore session: \(error)")
            // Clear invalid session
            try? await supabaseClient.signOut()
        }
    }

    func saveAuthToken(_ token: String) async {
        // Store token in API service for authenticated requests
        await apiService.setAuthToken(token)

        // TODO: Store token securely in Keychain for persistence
    }

    // MARK: - Helper Methods

    func createUserFromSession(_ session: Session) async throws -> User {
        let supabaseUser = session.user

        // Extract name from user metadata
        var userName: String = supabaseUser.email ?? "User"
        if case let .string(fullName) = supabaseUser.userMetadata["full_name"] {
            userName = fullName
        }

        // Fetch user profile from backend
        // For now, create a user with basic info from Supabase
        return User(
            id: supabaseUser.id.uuidString,
            email: supabaseUser.email ?? "",
            name: userName,
            timezone: TimeZone.current.identifier,
            linkedAccounts: [],
            preferences: UserPreferences(
                briefingTime: "07:00",
                topics: ["News", "Tech"],
                voiceHost1: "en-US-Neural2-J",
                voiceHost2: "en-US-Neural2-D",
                includeWeather: false,
                includeCalendar: false,
                includeEmail: false
            ),
            createdAt: supabaseUser.createdAt,
            updatedAt: supabaseUser.updatedAt
        )
    }

    // MARK: - Guest Mode

    func continueAsGuest() async {
        let guestId = "guest_\(Int(Date().timeIntervalSince1970 * 1000))"
        print("👤 Continuing as guest: \(guestId)")

        // Create a guest user
        currentUser = User(
            id: guestId,
            email: "",
            name: "Guest",
            timezone: TimeZone.current.identifier,
            linkedAccounts: [],
            preferences: UserPreferences(
                briefingTime: "07:00",
                topics: ["News", "Tech"],
                voiceHost1: "en-US-Neural2-J",
                voiceHost2: "en-US-Neural2-D",
                includeWeather: false,
                includeCalendar: false,
                includeEmail: false
            ),
            createdAt: Date(),
            updatedAt: Date()
        )
        isAuthenticated = true

        // Store guest state
        UserDefaults.standard.set(true, forKey: "isGuestUser")
        UserDefaults.standard.set(guestId, forKey: "guestUserId")
    }

    // MARK: - OAuth Account Linking

    func linkGoogleAccount() async throws {
        // Request OAuth access with Gmail scope
        let (email, accessToken, refreshToken) = try await googleOAuthHelper.requestAccess(
            includeEmail: true,
            includeCalendar: false
        )

        // Store tokens on backend
        try await storeLinkedAccount(
            provider: "google",
            email: email,
            accessToken: accessToken,
            refreshToken: refreshToken
        )

        // Save to UserDefaults
        UserDefaults.standard.set(true, forKey: "hasLinkedGoogleAccount")
        UserDefaults.standard.set(email, forKey: "linkedAccountEmail")
        UserDefaults.standard.set("google", forKey: "linkedAccountProvider")

        print("✅ Linked Google account: \(email)")
    }

    func linkMicrosoftAccount() async throws {
        // TODO: Initiate Microsoft OAuth flow for Outlook/Calendar access
        print("Link Microsoft account - TODO")
    }

    // MARK: - Backend API

    private func storeLinkedAccount(
        provider: String,
        email: String,
        accessToken: String,
        refreshToken: String?
    ) async throws {
        // Use the email as the user identifier for the backend
        let userId = email

        guard let url = URL(string: "https://ai-radio-backend-917362189743.us-central1.run.app/api/linked-accounts/\(userId)") else {
            throw NSError(domain: "AuthService", code: -1, userInfo: [NSLocalizedDescriptionKey: "Invalid URL"])
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "provider": provider,
            "email": email,
            "access_token": accessToken,
            "refresh_token": refreshToken ?? "",
            "email_enabled": true,
            "calendar_enabled": false
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NSError(domain: "AuthService", code: -2, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
        }

        // Accept 200 (updated existing) or 201 (created new)
        guard httpResponse.statusCode == 200 || httpResponse.statusCode == 201 else {
            let errorBody = String(data: data, encoding: .utf8) ?? "Unknown error"
            print("❌ Failed to store linked account: \(httpResponse.statusCode) - \(errorBody)")
            throw NSError(domain: "AuthService", code: httpResponse.statusCode, userInfo: [NSLocalizedDescriptionKey: "Failed to store linked account: \(errorBody)"])
        }

        print("✅ Stored linked account on backend for: \(email)")
    }
}
