//
//  ProfileView.swift
//  BriefCast
//
//  User profile and settings view
//

import SwiftUI
import PaywallKit

struct ProfileView: View {
    @EnvironmentObject var authService: AuthService
    @State private var showLinkedAccounts = false
    @State private var showLanguagePicker = false
    @State private var showThemePicker = false
    @State private var showHiddenTopics = false
    @State private var showDeleteConfirmation = false
    @State private var showRadioLanguages = false
    @State private var showKokoroTest = false
    @State private var showSignOutConfirmation = false
    @State private var showPaywall = false
    @State private var isDeleting = false
    @State private var deleteError: String?
    @State private var showDeleteError = false
    @StateObject private var preferencesService = PreferencesService.shared
    @State private var subscriptionManager = SubscriptionManager.shared

    var body: some View {
        NavigationStack {
            ScrollView(showsIndicators: false) {
                VStack(spacing: 32) {
                    // Profile Header
                    VStack(spacing: 16) {
                        // Avatar
                        Circle()
                            .fill(
                                LinearGradient(
                                    colors: [
                                        Theme.Colors.accent,
                                        Theme.Colors.accent.opacity(0.6)
                                    ],
                                    startPoint: .topLeading,
                                    endPoint: .bottomTrailing
                                )
                            )
                            .frame(width: 100, height: 100)
                            .overlay(
                                Text(getInitials())
                                    .font(.system(size: 36, weight: .bold))
                                    .foregroundColor(.white)
                            )
                            .shadow(color: Theme.Colors.accent.opacity(0.3), radius: 10, x: 0, y: 5)

                        // Name and Email
                        if let user = authService.currentUser {
                            Text(user.name ?? "User")
                                .font(.system(size: 24, weight: .bold))
                                .foregroundColor(Theme.Colors.primaryText)

                            Text(user.email)
                                .font(.system(size: 16, weight: .regular))
                                .foregroundColor(Theme.Colors.secondaryText)
                        }
                    }
                    .padding(.top, 24)

                    // Premium Section
                    VStack(alignment: .leading, spacing: 16) {
                        SectionHeader(title: "Premium")

                        VStack(spacing: 12) {
                            SettingsRow(
                                icon: "star.fill",
                                title: subscriptionManager.isSubscribed ? "Ad-Free" : "Go Ad-Free",
                                subtitle: subscriptionManager.isSubscribed ? "Active subscription" : "Remove all ads",
                                action: {
                                    if !subscriptionManager.isSubscribed {
                                        showPaywall = true
                                    }
                                }
                            )
                            SettingsRow(
                                icon: "tag.fill",
                                title: "Redeem Promo Code",
                                subtitle: "Enter your offer code",
                                action: { OfferCodeManager.shared.presentRedemptionSheet() }
                            )
                        }
                    }
                    .padding(.horizontal, 16)

                    // Linked Accounts Section
                    VStack(alignment: .leading, spacing: 16) {
                        SectionHeader(title: "Linked Accounts")

                        VStack(spacing: 12) {
                            // Show linked accounts from user profile
                            if let linkedAccounts = authService.currentUser?.linkedAccounts, !linkedAccounts.isEmpty {
                                ForEach(linkedAccounts) { account in
                                    LinkedAccountRow(account: account)
                                }
                            }

                            // Add account button
                            Button(action: {
                                showLinkedAccounts = true
                            }) {
                                HStack {
                                    Image(systemName: "plus.circle.fill")
                                        .font(.system(size: 20))
                                        .foregroundColor(Theme.Colors.accent)

                                    Text("Add Account")
                                        .font(.system(size: 16, weight: .semibold))
                                        .foregroundColor(Theme.Colors.primaryText)

                                    Spacer()

                                    Image(systemName: "chevron.right")
                                        .font(.system(size: 14))
                                        .foregroundColor(Theme.Colors.secondaryText)
                                }
                                .padding(16)
                                .background(Theme.Colors.cardBackground)
                                .cornerRadius(12)
                            }
                        }
                    }
                    .padding(.horizontal, 16)

                    // Integration Settings Section (shown when account is linked)
                    if let linkedAccounts = authService.currentUser?.linkedAccounts, !linkedAccounts.isEmpty {
                        VStack(alignment: .leading, spacing: 16) {
                            SectionHeader(title: "Daily Brief Sources")

                            VStack(spacing: 12) {
                                IntegrationSettingsToggle(
                                    icon: "envelope.fill",
                                    title: "Email",
                                    subtitle: "Include email summaries in Daily Brief",
                                    isEnabled: Binding(
                                        get: { preferencesService.emailEnabled },
                                        set: { preferencesService.emailEnabled = $0 }
                                    )
                                )

                                IntegrationSettingsToggle(
                                    icon: "calendar",
                                    title: "Calendar",
                                    subtitle: "Include upcoming events in Daily Brief",
                                    isEnabled: Binding(
                                        get: { preferencesService.calendarEnabled },
                                        set: { preferencesService.calendarEnabled = $0 }
                                    )
                                )
                            }
                        }
                        .padding(.horizontal, 16)
                    }

                    // Preferences Section
                    VStack(alignment: .leading, spacing: 16) {
                        SectionHeader(title: "Preferences")

                        VStack(spacing: 12) {
                            SettingsRow(
                                icon: preferencesService.appTheme.iconName,
                                title: "App Theme",
                                subtitle: preferencesService.appTheme.displayName,
                                action: {
                                    showThemePicker = true
                                }
                            )

                            SettingsRow(
                                icon: "globe",
                                title: "Podcast Language",
                                subtitle: preferencesService.preferredSupportedLanguage.displayWithFlag,
                                action: {
                                    showLanguagePicker = true
                                }
                            )

                            SettingsRow(
                                icon: "radio.fill",
                                title: "Radio Languages",
                                subtitle: radioLanguagesSummary,
                                action: {
                                    showRadioLanguages = true
                                }
                            )

                            if !preferencesService.hiddenTopicIds.isEmpty {
                                SettingsRow(
                                    icon: "eye.slash.fill",
                                    title: "Hidden Topics",
                                    subtitle: "\(preferencesService.hiddenTopicIds.count) topic\(preferencesService.hiddenTopicIds.count == 1 ? "" : "s") hidden",
                                    action: {
                                        showHiddenTopics = true
                                    }
                                )
                            }

                            #if DEBUG
                            // Debug entry for the on-device Kokoro 82M pipeline.
                            // Production users reach the model via the
                            // onboarding "Voice runs on your phone" card.
                            SettingsRow(
                                icon: "waveform.path.ecg",
                                title: "On-device voice (debug)",
                                subtitle: "Test Kokoro 82M synth + playback",
                                action: {
                                    showKokoroTest = true
                                }
                            )

                            // Debug-only paywall bypass for on-device testing.
                            // Stripped from Release builds via the #if guard.
                            ForcePremiumToggleRow()
                            #endif
                        }
                    }
                    .padding(.horizontal, 16)

                    // About Section
                    VStack(alignment: .leading, spacing: 16) {
                        SectionHeader(title: "About")

                        VStack(spacing: 12) {
                            InfoRow(
                                icon: "info.circle.fill",
                                title: "Version",
                                value: Bundle.main.infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0.0"
                            )

                            SettingsRow(
                                icon: "doc.text.fill",
                                title: "Terms of Service",
                                subtitle: "",
                                action: {
                                    if let url = URL(string: "https://www.sendsmiles.biz/terms-of-service") {
                                        UIApplication.shared.open(url)
                                    }
                                }
                            )

                            SettingsRow(
                                icon: "lock.shield.fill",
                                title: "Privacy Policy",
                                subtitle: "",
                                action: {
                                    if let url = URL(string: "https://www.sendsmiles.biz/privacy-policy") {
                                        UIApplication.shared.open(url)
                                    }
                                }
                            )

                            // Share App
                            SettingsRow(
                                icon: "square.and.arrow.up.fill",
                                title: "Share Audexa",
                                subtitle: "Tell your friends",
                                action: {
                                    shareApp()
                                }
                            )
                        }
                    }
                    .padding(.horizontal, 16)

                    // Debug Paywall Section (DEBUG only)
                    #if DEBUG
                    VStack(alignment: .leading, spacing: 16) {
                        List {
                            PaywallDebugView(
                                appId: "audexa",
                                appName: "Audexa Premium",
                                features: [
                                    PaywallFeature(icon: "speaker.slash.fill", title: "Ad-Free Listening", description: "No audio ad interruptions"),
                                    PaywallFeature(icon: "bolt.fill", title: "Seamless Playback", description: "Uninterrupted episode streaming"),
                                    PaywallFeature(icon: "waveform.circle.fill", title: "Premium Voices", description: "Ultra-realistic AI narrators"),
                                    PaywallFeature(icon: "arrow.down.circle.fill", title: "Offline Downloads", description: "Listen without internet"),
                                    PaywallFeature(icon: "infinity", title: "Unlimited Topics", description: "Explore all categories"),
                                    PaywallFeature(icon: "magnifyingglass.circle.fill", title: "Deep Dive", description: "In-depth AI research podcasts"),
                                ],
                                theme: PaywallTheme(accent: Color(hex: "#FF6B35"), accent2: Color(hex: "#E55A2B"))
                            )
                        }
                        .listStyle(.insetGrouped)
                        .frame(height: 420)
                        .scrollDisabled(true)
                    }
                    .padding(.horizontal, 16)
                    #endif

                    // Account Actions Section
                    VStack(spacing: 12) {
                        // Sign Out Button
                        Button(action: {
                            showSignOutConfirmation = true
                        }) {
                            HStack(spacing: 8) {
                                Image(systemName: "rectangle.portrait.and.arrow.right")
                                    .font(.system(size: 18))

                                Text("Sign Out")
                                    .font(.system(size: 18, weight: .semibold))
                            }
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(Color.red.opacity(0.1))
                            .cornerRadius(12)
                        }

                        // Delete Account Button
                        Button(action: {
                            showDeleteConfirmation = true
                        }) {
                            HStack(spacing: 8) {
                                Image(systemName: "trash.fill")
                                    .font(.system(size: 18))

                                Text("Delete Account")
                                    .font(.system(size: 18, weight: .semibold))
                            }
                            .foregroundColor(.red)
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 16)
                            .background(Color.clear)
                            .overlay(
                                RoundedRectangle(cornerRadius: 12)
                                    .stroke(Color.red.opacity(0.5), lineWidth: 1)
                            )
                        }
                    }
                    .padding(.horizontal, 16)
                    .padding(.bottom, Theme.Sizing.miniPlayerHeight + Theme.Sizing.tabBarHeight)
                }
            }
            .background(Theme.Colors.background)
            .navigationTitle("Profile")
            .navigationBarTitleDisplayMode(.inline)
            .sheet(isPresented: $showLinkedAccounts) {
                LinkedAccountsView()
            }
            .sheet(isPresented: $showLanguagePicker) {
                LanguagePickerView(
                    selectedLanguage: preferencesService.preferredSupportedLanguage,
                    onSelect: { language in
                        preferencesService.preferredLanguage = language.rawValue
                        showLanguagePicker = false
                    }
                )
                .presentationDetents([.medium])
            }
            .sheet(isPresented: $showHiddenTopics) {
                HiddenTopicsView()
            }
            .sheet(isPresented: $showThemePicker) {
                ThemePickerView(
                    selectedTheme: preferencesService.appTheme,
                    onSelect: { theme in
                        preferencesService.appTheme = theme
                        showThemePicker = false
                    }
                )
                .presentationDetents([.height(280)])
            }
            .sheet(isPresented: $showRadioLanguages) {
                RadioLanguagesView()
                    .presentationDetents([.medium])
            }
            .sheet(isPresented: $showKokoroTest) {
                KokoroTestView()
            }
            .sheet(isPresented: $showPaywall) {
                RemotePaywallView(triggerSource: "profile")
            }
            .alert("Sign Out", isPresented: $showSignOutConfirmation) {
                Button("Cancel", role: .cancel) { }
                Button("Sign Out", role: .destructive) {
                    Task {
                        await authService.signOut()
                    }
                }
            } message: {
                Text("Are you sure you want to sign out?")
            }
            .alert("Delete Account", isPresented: $showDeleteConfirmation) {
                Button("Cancel", role: .cancel) { }
                Button("Delete", role: .destructive) {
                    Task {
                        await deleteAccount()
                    }
                }
            } message: {
                Text("Are you sure you want to delete your account? This will permanently delete all your data including podcasts, preferences, and linked accounts. This action cannot be undone.")
            }
            .alert("Error", isPresented: $showDeleteError) {
                Button("OK", role: .cancel) { }
            } message: {
                Text(deleteError ?? "Failed to delete account. Please try again.")
            }
            .overlay {
                if isDeleting {
                    Color.black.opacity(0.5)
                        .ignoresSafeArea()

                    VStack(spacing: 16) {
                        ProgressView()
                            .progressViewStyle(CircularProgressViewStyle(tint: Theme.Colors.accent))
                            .scaleEffect(1.5)

                        Text("Deleting account...")
                            .font(.system(size: 16, weight: .medium))
                            .foregroundColor(.white)
                    }
                }
            }
        }
    }

    private func deleteAccount() async {
        isDeleting = true
        deleteError = nil

        do {
            try await authService.deleteAccount()
            // Account deleted successfully - user will be signed out automatically
        } catch {
            deleteError = error.localizedDescription
            showDeleteError = true
        }

        isDeleting = false
    }

    private func getInitials() -> String {
        guard let name = authService.currentUser?.name else { return "U" }
        let components = name.split(separator: " ")
        if components.count >= 2 {
            return String(components[0].prefix(1) + components[1].prefix(1)).uppercased()
        }
        return String(name.prefix(1)).uppercased()
    }

    private var radioLanguagesSummary: String {
        let langs = preferencesService.radioSupportedLanguages
        if langs.isEmpty { return "None" }
        return langs.map { $0.radioStationName.replacingOccurrences(of: "Audexa Radio ", with: "").replacingOccurrences(of: "Audexa Radio", with: "English") }.joined(separator: ", ")
    }

    private func shareApp() {
        let appStoreURL = "https://apps.apple.com/app/audexa" // Update with actual App Store URL when available
        let shareText = "Check out Audexa - Your personalized AI-powered daily briefing podcast! 🎙️"
        let items: [Any] = [shareText, URL(string: appStoreURL)!]

        let activityVC = UIActivityViewController(activityItems: items, applicationActivities: nil)

        // Get the key window scene
        if let windowScene = UIApplication.shared.connectedScenes.first as? UIWindowScene,
           let rootViewController = windowScene.windows.first?.rootViewController {
            // Handle iPad popover
            if let popover = activityVC.popoverPresentationController {
                popover.sourceView = rootViewController.view
                popover.sourceRect = CGRect(x: UIScreen.main.bounds.midX, y: UIScreen.main.bounds.midY, width: 0, height: 0)
                popover.permittedArrowDirections = []
            }
            rootViewController.present(activityVC, animated: true)
        }
    }
}

