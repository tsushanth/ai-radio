//
//  WeatherTrafficService.swift
//  BriefCast
//
//  Service for fetching weather and traffic data
//  Note: Weather/traffic APIs are not yet implemented
//
//  Models are defined in WeatherTraffic.swift
//

import Foundation
import CoreLocation

@MainActor
class WeatherTrafficService: NSObject, ObservableObject {
    static let shared = WeatherTrafficService()

    private let locationManager = CLLocationManager()

    // Published state
    @Published var currentWeather: WeatherData?
    @Published var currentTraffic: TrafficData?
    @Published var locationSettings: UserLocationSettings = .default
    @Published var isLoadingWeather = false
    @Published var isLoadingTraffic = false
    @Published var locationError: String?

    // Cache
    private let weatherCacheKey = "cached_weather"
    private let trafficCacheKey = "cached_traffic"
    private let settingsCacheKey = "location_settings"
    private let cacheValiditySeconds: TimeInterval = 1800 // 30 minutes

    private var currentLocation: CLLocation?

    override private init() {
        super.init()
        loadCachedData()
        setupLocationManager()
    }

    // MARK: - Location Manager

    private func setupLocationManager() {
        locationManager.delegate = self
        locationManager.desiredAccuracy = kCLLocationAccuracyKilometer
    }

    func requestLocationPermission() {
        let status = locationManager.authorizationStatus

        switch status {
        case .notDetermined:
            locationManager.requestWhenInUseAuthorization()
        case .authorizedWhenInUse, .authorizedAlways:
            locationManager.requestLocation()
        case .denied, .restricted:
            locationError = "Location access denied. Enable in Settings to get weather and traffic."
        @unknown default:
            break
        }
    }

    // MARK: - Fetch Weather

    func fetchWeather(forceRefresh: Bool = false) async {
        // Check cache first
        if !forceRefresh, let cached = currentWeather,
           Date().timeIntervalSince(cached.fetchedAt) < cacheValiditySeconds {
            return
        }

        isLoadingWeather = true
        defer { isLoadingWeather = false }

        // TODO: Implement weather API fetch
        print("🌤️ Would fetch weather data")
    }

    // MARK: - Fetch Traffic

    func fetchTraffic(forceRefresh: Bool = false) async {
        // Need both home and work addresses for traffic
        guard locationSettings.homeAddress != nil,
              locationSettings.workAddress != nil else {
            return
        }

        // Check cache first
        if !forceRefresh, let cached = currentTraffic,
           Date().timeIntervalSince(cached.fetchedAt) < cacheValiditySeconds {
            return
        }

        isLoadingTraffic = true
        defer { isLoadingTraffic = false }

        // TODO: Implement traffic API fetch
        print("🚗 Would fetch traffic data")
    }

    // MARK: - Fetch All Context Data

    func fetchContextData(forceRefresh: Bool = false) async -> ContextData? {
        // Fetch weather and traffic in parallel
        async let weatherTask: () = fetchWeather(forceRefresh: forceRefresh)
        async let trafficTask: () = fetchTraffic(forceRefresh: forceRefresh)

        await weatherTask
        await trafficTask

        return ContextData(
            weather: currentWeather,
            traffic: currentTraffic,
            localNews: nil
        )
    }

    // MARK: - Settings

    func updateLocationSettings(_ settings: UserLocationSettings) {
        locationSettings = settings
        cacheSettings(settings)

        // Refresh data with new settings
        Task {
            _ = await fetchContextData(forceRefresh: true)
        }
    }

    func setHomeAddress(_ address: String) {
        var settings = locationSettings
        settings.homeAddress = address
        updateLocationSettings(settings)
    }

    func setWorkAddress(_ address: String) {
        var settings = locationSettings
        settings.workAddress = address
        updateLocationSettings(settings)
    }

    func setTemperatureUnit(_ unit: TemperatureUnit) {
        var settings = locationSettings
        settings.temperatureUnit = unit
        updateLocationSettings(settings)
    }

