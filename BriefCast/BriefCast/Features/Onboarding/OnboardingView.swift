//
//  OnboardingView.swift
//  BriefCast
//
//  Onboarding flow for first-time users
//  Includes welcome, account linking, and topic selection
//

import SwiftUI
import UserNotifications

struct OnboardingView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var viewModel = OnboardingViewModel()
    @State private var selectedLanguage: SupportedLanguage = .en
    @State private var fetchedTopics: [Topic] = []

    var body: some View {
        ZStack {
            // Background
            Theme.Colors.background
                .ignoresSafeArea()

            // Page content
            TabView(selection: $viewModel.currentPage) {
                // Page 0: Welcome
                WelcomePage(onContinue: viewModel.nextPage)
                    .tag(0)

                // Page 1: Language Selection
                LanguageSelectionPage(
                    selectedLanguage: $selectedLanguage,
                    onContinue: viewModel.nextPage
                )
                .tag(1)

                // Page 2: Link Account (with email/calendar options)
                LinkAccountPage(
                    viewModel: viewModel,
                    onSkip: viewModel.nextPage,
                    onContinue: viewModel.nextPage
                )
                .tag(2)

                // Page 3: Topic Selection
                TopicSelectionPage(
                    viewModel: viewModel,
                    onComplete: completeOnboarding,
                    language: selectedLanguage.rawValue,
                    onTopicsFetched: { fetchedTopics = $0 }
                )
                .tag(3)
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .animation(.easeInOut, value: viewModel.currentPage)

            // Page indicators
            VStack {
                Spacer()

                HStack(spacing: 8) {
                    ForEach(0..<4) { index in
                        Circle()
                            .fill(index == viewModel.currentPage ? Theme.Colors.accent : Color.white.opacity(0.3))
                            .frame(width: 8, height: 8)
                            .animation(.easeInOut, value: viewModel.currentPage)
                    }
                }
                .padding(.bottom, 40)
            }
        }
        .onAppear {
            let deviceLang = Locale.current.language.languageCode?.identifier ?? "en"
            if let matched = SupportedLanguage(rawValue: deviceLang) {
                selectedLanguage = matched
            }
        }
    }

    private func completeOnboarding() {
        // Save selected language
        PreferencesService.shared.preferredLanguage = selectedLanguage.rawValue

        // Mark onboarding as complete
        UserDefaults.standard.set(true, forKey: "hasCompletedOnboarding")

        // Save selected topics
        UserDefaults.standard.set(viewModel.selectedTopics, forKey: "selectedTopics")

        // Bookmark the selected topics by ID so they show in "Your Topics"
        let topicPool = !fetchedTopics.isEmpty ? fetchedTopics : (TopicService.shared.getCachedTopics()?.topics ?? [])
        NSLog("🔖 completeOnboarding: selected=\(viewModel.selectedTopics), pool=\(topicPool.count) topics, fetchedTopics=\(fetchedTopics.count)")
        for topicName in viewModel.selectedTopics {
            if let topic = topicPool.first(where: { $0.name == topicName }) {
                NSLog("🔖 Bookmarking \(topicName) -> \(topic.id)")
                PreferencesService.shared.addBookmark(for: topic.id)
            } else {
                NSLog("⚠️ No match for \(topicName) in pool")
            }
        }
        NSLog("🔖 Final bookmarks: \(PreferencesService.shared.bookmarkedTopicIds)")

        // Save email/calendar preferences
        UserDefaults.standard.set(viewModel.emailEnabled, forKey: "emailEnabled")
        // Use "hasLinkedCalendar" to be consistent with LinkedAccountsView
        UserDefaults.standard.set(viewModel.calendarEnabled, forKey: "hasLinkedCalendar")

        // Save topic updates preference
        UserDefaults.standard.set(viewModel.includeTopicUpdates, forKey: "includeTopicUpdates")

        // Schedule daily notification and sync with backend if enabled
        if viewModel.dailyNotificationsEnabled && viewModel.googleLinked {
            Task {
                // Request permission and register for remote notifications
                await PushNotificationService.shared.requestPermissionAndRegister()

                // Schedule local notification as backup reminder
                await PushNotificationService.shared.scheduleDailyNotification(at: viewModel.briefingTime)

                // Sync notification settings with backend so it generates the brief at this time
                // The backend will generate the brief and send a push notification when ready
                let formatter = DateFormatter()
                formatter.dateFormat = "HH:mm"
                let timeString = formatter.string(from: viewModel.briefingTime)

                await PushNotificationService.shared.updateSettings(
                    briefingTime: timeString,
                    timezone: TimeZone.current.identifier,
                    enabled: true
                )
            }
        }

        // If user linked email or calendar, start generating their Daily Brief immediately
        // so it's ready (or in progress) when they reach the home screen
        if viewModel.googleLinked {
            // Post notification to trigger Daily Brief generation
            NotificationCenter.default.post(
                name: .startDailyBriefGeneration,
                object: nil
            )
            print("🚀 Starting Daily Brief generation after onboarding")
        }

        dismiss()
    }
}

