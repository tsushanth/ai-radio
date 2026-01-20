/**
 * Context Data Type Definitions
 * Types for weather, traffic, and location-aware content
 */

// Weather types
export interface WeatherData {
  id: string;
  location: WeatherLocation;
  current: CurrentWeather;
  forecast: WeatherForecast;
  alerts?: WeatherAlert[];
  fetched_at: string;
}

export interface WeatherLocation {
  city: string;
  region?: string;
  country: string;
  latitude: number;
  longitude: number;
}

export interface CurrentWeather {
  temperature: number; // Fahrenheit
  temperature_celsius: number;
  feels_like: number;
  condition: string;
  condition_code: string;
  humidity: number;
  wind_speed: number;
  wind_direction: string;
  uv_index: number;
  visibility: number;
}

export interface WeatherForecast {
  high: number;
  low: number;
  condition: string;
  precipitation_chance: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherAlert {
  id: string;
  type: 'warning' | 'watch' | 'advisory';
  title: string;
  description: string;
  severity: 'minor' | 'moderate' | 'severe' | 'extreme';
  start_time: string;
  end_time: string;
}

// Traffic types
export interface TrafficData {
  id: string;
  route: TrafficRoute;
  current_conditions: TrafficConditions;
  incidents?: TrafficIncident[];
  fetched_at: string;
}

export interface TrafficRoute {
  name: string;
  origin: string;
  destination: string;
  distance: number; // miles
  typical_duration: number; // seconds
}

export interface TrafficConditions {
  current_duration: number; // seconds
  delay_minutes: number;
  congestion_level: CongestionLevel;
  summary: string;
}

export type CongestionLevel = 'clear' | 'light' | 'moderate' | 'heavy' | 'severe';

export interface TrafficIncident {
  id: string;
  type: 'accident' | 'construction' | 'road_closure' | 'event';
  title: string;
  description?: string;
  severity: 'minor' | 'moderate' | 'major';
  location: string;
  delay_minutes?: number;
}

// Location settings
export interface UserLocationSettings {
  home_address?: string;
  work_address?: string;
  use_current_location: boolean;
  temperature_unit: 'fahrenheit' | 'celsius';
}

// API requests
export interface WeatherRequest {
  lat?: number;
  lon?: number;
  address?: string;
}

export interface TrafficRequest {
  origin: string;
  destination: string;
}

// API responses
export interface WeatherResponse {
  success: boolean;
  data?: WeatherData;
  error?: string;
}

export interface TrafficResponse {
  success: boolean;
  data?: TrafficData;
  error?: string;
}

export interface ContextDataResponse {
  success: boolean;
  data?: {
    weather?: WeatherData;
    traffic?: TrafficData;
    local_news?: LocalNewsItem[];
  };
  error?: string;
}

export interface LocalNewsItem {
  id: string;
  title: string;
  summary: string;
  source: string;
  url?: string;
  published_at: string;
}

// For podcast generation
export interface ContextSummaryForScript {
  weather_summary?: string;
  traffic_summary?: string;
  local_news_summary?: string;
}
