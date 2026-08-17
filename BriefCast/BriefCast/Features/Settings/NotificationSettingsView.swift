//
//  NotificationSettingsView.swift
//  BriefCast
//
//  Settings for daily brief schedule and push notifications
//

import SwiftUI

struct NotificationSettingsView: View {
    @State private var viewModel = NotificationSettingsViewModel()
    @Environment(\.dismiss) private var dismiss

    // Daily briefing wiring
    @State private var showBriefingGeneration = false
    @State private var generatedBriefing: DailyBriefingGenerator.Result?
    private let topicPrefs = UserTopicPreferences.shared

    var body: some View {
        NavigationStack {
            Form {
                // Notification Permission Section
                Section {
                    HStack {
                        Label("Notifications", systemImage: "bell.badge.fill")

                        Spacer()

                        switch viewModel.permissionStatus {
                        case .authorized:
                            Text("Enabled")
                                .foregroundColor(.green)
                        case .denied:
                            Button("Open Settings") {
                                viewModel.openAppSettings()
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                        case .notDetermined:
                            Button("Enable") {
                                Task {
                                    await viewModel.requestPermission()
                                }
                            }
                            .buttonStyle(.borderedProminent)
                            .controlSize(.small)
                        default:
                            Text("Not Available")
                                .foregroundColor(.secondary)
                        }
                    }
                } header: {
                    Text("Permission")
                } footer: {
                    Text("Allow notifications to receive your daily brief when it's ready.")
                }

                // Daily Brief Schedule Section
                Section {
                    Toggle(isOn: $viewModel.notificationsEnabled) {
                        Label("Daily Brief Notifications", systemImage: "sun.horizon.fill")
                    }
                    .onChange(of: viewModel.notificationsEnabled) { _, newValue in
                        Task {
                            await viewModel.saveSettings()
                        }
                    }

                    if viewModel.notificationsEnabled {
                        DatePicker(
                            "Briefing Time",
                            selection: $viewModel.briefingTime,
                            displayedComponents: .hourAndMinute
                        )
                        .onChange(of: viewModel.briefingTime) { _, _ in
                            Task {
                                await viewModel.saveSettings()
                            }
                        }

                        Picker("Timezone", selection: $viewModel.selectedTimezone) {
                            ForEach(viewModel.availableTimezones, id: \.self) { tz in
                                Text(tz.friendlyName).tag(tz)
                            }
                        }
                        .onChange(of: viewModel.selectedTimezone) { _, _ in
                            Task {
                                await viewModel.saveSettings()
                            }
                        }
                    }
                } header: {
                    Text("Daily Brief Schedule")
                } footer: {
                    if viewModel.notificationsEnabled {
                        Text("Your daily brief will be generated and ready at \(viewModel.formattedBriefingTime). You'll receive a notification when it's ready to play.")
                    } else {
                        Text("Enable to have your daily brief automatically generated each morning.")
                    }
                }

                // Daily Brief Content Section
                Section {
                    Toggle(isOn: $viewModel.includeTopicUpdates) {
                        Label("Include Topic Updates", systemImage: "newspaper.fill")
                    }
                    .onChange(of: viewModel.includeTopicUpdates) { _, _ in
                        viewModel.saveTopicPreference()
                    }

                    if viewModel.includeTopicUpdates {
                        NavigationLink {
                            TopicPickerView()
                        } label: {
                            HStack {
                                Label("Briefing Topics", systemImage: "list.bullet.rectangle.portrait")
                                Spacer()
                                Text(topicPrefs.count == 0
                                     ? "Pick"
                                     : "\(topicPrefs.count) selected")
                                    .foregroundStyle(.secondary)
                            }
                        }
                    }
                } header: {
                    Text("Daily Brief Content")
                } footer: {
                    Text("When enabled, your Daily Brief will include headlines and updates from the topics you select.")
                }

                // On-device daily briefing
                dailyBriefingOnDeviceSection

                // Preview Section
                if viewModel.notificationsEnabled {
                    Section {
                        HStack {
                            Image(systemName: "bell.circle.fill")
                                .font(.system(size: 40))
                                .foregroundColor(.orange)

                            VStack(alignment: .leading, spacing: 4) {
                                Text("☀️ Your Daily Brief is Ready")
                                    .font(.headline)
                                Text("Your personalized briefing is ready to play.")
                                    .font(.subheadline)
                                    .foregroundColor(.secondary)
                            }
                        }
                        .padding(.vertical, 8)
                    } header: {
                        Text("Notification Preview")
                    }
                }

            }
            .navigationTitle("Notifications")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Done") {
                        dismiss()
                    }
                }
            }
            .task {
                await viewModel.loadSettings()
            }
            .sheet(isPresented: $showBriefingGeneration) {
                BriefingGenerationView { result in
                    generatedBriefing = result
                    AudioService.shared.playStream(
                        url: result.fileURL,
                        title: "Daily Briefing",
                        showName: "Your Topics"
                    )
                }
            }
        }
    }

    // MARK: - On-device daily briefing

    @ViewBuilder
    private var dailyBriefingOnDeviceSection: some View {
        let eligible = KokoroModelManager.isDeviceEligible
        let premium = SubscriptionManager.shared.isSubscribed
        let hasTopics = topicPrefs.count > 0
        let canGenerate = eligible && premium && hasTopics && viewModel.includeTopicUpdates

        Section {
            if !eligible {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Not supported on this device")
                        Text("On-device briefings need iPhone 13 or newer with iOS 17+.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "iphone.slash")
                        .foregroundStyle(.secondary)
                }
            } else if !premium {
                Label {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Audexa Premium required")
                        Text("Premium unlocks on-device briefings tailored to your topics.")
                            .font(.caption).foregroundStyle(.secondary)
                    }
                } icon: {
                    Image(systemName: "lock.fill")
                        .foregroundStyle(.orange)
                }
            } else if !viewModel.includeTopicUpdates {
                Label("Enable 'Include Topic Updates' above to use the on-device briefing.",
                      systemImage: "info.circle")
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            } else if !hasTopics {
                NavigationLink {
                    TopicPickerView()
                } label: {
                    Label("Pick topics to enable on-device generation",
                          systemImage: "list.bullet.rectangle.portrait")
                }
            } else {
                Button {
                    showBriefingGeneration = true
                } label: {
                    HStack {
                        Label("Generate Briefing Now", systemImage: "waveform.circle.fill")
                        Spacer()
                        Image(systemName: "play.fill")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .disabled(!canGenerate)
            }
        } header: {
            Text("On-Device Briefing")
        } footer: {
            if eligible && premium {
                Text("Briefing audio is generated on this iPhone using your chosen topics. No cloud render, no waiting — synthesis runs in ~60-120 seconds the first time.")
            }
        }
    }
}

