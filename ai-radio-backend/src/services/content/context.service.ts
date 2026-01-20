/**
 * Context Service
 * Handles weather and traffic data fetching
 */

import { env } from '../../config/environment';
import type {
  WeatherData,
  WeatherResponse,
  TrafficData,
  TrafficResponse,
  TrafficRequest,
  ContextSummaryForScript,
  CongestionLevel,
} from '../../types/context';

export class ContextService {
  private weatherApiKey: string;
  private readonly WEATHER_CACHE_MS = 30 * 60 * 1000; // 30 minutes
  private weatherCache: Map<string, { data: WeatherData; timestamp: number }> = new Map();

  constructor() {
    // Use OpenWeatherMap API (free tier available)
    this.weatherApiKey = env.OPENWEATHER_API_KEY || '';
  }

  /**
   * Fetch weather data
   */
  async getWeather(lat?: number, lon?: number, address?: string): Promise<WeatherResponse> {
    try {
      // Check cache first
      const cacheKey = lat && lon ? `${lat},${lon}` : address || 'default';
      const cached = this.weatherCache.get(cacheKey);
      if (cached && Date.now() - cached.timestamp < this.WEATHER_CACHE_MS) {
        return { success: true, data: cached.data };
      }

      // If no API key, return mock data
      if (!this.weatherApiKey) {
        console.warn('Weather API key not configured, using mock data');
        return { success: true, data: this.getMockWeather() };
      }

      // Build API URL
      let url: string;
      if (lat && lon) {
        url = `https://api.openweathermap.org/data/2.5/weather?lat=${lat}&lon=${lon}&appid=${this.weatherApiKey}&units=imperial`;
      } else if (address) {
        // Would need geocoding first - for simplicity, use city name
        url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(address)}&appid=${this.weatherApiKey}&units=imperial`;
      } else {
        return { success: true, data: this.getMockWeather() };
      }

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Weather API error: ${response.status}`);
      }

      const apiData = await response.json() as Record<string, unknown>;
      const weather = this.mapOpenWeatherResponse(apiData);

      // Cache the result
      this.weatherCache.set(cacheKey, { data: weather, timestamp: Date.now() });

