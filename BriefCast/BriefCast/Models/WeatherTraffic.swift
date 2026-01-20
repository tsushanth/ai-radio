//
//  WeatherTraffic.swift
//  BriefCast
//
//  Models for weather and traffic integration
//

import Foundation
import CoreLocation

// MARK: - Weather Data

struct WeatherData: Codable, Identifiable {
    let id: String
    let location: WeatherLocation
    let current: CurrentWeather
    let forecast: WeatherForecast
    let alerts: [WeatherAlert]?
    let fetchedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case location
        case current
        case forecast
        case alerts
        case fetchedAt = "fetched_at"
    }
}

struct WeatherLocation: Codable {
    let city: String
    let region: String?
    let country: String
    let latitude: Double
    let longitude: Double
}

struct CurrentWeather: Codable {
    let temperature: Double          // Fahrenheit
    let temperatureCelsius: Double   // Celsius
    let feelsLike: Double
    let condition: String            // "Sunny", "Cloudy", "Rainy", etc.
    let conditionCode: String        // Icon code
    let humidity: Int                // Percentage
    let windSpeed: Double            // mph
    let windDirection: String        // "N", "NE", etc.
    let uvIndex: Int
    let visibility: Double           // miles

    enum CodingKeys: String, CodingKey {
        case temperature
        case temperatureCelsius = "temperature_celsius"
        case feelsLike = "feels_like"
        case condition
        case conditionCode = "condition_code"
        case humidity
        case windSpeed = "wind_speed"
        case windDirection = "wind_direction"
        case uvIndex = "uv_index"
        case visibility
    }

    var temperatureDisplay: String {
        "\(Int(temperature))°F"
    }

    var temperatureCelsiusDisplay: String {
        "\(Int(temperatureCelsius))°C"
    }

    var systemImage: String {
        switch conditionCode.lowercased() {
        case "sunny", "clear":
            return "sun.max.fill"
        case "cloudy", "overcast":
            return "cloud.fill"
        case "partly_cloudy", "partlycloudy":
            return "cloud.sun.fill"
        case "rain", "rainy", "drizzle":
            return "cloud.rain.fill"
        case "thunderstorm", "storm":
            return "cloud.bolt.rain.fill"
        case "snow", "snowy":
            return "cloud.snow.fill"
        case "fog", "mist":
            return "cloud.fog.fill"
        case "wind", "windy":
            return "wind"
        default:
            return "cloud.fill"
        }
    }
}

struct WeatherForecast: Codable {
    let high: Double
    let low: Double
    let condition: String
    let precipitationChance: Int     // Percentage
    let sunrise: String              // Time string
    let sunset: String               // Time string

    enum CodingKeys: String, CodingKey {
        case high
        case low
        case condition
        case precipitationChance = "precipitation_chance"
        case sunrise
        case sunset
    }
}

struct WeatherAlert: Codable, Identifiable {
    let id: String
    let type: String                 // "warning", "watch", "advisory"
    let title: String
    let description: String
    let severity: String             // "minor", "moderate", "severe", "extreme"
    let startTime: Date
    let endTime: Date

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case title
        case description
        case severity
        case startTime = "start_time"
        case endTime = "end_time"
    }
}

// MARK: - Traffic Data

struct TrafficData: Codable, Identifiable {
    let id: String
    let route: TrafficRoute
    let currentConditions: TrafficConditions
    let incidents: [TrafficIncident]?
    let fetchedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case route
        case currentConditions = "current_conditions"
        case incidents
        case fetchedAt = "fetched_at"
    }
}

struct TrafficRoute: Codable {
    let name: String                 // "Home to Work", "Work to Home"
    let origin: String
    let destination: String
    let distance: Double             // miles
    let typicalDuration: Int         // seconds

    enum CodingKeys: String, CodingKey {
        case name
        case origin
        case destination
        case distance
        case typicalDuration = "typical_duration"
    }
}

struct TrafficConditions: Codable {
    let currentDuration: Int         // seconds
    let delayMinutes: Int
    let congestionLevel: CongestionLevel
    let summary: String

    enum CodingKeys: String, CodingKey {
        case currentDuration = "current_duration"
        case delayMinutes = "delay_minutes"
        case congestionLevel = "congestion_level"
        case summary
    }
}

enum CongestionLevel: String, Codable {
    case clear = "clear"
    case light = "light"
    case moderate = "moderate"
    case heavy = "heavy"
    case severe = "severe"