// MARK: - View Model

@MainActor
@Observable
class NotificationSettingsViewModel {
    var notificationsEnabled = true
    var briefingTime = Calendar.current.date(from: DateComponents(hour: 7, minute: 0)) ?? Date()
    var selectedTimezone = TimezoneOption.current
    var permissionStatus: UNAuthorizationStatus = .notDetermined
    var isGenerating = false
    var isSaving = false
    var includeTopicUpdates = true

    let availableTimezones: [TimezoneOption] = [
        .losAngeles,
        .denver,
        .chicago,
        .newYork,
        .london,
        .paris,
        .tokyo,
        .sydney,
    ]

    private let pushService = PushNotificationService.shared

    var formattedBriefingTime: String {
        let formatter = DateFormatter()
        formatter.timeStyle = .short
        return formatter.string(from: briefingTime)
    }

    func loadSettings() async {
        await pushService.checkPermissionStatus()
        permissionStatus = pushService.permissionStatus

        // Load topic updates preference from local storage
        includeTopicUpdates = UserDefaults.standard.object(forKey: "includeTopicUpdates") as? Bool ?? true

        // Fetch settings from backend/local
        if let settings = await pushService.fetchSettings() {
            notificationsEnabled = settings.notificationsEnabled

            // Parse briefing time
            let components = settings.briefingTime.split(separator: ":")
            if components.count == 2,
               let hour = Int(components[0]),
               let minute = Int(components[1]) {
                briefingTime = Calendar.current.date(from: DateComponents(hour: hour, minute: minute)) ?? briefingTime
            }

            // Parse timezone
            if let tz = availableTimezones.first(where: { $0.identifier == settings.timezone }) {
                selectedTimezone = tz
            }
        }
    }

    func saveTopicPreference() {
        UserDefaults.standard.set(includeTopicUpdates, forKey: "includeTopicUpdates")
        print("📰 Topic updates preference saved: \(includeTopicUpdates)")
    }

    func requestPermission() async {
        await pushService.requestPermissionAndRegister()
        await pushService.checkPermissionStatus()
        permissionStatus = pushService.permissionStatus
    }

    func saveSettings() async {
        guard !isSaving else { return }
        isSaving = true

        let formatter = DateFormatter()
        formatter.dateFormat = "HH:mm"
        let timeString = formatter.string(from: briefingTime)

        await pushService.updateSettings(
            briefingTime: timeString,
            timezone: selectedTimezone.identifier,
            enabled: notificationsEnabled
        )

        isSaving = false
    }

    func triggerManualGeneration() async {
        guard !isGenerating else { return }
        isGenerating = true

        // Get userId from UserDefaults (same as stored by AuthService)
        let userId = UserDefaults.standard.string(forKey: "linkedAccountEmail")
        guard let userId = userId, !userId.isEmpty else {
            isGenerating = false
            return
        }

        // TODO: Implement API call when backend is ready
        print("📱 Would trigger manual generation for user: \(userId)")

        isGenerating = false
    }

    func openAppSettings() {
        if let url = URL(string: UIApplication.openSettingsURLString) {
            UIApplication.shared.open(url)
        }
    }
}

// MARK: - Timezone Options

struct TimezoneOption: Hashable {
    let identifier: String
    let friendlyName: String

    static let losAngeles = TimezoneOption(identifier: "America/Los_Angeles", friendlyName: "Pacific Time (LA)")
    static let denver = TimezoneOption(identifier: "America/Denver", friendlyName: "Mountain Time (Denver)")
    static let chicago = TimezoneOption(identifier: "America/Chicago", friendlyName: "Central Time (Chicago)")
    static let newYork = TimezoneOption(identifier: "America/New_York", friendlyName: "Eastern Time (NY)")
    static let london = TimezoneOption(identifier: "Europe/London", friendlyName: "London (GMT)")
    static let paris = TimezoneOption(identifier: "Europe/Paris", friendlyName: "Paris (CET)")
    static let tokyo = TimezoneOption(identifier: "Asia/Tokyo", friendlyName: "Tokyo (JST)")
    static let sydney = TimezoneOption(identifier: "Australia/Sydney", friendlyName: "Sydney (AEST)")

    static var current: TimezoneOption {
        let tz = TimeZone.current.identifier
        switch tz {
        case "America/Los_Angeles": return .losAngeles
        case "America/Denver": return .denver
        case "America/Chicago": return .chicago
        case "America/New_York": return .newYork
        case "Europe/London": return .london
        case "Europe/Paris": return .paris
        case "Asia/Tokyo": return .tokyo
        case "Australia/Sydney": return .sydney
        default: return .losAngeles
        }
    }
}

#Preview {
    NotificationSettingsView()
}
