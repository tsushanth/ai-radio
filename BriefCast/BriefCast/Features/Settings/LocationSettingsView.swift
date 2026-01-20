//
//  LocationSettingsView.swift
//  BriefCast
//
//  Settings view for weather and traffic location configuration
//

import SwiftUI

struct LocationSettingsView: View {
    @StateObject private var weatherService = WeatherTrafficService.shared
    @Environment(\.dismiss) private var dismiss

    @State private var homeAddress: String = ""
    @State private var workAddress: String = ""
    @State private var useCurrentLocation = true
    @State private var temperatureUnit: TemperatureUnit = .fahrenheit

    var body: some View {
        NavigationStack {
            Form {
                // Current Weather Preview
                if let weather = weatherService.currentWeather {
                    Section {
                        WeatherPreviewCard(weather: weather, unit: temperatureUnit)
                    }
                }

                // Location Settings
                Section {
                    Toggle("Use Current Location", isOn: $useCurrentLocation)
                        .tint(Theme.Colors.accent)
                        .onChange(of: useCurrentLocation) { _, newValue in
                            if newValue {
                                weatherService.requestLocationPermission()
                            }
                        }

                    if let error = weatherService.locationError {
                        HStack {
                            Image(systemName: "exclamationmark.triangle.fill")
                                .foregroundColor(.orange)
                            Text(error)
                                .font(.caption)
                                .foregroundColor(.secondary)
                        }
                    }
                } header: {
                    Text("Weather Location")
                }

                // Home & Work Addresses (for traffic)
                Section {
                    VStack(alignment: .leading, spacing: 4) {
                        Text("Home Address")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        TextField("Enter your home address", text: $homeAddress)
                            .textContentType(.fullStreetAddress)
                    }

                    VStack(alignment: .leading, spacing: 4) {
                        Text("Work Address")
                            .font(.caption)
                            .foregroundColor(.secondary)

                        TextField("Enter your work address", text: $workAddress)
                            .textContentType(.fullStreetAddress)
                    }
                } header: {
                    Text("Traffic Route")
                } footer: {
                    Text("Set both addresses to get commute time in your daily briefing")
                }

                // Traffic Preview
                if let traffic = weatherService.currentTraffic {
                    Section {
                        TrafficPreviewCard(traffic: traffic)
                    }
                }

                // Units
                Section {
                    Picker("Temperature Unit", selection: $temperatureUnit) {
                        ForEach(TemperatureUnit.allCases, id: \.self) { unit in
                            Text(unit == .fahrenheit ? "Fahrenheit (°F)" : "Celsius (°C)")
                                .tag(unit)
                        }
                    }
                } header: {
                    Text("Units")
                }

                // Info Section
                Section {
                    HStack(spacing: 12) {
                        Image(systemName: "info.circle.fill")
                            .foregroundColor(.blue)

                        Text("Weather and traffic information will be included in your morning daily briefing when available.")
                            .font(.footnote)
                            .foregroundColor(.secondary)
                    }
                }
            }
            .navigationTitle("Location & Weather")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .navigationBarLeading) {
                    Button("Cancel") { dismiss() }
                }

                ToolbarItem(placement: .navigationBarTrailing) {
                    Button("Save") {
                        saveSettings()
                        dismiss()
                    }
                    .fontWeight(.semibold)
                }
            }
            .onAppear {
                loadCurrentSettings()
            }
        }
    }

    private func loadCurrentSettings() {
        let settings = weatherService.locationSettings
        homeAddress = settings.homeAddress ?? ""
        workAddress = settings.workAddress ?? ""
        useCurrentLocation = settings.useCurrentLocation
        temperatureUnit = settings.temperatureUnit
    }

    private func saveSettings() {
        let settings = UserLocationSettings(
            homeAddress: homeAddress.isEmpty ? nil : homeAddress,
            workAddress: workAddress.isEmpty ? nil : workAddress,
            currentLocation: nil,
            useCurrentLocation: useCurrentLocation,
            temperatureUnit: temperatureUnit
        )
        weatherService.updateLocationSettings(settings)
    }
}

// MARK: - Weather Preview Card

struct WeatherPreviewCard: View {
    let weather: WeatherData
    let unit: TemperatureUnit

    var body: some View {
        HStack(spacing: 16) {
            // Weather icon
            Image(systemName: weather.current.systemImage)
                .font(.system(size: 40))
                .foregroundColor(.orange)

            VStack(alignment: .leading, spacing: 4) {
                // Temperature
                Text(unit == .fahrenheit
                     ? weather.current.temperatureDisplay
                     : weather.current.temperatureCelsiusDisplay)
                    .font(.system(size: 28, weight: .bold))

                // Condition
                Text(weather.current.condition)
                    .font(.subheadline)
                    .foregroundColor(.secondary)

                // Location
                Text(weather.location.city)
                    .font(.caption)
                    .foregroundColor(.secondary)
            }

            Spacer()

            // High/Low
            VStack(alignment: .trailing, spacing: 2) {
                HStack(spacing: 4) {
                    Image(systemName: "arrow.up")
                        .font(.caption2)
                    Text("\(Int(weather.forecast.high))°")
                        .font(.subheadline)
                }
                .foregroundColor(.red.opacity(0.8))

                HStack(spacing: 4) {
                    Image(systemName: "arrow.down")
                        .font(.caption2)
                    Text("\(Int(weather.forecast.low))°")
                        .font(.subheadline)
                }
                .foregroundColor(.blue.opacity(0.8))
            }
        }
        .padding(.vertical, 8)
    }
}

// MARK: - Traffic Preview Card

struct TrafficPreviewCard: View {
    let traffic: TrafficData

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            // Route info
            HStack {
                Image(systemName: "car.fill")
                    .foregroundColor(Color(hex: traffic.currentConditions.congestionLevel.color))

                Text(traffic.route.name)
                    .font(.headline)

                Spacer()

                // Current duration
                Text(formatDuration(traffic.currentConditions.currentDuration))
                    .font(.system(size: 18, weight: .bold))
            }

            // Congestion level
            HStack {
                Text(traffic.currentConditions.congestionLevel.displayText)
                    .font(.subheadline)
                    .foregroundColor(Color(hex: traffic.currentConditions.congestionLevel.color))

                if traffic.currentConditions.delayMinutes > 0 {
                    Text("• \(traffic.currentConditions.delayMinutes) min delay")
                        .font(.subheadline)
                        .foregroundColor(.orange)
                }
            }

            // Incidents
            if let incidents = traffic.incidents, !incidents.isEmpty {
                Divider()

                ForEach(incidents.prefix(2)) { incident in
                    HStack(spacing: 8) {
                        Image(systemName: incident.systemImage)
                            .foregroundColor(.orange)
                            .frame(width: 20)

                        VStack(alignment: .leading) {
                            Text(incident.title)
                                .font(.caption)
                                .fontWeight(.medium)

                            Text(incident.location)
                                .font(.caption2)
                                .foregroundColor(.secondary)
                        }
                    }
                }
            }
        }
        .padding(.vertical, 8)
    }

    private func formatDuration(_ seconds: Int) -> String {
        let minutes = seconds / 60
        if minutes >= 60 {
            let hours = minutes / 60
            let mins = minutes % 60
            return "\(hours)h \(mins)m"
        }
        return "\(minutes) min"
    }
}

// MARK: - Preview

#Preview {
    LocationSettingsView()
}
