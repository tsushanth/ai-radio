//
//  OnboardingView.swift
//  BriefCast
//
//  Onboarding flow for first-time users
//  Includes welcome, account linking, and topic selection
//

import SwiftUI

struct OnboardingView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = OnboardingViewModel()

    var body: some View {
        ZStack {
            // Background
            Theme.Colors.background
                .ignoresSafeArea()

            // Page content
            TabView(selection: $viewModel.currentPage) {
                // Page 1: Welcome
                WelcomePage(onContinue: viewModel.nextPage)
                    .tag(0)

                // Page 2: Link Account
                LinkAccountPage(
                    viewModel: viewModel,
                    onSkip: viewModel.nextPage,
                    onContinue: viewModel.nextPage
                )
                .tag(1)

                // Page 3: Topic Selection
                TopicSelectionPage(
                    viewModel: viewModel,
                    onComplete: completeOnboarding
                )
                .tag(2)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.easeInOut, value: viewModel.currentPage)

            // Page indicators
            VStack {
                Spacer()

                HStack(spacing: 8) {
                    ForEach(0..<3) { index in
                        Circle()
                            .fill(index == viewModel.currentPage ? Theme.Colors.accent : Color.white.opacity(0.3))
                            .frame(width: 8, height: 8)
                            .animation(.easeInOut, value: viewModel.currentPage)
                    }
                }
                .padding(.bottom, 40)
            }
        }
    }

    private func completeOnboarding() {
        // Mark onboarding as complete
        UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")

        // Save selected topics
        UserDefaults.standard.set(viewModel.selectedTopics, forKey: "selectedTopics")

        dismiss()
    }
}

// MARK: - Welcome Page

struct WelcomePage: View {
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 32) {
            Spacer()

            // Icon
            ZStack {
                Circle()
                    .fill(
                        LinearGradient(
                            colors: [Theme.Colors.accent, Theme.Colors.accent.opacity(0.5)],
                            startPoint: .topLeading,
                            endPoint: .bottomTrailing
                        )
                    )
                    .frame(width: 120, height: 120)

                Image(systemName: "waveform.circle.fill")
                    .font(.system(size: 60))
                    .foregroundColor(.white)
            }

            // Title and description
            VStack(spacing: 16) {
                Text("Welcome to BriefCast")
                    .font(.system(size: 32, weight: .bold))
                    .foregroundColor(Theme.Colors.primaryText)
                    .multilineTextAlignment(.center)

                Text("Your personalized morning briefing, powered by AI. Get caught up on your emails, calendar, and news in just a few minutes.")
                    .font(.system(size: 17, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            Spacer()

            // Continue button
            Button(action: onContinue) {
                Text("Get Started")
                    .font(.system(size: 18, weight: .semibold))
                    .foregroundColor(.white)
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 16)
                    .background(Theme.Colors.accent)
                    .cornerRadius(12)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 60)
        }
    }
}

// MARK: - Link Account Page

struct LinkAccountPage: View {
    @ObservedObject var viewModel: OnboardingViewModel
    let onSkip: () -> Void
    let onContinue: () -> Void