// MARK: - Welcome Page

struct WelcomePage: View {
    let onContinue: () -> Void

    var body: some View {
        ScrollView(showsIndicators: false) {
            VStack(spacing: 32) {
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
                    Text("Welcome to Audexa")
                        .font(.system(size: 32, weight: .bold))
                        .foregroundColor(Theme.Colors.primaryText)
                        .multilineTextAlignment(.center)

                    Text("Your personalized AI radio. Get caught up on your emails, calendar, and favorite topics in just a few minutes.")
                        .font(.system(size: 17, weight: .regular))
                        .foregroundColor(Theme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                        .padding(.horizontal, 32)
                }

                // Get Started button
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
            }
            .padding(.top, 60)
            .padding(.bottom, 80)
        }
    }
}

// MARK: - Language Selection Page

struct LanguageSelectionPage: View {
    @Binding var selectedLanguage: SupportedLanguage
    let onContinue: () -> Void

    let columns = [GridItem(.flexible()), GridItem(.flexible())]

    var body: some View {
        VStack(spacing: 20) {
            // Title
            VStack(spacing: 12) {
                ZStack {
                    Circle()
                        .fill(Color.white.opacity(0.1))
                        .frame(width: 100, height: 100)

                    Image(systemName: "globe")
                        .font(.system(size: 50))
                        .foregroundColor(Theme.Colors.accent)
                }

                Text("Choose Your Language")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(Theme.Colors.primaryText)
                    .multilineTextAlignment(.center)

                Text("Select the language for your audio briefings.")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            .padding(.top, 32)

            // Language grid
            ScrollView(showsIndicators: false) {
                LazyVGrid(columns: columns, spacing: 12) {
                    ForEach(SupportedLanguage.allCases) { language in
                        Button {
                            selectedLanguage = language
                        } label: {
                            VStack(spacing: 6) {
                                Text(language.flagEmoji)
                                    .font(.system(size: 32))

                                Text(language.nativeName)
                                    .font(.system(size: 15, weight: .semibold))
                                    .foregroundColor(Theme.Colors.primaryText)
                                    .lineLimit(1)

                                Text(language.displayName)
                                    .font(.system(size: 12, weight: .regular))
                                    .foregroundColor(Theme.Colors.secondaryText)
                                    .lineLimit(1)
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(
                                selectedLanguage == language
                                    ? Theme.Colors.accent.opacity(0.15)
                                    : Theme.Colors.cardBackground
                            )
                            .cornerRadius(12)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(
                                        selectedLanguage == language
                                            ? Theme.Colors.accent
                                            : Color.white.opacity(0.1),
                                        lineWidth: selectedLanguage == language ? 2 : 1
                                    )
                            )
                        }
                        .buttonStyle(ScaleButtonStyle())
                    }
                }
                .padding(.horizontal, 24)
                .padding(.bottom, 16)
            }

            // Continue button
            Button(action: onContinue) {
                Text("Continue")
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
                Text("Connect Your Account")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(Theme.Colors.primaryText)
                    .multilineTextAlignment(.center)

                Text("Link your Google account to get personalized briefings from your email and calendar.")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }

            // Account connection
            VStack(spacing: 12) {
                AccountLinkButton(
                    icon: "g.circle.fill",
                    title: "Connect Google",
                    subtitle: viewModel.googleLinked ? "Connected" : "Sign in with Google",
                    color: .red,
                    isConnected: viewModel.googleLinked,
                    isLoading: viewModel.isLinkingGoogle
                ) {
                    Task { await viewModel.linkGoogle() }
                }

                // Email/Calendar toggle options (shown after connecting)
                if viewModel.googleLinked {
                    VStack(spacing: 8) {
                        IntegrationToggle(
                            icon: "envelope.fill",
                            title: "Email",
                            subtitle: "Include email summaries in briefings",
                            isEnabled: $viewModel.emailEnabled
                        )

                        // Calendar requires separate OAuth request
                        CalendarIntegrationRow(
                            isEnabled: viewModel.calendarEnabled,
                            isLinking: viewModel.isLinkingCalendar
                        ) {
                            Task { await viewModel.linkCalendar() }
                        }
                    }
                    .padding(.top, 8)
                }

                // Permission denied warning
                if viewModel.permissionDenied {
                    PermissionDeniedWarning {
                        Task { await viewModel.linkGoogle() }
                    }
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
    }
}

// MARK: - Integration Toggle

struct IntegrationToggle: View {
    let icon: String
    let title: String
    let subtitle: String
    @Binding var isEnabled: Bool

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(isEnabled ? Theme.Colors.accent : Theme.Colors.secondaryText)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text(title)
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(Theme.Colors.primaryText)

                Text(subtitle)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
            }

            Spacer()

            Toggle("", isOn: $isEnabled)
                .labelsHidden()
                .tint(Theme.Colors.accent)
        }
        .padding(12)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(10)
    }
}

// MARK: - Notification Toggle Row

struct NotificationToggleRow: View {
    @Binding var isEnabled: Bool
    let permissionStatus: UNAuthorizationStatus
    let onRequestPermission: () async -> Void

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "bell.fill")
                .font(.system(size: 20))
                .foregroundColor(isEnabled ? Theme.Colors.accent : Theme.Colors.secondaryText)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 2) {
                Text("Daily Reminder")
                    .font(.system(size: 16, weight: .medium))
                    .foregroundColor(Theme.Colors.primaryText)

                Text(subtitleText)
                    .font(.system(size: 13, weight: .regular))
                    .foregroundColor(subtitleColor)
            }

            Spacer()

            if permissionStatus == .denied {
                Button("Settings") {
                    if let url = URL(string: UIApplication.openSettingsURLString) {
                        UIApplication.shared.open(url)
                    }
                }
                .font(.system(size: 14, weight: .semibold))
                .foregroundColor(Theme.Colors.accent)
            } else {
                Toggle("", isOn: $isEnabled)
                    .labelsHidden()
                    .tint(Theme.Colors.accent)
                    .onChange(of: isEnabled) { _, newValue in
                        if newValue && permissionStatus == .notDetermined {
                            Task {
                                await onRequestPermission()
                            }
                        }
                    }
            }
        }
        .padding(12)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(10)
    }

    private var subtitleText: String {
        switch permissionStatus {
        case .denied:
            return "Notifications blocked. Tap Settings to enable."
        case .authorized:
            return "Get notified when your brief is ready"
        default:
            return "Get notified when your brief is ready"
        }
    }

    private var subtitleColor: Color {
        permissionStatus == .denied ? .orange : Theme.Colors.secondaryText
    }
}

