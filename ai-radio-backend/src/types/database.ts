/**
 * Database Type Definitions
 * TypeScript interfaces for Supabase database schema
 */

export interface User {
  id: string;
  email: string;
  name: string | null;
  timezone: string;
  preferences: UserPreferences;
  created_at: string;
  updated_at: string;
}

export interface UserPreferences {
  briefing_time?: string; // e.g., "07:00"
  topics?: string[];
  voice_host1?: string;
  voice_host2?: string;
  include_weather?: boolean;
  include_calendar?: boolean;
  include_email?: boolean;
}

export interface OAuthToken {
  id: string;
  user_id: string;
  provider: 'google' | 'microsoft';
  access_token: string;
  refresh_token: string;
  expires_at: string;
  scopes: string[];
  created_at: string;
  updated_at: string;
}

// TODO: Implement token encryption at rest in Supabase
// NOTE: OAuth tokens should be encrypted using Supabase vault or application-level encryption
// Consider using pgcrypto or a key management service

export interface PodcastEpisode {
  id: string;
  user_id: string;
  title: string;
  description: string;
  script: PodcastScript;
  audio_url: string | null;
  duration_seconds: number | null;
  status: 'pending' | 'generating' | 'completed' | 'failed';
  error_message: string | null;
  generated_at: string;
  created_at: string;
}

export interface PodcastScript {
  segments: ScriptSegment[];
  total_duration_estimate?: number;
  total_segments?: number;
  estimated_duration_seconds?: number;
  metadata?: any;
  generated_at?: string;
}

export interface ScriptSegment {
  speaker: 'host1' | 'host2';
  text: string;
  type: 'intro' | 'calendar' | 'email' | 'news' | 'weather' | 'outro' | 'pause';
  duration_estimate?: number; // in seconds
  sequence?: number;
}

// Database query result types
export type UserInsert = Omit<User, 'id' | 'created_at' | 'updated_at'>;
export type UserUpdate = Partial<Omit<User, 'id' | 'created_at' | 'updated_at'>>;

export type OAuthTokenInsert = Omit<OAuthToken, 'id' | 'created_at' | 'updated_at'>;
export type OAuthTokenUpdate = Partial<Omit<OAuthToken, 'id' | 'user_id' | 'provider' | 'created_at' | 'updated_at'>>;

export type PodcastEpisodeInsert = Omit<PodcastEpisode, 'id' | 'created_at'>;
export type PodcastEpisodeUpdate = Partial<Omit<PodcastEpisode, 'id' | 'user_id' | 'created_at'>>;