// MARK: - Supporting Views

struct SectionHeader: View {
    let title: String

    var body: some View {
        Text(title)
            .font(.system(size: 20, weight: .bold))
            .foregroundColor(Theme.Colors.primaryText)
    }
}

struct SettingsRow: View {
    let icon: String
    let title: String
    let subtitle: String
    let action: () -> Void

    var body: some View {
        Button(action: action) {
            HStack(spacing: 12) {
                Image(systemName: icon)
                    .font(.system(size: 20))
                    .foregroundColor(Theme.Colors.accent)
                    .frame(width: 32)

                VStack(alignment: .leading, spacing: 4) {
                    Text(title)
                        .font(.system(size: 16, weight: .semibold))
                        .foregroundColor(Theme.Colors.primaryText)

                    if !subtitle.isEmpty {
                        Text(subtitle)
                            .font(.system(size: 14, weight: .regular))
                            .foregroundColor(Theme.Colors.secondaryText)
                            .lineLimit(1)
                    }
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.system(size: 14))
                    .foregroundColor(Theme.Colors.secondaryText)
            }
            .padding(16)
            .background(Theme.Colors.cardBackground)
            .cornerRadius(12)
        }
        .buttonStyle(ScaleButtonStyle())
    }
}

struct InfoRow: View {
    let icon: String
    let title: String
    let value: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: icon)
                .font(.system(size: 20))
                .foregroundColor(Theme.Colors.accent)
                .frame(width: 32)

            Text(title)
                .font(.system(size: 16, weight: .semibold))
                .foregroundColor(Theme.Colors.primaryText)

            Spacer()

            Text(value)
                .font(.system(size: 14, weight: .regular))
                .foregroundColor(Theme.Colors.secondaryText)
        }
        .padding(16)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(12)
    }
}

