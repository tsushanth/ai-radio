//
//  LinkedAccountsView.swift
//  BriefCast
//
//  Gmail/Outlook linking view with OAuth flows
//

import SwiftUI
import GoogleSignIn

struct LinkedAccountsView: View {
    @StateObject private var viewModel = LinkedAccountsViewModel()
    @Environment(\.dismiss) private var dismiss

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(spacing: 24) {
                    // Header description
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Connect your accounts to personalize your daily briefings with relevant information from your emails.")
                            .font(.system(size: 15, weight: .regular))
                            .foregroundColor(Theme.Colors.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(.horizontal, 16)
                    .padding(.top, 16)

                    // Connected Accounts
                    if !viewModel.connectedAccounts.isEmpty {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Connected Accounts")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(Theme.Colors.primaryText)
                                .padding(.horizontal, 16)

                            ForEach(viewModel.connectedAccounts) { account in
                                UserConnectedAccountCard(
                                    account: account,
                                    onToggleEmail: { enabled in
                                        viewModel.updatePermission(accountId: account.id, emailEnabled: enabled)
                                    },
                                    onDisconnect: {
                                        viewModel.disconnectAccount(account)
                                    }
                                )
                            }
                        }
                    }

                    // Available Integrations
                    VStack(alignment: .leading, spacing: 12) {
                        Text(viewModel.connectedAccounts.isEmpty && !viewModel.hasLinkedCalendar ? "Available Accounts" : "Add Another Account")
                            .font(.system(size: 20, weight: .bold))
                            .foregroundColor(Theme.Colors.primaryText)
                            .padding(.horizontal, 16)

                        ForEach(viewModel.availableProviders) { provider in
                            // Skip showing provider if already connected
                            let isConnected = (provider.id == "google" && !viewModel.connectedAccounts.isEmpty) ||
                                              (provider.id == "google_calendar" && viewModel.hasLinkedCalendar)

                            if !isConnected {
                                ProviderCard(
                                    provider: provider,
                                    onConnect: {
                                        Task {
                                            await viewModel.connectAccount(provider: provider)
                                        }
                                    }
                                )
                            }
                        }
                    }

                    // Show connected calendar section if linked
                    if viewModel.hasLinkedCalendar {
                        VStack(alignment: .leading, spacing: 12) {
                            Text("Connected Calendar")
                                .font(.system(size: 20, weight: .bold))
                                .foregroundColor(Theme.Colors.primaryText)
                                .padding(.horizontal, 16)

                            CalendarConnectedCard(onDisconnect: {
                                viewModel.disconnectCalendar()
                            })
                        }
                    }

                    // Info section
                    VStack(alignment: .leading, spacing: 12) {
                        HStack(spacing: 8) {
                            Image(systemName: "lock.shield.fill")
                                .font(.system(size: 16))
                                .foregroundColor(Theme.Colors.accent)

                            Text("Your data is secure")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Theme.Colors.primaryText)
                        }

                        Text("We only access the information you explicitly allow and use it solely to create your personalized briefings. You can revoke access at any time.")
                            .font(.system(size: 13, weight: .regular))
                            .foregroundColor(Theme.Colors.secondaryText)
                            .fixedSize(horizontal: false, vertical: true)
                    }
                    .padding(16)
                    .background(Theme.Colors.cardBackground)
                    .cornerRadius(12)
                    .padding(.horizontal, 16)
                }
                .padding(.bottom, 32)
            }
            .background(Theme.Colors.background)
            .navigationTitle("Linked Accounts")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(Theme.Colors.accent)
                }
            }
            .alert("Connection Error", isPresented: $viewModel.showError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(viewModel.errorMessage ?? "Failed to connect account")
            }
            .overlay {
                if viewModel.isLoading {
                    Color.black.opacity(0.5)
                        .ignoresSafeArea()

                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Theme.Colors.accent))
                        .scaleEffect(1.5)
                }
            }
            .onOpenURL { url in
                // Handle Google OAuth callback when this sheet is presented
                print("📱 Received URL in LinkedAccountsView: \(url)")
                GIDSignIn.sharedInstance.handle(url)
            }
        }
    }
}

// MARK: - Supporting Views

struct ProviderCard: View {
    let provider: OAuthProvider
    let onConnect: () -> Void