// MARK: - Calendar Integration Row

struct CalendarIntegrationRow: View {
    let isEnabled: Bool
    let isLinking: Bool
    let onConnect: () -> Void

    @State private var showCalendarInfo = false

    var body: some View {
        VStack(spacing: 0) {
            HStack(spacing: 12) {
                Image(systemName: "calendar")
                    .font(.system(size: 20))
                    .foregroundColor(isEnabled ? Theme.Colors.accent : Theme.Colors.secondaryText)
                    .frame(width: 32)

                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 4) {
                        Text("Calendar")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(Theme.Colors.primaryText)

                        if !isEnabled {
                            Text("(Optional)")
                                .font(.system(size: 12, weight: .regular))
                                .foregroundColor(Theme.Colors.secondaryText)
                        }
                    }

                    Text(isEnabled ? "Connected" : "Include upcoming events in briefings")
                        .font(.system(size: 13, weight: .regular))
                        .foregroundColor(isEnabled ? .green : Theme.Colors.secondaryText)
                }

                Spacer()

                if isLinking {
                    ProgressView()
                        .progressViewStyle(CircularProgressViewStyle(tint: Theme.Colors.accent))
                } else if isEnabled {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 22))
                        .foregroundColor(.green)
                } else {
                    HStack(spacing: 8) {
                        Button(action: { showCalendarInfo.toggle() }) {
                            Image(systemName: "info.circle")
                                .font(.system(size: 18))
                                .foregroundColor(Theme.Colors.secondaryText)
                        }

                        Button(action: onConnect) {
                            Text("Connect")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(.white)
                                .padding(.horizontal, 12)
                                .padding(.vertical, 6)
                                .background(Theme.Colors.accent)
                                .cornerRadius(6)
                        }
                    }
                }
            }
            .padding(12)

            // Info panel about unverified app
            if showCalendarInfo && !isEnabled {
                VStack(alignment: .leading, spacing: 8) {
                    HStack(spacing: 6) {
                        Image(systemName: "exclamationmark.shield")
                            .font(.system(size: 14))
                            .foregroundColor(.orange)

                        Text("\"Unverified App\" Warning")
                            .font(.system(size: 13, weight: .semibold))
                            .foregroundColor(Theme.Colors.primaryText)
                    }

                    Text("Google may show an \"unverified app\" screen because our calendar access is pending verification. This is safe to proceed.")
                        .font(.system(size: 12, weight: .regular))
                        .foregroundColor(Theme.Colors.secondaryText)
                        .fixedSize(horizontal: false, vertical: true)

                    VStack(alignment: .leading, spacing: 4) {
                        Text("To connect:")
                            .font(.system(size: 12, weight: .semibold))
                            .foregroundColor(Theme.Colors.secondaryText)

                        HStack(alignment: .top, spacing: 6) {
                            Text("1.")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.Colors.secondaryText)
                            Text("Tap \"Advanced\" on the warning screen")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.Colors.secondaryText)
                        }

                        HStack(alignment: .top, spacing: 6) {
                            Text("2.")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.Colors.secondaryText)
                            Text("Tap \"Go to Audexa (unsafe)\"")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.Colors.secondaryText)
                        }

                        HStack(alignment: .top, spacing: 6) {
                            Text("3.")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.Colors.secondaryText)
                            Text("Grant calendar access")
                                .font(.system(size: 12))
                                .foregroundColor(Theme.Colors.secondaryText)
                        }
                    }
                    .padding(.top, 4)
                }
                .padding(12)
                .background(Color.orange.opacity(0.1))
                .cornerRadius(8)
                .padding(.horizontal, 12)
                .padding(.bottom, 12)
            }
        }
        .background(Theme.Colors.cardBackground)
        .cornerRadius(10)
    }
}

