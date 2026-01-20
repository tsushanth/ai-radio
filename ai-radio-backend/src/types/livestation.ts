/**
 * Live Station Types
 * Definitions for continuously updating news streams
 */

/**
 * Live station category
 */
export type LiveStationCategory =
  | 'news'
  | 'technology'
  | 'business'
  | 'sports'
  | 'entertainment'
  | 'world';

/**
 * Live station definition
 */
export interface LiveStation {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: LiveStationCategory;
  refreshIntervalMinutes: number;
  isActive: boolean;
  listenerCount: number;
  currentEpisode?: LiveStationEpisode;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Live station episode (auto-generated content)
 */
export interface LiveStationEpisode {
  id: string;
  stationId: string;
  title: string;
  description: string;
  audioUrl?: string;
  audioPath?: string;
  durationSeconds?: number;
  headlines: string[];
  script?: string;
  generatedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
}

/**
 * Live stations response
 */
export interface LiveStationsResponse {
  stations: LiveStation[];
  categories: LiveStationCategoryInfo[];
}

/**
 * Live station category info
 */
export interface LiveStationCategoryInfo {
  id: LiveStationCategory;
  name: string;
  count: number;
}

/**
 * Live station detail response
 */
export interface LiveStationDetailResponse {
  station: LiveStation;
  recentEpisodes: LiveStationEpisode[];
}

/**
 * Tune in response (join a live station)
 */
export interface LiveStationTuneInResponse {
  station: LiveStation;
  episode: LiveStationEpisode;
  nextUpdateAt: Date;
}

/**
 * Database record for live station
 */
export interface LiveStationDbRecord {
  id: string;
  name: string;
  description: string;
  icon: string;
  color: string;
  category: LiveStationCategory;
  refresh_interval_minutes: number;
  is_active: boolean;
  listener_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Database record for live station episode
 */
export interface LiveStationEpisodeDbRecord {
  id: string;
  station_id: string;
  title: string;
  description: string;
  audio_url?: string;
  audio_path?: string;
  duration_seconds?: number;
  headlines: string; // JSON stringified
  script?: string;
  generated_at?: string;
  expires_at?: string;
  created_at: string;
}

/**
 * News source for live station content
 */
export interface LiveNewsSource {
  url: string;
  title: string;
  domain: string;
  publishedAt?: Date;
  content: string;
}

/**
 * Live station update request (internal)
 */
export interface LiveStationUpdateRequest {
  stationId: string;
  forceRefresh?: boolean;
}