    var body: some View {
        Button(action: onConnect) {
            VStack(alignment: .leading, spacing: 16) {
                HStack(spacing: 12) {
                    // Provider icon
                    Circle()
                        .fill(provider.color.opacity(0.15))
                        .frame(width: 48, height: 48)
                        .overlay(
                            Image(systemName: provider.iconName)
                                .font(.system(size: 24))
                                .foregroundColor(provider.color)
                        )

                    VStack(alignment: .leading, spacing: 4) {
                        Text(provider.displayName)
                            .font(.system(size: 17, weight: .semibold))
                            .foregroundColor(Theme.Colors.primaryText)

                        Text("Not connected")
                            .font(.system(size: 14, weight: .regular))
                            .foregroundColor(Theme.Colors.secondaryText)
                    }

                    Spacer()

                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Theme.Colors.secondaryText)
                }

                // What we'll access
                VStack(alignment: .leading, spacing: 8) {
                    Text("We'll access:")
                        .font(.system(size: 13, weight: .semibold))
                        .foregroundColor(Theme.Colors.secondaryText)

                    ForEach(provider.accessDescriptions, id: \.self) { description in
                        HStack(spacing: 8) {
                            Image(systemName: "checkmark.circle.fill")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.Colors.accent)

                            Text(description)
                                .font(.system(size: 13, weight: .regular))
                                .foregroundColor(Theme.Colors.secondaryText)
                        }
                    }
                }
            }
            .padding(16)
            .background(Theme.Colors.cardBackground)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(Color.white.opacity(0.05), lineWidth: 1)
            )
        }
        .buttonStyle(ScaleButtonStyle())
        .padding(.horizontal, 16)
    }
}

struct UserConnectedAccountCard: View {
    let account: UserConnectedAccount
    let onToggleEmail: (Bool) -> Void
    let onDisconnect: () -> Void

    @State private var showDisconnectConfirmation = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            // Account header
            HStack(spacing: 12) {
                Circle()
                    .fill(account.provider.color.opacity(0.15))
                    .frame(width: 48, height: 48)
                    .overlay(
                        Image(systemName: account.provider.iconName)
                            .font(.system(size: 24))
                            .foregroundColor(account.provider.color)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text(account.provider.displayName)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(Theme.Colors.primaryText)

                    Text(account.email)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundColor(Theme.Colors.secondaryText)

                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 8, height: 8)

                        Text("Connected")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.green)
                    }
                }

                Spacer()
            }

            Divider()
                .background(Color.white.opacity(0.1))

            // Permission toggles
            VStack(spacing: 12) {
                Text("Access Permissions")
                    .font(.system(size: 13, weight: .semibold))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .frame(maxWidth: .infinity, alignment: .leading)

                PermissionToggle(
                    icon: "envelope.fill",
                    title: "Email Access",
                    description: "Read emails to include in briefings",
                    isEnabled: account.emailEnabled,
                    onToggle: onToggleEmail
                )
            }

            Divider()
                .background(Color.white.opacity(0.1))

            // Disconnect button
            Button(action: {
                showDisconnectConfirmation = true
            }) {
                HStack {
                    Image(systemName: "link.badge.minus")
                        .font(.system(size: 14))

                    Text("Disconnect Account")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(.red)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
        }
        .padding(16)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(0.05), lineWidth: 1)
        )
        .padding(.horizontal, 16)
        .alert("Disconnect Account", isPresented: $showDisconnectConfirmation) {
            Button("Cancel", role: .cancel) { }
            Button("Disconnect", role: .destructive) {
                onDisconnect()
            }
        } message: {
            Text("Are you sure you want to disconnect \(account.email)? You'll stop receiving personalized content from this account.")
        }
    }
}

struct PermissionToggle: View {
    let icon: String
    let title: String
    let description: String
    let isEnabled: Bool
    let onToggle: (Bool) -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 16))
                .foregroundColor(Theme.Colors.accent)
                .frame(width: 24)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Theme.Colors.primaryText)

                Text(description)
                    .font(.system(size: 12, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
            }

            Spacer()

            Toggle("", isOn: Binding(
                get: { isEnabled },
                set: { onToggle($0) }
            ))
            .labelsHidden()
            .tint(Theme.Colors.accent)
        }
        .padding(12)
        .background(Color.white.opacity(0.03))
        .cornerRadius(8)
    }
}

// MARK: - Calendar Connected Card

struct CalendarConnectedCard: View {
    let onDisconnect: () -> Void
    @State private var showDisconnectConfirmation = false

