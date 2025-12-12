//
//  AuthViewModel.swift
//  BriefCast
//
//  Authentication view model with Observable macro
//

import Foundation
import Observation

@Observable
@MainActor
class AuthViewModel {
    var isAuthenticated: Bool = false
    var isLoading: Bool = false
    var user: User?
    var errorMessage: String?

    private let authService = AuthService()

    // MARK: - Initialization

    init() {
        // Observe auth service changes
        Task {
            await restoreSession()
        }
    }

    // MARK: - Authentication

    func signInWithApple() async {
        isLoading = true
        errorMessage = nil

        do {
            try await authService.signInWithApple()
            // Get authenticated user from service
            user = authService.currentUser
            isAuthenticated = authService.isAuthenticated
        } catch {
            errorMessage = "Apple Sign-In failed: \(error.localizedDescription)"
            print("Apple Sign-In error: \(error)")
        }

        isLoading = false
    }

    func signInWithGoogle() async {
        isLoading = true
        errorMessage = nil

        do {
            try await authService.signInWithGoogle()
            // Get authenticated user from service
            user = authService.currentUser
            isAuthenticated = authService.isAuthenticated
        } catch {
            errorMessage = "Google Sign-In failed: \(error.localizedDescription)"
            print("Google Sign-In error: \(error)")
        }

        isLoading = false
    }

    func signOut() async {
        await authService.signOut()
        isAuthenticated = authService.isAuthenticated
        user = authService.currentUser
    }

    // MARK: - Session Management

    private func restoreSession() async {
        isLoading = true
        await authService.restoreSession()
        user = authService.currentUser
        isAuthenticated = authService.isAuthenticated
        isLoading = false
    }
}