struct IntegrationSettingsToggle: View {
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
                    .font(.system(size: 16, weight: .semibold))
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
        .padding(16)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(12)
    }
}

struct LinkedAccountRow: View {
    let account: LinkedAccount

    var body: some View {
        HStack(spacing: 12) {
            // Provider icon
            Circle()
                .fill(account.isActive ? Color.green.opacity(0.2) : Color.gray.opacity(0.2))
                .frame(width: 40, height: 40)
                .overlay(
                    Image(systemName: account.provider.iconName)
                        .font(.system(size: 20))
                        .foregroundColor(account.isActive ? .green : .gray)
                )

            // Info
            VStack(alignment: .leading, spacing: 4) {
                Text(account.provider.displayName)
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Theme.Colors.primaryText)

                Text(account.email)
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
            }

            Spacer()

            // Status
            HStack(spacing: 6) {
                if account.isActive {
                    Image(systemName: "checkmark.circle.fill")
                        .font(.system(size: 16))
                        .foregroundColor(.green)

                    Text("Connected")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.green)
                } else {
                    Text("Disconnected")
                        .font(.system(size: 13, weight: .medium))
                        .foregroundColor(.gray)
                }
            }
        }
        .padding(16)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(12)
    }
}

// MARK: - Language Picker View

struct LanguagePickerView: View {
    let selectedLanguage: SupportedLanguage
    let onSelect: (SupportedLanguage) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(SupportedLanguage.allCases) { language in
                    Button(action: { onSelect(language) }) {
                        HStack {
                            Text(language.flagEmoji)
                                .font(.system(size: 24))

                            VStack(alignment: .leading, spacing: 2) {
                                Text(language.displayName)
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(Theme.Colors.primaryText)

                                Text(language.nativeName)
                                    .font(.system(size: 13))
                                    .foregroundColor(Theme.Colors.secondaryText)
                            }

                            Spacer()

                            if language == selectedLanguage {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(Theme.Colors.accent)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Podcast Language")
            .navigationBarTitleDisplayMode(.inline)
        }
    }
}

// MARK: - Hidden Topics View

struct HiddenTopicsView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var preferencesService = PreferencesService.shared
    @State private var topics: [Topic] = []

    var body: some View {
        NavigationStack {
            Group {
                if hiddenTopics.isEmpty {
                    VStack(spacing: 16) {
                        Image(systemName: "eye.fill")
                            .font(.system(size: 48))
                            .foregroundColor(Theme.Colors.secondaryText)

                        Text("No Hidden Topics")
                            .font(.system(size: 18, weight: .semibold))
                            .foregroundColor(Theme.Colors.primaryText)

                        Text("Topics you hide will appear here")
                            .font(.system(size: 14))
                            .foregroundColor(Theme.Colors.secondaryText)
                    }
                    .frame(maxWidth: .infinity, maxHeight: .infinity)
                    .background(Theme.Colors.background)
                } else {
                    List {
                        ForEach(hiddenTopics) { topic in
                            HStack(spacing: 12) {
                                // Topic icon
                                ZStack {
                                    topic.swiftUIColor.opacity(0.2)
                                        .frame(width: 44, height: 44)
                                        .cornerRadius(10)

                                    Image(systemName: topic.systemImage)
                                        .font(.system(size: 18))
                                        .foregroundColor(topic.swiftUIColor)
                                }

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(topic.name)
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundColor(Theme.Colors.primaryText)

                                    Text(topic.category.displayName)
                                        .font(.system(size: 13))
                                        .foregroundColor(Theme.Colors.secondaryText)
                                }

                                Spacer()

                                // Unhide button
                                Button(action: {
                                    preferencesService.unhideTopic(topic.id)
                                }) {
                                    Text("Unhide")
                                        .font(.system(size: 14, weight: .medium))
                                        .foregroundColor(Theme.Colors.accent)
                                        .padding(.horizontal, 12)
                                        .padding(.vertical, 6)
                                        .background(Theme.Colors.accent.opacity(0.1))
                                        .cornerRadius(8)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                    .listStyle(.insetGrouped)
                }
            }
            .navigationTitle("Hidden Topics")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(Theme.Colors.accent)
                }
            }
        }
        .task {
            await loadTopics()
        }
    }

    private var hiddenTopics: [Topic] {
        topics.filter { preferencesService.hiddenTopicIds.contains($0.id) }
    }

    private func loadTopics() async {
        do {
            let topicsData = try await TopicService.shared.fetchTopics()
            topics = topicsData.topics
        } catch {
            print("Failed to load topics: \(error)")
        }
    }
}

// MARK: - Theme Picker View

struct ThemePickerView: View {
    let selectedTheme: AppTheme
    let onSelect: (AppTheme) -> Void

    var body: some View {
        NavigationStack {
            List {
                ForEach(AppTheme.allCases) { theme in
                    Button(action: { onSelect(theme) }) {
                        HStack {
                            Image(systemName: theme.iconName)
                                .font(.system(size: 20))
                                .foregroundColor(Theme.Colors.accent)
                                .frame(width: 32)

                            VStack(alignment: .leading, spacing: 2) {
                                Text(theme.displayName)
                                    .font(.system(size: 16, weight: .medium))
                                    .foregroundColor(Theme.Colors.primaryText)

                                Text(themeDescription(for: theme))
                                    .font(.system(size: 13))
                                    .foregroundColor(Theme.Colors.secondaryText)
                            }

                            Spacer()

                            if theme == selectedTheme {
                                Image(systemName: "checkmark")
                                    .font(.system(size: 16, weight: .semibold))
                                    .foregroundColor(Theme.Colors.accent)
                            }
                        }
                        .padding(.vertical, 4)
                    }
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("App Theme")
            .navigationBarTitleDisplayMode(.inline)
        }
    }

    private func themeDescription(for theme: AppTheme) -> String {
        switch theme {
        case .system: return "Match device settings"
        case .dark: return "Always dark mode"
        case .light: return "Always light mode"
        }
    }
}

// MARK: - Radio Languages View

struct RadioLanguagesView: View {
    @Environment(\.dismiss) private var dismiss
    @StateObject private var preferencesService = PreferencesService.shared

    var body: some View {
        NavigationStack {
            List {
                Section {
                    ForEach(SupportedLanguage.radioAvailable) { language in
                        let isEnabled = preferencesService.radioLanguages.contains(language.rawValue)
                        let isLastEnabled = isEnabled && preferencesService.radioLanguages.count == 1
                        Button(action: {
                            preferencesService.toggleRadioLanguage(language.rawValue)
                        }) {
                            HStack {
                                Text(language.flagEmoji)
                                    .font(.system(size: 24))

                                VStack(alignment: .leading, spacing: 2) {
                                    Text(language.radioStationName)
                                        .font(.system(size: 16, weight: .medium))
                                        .foregroundColor(Theme.Colors.primaryText)

                                    Text(language.nativeName)
                                        .font(.system(size: 13))
                                        .foregroundColor(Theme.Colors.secondaryText)
                                }

                                Spacer()

                                Image(systemName: isEnabled ? "checkmark.circle.fill" : "circle")
                                    .font(.system(size: 22))
                                    .foregroundColor(isEnabled ? Theme.Colors.accent : Theme.Colors.secondaryText.opacity(0.4))
                            }
                            .padding(.vertical, 4)
                            .opacity(isLastEnabled ? 0.6 : 1.0)
                        }
                        .disabled(isLastEnabled)
                    }
                } footer: {
                    Text("Selected stations will appear on your home screen. At least one language must be enabled.")
                        .font(.system(size: 13))
                        .foregroundColor(Theme.Colors.secondaryText)
                }
            }
            .listStyle(.insetGrouped)
            .navigationTitle("Radio Languages")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                    .foregroundColor(Theme.Colors.accent)
                }
            }
        }
    }
}

#Preview {
    ProfileView()
        .environmentObject(AuthService())
}

#if DEBUG
/// Debug-only paywall bypass toggle. Persists in UserDefaults via
/// `SubscriptionManager.debugForcePremiumEnabled`. Compiled out of Release
/// builds so the row never exists in a shipped app.
private struct ForcePremiumToggleRow: View {
    @State private var isOn: Bool = SubscriptionManager.debugForcePremiumEnabled

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: "lock.open.fill")
                .font(.system(size: 20))
                .foregroundColor(.orange)
                .frame(width: 32)

            VStack(alignment: .leading, spacing: 4) {
                Text("Skip paywall (debug)")
                    .font(.system(size: 16, weight: .semibold))
                    .foregroundColor(Theme.Colors.primaryText)

                Text(isOn ? "Pretending you're premium" : "Off — using real subscription state")
                    .font(.system(size: 14, weight: .regular))
                    .foregroundColor(Theme.Colors.secondaryText)
                    .lineLimit(1)
            }

            Spacer()

            Toggle("", isOn: $isOn)
                .labelsHidden()
                .onChange(of: isOn) { _, newValue in
                    SubscriptionManager.debugForcePremiumEnabled = newValue
                }
        }
        .padding(.horizontal, 16)
        .padding(.vertical, 12)
        .background(Theme.Colors.cardBackground)
        .cornerRadius(12)
    }
}
#endif
