/**
 * Custom Source Types
 * Definitions for user-added RSS feeds, newsletters, and websites
 */

/**
 * Custom source type
 */
export type CustomSourceType =
  | 'rss'
  | 'newsletter'
  | 'website'
  | 'youtube'
  | 'podcast';

/**
 * Custom source status
 */
export type CustomSourceStatus =
  | 'active'
  | 'paused'
  | 'error'
  | 'pending';

/**
 * Custom source definition
 */
export interface CustomSource {
  id: string;
  userId: string;
  name: string;
  url: string;
  sourceType: CustomSourceType;
  icon?: string;
  color: string;
  isActive: boolean;
  lastFetchedAt?: Date;
  itemCount: number;
  status: CustomSourceStatus;
  errorMessage?: string;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Custom source item (content from the source)
 */
export interface CustomSourceItem {
  id: string;
  sourceId: string;
  title: string;
  url: string;
  content?: string;
  summary?: string;
  author?: string;
  publishedAt?: Date;
  fetchedAt: Date;
  isRead: boolean;
  isIncludedInBrief: boolean;
}

/**
 * Add custom source request
 */
export interface CustomSourceAddRequest {
  url: string;
  sourceType: CustomSourceType;
  name?: string;
  userId: string;
}

/**
 * Add custom source response
 */
export interface CustomSourceAddResponse {
  source: CustomSource;
  message: string;
}

/**
 * Custom sources list response
 */
export interface CustomSourcesResponse {
  sources: CustomSource[];
  total: number;
}

/**
 * Custom source detail response
 */
export interface CustomSourceDetailResponse {
  source: CustomSource;
  items: CustomSourceItem[];
  hasMore: boolean;
}

/**
 * Refresh custom source response
 */
export interface CustomSourceRefreshResponse {
  source: CustomSource;
  newItemCount: number;
  message: string;
}

/**
 * Validate custom source response
 */
export interface CustomSourceValidateResponse {
  isValid: boolean;
  sourceType?: CustomSourceType;
  suggestedName?: string;
  itemCount?: number;
  error?: string;
}

/**
 * Database record for custom source
 */
export interface CustomSourceDbRecord {
  id: string;
  user_id: string;
  name: string;
  url: string;
  source_type: CustomSourceType;
  icon?: string;
  color: string;
  is_active: boolean;
  last_fetched_at?: string;
  item_count: number;
  status: CustomSourceStatus;
  error_message?: string;
  created_at: string;
  updated_at: string;
}

/**
 * Database record for custom source item
 */
export interface CustomSourceItemDbRecord {
  id: string;
  source_id: string;
  title: string;
  url: string;
  content?: string;
  summary?: string;
  author?: string;
  published_at?: string;
  fetched_at: string;
  is_read: boolean;
  is_included_in_brief: boolean;
}

/**
 * RSS feed parsed item
 */
export interface RSSFeedItem {
  title: string;
  link: string;
  description?: string;
  content?: string;
  author?: string;
  pubDate?: string;
  guid?: string;
}

/**
 * RSS feed metadata
 */
export interface RSSFeedMetadata {
  title: string;
  description?: string;
  link?: string;
  language?: string;
  lastBuildDate?: string;
  itemCount: number;
}

/**
 * Internal: Fetch source request
 */
export interface FetchSourceRequest {
  sourceId: string;
  forceRefresh?: boolean;
  maxItems?: number;
}
