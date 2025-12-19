//
//  AuthView.swift
//  BriefCast
//
//  Clean login screen with Apple and Google sign-in
//

import SwiftUI
import AuthenticationServices
import CryptoKit

struct AuthView: View {
    @EnvironmentObject var authService: AuthService
    @State private var isLoading = false
    @State private var errorMessage: String?
    @State private var currentNonce: String?

    var body: some View {
        ZStack {
            // Dark background
            Color.black
                .ignoresSafeArea()

            VStack(spacing: 40) {
                Spacer()

                // App logo and branding
                VStack(spacing: 20) {
                    // Logo with gradient
                    RoundedRectangle(cornerRadius: 28)
                        .fill(Theme.Colors.heroGradient)
                        .frame(width: 140, height: 140)
                        .overlay(
                            Image(systemName: "waveform.circle.fill")
                                .font(.system(size: 70))
                                .foregroundColor(.white)
                        )
                        .shadow(color: Theme.Colors.accent.opacity(0.5), radius: 20, x: 0, y: 10)

                    // App name
                    Text("Audexa")
                        .font(.system(size: 42, weight: .bold))
                        .foregroundColor(.white)

                    // Tagline
                    Text("Your personal AI radio")
                        .font(.system(size: 18, weight: .regular))
                        .foregroundColor(.white.opacity(0.7))
                }

                Spacer()

                // Sign in buttons
                VStack(spacing: 16) {
                    // Sign in with Apple
                    SignInWithAppleButton(
                        onRequest: { request in
                            request.requestedScopes = [.email, .fullName]
                            // Generate nonce for security
                            let nonce = randomNonceString()
                            currentNonce = nonce
                            request.nonce = sha256(nonce)
                        },
                        onCompletion: { result in
                            Task {
                                await handleAppleSignIn(result: result)
                            }
                        }
                    )
                    .signInWithAppleButtonStyle(.white)
                    .frame(height: 56)
                    .cornerRadius(12)

                    // Sign in with Google
                    Button(action: {
                        Task {
                            await signInWithGoogle()
                        }
                    }) {
                        HStack(spacing: 12) {
                            Image(systemName: "g.circle.fill")
                                .font(.system(size: 24))
                                .foregroundColor(.red)

                            Text("Sign in with Google")
                                .font(.system(size: 18, weight: .semibold))
                                .foregroundColor(.black)
                        }
                        .frame(maxWidth: .infinity)
                        .frame(height: 56)
                        .background(.white)
                        .cornerRadius(12)
                    }
                    .buttonStyle(ScaleButtonStyle())

                    // Error message
                    if let error = errorMessage {
                        Text(error)
                            .font(.system(size: 14, weight: .regular))
                            .foregroundColor(.red)
                            .multilineTextAlignment(.center)
                            .padding(.top, 8)
                    }

                    // Continue without sign in
                    Button(action: {
                        Task {
                            await continueWithoutSignIn()
                        }
                    }) {
                        Text("Continue without sign in")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white.opacity(0.7))
                    }
                    .padding(.top, 8)

                    // Info text about linking later
                    Text("You can link your email later to enable personalized Daily Brief")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(.white.opacity(0.5))
                        .multilineTextAlignment(.center)
                        .padding(.top, 4)
                }
                .padding(.horizontal, 32)

                // Terms and Privacy
                VStack(spacing: 8) {
                    Text("By continuing, you agree to our")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(.white.opacity(0.5))

                    HStack(spacing: 4) {
                        Link("Terms of Service", destination: URL(string: "https://www.sendsmiles.biz/terms-of-service")!)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Theme.Colors.accent)

                        Text("and")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundColor(.white.opacity(0.5))

                        Link("Privacy Policy", destination: URL(string: "https://www.sendsmiles.biz/privacy-policy")!)
                            .font(.system(size: 13, weight: .medium))
                            .foregroundColor(Theme.Colors.accent)
                    }
                }
                .padding(.bottom, 40)
            }

            // Loading overlay
            if isLoading {
                Color.black.opacity(0.7)
                    .ignoresSafeArea()

                ProgressView()
                    .progressViewStyle(CircularProgressViewStyle(tint: Theme.Colors.accent))
                    .scaleEffect(1.5)
            }
        }
    }

    // MARK: - Authentication Methods

    private func handleAppleSignIn(result: Result<ASAuthorization, Error>) async {
        isLoading = true
        errorMessage = nil

        switch result {
        case .success(let authorization):
            guard let appleIDCredential = authorization.credential as? ASAuthorizationAppleIDCredential,
                  let appleIDToken = appleIDCredential.identityToken,
                  let idTokenString = String(data: appleIDToken, encoding: .utf8),
                  let nonce = currentNonce else {
                errorMessage = "Apple Sign-In failed: Invalid credentials"
                isLoading = false
                return
            }

            do {
                // Use the Supabase manager directly with the credentials
                let session = try await SupabaseManager.shared.signInWithApple(idToken: idTokenString, nonce: nonce)

                // Update auth service state
                authService.currentUser = try await authService.createUserFromSession(session)
                authService.isAuthenticated = true
                await authService.saveAuthToken(session.accessToken)
            } catch {
                errorMessage = "Apple Sign-In failed: \(error.localizedDescription)"
                print("Apple Sign-In error: \(error)")
            }

        case .failure(let error):
            errorMessage = "Apple Sign-In failed: \(error.localizedDescription)"
            print("Apple Sign-In error: \(error)")
        }

        isLoading = false
        currentNonce = nil
    }

    private func signInWithGoogle() async {
        isLoading = true
        errorMessage = nil

        do {
            try await authService.signInWithGoogle()
        } catch let error as NSError {
            // Check for user cancellation (code -5)
            if error.code == -5 || error.localizedDescription.contains("canceled") || error.localizedDescription.contains("cancelled") {
                // User cancelled - don't show error, just reset state
                print("ℹ️ User cancelled Google sign-in")
                errorMessage = nil
            } else {
                // Actual error - show to user
                errorMessage = "Google Sign-In failed: \(error.localizedDescription)"
                print("Google Sign-In error: \(error)")
            }
        }

        isLoading = false
    }

    private func continueWithoutSignIn() async {
        isLoading = true
        errorMessage = nil

        await authService.continueAsGuest()

        isLoading = false
    }

    // MARK: - Helper Methods

    private func randomNonceString(length: Int = 32) -> String {
        precondition(length > 0)
        var randomBytes = [UInt8](repeating: 0, count: length)
        let errorCode = SecRandomCopyBytes(kSecRandomDefault, randomBytes.count, &randomBytes)
        if errorCode != errSecSuccess {
            fatalError("Unable to generate nonce. SecRandomCopyBytes failed with OSStatus \(errorCode)")
        }

        let charset: [Character] = Array("0123456789ABCDEFGHIJKLMNOPQRSTUVXYZabcdefghijklmnopqrstuvwxyz-._")
        let nonce = randomBytes.map { byte in
            charset[Int(byte) % charset.count]
        }
        return String(nonce)
    }

    private func sha256(_ input: String) -> String {
        let inputData = Data(input.utf8)
        let hashedData = SHA256.hash(data: inputData)
        let hashString = hashedData.compactMap {
            String(format: "%02x", $0)
        }.joined()

        return hashString
    }
}

#Preview {
    AuthView()
        .environmentObject(AuthService())
}