    var color: String {
        switch self {
        case .clear: return "#4CAF50"    // Green
        case .light: return "#8BC34A"    // Light green
        case .moderate: return "#FFC107" // Yellow
        case .heavy: return "#FF9800"    // Orange
        case .severe: return "#F44336"   // Red
        }
    }

    var displayText: String {
        switch self {
        case .clear: return "Clear"
        case .light: return "Light Traffic"
        case .moderate: return "Moderate Traffic"
        case .heavy: return "Heavy Traffic"
        case .severe: return "Severe Congestion"
        }
    }
}

struct TrafficIncident: Codable, Identifiable {
    let id: String
    let type: String                 // "accident", "construction", "road_closure", "event"
    let title: String
    let description: String?
    let severity: String             // "minor", "moderate", "major"
    let location: String
    let delayMinutes: Int?

    enum CodingKeys: String, CodingKey {
        case id
        case type
        case title
        case description
        case severity
        case location
        case delayMinutes = "delay_minutes"
    }

    var systemImage: String {
        switch type {
        case "accident": return "exclamationmark.triangle.fill"
        case "construction": return "cone.fill"
        case "road_closure": return "xmark.circle.fill"
        case "event": return "calendar.badge.exclamationmark"
        default: return "exclamationmark.circle.fill"
        }
    }
}

// MARK: - User Location Settings

struct UserLocationSettings: Codable {
    var homeAddress: String?
    var workAddress: String?
    var currentLocation: CLLocationCoordinate2D?
    var useCurrentLocation: Bool
    var temperatureUnit: TemperatureUnit

    enum CodingKeys: String, CodingKey {
        case homeAddress = "home_address"
        case workAddress = "work_address"
        case useCurrentLocation = "use_current_location"
        case temperatureUnit = "temperature_unit"
    }

    // Custom encoding for CLLocationCoordinate2D
    func encode(to encoder: Encoder) throws {
        var container = encoder.container(keyedBy: CodingKeys.self)
        try container.encodeIfPresent(homeAddress, forKey: .homeAddress)
        try container.encodeIfPresent(workAddress, forKey: .workAddress)
        try container.encode(useCurrentLocation, forKey: .useCurrentLocation)
        try container.encode(temperatureUnit, forKey: .temperatureUnit)
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        homeAddress = try container.decodeIfPresent(String.self, forKey: .homeAddress)
        workAddress = try container.decodeIfPresent(String.self, forKey: .workAddress)
        useCurrentLocation = try container.decodeIfPresent(Bool.self, forKey: .useCurrentLocation) ?? true
        temperatureUnit = try container.decodeIfPresent(TemperatureUnit.self, forKey: .temperatureUnit) ?? .fahrenheit
        currentLocation = nil
    }

    init(homeAddress: String? = nil, workAddress: String? = nil, currentLocation: CLLocationCoordinate2D? = nil, useCurrentLocation: Bool = true, temperatureUnit: TemperatureUnit = .fahrenheit) {
        self.homeAddress = homeAddress
        self.workAddress = workAddress
        self.currentLocation = currentLocation
        self.useCurrentLocation = useCurrentLocation
        self.temperatureUnit = temperatureUnit
    }

    static let `default` = UserLocationSettings()
}

enum TemperatureUnit: String, Codable, CaseIterable {
    case fahrenheit = "fahrenheit"
    case celsius = "celsius"

    var symbol: String {
        switch self {
        case .fahrenheit: return "°F"
        case .celsius: return "°C"
        }
    }
}

// MARK: - API Responses

struct WeatherResponse: Codable {
    let success: Bool
    let data: WeatherData?
    let error: String?
}

struct TrafficResponse: Codable {
    let success: Bool
    let data: TrafficData?
    let error: String?
}

struct ContextDataResponse: Codable {
    let success: Bool
    let data: ContextData?
    let error: String?
}

struct ContextData: Codable {
    let weather: WeatherData?
    let traffic: TrafficData?
    let localNews: [LocalNewsItem]?

    enum CodingKeys: String, CodingKey {
        case weather
        case traffic
        case localNews = "local_news"
    }
}

struct LocalNewsItem: Codable, Identifiable {
    let id: String
    let title: String
    let summary: String
    let source: String
    let url: String?
    let publishedAt: Date

    enum CodingKeys: String, CodingKey {
        case id
        case title
        case summary
        case source
        case url
        case publishedAt = "published_at"
    }
}
