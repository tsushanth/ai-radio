//
//  MicrosoftOAuthHelper.swift
//  BriefCast
//
//  Microsoft OAuth helper for Outlook and Calendar access
//

import Foundation
import AuthenticationServices

@MainActor
class MicrosoftOAuthHelper: NSObject {

    // Microsoft OAuth configuration
    private let clientId = "YOUR_MICROSOFT_CLIENT_ID" // TODO: Replace with actual client ID from Azure portal
    private let redirectURI = "com.kreativekoala.briefcast://oauth/microsoft"
    private let authority = "https://login.microsoftonline.com/common"

    /// OAuth scopes for Outlook and Calendar access
    private let mailScopes = "https://graph.microsoft.com/Mail.Read"
    private let calendarScopes = "https://graph.microsoft.com/Calendars.Read"
    private let userScopes = "https://graph.microsoft.com/User.Read"

    private var authSession: ASWebAuthenticationSession?
    private var continuation: CheckedContinuation<(email: String, accessToken: String, refreshToken: String?), Error>?

    /// Request OAuth access for Outlook and Calendar
    func requestAccess(includeEmail: Bool = true, includeCalendar: Bool = true) async throws -> (email: String, accessToken: String, refreshToken: String?) {
        // Build scopes string
        var scopes: [String] = [userScopes]
        if includeEmail {
            scopes.append(mailScopes)
        }
        if includeCalendar {
            scopes.append(calendarScopes)
        }

        let scopeString = scopes.joined(separator: " ")

        // Build authorization URL
        let state = UUID().uuidString
        let authURL = buildAuthorizationURL(scopes: scopeString, state: state)

        return try await withCheckedThrowingContinuation { continuation in
            self.continuation = continuation

            // Create authentication session
            authSession = ASWebAuthenticationSession(
                url: authURL,
                callbackURLScheme: "com.kreativekoala.briefcast"
            ) { [weak self] callbackURL, error in
                guard let self = self else { return }

                if let error = error {
                    self.continuation?.resume(throwing: error)
                    self.continuation = nil
                    return
                }

                guard let callbackURL = callbackURL else {
                    self.continuation?.resume(throwing: NSError(
                        domain: "MicrosoftOAuth",
                        code: -1,
                        userInfo: [NSLocalizedDescriptionKey: "No callback URL"]
                    ))
                    self.continuation = nil
                    return
                }

                // Extract authorization code from callback
                Task {
                    do {
                        let result = try await self.handleCallback(callbackURL)
                        self.continuation?.resume(returning: result)
                    } catch {
                        self.continuation?.resume(throwing: error)
                    }
                    self.continuation = nil
                }
            }

            authSession?.presentationContextProvider = self
            authSession?.prefersEphemeralWebBrowserSession = false
            authSession?.start()
        }
    }

    /// Revoke Microsoft OAuth access
    func revokeAccess() async throws {
        // TODO: Call Microsoft Graph API to revoke token
        // This typically requires calling the logout endpoint
        print("Microsoft OAuth access revoked")
    }

    // MARK: - Private Methods

    private func buildAuthorizationURL(scopes: String, state: String) -> URL {
        var components = URLComponents(string: "\(authority)/oauth2/v2.0/authorize")!

        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "response_type", value: "code"),
            URLQueryItem(name: "redirect_uri", value: redirectURI),
            URLQueryItem(name: "scope", value: scopes),
            URLQueryItem(name: "state", value: state),
            URLQueryItem(name: "response_mode", value: "query")
        ]

        return components.url!
    }

    private func handleCallback(_ url: URL) async throws -> (email: String, accessToken: String, refreshToken: String?) {
        guard let components = URLComponents(url: url, resolvingAgainstBaseURL: false),
              let queryItems = components.queryItems else {
            throw NSError(domain: "MicrosoftOAuth", code: -2, userInfo: [NSLocalizedDescriptionKey: "Invalid callback URL"])
        }

        // Check for errors
        if let error = queryItems.first(where: { $0.name == "error" })?.value {
            let errorDescription = queryItems.first(where: { $0.name == "error_description" })?.value ?? error
            throw NSError(domain: "MicrosoftOAuth", code: -3, userInfo: [NSLocalizedDescriptionKey: errorDescription])
        }

        // Extract authorization code
        guard let code = queryItems.first(where: { $0.name == "code" })?.value else {
            throw NSError(domain: "MicrosoftOAuth", code: -4, userInfo: [NSLocalizedDescriptionKey: "No authorization code"])
        }

        // Exchange code for tokens
        return try await exchangeCodeForTokens(code: code)
    }

    private func exchangeCodeForTokens(code: String) async throws -> (email: String, accessToken: String, refreshToken: String?) {
        // Build token request
        var components = URLComponents(string: "\(authority)/oauth2/v2.0/token")!
        components.queryItems = [
            URLQueryItem(name: "client_id", value: clientId),
            URLQueryItem(name: "grant_type", value: "authorization_code"),
            URLQueryItem(name: "code", value: code),
            URLQueryItem(name: "redirect_uri", value: redirectURI)
        ]

        guard let url = components.url else {
            throw NSError(domain: "MicrosoftOAuth", code: -5, userInfo: [NSLocalizedDescriptionKey: "Invalid token URL"])
        }

        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/x-www-form-urlencoded", forHTTPHeaderField: "Content-Type")

        // Make request
        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw NSError(domain: "MicrosoftOAuth", code: -6, userInfo: [NSLocalizedDescriptionKey: "Token exchange failed"])
        }

        // Parse response
        let tokenResponse = try JSONDecoder().decode(TokenResponse.self, from: data)

        // Get user email from Microsoft Graph API
        let email = try await fetchUserEmail(accessToken: tokenResponse.accessToken)

        return (email: email, accessToken: tokenResponse.accessToken, refreshToken: tokenResponse.refreshToken)
    }

    private func fetchUserEmail(accessToken: String) async throws -> String {
        let url = URL(string: "https://graph.microsoft.com/v1.0/me")!
        var request = URLRequest(url: url)
        request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 200 else {
            throw NSError(domain: "MicrosoftOAuth", code: -7, userInfo: [NSLocalizedDescriptionKey: "Failed to fetch user profile"])
        }

        let userProfile = try JSONDecoder().decode(UserProfile.self, from: data)
        return userProfile.mail ?? userProfile.userPrincipalName
    }
}

// MARK: - ASWebAuthenticationPresentationContextProviding

extension MicrosoftOAuthHelper: ASWebAuthenticationPresentationContextProviding {
    func presentationAnchor(for session: ASWebAuthenticationSession) -> ASPresentationAnchor {
        guard let window = UIApplication.shared.connectedScenes
            .compactMap({ $0 as? UIWindowScene })
            .flatMap({ $0.windows })
            .first(where: { $0.isKeyWindow }) else {
            fatalError("No key window found")
        }
        return window
    }
}

// MARK: - Response Models

private struct TokenResponse: Codable {
    let accessToken: String
    let refreshToken: String?
    let expiresIn: Int

    enum CodingKeys: String, CodingKey {
        case accessToken = "access_token"
        case refreshToken = "refresh_token"
        case expiresIn = "expires_in"
    }
}

private struct UserProfile: Codable {
    let mail: String?
    let userPrincipalName: String
}
