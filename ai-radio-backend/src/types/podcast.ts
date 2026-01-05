/**
 * Podcast Type Definitions
 * Types for podcast generation and audio processing
 */

import { EmailMessage } from './email';
import { CalendarEvent } from './calendar';
import { UserPreferences, PodcastScript } from './database';

export interface PodcastGenerationInput {
  user_id: string;
  emails: EmailMessage[];
  calendar_events: CalendarEvent[];
  date: string;
  preferences: UserPreferences;
  topic_teasers?: TopicTeaser[];  // Previews from user's followed topics
}

export interface PodcastGenerationResult {
  episode_id: string;
  audio_url: string;
  duration_seconds: number;
  script: PodcastScript;
}

export interface TTSRequest {
  text: string;
  voice: string;
  speed?: number;
  pitch?: number;
  language_code?: string;
}

export interface TTSResponse {
  audio_buffer: Buffer;
  duration_seconds: number;
  format: 'mp3' | 'wav' | 'ogg' | 'opus' | 'aac' | 'flac' | 'pcm';
}

// Audio processing types
export interface AudioSegment {
  buffer: Buffer;
  duration_seconds: number;
  speaker: 'host1' | 'host2';
  segment_type: 'intro' | 'calendar' | 'email' | 'news' | 'weather' | 'teaser' | 'outro';
}

export interface AudioMixingOptions {
  crossfade_duration_ms: number;
  intro_music_url?: string;
  outro_music_url?: string;
  background_music_url?: string;
  background_music_volume: number; // 0.0 to 1.0
  normalize_audio: boolean;
}

export interface MixedAudioResult {
  buffer: Buffer;
  duration_seconds: number;
  format: 'mp3';
  bitrate: number;
}

// Topic teaser for user's followed topics
export interface TopicTeaser {
  topicId: string;
  topicName: string;
  headlines: string[];
}

// Content generation types
export interface ContentSummary {
  emails: EmailSummary;
  calendar: CalendarSummary;
  weather?: WeatherSummary;
  news?: NewsSummary;
  topicTeasers?: TopicTeaser[];
}

export interface EmailSummary {
  total_count: number;
  important_count: number;
  highlights: string[];
  action_items: string[];
}

export interface CalendarSummary {
  total_events: number;
  next_event?: {
    title: string;
    time_until: string;
    location?: string;
  };
  busy_periods: string[];
  key_meetings: string[];
}

export interface WeatherSummary {
  location: string;
  current: {
    temperature: number;
    condition: string;
  };
  forecast: {
    high: number;
    low: number;
    condition: string;
  };
}

export interface NewsSummary {
  headlines: string[];
  topics: string[];
}

// Script generation types
export interface ScriptGenerationContext {
  user_name: string;
  date: string;
  time_of_day: 'morning' | 'afternoon' | 'evening';
  content: ContentSummary;
  preferences: UserPreferences;
}

export interface ScriptGenerationOptions {
  max_duration_minutes: number;
  tone: 'professional' | 'casual' | 'energetic';
  include_music_cues: boolean;
}

// Job processing types
export interface PodcastGenerationJob {
  job_id: string;
  user_id: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress_percent: number;
  current_step: string;
  error?: string;
  created_at: string;
  updated_at: string;
}

// TODO: Implement audio mixing with ffmpeg for combining host tracks
// TODO: Add crossfade between segments for smooth transitions
// TODO: Implement retry logic with exponential backoff for TTS API calls
// TODO: Add audio normalization to ensure consistent volume levels
// TODO: Implement streaming audio upload to storage for large files
// TODO: Add background music mixing at appropriate volume levels