    // MARK: - Formatted Data for Display

    var weatherSummaryForBriefing: String? {
        guard let weather = currentWeather else { return nil }

        let temp = locationSettings.temperatureUnit == .fahrenheit
            ? weather.current.temperatureDisplay
            : weather.current.temperatureCelsiusDisplay

        var summary = "Currently \(temp) and \(weather.current.condition.lowercased()) in \(weather.location.city)."

        if weather.forecast.precipitationChance > 30 {
            summary += " There's a \(weather.forecast.precipitationChance)% chance of precipitation today."
        }

        if let alerts = weather.alerts, !alerts.isEmpty {
            summary += " Weather alert: \(alerts[0].title)."
        }

        return summary
    }

    var trafficSummaryForBriefing: String? {
        guard let traffic = currentTraffic else { return nil }

        let conditions = traffic.currentConditions
        let delayText = conditions.delayMinutes > 0
            ? "with a \(conditions.delayMinutes) minute delay"
            : "with no significant delays"

        var summary = "Your commute is looking \(conditions.congestionLevel.displayText.lowercased()) \(delayText)."

        if let incidents = traffic.incidents, !incidents.isEmpty {
            let incident = incidents[0]
            summary += " There's a reported \(incident.type.replacingOccurrences(of: "_", with: " ")) near \(incident.location)."
        }

        return summary
    }

    // MARK: - Caching

    private func loadCachedData() {
        // Load settings
        if let data = UserDefaults.standard.data(forKey: settingsCacheKey),
           let settings = try? JSONDecoder().decode(UserLocationSettings.self, from: data) {
            locationSettings = settings
        }

        // Load weather
        if let data = UserDefaults.standard.data(forKey: weatherCacheKey),
           let weather = try? JSONDecoder().decode(WeatherData.self, from: data) {
            if Date().timeIntervalSince(weather.fetchedAt) < cacheValiditySeconds {
                currentWeather = weather
            }
        }

        // Load traffic
        if let data = UserDefaults.standard.data(forKey: trafficCacheKey),
           let traffic = try? JSONDecoder().decode(TrafficData.self, from: data) {
            if Date().timeIntervalSince(traffic.fetchedAt) < cacheValiditySeconds {
                currentTraffic = traffic
            }
        }
    }

    private func cacheWeather(_ weather: WeatherData) {
        if let data = try? JSONEncoder().encode(weather) {
            UserDefaults.standard.set(data, forKey: weatherCacheKey)
        }
    }

    private func cacheTraffic(_ traffic: TrafficData) {
        if let data = try? JSONEncoder().encode(traffic) {
            UserDefaults.standard.set(data, forKey: trafficCacheKey)
        }
    }

    private func cacheSettings(_ settings: UserLocationSettings) {
        if let data = try? JSONEncoder().encode(settings) {
            UserDefaults.standard.set(data, forKey: settingsCacheKey)
        }
    }
}

// MARK: - CLLocationManagerDelegate

extension WeatherTrafficService: CLLocationManagerDelegate {
    nonisolated func locationManager(_ manager: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
        guard let location = locations.last else { return }

        Task { @MainActor in
            self.currentLocation = location
            self.locationError = nil

            // Fetch weather with new location
            await self.fetchWeather(forceRefresh: true)
        }
    }

    nonisolated func locationManager(_ manager: CLLocationManager, didFailWithError error: Error) {
        Task { @MainActor in
            self.locationError = error.localizedDescription
            print("⚠️ Location error: \(error.localizedDescription)")
        }
    }

    nonisolated func locationManagerDidChangeAuthorization(_ manager: CLLocationManager) {
        Task { @MainActor in
            switch manager.authorizationStatus {
            case .authorizedWhenInUse, .authorizedAlways:
                self.locationError = nil
                manager.requestLocation()
            case .denied, .restricted:
                self.locationError = "Location access denied"
            default:
                break
            }
        }
    }
}
