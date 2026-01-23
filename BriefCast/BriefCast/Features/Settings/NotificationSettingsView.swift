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

                // Manual Trigger (for testing)
                Section {
                    Button(action: {
                        Task {
                            await viewModel.triggerManualGeneration()
                        }
                    }) {
                        HStack {
                            Label("Generate Now", systemImage: "play.fill")
                            Spacer()
                            if viewModel.isGenerating {
                                ProgressView()
                            }
                        }
                    }
                    .disabled(viewModel.isGenerating)
                } header: {
                    Text("Manual")
                } footer: {
                    Text("Generate your daily brief immediately instead of waiting for the scheduled time.")
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

        // Fetch settings from backend
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
