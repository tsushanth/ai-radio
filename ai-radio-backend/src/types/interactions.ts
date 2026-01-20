/**
 * Playback Interactions Type Definitions
 * Types for skip/tell-me-more controls and adaptive learning
 */

// Interaction types
export type InteractionType = 'skip' | 'tell_me_more' | 'completed' | 'paused';

export interface PlaybackInteraction {
  id: string;
  user_id: string;
  context_type: 'daily_brief' | 'topic' | 'deep_dive' | 'live_station';
  context_id: string;
  segment_type?: string;
  segment_index?: number;
  interaction_type: InteractionType;
  timestamp: number;
  metadata?: Record<string, string>;
  created_at: string;
}

// Tell Me More expansion
export interface TellMeMoreRequest {
  context_type: string;
  context_id: string;
  segment_type?: string;
  segment_index?: number;
  timestamp: number;
}

export interface TellMeMoreExpansion {
  id: string;
  original_segment: string;
  expanded_content: string;
  audio_url?: string;
  duration_seconds?: number;
  sources?: ExpansionSource[];
}

export interface ExpansionSource {
  id: string;
  title: string;
  url?: string;
  snippet?: string;
}

export interface TellMeMoreResponse {
  success: boolean;
  data?: {
    expansion: TellMeMoreExpansion;
  };
  error?: string;
}

// User preferences for adaptive learning
export interface UserPreferencesData {
  skipped_topics: Record<string, number>;
  expanded_topics: Record<string, number>;
  preferred_segment_types: Record<string, number>;
  avg_listening_duration?: number;
  preferred_time_of_day?: 'morning' | 'afternoon' | 'evening';
  last_updated: string;
}

export interface UserPreferencesResponse {
  success: boolean;
  data?: {
    preferences: UserPreferencesData;
    recommendations?: string[];
  };
  error?: string;
}

// Record interaction request
export interface RecordInteractionRequest {
  context_type: string;
  context_id: string;
  segment_type?: string;
  segment_index?: number;
  interaction_type: InteractionType;
  timestamp: number;
  metadata?: Record<string, string>;
}

// Audio segment info
export interface AudioSegmentInfo {
  id: string;
  type: string;
  title: string;
  start_time: number;
  end_time: number;
  content?: string;
  topic_id?: string;
}

// Database records
export interface InteractionDbRecord {
  id: string;
  user_id: string;
  context_type: string;
  context_id: string;
  segment_type?: string;
  segment_index?: number;
  interaction_type: string;
  timestamp: number;
  metadata?: string; // JSON string
  created_at: string;
}

export interface UserPreferencesDbRecord {
  user_id: string;
  skipped_topics: string; // JSON
  expanded_topics: string; // JSON
  preferred_segment_types: string; // JSON
  avg_listening_duration?: number;
  preferred_time_of_day?: string;
  updated_at: string;
}