// MARK: - Permission Denied Warning

struct PermissionDeniedWarning: View {
    let onTryAgain: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 10) {
                Image(systemName: "exclamationmark.triangle.fill")
                    .font(.system(size: 18))
                    .foregroundColor(.orange)

                Text("Access not granted")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(.white)
            }

            Text("Without access, we can only create general topic briefings. To get personalized briefings, please try again and grant the requested permissions.")
                .font(.system(size: 14, weight: .regular))
                .foregroundColor(.white.opacity(0.7))
                .fixedSize(horizontal: false, vertical: true)

            Button(action: onTryAgain) {
                HStack(spacing: 6) {
                    Image(systemName: "arrow.clockwise")
                        .font(.system(size: 14, weight: .semibold))
                    Text("Try Again")
                        .font(.system(size: 14, weight: .semibold))
                }
                .foregroundColor(Theme.Colors.accent)
            }
            .padding(.top, 4)
        }
        .padding(16)
        .background(
            RoundedRectangle(cornerRadius: 12)
                .fill(Color.orange.opacity(0.1))
                .overlay(
                    RoundedRectangle(cornerRadius: 12)
                        .stroke(Color.orange.opacity(0.3), lineWidth: 1)
                )
        )
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
    let language: String
    var onTopicsFetched: (([Topic]) -> Void)? = nil

    // Fallback hardcoded topics in case API fails
    private let fallbackTopics = [
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

    @State private var apiTopics: [Topic] = []
    @State private var isLoading = true

    var body: some View {
        VStack(spacing: 20) {
            // Title
            VStack(spacing: 8) {
                Text("Choose Your Interests")
                    .font(.system(size: 28, weight: .bold))
                    .foregroundColor(Theme.Colors.primaryText)
                    .multilineTextAlignment(.center)

                Text("Select topics to personalize your Daily Brief.")
                    .font(.system(size: 16, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .multilineTextAlignment(.center)
                    .padding(.horizontal, 32)
            }
            .padding(.top, 32)

            // Topic grid
            ScrollView(showsIndicators: false) {
                VStack(spacing: 16) {
                    if isLoading {
                        ProgressView()
                            .tint(Theme.Colors.accent)
                            .padding(.top, 40)
                    } else if !apiTopics.isEmpty {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            ForEach(apiTopics) { topic in
                                TopicChip(
                                    title: topic.name,
                                    icon: topic.icon,
                                    color: Color(hex: topic.color),
                                    isSelected: viewModel.selectedTopics.contains(topic.name)
                                ) {
                                    viewModel.toggleTopic(topic.name)
                                }
                            }
                        }
                        .padding(.horizontal, 24)
                    } else {
                        LazyVGrid(columns: [GridItem(.flexible()), GridItem(.flexible())], spacing: 12) {
                            ForEach(fallbackTopics, id: \.0) { topic in
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

                    // Suggest a Topic
                    SuggestTopicOnboarding(language: language)
                        .padding(.horizontal, 24)

                    // Daily Brief Options
                    if viewModel.googleLinked {
                        VStack(spacing: 12) {
                            // Divider
                            Rectangle()
                                .fill(Color.white.opacity(0.1))
                                .frame(height: 1)
                                .padding(.vertical, 8)

                            Text("Daily Brief Options")
                                .font(.system(size: 14, weight: .semibold))
                                .foregroundColor(Theme.Colors.secondaryText)
                                .frame(maxWidth: .infinity, alignment: .leading)

                            // Include topic updates toggle
                            IntegrationToggle(
                                icon: "newspaper.fill",
                                title: "Include Topic Updates",
                                subtitle: "Add headlines from your topics to Daily Brief",
                                isEnabled: $viewModel.includeTopicUpdates
                            )

                            // Daily notification toggle - requests permission when enabled
                            NotificationToggleRow(
                                isEnabled: $viewModel.dailyNotificationsEnabled,
                                permissionStatus: viewModel.notificationPermissionStatus
                            ) {
                                await viewModel.requestNotificationPermission()
                            }

                            // Briefing time picker
                            if viewModel.dailyNotificationsEnabled {
                                HStack {
                                    Image(systemName: "clock.fill")
                                        .font(.system(size: 20))
                                        .foregroundColor(Theme.Colors.accent)
                                        .frame(width: 32)

                                    Text("Reminder Time")
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundColor(Theme.Colors.primaryText)

                                    Spacer()

                                    DatePicker(
                                        "",
                                        selection: $viewModel.briefingTime,
                                        displayedComponents: .hourAndMinute
                                    )
                                    .labelsHidden()
                                    .tint(Theme.Colors.accent)
                                }
                                .padding(12)
                                .background(Theme.Colors.cardBackground)
                                .cornerRadius(10)
                            }
                        }
                        .padding(.horizontal, 24)
                    }
                }
                .padding(.bottom, 16)
            }

            // Complete button — always enabled so users can finish onboarding
            // even without selecting topics. They can pick later from Home.
            // The Android equivalent had this gated on selectedTopics.isEmpty
            // and produced a Play 1★ review when topics failed to load.
            VStack(spacing: 8) {
                if viewModel.selectedTopics.isEmpty {
                    Text("Tap Continue — you can pick topics later from the Home screen")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(Theme.Colors.secondaryText)
                        .multilineTextAlignment(.center)
                } else {
                    Text("\(viewModel.selectedTopics.count) topic\(viewModel.selectedTopics.count == 1 ? "" : "s") selected")
                        .font(.system(size: 14, weight: .medium))
                        .foregroundColor(Theme.Colors.secondaryText)
                }

                Button(action: onComplete) {
                    Text(viewModel.selectedTopics.isEmpty ? "Continue" : "Complete Setup")
                        .font(.system(size: 18, weight: .semibold))
                        .foregroundColor(.white)
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 16)
                        .background(Theme.Colors.accent)
                        .cornerRadius(12)
                }
            }
            .padding(.horizontal, 24)
            .padding(.bottom, 60)
        }
        .task {
            do {
                let data = try await TopicService.shared.fetchTopics(language: language)
                apiTopics = data.topics.filter { $0.isActive }
                onTopicsFetched?(apiTopics)
            } catch {
                print("Failed to fetch topics for onboarding: \(error)")
            }
            isLoading = false
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
    @Published var isLinkingGoogle: Bool = false
    @Published var isLinkingCalendar: Bool = false
    @Published var showError: Bool = false
    @Published var errorMessage: String?
    @Published var selectedTopics: [String] = []  // Start with empty selection
    @Published var permissionDenied: Bool = false
    @Published var emailEnabled: Bool = true
    @Published var calendarEnabled: Bool = false  // Start with calendar disabled
    @Published var includeTopicUpdates: Bool = true  // Include topic updates in daily brief
    @Published var dailyNotificationsEnabled: Bool = true  // Daily brief notification reminder
    @Published var briefingTime: Date = Calendar.current.date(from: DateComponents(hour: 7, minute: 0)) ?? Date()
    @Published var notificationPermissionStatus: UNAuthorizationStatus = .notDetermined

    private let googleOAuthHelper = GoogleOAuthHelper()
    private var linkedEmail: String?

    init() {
        // Check if user already has linked accounts
        if UserDefaults.standard.bool(forKey: "hasLinkedGoogleAccount") {
            googleLinked = true
            linkedEmail = UserDefaults.standard.string(forKey: "linkedAccountEmail")
        }
        // Load saved topics if they exist
        if let savedTopics = UserDefaults.standard.stringArray(forKey: "selectedTopics"), !savedTopics.isEmpty {
            selectedTopics = savedTopics
        }
        // Load email/calendar preferences
        emailEnabled = UserDefaults.standard.object(forKey: "emailEnabled") as? Bool ?? true
        // Use "hasLinkedCalendar" to be consistent with LinkedAccountsView
        calendarEnabled = UserDefaults.standard.bool(forKey: "hasLinkedCalendar")
        // Load topic updates preference
        includeTopicUpdates = UserDefaults.standard.object(forKey: "includeTopicUpdates") as? Bool ?? true
        // Load notification preferences
        dailyNotificationsEnabled = UserDefaults.standard.object(forKey: "dailyBriefNotificationsEnabled") as? Bool ?? true
        if let savedTime = UserDefaults.standard.object(forKey: "dailyBriefingTime") as? TimeInterval, savedTime > 0 {
            briefingTime = Date(timeIntervalSince1970: savedTime)
        }

        // Check notification permission status
        Task {
            await checkNotificationPermissionStatus()
        }
    }

    func checkNotificationPermissionStatus() async {
        let center = UNUserNotificationCenter.current()
        let settings = await center.notificationSettings()
        notificationPermissionStatus = settings.authorizationStatus
    }

    func requestNotificationPermission() async {
        let center = UNUserNotificationCenter.current()

        do {
            let granted = try await center.requestAuthorization(options: [.alert, .sound, .badge])

            if granted {
                notificationPermissionStatus = .authorized
                print("✅ Notification permission granted during onboarding")
            } else {
                notificationPermissionStatus = .denied
                dailyNotificationsEnabled = false
                print("⚠️ Notification permission denied during onboarding")
            }
        } catch {
            print("❌ Notification permission error: \(error.localizedDescription)")
            notificationPermissionStatus = .denied
            dailyNotificationsEnabled = false
        }
    }

    var hasLinkedAccount: Bool {
        googleLinked
    }

    func nextPage() {
        if currentPage < 3 {
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
            // Request only Gmail access (verified scope)
            // Calendar is optional and requested separately if user enables it
            let (email, accessToken, refreshToken) = try await googleOAuthHelper.requestAccess(
                includeEmail: true,
                includeCalendar: false
            )

            // Store in backend
            try await storeLinkedAccount(
                provider: "google",
                email: email,
                accessToken: accessToken,
                refreshToken: refreshToken
            )

            googleLinked = true
            linkedEmail = email
            UserDefaults.standard.set(true, forKey: "hasLinkedGoogleAccount")
            UserDefaults.standard.set(email, forKey: "linkedAccountEmail")
            UserDefaults.standard.set("google", forKey: "linkedAccountProvider")

            print("Google linked in onboarding: \(email)")
            permissionDenied = false
        } catch let error as GoogleOAuthError {
            permissionDenied = true
            errorMessage = nil
            showError = false
            print("Google OAuth permission denied: \(error)")
        } catch let error as NSError {
            if error.code == -5 || error.localizedDescription.contains("canceled") || error.localizedDescription.contains("cancelled") {
                print("User cancelled Google sign-in")
                errorMessage = nil
                showError = false
            } else {
                errorMessage = "Failed to connect Google: \(error.localizedDescription)"
                showError = true
                print("Google OAuth error: \(error)")
            }
        }

        isLinkingGoogle = false
    }

    func linkCalendar() async {
        isLinkingCalendar = true
        errorMessage = nil

        do {
            // Request calendar access separately (may show unverified warning)
            let (email, accessToken, refreshToken) = try await googleOAuthHelper.requestAccess(
                includeEmail: false,
                includeCalendar: true
            )

            // Update backend with calendar access
            try await storeLinkedAccount(
                provider: "google",
                email: linkedEmail ?? email,
                accessToken: accessToken,
                refreshToken: refreshToken,
                emailEnabled: emailEnabled,
                calendarEnabled: true
            )

            calendarEnabled = true
            // Use "hasLinkedCalendar" to be consistent with LinkedAccountsView
            UserDefaults.standard.set(true, forKey: "hasLinkedCalendar")

            print("Calendar linked in onboarding: \(email)")
        } catch let error as GoogleOAuthError {
            errorMessage = error.localizedDescription
            showError = true
            print("Calendar OAuth permission denied: \(error)")
        } catch let error as NSError {
            if error.code == -5 || error.localizedDescription.contains("canceled") || error.localizedDescription.contains("cancelled") {
                print("User cancelled Calendar sign-in")
                errorMessage = nil
                showError = false
            } else {
                errorMessage = "Failed to connect Calendar: \(error.localizedDescription)"
                showError = true
                print("Calendar OAuth error: \(error)")
            }
        }

        isLinkingCalendar = false
    }

    private func storeLinkedAccount(
        provider: String,
        email: String,
        accessToken: String,
        refreshToken: String?,
        emailEnabled: Bool? = nil,
        calendarEnabled: Bool? = nil
    ) async throws {
        let userId = email

        let url = URL(string: "https://ai-radio-backend.fly.dev/api/linked-accounts/\(userId)")!
        var request = URLRequest(url: url)
        request.httpMethod = "POST"
        request.setValue("application/json", forHTTPHeaderField: "Content-Type")

        let body: [String: Any] = [
            "provider": provider,
            "email": email,
            "access_token": accessToken,
            "refresh_token": refreshToken ?? "",
            "email_enabled": emailEnabled ?? self.emailEnabled,
            "calendar_enabled": calendarEnabled ?? self.calendarEnabled
        ]

        request.httpBody = try JSONSerialization.data(withJSONObject: body)

        let (_, response) = try await URLSession.shared.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse, httpResponse.statusCode == 201 else {
            throw NSError(domain: "API", code: -1, userInfo: [NSLocalizedDescriptionKey: "Failed to store linked account"])
        }
    }
}

// MARK: - Notification Names

extension Notification.Name {
    static let startDailyBriefGeneration = Notification.Name("startDailyBriefGeneration")
}

// MARK: - Suggest Topic (Onboarding)

struct SuggestTopicOnboarding: View {
    let language: String
    @State private var showSheet = false
    @State private var topicName = ""
    @State private var isSubmitting = false
    @State private var showConfirmation = false

    var body: some View {
        Button {
            showSheet = true
        } label: {
            HStack(spacing: 8) {
                Image(systemName: "lightbulb.fill")
                    .font(.system(size: 14))
                    .foregroundColor(.orange)
                Text("Don't see your topic? Suggest one")
                    .font(.system(size: 14, weight: .medium))
                    .foregroundColor(.orange)
            }
            .padding(.vertical, 10)
        }
        .sheet(isPresented: $showSheet) {
            NavigationStack {
                VStack(spacing: 20) {
                    Text("What topic would you like?")
                        .font(.headline)
                        .foregroundColor(Theme.Colors.primaryText)
                        .padding(.top, 20)

                    TextField("", text: $topicName, prompt: Text("e.g. Crypto, Formula 1, Bollywood...").foregroundColor(.gray))
                        .font(.system(size: 16))
                        .foregroundColor(.white)
                        .padding(14)
                        .background(Color.white.opacity(0.15))
                        .cornerRadius(10)
                        .padding(.horizontal, 24)

                    Button {
                        submitTopic()
                    } label: {
                        HStack {
                            if isSubmitting {
                                ProgressView().tint(.white)
                            }
                            Text("Submit")
                                .font(.system(size: 16, weight: .semibold))
                                .foregroundColor(.white)
                        }
                        .frame(maxWidth: .infinity)
                        .padding(.vertical, 14)
                        .background(topicName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty ? Color.gray : Theme.Colors.accent)
                        .cornerRadius(10)
                    }
                    .disabled(topicName.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || isSubmitting)
                    .padding(.horizontal, 24)

                    Text("We'll research sources and add it within minutes!")
                        .font(.caption)
                        .foregroundColor(Theme.Colors.secondaryText)

                    Spacer()
                }
                .background(Theme.Colors.background)
                .navigationTitle("Suggest a Topic")
                .navigationBarTitleDisplayMode(.inline)
                .toolbar {
                    ToolbarItem(placement: .cancellationAction) {
                        Button("Cancel") { showSheet = false }
                    }
                }
            }
            .presentationDetents([.medium])
            .preferredColorScheme(.dark)
        }
        .alert("Topic Suggested!", isPresented: $showConfirmation) {
            Button("OK") {}
        } message: {
            Text("We'll add \"\(topicName)\" soon. It will appear in your topics on the next app refresh.")
        }
    }

    private func submitTopic() {
        let name = topicName.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !name.isEmpty else { return }
        isSubmitting = true

        Task {
            do {
                try await TopicService.shared.suggestTopic(topicName: name, language: language, description: nil)
                showSheet = false
                showConfirmation = true
            } catch {
                print("Failed to suggest topic: \(error)")
            }
            isSubmitting = false
        }
    }
}

#Preview {
    OnboardingView()
}