    var body: some View {
        VStack(spacing: 24) {
            Spacer()

            // Icon
            ZStack {
                Circle()
                    .fill(Color.white.opacity(0.1))
                    .frame(width: 100, height: 100)

                Image(systemName: "link.circle.fill")
                    .font(.system(size: 50))
                    .foregroundColor(Theme.Colors.accent)
            }

            // Title and description
            VStack(spacing: 12) {
                Text("Connect Your Email")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(Theme.Colors.primaryText)
                    .multilineTextAlignment(.center)

                Text("Link your email to get personalized briefings based on your important messages.")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            // Account options
            VStack(spacing: 12) {
                AccountLinkButton(
                    icon: "g.circle.fill",
                    title: "Connect Google",
                    subtitle: viewModel.googleLinked ? "Connected" : "Gmail",
                    color: .red,
                    isConnected: viewModel.googleLinked,
                    isLoading: viewModel.isLinkingGoogle
                ) {
                    Task { await viewModel.linkGoogle() }
                }

                AccountLinkButton(
                    icon: "m.circle.fill",
                    title: "Connect Microsoft",
                    subtitle: viewModel.microsoftLinked ? "Connected" : "Outlook",
                    color: .blue,
                    isConnected: viewModel.microsoftLinked,
                    isLoading: viewModel.isLinkingMicrosoft
                ) {
                    Task { await viewModel.linkMicrosoft() }
                }
            }
            .padding(.horizontal, 24)
            .padding(.top, 16)

            Spacer()

            // Buttons
            VStack(spacing: 12) {
                if viewModel.hasLinkedAccount {
                    Button(action: onContinue) {
                        Text("Continue")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(.white)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(Theme.Colors.accent)
                            .cornerRadius(12)
                    }
                }

                Button(action: onSkip) {
                    Text("Skip for now")
                        .font(.system(size: 16, weight: .medium))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 60)
        }
        .alert("Connection Error", isPresented: $viewModel.showError) {
            Button("OK", role: .cancel) { }
        } message: {
            Text(viewModel.errorMessage ?? "Failed to connect account")
        }
        .alert("Coming Soon", isPresented: $viewModel.showComingSoon) {
            Button("OK", role: .cancel) { }
        } message: {
            Text("Microsoft account integration is coming soon. Stay tuned!")
        }
    }
}

struct AccountLinkButton: View {
    let icon: String
    let title: String
    let subtitle: String
    let color: Color
    let isConnected: Bool
    let isLoading: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 16) {
                // Provider icon
                Circle()
                    .fill(color.opacity(0.15))
                    .frame(width: 48, height: 48)
                    .overlay(
                        Image(systemName: icon)
                            .font(.system(size: 24))
                            .foregroundColor(color)
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 17, weight: .semibold))
                        .foregroundColor(Theme.Colors.primaryText)

                    Text(subtitle)
                        .font(.system(size: 14, weight: .regular))
                        .foregroundColor(isConnected ? .green : Theme.Colors.secondaryText)
                }

                Spacer()

                if isLoading {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Theme.Colors.accent))
                } else if isConnected {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 24))
                        .foregroundColor(.green)
                } else {
                    Image(systemName: "chevron.right")
                        .font(.system(size: 14, weight: .semibold))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
            }
            .padding(16)
            .background(Theme.Colors.cardBackground)
            .cornerRadius(12)
            .overlay(
                RoundedRectangle(cornerRadius: 12)
                    .stroke(isConnected ? Color.green.opacity(0.5) : Color.white.opacity(0.05), lineWidth: 1)
            )
        }
        .disabled(isConnected || isLoading)
        .buttonStyle(ScaleButtonStyle())
    }
}

// MARK: - Topic Selection Page

struct TopicSelectionPage: View {
    @ObservedObject var viewModel: OnboardingViewModel
    let onComplete: () -> Void

    let allTopics = [
        ("Technology", "laptopcomputer", "#4A90E2"),
        ("AI & Machine Learning", "cpu", "#9B59B6"),
        ("Business", "chart.line.uptrend.xyaxis", "#50C878"),
        ("News", "newspaper", "#FF6B35"),
        ("Finance", "dollarsign.circle", "#27AE60"),
        ("Sports", "sportscourt", "#E74C3C"),
        ("Entertainment", "film", "#F39C12"),
        ("Science", "atom", "#3498DB"),
        ("Health", "heart", "#E91E63"),
        ("Politics", "building.columns", "#607D8B")
    ]

    var body: some View {
        VStack(spacing: 24) {
            // Title
            VStack(spacing: 12) {
                Text("Choose Your Interests")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(Theme.Colors.primaryText)
                    .multilineTextAlignment(.center)

                Text("Select topics to personalize your briefings. We'll include relevant news and updates in your daily brief.")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            .padding(.top, 40)

            // Topic grid
            ScrollView {
                LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                    ForEach(allTopics, id: \.0) { topic in
                        TopicChip(
                            title: topic.0,
                            icon: topic.1,
                            color: Color(hex: topic.2),
                            isSelected: viewModel.selectedTopics.contains(topic.0)
                        ) {
                            viewModel.toggleTopic(topic.0)
                        }
                    }
                }
                .padding(.horizontal, 24)
            }

            Spacer()

            // Complete button
            VStack(spacing: 8) {
                Text("\(viewModel.selectedTopics.count) topics selected")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(Theme.Colors.secondaryText)

                Button(action: onComplete) {
                    Text("Complete Setup")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(viewModel.selectedTopics.isEmpty ? Color.gray : Theme.Colors.accent)
                        .cornerRadius(12)
                }
                .disabled(viewModel.selectedTopics.isEmpty)
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 60)
        }
    }
}

