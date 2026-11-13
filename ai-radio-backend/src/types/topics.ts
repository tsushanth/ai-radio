/**
 * Topic Types
 * Definitions for topic-based podcasts
 */

import type { SegmentTiming } from './ads';

/**
 * Content source types
 */
export type SourceType = 'rss' | 'hackernews' | 'reddit' | 'api' | 'twitter' | 'web';

/**
 * Content source configuration
 */
export interface ContentSource {
  type: SourceType;
  name: string;
  url?: string;
  subreddit?: string;
  keywords?: string[];
  maxItems?: number;
  /** Reddit archive options, set by the source policy (never stored in the catalog). */
  archive?: { comments?: boolean; minScore?: number };
}

/**
 * Topic definition
 */
export interface TopicDefinition {
  id: string;
  name: string;
  description: string;
  icon: string; // SF Symbol name or emoji
  color: string; // Hex color
  category: TopicCategory;
  sources: ContentSource[];
  promptContext: string; // Additional context for LLM
  targetDurationMinutes: number;
  isActive: boolean;
  languages: string[]; // ISO codes this topic is relevant for. ['all'] = universal
  localizedNames?: Record<string, string>; // lang code -> localized name
  localizedDescriptions?: Record<string, string>; // lang code -> localized description
}

/**
 * Topic categories for grouping
 */
export type TopicCategory =
  | 'news'
  | 'technology'
  | 'business'
  | 'science'
  | 'lifestyle'
  | 'entertainment'
  | 'sports';

/**
 * Aggregated story from sources
 */
export interface AggregatedStory {
  title: string;
  source: string;
  sourceType: SourceType;
  summary?: string;
  url?: string;
  score?: number; // Reddit upvotes, HN points, etc.
  commentCount?: number;
  publishedAt?: Date;
  author?: string;
  /**
   * Article body excerpt (about 1500 chars) for web-search stories. Used only to ground the script prompt: the generator strips it
   * before the story list is stored on the episode.
   */
  excerpt?: string;
}

/**
 * Aggregated content for a topic
 */
export interface TopicContent {
  topicId: string;
  date: string; // YYYY-MM-DD
  stories: AggregatedStory[];
  fetchedAt: Date;
  totalSources: number;
  successfulSources: number;
}

/**
 * Topic episode status
 */
export type TopicEpisodeStatus =
  | 'not_generated'
  | 'generating'
  | 'completed'
  | 'failed';

/**
 * Topic episode metadata
 */
export interface TopicEpisode {
  id: string;
  topicId: string;
  date: string; // YYYY-MM-DD
  status: TopicEpisodeStatus;
  title: string;
  description: string;
  audioUrl?: string;
  audioPath?: string;
  durationSeconds?: number;
  script?: string;
  stories: AggregatedStory[];
  generatedAt?: Date;
  generatedBy?: string; // User who triggered generation
  createdAt: Date;
  updatedAt: Date;
  playCount: number;
  error?: string;
  language?: string; // ISO language code (e.g., 'en', 'es', 'fr')
  segmentTimings?: SegmentTiming[]; // Timing data for client-side ad insertion
}

/**
 * Topic episode request
 */
export interface TopicEpisodeRequest {
  topicId: string;
  userId?: string; // Optional, for tracking who triggered
  forceRegenerate?: boolean; // Force regeneration even if exists
}

/**
 * Topic episode response
 */
export interface TopicEpisodeResponse {
  episode: TopicEpisode;
  isNew: boolean; // Whether this was newly generated
  message: string;
}

/**
 * Topic list response
 */
export interface TopicListResponse {
  topics: TopicDefinition[];
  categories: {
    id: TopicCategory;
    name: string;
    count: number;
  }[];
}