    var body: some View {
        VStack(alignment: .leading, spacing: 16) {
            HStack(spacing: 12) {
                Circle()
                    .fill(Color.blue.opacity(0.15))
                    .frame(width: 48, height: 48)
                    .overlay(
                        Image(systemName: "calendar")
                            .font(.system(size: 24))
                            .foregroundColor(.blue)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text("Google Calendar")
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(Theme.Colors.primaryText)

                    HStack(spacing: 6) {
                        Circle()
                            .fill(Color.green)
                            .frame(width: 8, height: 8)

                        Text("Connected")
                            .font(.system(size: 12, weight: .medium))
                            .foregroundColor(.green)
                    }
                }

                Spacer()
            }

            Divider()
                .background(Color.white.opacity(0.1))

            Button(action: {
                showDisconnectConfirmation = true
            }) {
                HStack {
                    Image(systemName: "link.badge.minus")
                        .font(.system(size: 14))

                    Text("Disconnect Calendar")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(.red)
                .frame(maxWidth: .infinity)
                .padding(.vertical, 8)
            }
        }
        .padding(16)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(12)
        .overlay(
            RoundedRectangle(cornerRadius: 12)
                .stroke(Color.white.opacity(0.05), lineWidth: 1)
        )
        .padding(.horizontal, 16)
        .alert("Disconnect Calendar", isPresented: $showDisconnectConfirmation) {
            Button("Cancel", role: .cancel) { }
            Button("Disconnect", role: .destructive) {
                onDisconnect()
            }
        } message: {
            Text("Are you sure you want to disconnect your Google Calendar? Your Daily Brief will no longer include upcoming events.")
        }
    }
}

// MARK: - View-Specific Models

struct OAuthProvider: Identifiable {
    let id: String
    let displayName: String
    let iconName: String
    let color: Color
    let accessDescriptions: [String]
}

struct UserConnectedAccount: Identifiable {
    let id: String
    let provider: OAuthProvider
    let email: String
    var emailEnabled: Bool
    let connectedAt: Date
}

// MARK: - View Model

@MainActor
class LinkedAccountsViewModel: ObservableObject {
    @Published var connectedAccounts: [UserConnectedAccount] = []
    @Published var isLoading: Bool = false
    @Published var showError: Bool = false
    @Published var errorMessage: String?

    private let googleOAuthHelper = GoogleOAuthHelper()

    let availableProviders: [OAuthProvider] = [
        OAuthProvider(
            id: "google",
            displayName: "Gmail",
            iconName: "envelope.fill",
            color: .red,
            accessDescriptions: [
                "Read your Gmail messages",
                "Basic profile information"
            ]
        ),
        OAuthProvider(
            id: "google_calendar",
            displayName: "Google Calendar",
            iconName: "calendar",
            color: .blue,
            accessDescriptions: [
                "Read your calendar events",
                "Basic profile information"
            ]
        )
    ]

    // Track calendar connection separately
    @Published var hasLinkedCalendar: Bool = false

    init() {
        // Load connected accounts from user profile
        loadConnectedAccounts()
    }

    func connectAccount(provider: OAuthProvider) async {
        isLoading = true
        errorMessage = nil

        do {
            switch provider.id {
            case "google":
                try await connectGoogleAccount(provider: provider)
            case "google_calendar":
                try await connectGoogleCalendar(provider: provider)
            default:
                throw NSError(domain: "OAuth", code: -1, userInfo: [NSLocalizedDescriptionKey: "Unknown provider"])
            }
        } catch let error as GoogleOAuthError {
            // Handle permission denied specifically with a clear message
            errorMessage = error.localizedDescription
            showError = true
            print("OAuth permission error: \(error)")
        } catch let error as NSError {
            // Check for user cancellation (code -5)
            if error.code == -5 || error.localizedDescription.contains("canceled") || error.localizedDescription.contains("cancelled") {
                // User cancelled - don't show error, just reset state
                print("ℹ️ User cancelled Google sign-in")
                errorMessage = nil
                showError = false
            } else {
                // Actual error - show to user
                errorMessage = "Failed to connect \(provider.displayName): \(error.localizedDescription)"
                showError = true
                print("OAuth error: \(error)")
            }
        }

        isLoading = false
    }

    private func connectGoogleAccount(provider: OAuthProvider) async throws {
        // Request OAuth access with Gmail scope
        let (email, accessToken, refreshToken) = try await googleOAuthHelper.requestAccess(
            includeEmail: true,
            includeCalendar: false
        )

        // Store tokens in backend
        let accountId = try await storeLinkedAccount(
            provider: "google",
            email: email,
            accessToken: accessToken,
            refreshToken: refreshToken
        )

        // Create new connected account
        let newAccount = UserConnectedAccount(
            id: accountId,
            provider: provider,
            email: email,
            emailEnabled: true,
            connectedAt: Date()
        )

        // Add to local list
        connectedAccounts.append(newAccount)

        // Set flag for HomeViewModel to know we have a linked account
        UserDefaults.standard.set(true, forKey: "hasLinkedGoogleAccount")
        // Save the linked email for podcast generation
        UserDefaults.standard.set(email, forKey: "linkedAccountEmail")
        // Save the provider type
        UserDefaults.standard.set("google", forKey: "linkedAccountProvider")

        // Also update main user email if it was empty (guest user linking Gmail)
        // This ensures HomeViewModel.userEmail gets updated for Daily Brief generation
        let isGuest = UserDefaults.standard.bool(forKey: "isGuestUser")
        if isGuest {
            // Clear guest status now that they have a linked account
            UserDefaults.standard.set(false, forKey: "isGuestUser")
            UserDefaults.standard.removeObject(forKey: "guestUserId")
            print("👤 Guest user upgraded with Gmail: \(email)")
        }

        print("✅ Connected Google account: \(email)")
    }

