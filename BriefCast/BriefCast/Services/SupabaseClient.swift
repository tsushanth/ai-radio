//
//  SupabaseClient.swift
//  BriefCast
//
//  Supabase client configuration
//

import Foundation
import Supabase

class SupabaseManager {
    static let shared = SupabaseManager()

    let client: SupabaseClient

    private init() {
        // Initialize Supabase client
        client = SupabaseClient(
            supabaseURL: URL(string: "https://lxtuvvsrtpoqgikbpasm.supabase.co")!,
            supabaseKey: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx4dHV2dnNydHBvcWdpa2JwYXNtIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjUzMDA5NDEsImV4cCI6MjA4MDg3Njk0MX0.-0L2P6Wutv8hlsmMBaurznr1HgWSOWukj7rZTmmkuI4"
        )
    }

    // MARK: - Authentication Methods

    /// Sign in with Apple ID token
    func signInWithApple(idToken: String, nonce: String) async throws -> Session {
        let session = try await client.auth.signInWithIdToken(
            credentials: .init(
                provider: .apple,
                idToken: idToken,
                nonce: nonce
            )
        )
        return session
    }

    /// Sign in with Google
    func signInWithGoogle(idToken: String, accessToken: String) async throws -> Session {
        let session = try await client.auth.signInWithIdToken(
            credentials: .init(
                provider: .google,
                idToken: idToken,
                accessToken: accessToken,
                nonce: nil
            )
        )
        return session
    }

    /// Sign out current user
    func signOut() async throws {
        try await client.auth.signOut()
    }

    // MARK: - Helper Methods

    /// Get current session
    var session: Session? {
        get async {
            try? await client.auth.session
        }
    }

    /// Get current user
    var currentUser: Auth.User? {
        get async {
            await session?.user
        }
    }

    /// Check if user is authenticated
    var isAuthenticated: Bool {
        get async {
            await session != nil
        }
    }
}