      return { success: true, data: weather };
    } catch (error) {
      console.error('Weather fetch error:', error);
      // Return mock data on error
      return { success: true, data: this.getMockWeather() };
    }
  }

  /**
   * Fetch traffic data
   */
  async getTraffic(request: TrafficRequest): Promise<TrafficResponse> {
    try {
      // Traffic APIs typically require paid subscriptions (Google Maps, TomTom, etc.)
      // For now, return simulated traffic data
      console.log(`[Traffic] Fetching traffic from ${request.origin} to ${request.destination}`);

      const traffic = this.getSimulatedTraffic(request);
      return { success: true, data: traffic };
    } catch (error) {
      console.error('Traffic fetch error:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to fetch traffic',
      };
    }
  }

  /**
   * Get context summary for podcast script generation
   */
  async getContextSummary(
    lat?: number,
    lon?: number,
    homeAddress?: string,
    workAddress?: string
  ): Promise<ContextSummaryForScript> {
    const summary: ContextSummaryForScript = {};

    // Get weather
    const weatherResponse = await this.getWeather(lat, lon, homeAddress);
    if (weatherResponse.success && weatherResponse.data) {
      summary.weather_summary = this.generateWeatherSummary(weatherResponse.data);
    }

    // Get traffic if both addresses provided
    if (homeAddress && workAddress) {
      const trafficResponse = await this.getTraffic({
        origin: homeAddress,
        destination: workAddress,
      });
      if (trafficResponse.success && trafficResponse.data) {
        summary.traffic_summary = this.generateTrafficSummary(trafficResponse.data);
      }
    }

    return summary;
  }

  /**
   * Generate weather summary for script
   */
  private generateWeatherSummary(weather: WeatherData): string {
    const current = weather.current;
    const forecast = weather.forecast;

    let summary = `Currently ${Math.round(current.temperature)} degrees and ${current.condition.toLowerCase()} in ${weather.location.city}.`;

    // Add feels like if significantly different
    if (Math.abs(current.temperature - current.feels_like) > 5) {
      summary += ` It feels like ${Math.round(current.feels_like)} degrees.`;
    }

    // Add forecast highlights
    summary += ` Today's high will be ${Math.round(forecast.high)} with a low of ${Math.round(forecast.low)}.`;

    if (forecast.precipitation_chance > 30) {
      summary += ` There's a ${forecast.precipitation_chance}% chance of precipitation.`;
    }

    // Add alerts
    if (weather.alerts && weather.alerts.length > 0) {
      const alert = weather.alerts[0];
      summary += ` Weather alert: ${alert.title}.`;
    }

    return summary;
  }

  /**
   * Generate traffic summary for script
   */
  private generateTrafficSummary(traffic: TrafficData): string {
    const conditions = traffic.current_conditions;
    const durationMinutes = Math.ceil(conditions.current_duration / 60);

    let summary = `Your commute to work is currently ${durationMinutes} minutes`;

    if (conditions.delay_minutes > 0) {
      summary += `, which is ${conditions.delay_minutes} minutes longer than usual due to ${conditions.congestion_level} traffic`;
    } else {
      summary += ` with ${conditions.congestion_level} traffic`;
    }
    summary += '.';

    // Add incidents
    if (traffic.incidents && traffic.incidents.length > 0) {
      const incident = traffic.incidents[0];
      summary += ` Heads up: there's ${incident.type === 'accident' ? 'an' : 'a'} ${incident.type.replace('_', ' ')} reported near ${incident.location}.`;
    }

    return summary;
  }

  /**
   * Map OpenWeather API response to our format
   */
  private mapOpenWeatherResponse(apiData: Record<string, unknown>): WeatherData {
    const main = apiData.main as Record<string, number>;
    const weather = (apiData.weather as Record<string, unknown>[])[0];
    const wind = apiData.wind as Record<string, number>;
    const sys = apiData.sys as Record<string, unknown>;
    const coord = apiData.coord as Record<string, number>;

    // Convert sunset/sunrise from unix timestamp
    const sunrise = new Date((sys.sunrise as number) * 1000);
    const sunset = new Date((sys.sunset as number) * 1000);

    return {
      id: `weather-${Date.now()}`,
      location: {
        city: apiData.name as string,
        country: sys.country as string,
        latitude: coord.lat,
        longitude: coord.lon,
      },
      current: {
        temperature: main.temp,
        temperature_celsius: ((main.temp - 32) * 5) / 9,
        feels_like: main.feels_like,
        condition: (weather.main as string) || 'Unknown',
        condition_code: (weather.icon as string) || 'unknown',
        humidity: main.humidity,
        wind_speed: wind.speed,
        wind_direction: this.degreesToDirection(wind.deg),
        uv_index: 0, // Not available in basic API
        visibility: ((apiData.visibility as number) || 10000) / 1609, // meters to miles
      },
      forecast: {
        high: main.temp_max,
        low: main.temp_min,
        condition: (weather.description as string) || 'Unknown',
        precipitation_chance: 0, // Would need forecast API
        sunrise: sunrise.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
        sunset: sunset.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' }),
      },
      fetched_at: new Date().toISOString(),
    };
  }

  /**
   * Convert wind degrees to direction
   */
  private degreesToDirection(degrees: number): string {
    const directions = ['N', 'NNE', 'NE', 'ENE', 'E', 'ESE', 'SE', 'SSE', 'S', 'SSW', 'SW', 'WSW', 'W', 'WNW', 'NW', 'NNW'];
    const index = Math.round(degrees / 22.5) % 16;
    return directions[index];
  }

  /**
   * Get mock weather data
   */
  private getMockWeather(): WeatherData {
    const hour = new Date().getHours();
    const isNight = hour < 6 || hour > 19;

    return {
      id: `weather-mock-${Date.now()}`,
      location: {
        city: 'San Francisco',
        region: 'CA',
        country: 'US',
        latitude: 37.7749,
        longitude: -122.4194,
      },
      current: {
        temperature: isNight ? 52 : 65,
        temperature_celsius: isNight ? 11 : 18,
        feels_like: isNight ? 50 : 63,
        condition: isNight ? 'Clear' : 'Partly Cloudy',
        condition_code: isNight ? 'clear_night' : 'partly_cloudy',
        humidity: 68,
        wind_speed: 12,
        wind_direction: 'W',
        uv_index: isNight ? 0 : 5,
        visibility: 10,
      },
      forecast: {
        high: 68,
        low: 52,
        condition: 'Partly cloudy with mild temperatures',
        precipitation_chance: 10,
        sunrise: '6:45 AM',
        sunset: '7:30 PM',
      },
      fetched_at: new Date().toISOString(),
    };
  }

  /**
   * Get simulated traffic data
   */
  private getSimulatedTraffic(request: TrafficRequest): TrafficData {
    const hour = new Date().getHours();
    const isRushHour = (hour >= 7 && hour <= 9) || (hour >= 16 && hour <= 19);

    // Simulate congestion based on time
    let congestionLevel: CongestionLevel;
    let delayMinutes: number;

    if (isRushHour) {
      const rushIntensity = Math.random();
      if (rushIntensity > 0.7) {
        congestionLevel = 'heavy';
        delayMinutes = Math.floor(Math.random() * 15) + 10;
      } else if (rushIntensity > 0.4) {
        congestionLevel = 'moderate';
        delayMinutes = Math.floor(Math.random() * 10) + 5;
      } else {
        congestionLevel = 'light';
        delayMinutes = Math.floor(Math.random() * 5);
      }
    } else {
      congestionLevel = Math.random() > 0.7 ? 'light' : 'clear';
      delayMinutes = congestionLevel === 'light' ? Math.floor(Math.random() * 3) : 0;
    }

    const typicalDuration = 25 * 60; // 25 minutes in seconds
    const currentDuration = typicalDuration + delayMinutes * 60;

    return {
      id: `traffic-${Date.now()}`,
      route: {
        name: 'Home to Work',
        origin: request.origin,
        destination: request.destination,
        distance: 12.5,
        typical_duration: typicalDuration,
      },
      current_conditions: {
        current_duration: currentDuration,
        delay_minutes: delayMinutes,
        congestion_level: congestionLevel,
        summary: delayMinutes > 0
          ? `${congestionLevel.charAt(0).toUpperCase() + congestionLevel.slice(1)} traffic with ${delayMinutes} minute delay`
          : 'Traffic is flowing smoothly',
      },
      incidents: isRushHour && Math.random() > 0.6
        ? [
            {
              id: `incident-${Date.now()}`,
              type: Math.random() > 0.5 ? 'accident' : 'construction',
              title: Math.random() > 0.5 ? 'Minor accident' : 'Road construction',
              severity: 'minor',
              location: 'Highway 101 near Downtown',
              delay_minutes: Math.floor(Math.random() * 5) + 2,
            },
          ]
        : undefined,
      fetched_at: new Date().toISOString(),
    };
  }
}

// Export singleton
export const contextService = new ContextService();