struct TopicChip: View {
    let title: String
    let icon: String
    let color: Color
    let isSelected: Bool
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 8) {
                Image(systemName: icon)
                    .font(.system(size: 16))

                Text(title)
                    .font(.system(size: 14, weight: .medium))
                    .lineLimit(1)
            }
            .foregroundColor(isSelected ? .white : Theme.Colors.primaryText)
            .padding(.horizontal, 16)
            .padding(.vertical, 12)
            .frame(maxWidth: .infinity)
            .background(isSelected ? color : Theme.Colors.cardBackground)
            .cornerRadius(10)
            .overlay(
                RoundedRectangle(cornerRadius: 10)
                    .stroke(isSelected ? color : Color.white.opacity(0.1), lineWidth: 1)
            )
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

// MARK: - View Model

@MainActor
class OnboardingViewModel: ObservableObject {
    @Published var currentPage: Int = 0
    @Published var googleLinked: Bool = false
    @Published var microsoftLinked: Bool = false
    @Published var isLinkingGoogle: Bool = false
    @Published var isLinkingMicrosoft: Bool = false
    @Published var showError: Bool = false
    @Published var errorMessage: String?
    @Published var showComingSoon: Bool = false
    @Published var selectedTopics: [String] = ["Technology", "News", "Business"]

    private let googleOAuthHelper = GoogleOAuthHelper()

    init() {
        // Check if user already has linked accounts (e.g., from profile)
        if UserDefaults.standard.bool(forKey: "hasLinkedGoogleAccount") {
            googleLinked = true
        }
        // Load saved topics if they exist
        if let savedTopics = UserDefaults.standard.stringArray(forKey: "selectedTopics"), !savedTopics.isEmpty {
            selectedTopics = savedTopics
        }
    }

    var hasLinkedAccount: Bool {
        googleLinked || microsoftLinked
    }

    func nextPage() {
        if currentPage < 2 {
            currentPage += 1
        }
    }

    func toggleTopic(_ topic: String) {
        if selectedTopics.contains(topic) {
            selectedTopics.removeAll { $0 == topic }
        } else {
            selectedTopics.append(topic)
        }
    }

    func linkGoogle() async {
        isLinkingGoogle = true
        errorMessage = nil

        do {
            let (email, accessToken, refreshToken) = try await googleOAuthHelper.requestAccess(
                includeEmail: true,
                includeCalendar: false
            )

            // Store in backend (reuse LinkedAccountsViewModel logic)
            try await storeLinkedAccount(
                provider: "google",
                email: email,
                accessToken: accessToken,
                refreshToken: refreshToken
            )

            googleLinked = true
            UserDefaults.standard.set(true, forKey: "hasLinkedGoogleAccount")
            UserDefaults.standard.set(email, forKey: "linkedAccountEmail")
            UserDefaults.standard.set("google", forKey: "linkedAccountProvider")

            print("✅ Google linked in onboarding: \(email)")
        } catch {
            errorMessage = "Failed to connect Google: \(error.localizedDescription)"
            showError = true
            print("Google OAuth error: \(error)")
        }

        isLinkingGoogle = false
    }

    func linkMicrosoft() async {
        // Show "Coming Soon" dialog for Microsoft
        showComingSoon = true
    }

    private func storeLinkedAccount(
        provider: String,
        email: String,
        accessToken: String,
        refreshToken: String?
    ) async throws {
        // Use the OAuth email as the user ID (the email being linked)
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
            "email_enabled": true,
            "calendar_enabled": false
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201 else {
            throw NSError(domain: "API", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to store linked account"])
        }
    }
}

#Preview {
    OnboardingView()
}