    private func connectGoogleCalendar(provider: OAuthProvider) async throws {
        // Request OAuth access with Calendar scope only
        let (email, accessToken, refreshToken) = try await googleOAuthHelper.requestAccess(
            includeEmail: false,
            includeCalendar: true
        )

        // Store tokens in backend with calendar enabled
        _ = try await storeLinkedAccount(
            provider: "google",
            email: email,
            accessToken: accessToken,
            refreshToken: refreshToken,
            calendarEnabled: true
        )

        // Mark calendar as connected
        hasLinkedCalendar = true
        UserDefaults.standard.set(true, forKey: "hasLinkedCalendar")

        print("✅ Connected Google Calendar: \(email)")
    }

    func disconnectCalendar() {
        hasLinkedCalendar = false
        UserDefaults.standard.set(false, forKey: "hasLinkedCalendar")
        print("📅 Disconnected Google Calendar")
    }

    func disconnectAccount(_ account: UserConnectedAccount) {
        Task {
            do {
                // Revoke OAuth access
                switch account.provider.id {
                case "google":
                    try await googleOAuthHelper.revokeAccess()
                default:
                    break
                }

                // Remove from local list
                connectedAccounts.removeAll { $0.id == account.id }

                // Clear flag if no more connected accounts
                if connectedAccounts.isEmpty {
                    UserDefaults.standard.set(false, forKey: "hasLinkedGoogleAccount")
                    UserDefaults.standard.removeObject(forKey: "linkedAccountEmail")
                    UserDefaults.standard.removeObject(forKey: "linkedAccountProvider")
                }

                // TODO: Call backend to delete linked account
                print("Disconnected \(account.email)")
            } catch {
                errorMessage = "Failed to disconnect account: \(error.localizedDescription)"
                showError = true
                print("Disconnect error: \(error)")
            }
        }
    }

    func updatePermission(accountId: String, emailEnabled: Bool) {
        if let index = connectedAccounts.firstIndex(where: { $0.id == accountId }) {
            connectedAccounts[index].emailEnabled = emailEnabled

            // TODO: Update backend preferences via API
            print("Updated permissions for account \(accountId): email=\(emailEnabled)")
        }
    }

    private func loadConnectedAccounts() {
        // Load connected accounts from UserDefaults
        let hasLinkedAccount = UserDefaults.standard.bool(forKey: "hasLinkedGoogleAccount")
        let linkedEmail = UserDefaults.standard.string(forKey: "linkedAccountEmail")
        let linkedProvider = UserDefaults.standard.string(forKey: "linkedAccountProvider")

        // Load calendar status
        hasLinkedCalendar = UserDefaults.standard.bool(forKey: "hasLinkedCalendar")

        if hasLinkedAccount, let email = linkedEmail, !email.isEmpty {
            // Get provider from stored value, or fall back to heuristic
            let providerId = linkedProvider ?? (email.contains("gmail.com") || email.contains("googlemail.com") ? "google" : "microsoft")
            guard let provider = availableProviders.first(where: { $0.id == providerId }) else {
                connectedAccounts = []
                return
            }

            let account = UserConnectedAccount(
                id: "saved_\(email)",
                provider: provider,
                email: email,
                emailEnabled: true,
                connectedAt: Date() // We don't store this, so use current date
            )
            connectedAccounts = [account]
            print("📧 Loaded saved linked account: \(email) (\(providerId))")
        } else {
            connectedAccounts = []
        }
    }

    // MARK: - Backend API Methods

    private func storeLinkedAccount(
        provider: String,
        email: String,
        accessToken: String,
        refreshToken: String?,
        calendarEnabled: Bool = false
    ) async throws -> String {
        // Get the linked account email as the user ID for backend
        // This is the email being linked (e.g., t.sushanth@gmail.com)
        let userId = email

        let url = URL(string: "https://ai-radio-backend-917362189743.us-central1.run.app/api/linked-accounts/\(userId)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "provider": provider,
            "email": email,
            "access_token": accessToken,
            "refresh_token": refreshToken ?? "",
            "email_enabled": !calendarEnabled,  // If calendar only, email is false
            "calendar_enabled": calendarEnabled
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (data, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201 else {
            throw NSError(domain: "API", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to store linked account"])
        }

        let json = try JSONSerialization.jsonObject(with: data) as? [String: Any]
        guard let linkedAccount = json?["linked_account"] as? [String: Any],
              let accountId = linkedAccount["id"] as? String else {
            throw NSError(domain: "API", code: -2, userInfo: [NSLocalizedDescriptionKey: "Invalid response"])
        }

        return accountId
    }
}

#Preview {
    LinkedAccountsView()
}
