/**
 * Deep Dive Types
 * Definitions for on-demand research podcast generation
 */

/**
 * Deep Dive episode status
 */
export type DeepDiveStatus =
  | 'pending'
  | 'researching'
  | 'generating'
  | 'completed'
  | 'failed';

/**
 * Research source from web search
 */
export interface DeepDiveSource {
  url: string;
  title: string;
  domain: string;
  snippet: string;
  publishedAt?: string;
}

/**
 * Deep Dive episode
 */
export interface DeepDiveEpisode {
  id: string;
  userId: string;
  query: string;
  title: string;
  description: string;
  audioUrl?: string;
  audioPath?: string;
  durationSeconds?: number;
  status: DeepDiveStatus;
  language: string;
  sources: DeepDiveSource[];
  script?: string;
  generatedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  error?: string;
}

/**
 * Deep Dive generation request
 */
export interface DeepDiveGenerateRequest {
  query: string;
  language?: string;
  targetDurationMinutes?: number;
  userId: string;
}

/**
 * Deep Dive generation response
 */
export interface DeepDiveGenerateResponse {
  episode: DeepDiveEpisode;
  isNew: boolean;
  message: string;
}

/**
 * Deep Dive history response
 */
export interface DeepDiveHistoryResponse {
  episodes: DeepDiveEpisode[];
  total: number;
  hasMore: boolean;
}

/**
 * Research result from web search
 */
export interface ResearchResult {
  query: string;
  sources: DeepDiveSource[];
  summary: string;
  keyPoints: string[];
  fetchedAt: Date;
}

/**
 * Database record for Deep Dive episode
 */
export interface DeepDiveDbRecord {
  id: string;
  user_id: string;
  query: string;
  title: string;
  description: string;
  audio_url?: string;
  audio_path?: string;
  duration_seconds?: number;
  status: DeepDiveStatus;
  language: string;
  sources: string; // JSON stringified
  script?: string;
  generated_at?: string;
  created_at: string;
  updated_at: string;
  error?: string;
}
