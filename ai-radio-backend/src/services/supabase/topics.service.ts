/**
 * Supabase Topics Service
 * Fetches topics from the Supabase `topics` table with in-memory caching.
 * Falls back to hardcoded config if Supabase is unavailable.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';
import {
  TOPICS,
  getActiveTopics as getHardcodedActiveTopics,
  getTopicById as getHardcodedTopicById,
  getCategoriesWithCounts as getHardcodedCategoriesWithCounts,
  CATEGORY_NAMES,
} from '../../config/topics';
import type { TopicDefinition, TopicCategory, TopicListResponse } from '../../types/topics';

interface CacheEntry {
  topics: TopicDefinition[];
  fetchedAt: number;
}

class TopicsService {
  private supabase: SupabaseClient | null = null;
  private cache: CacheEntry | null = null;
  private readonly CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
  private readonly TABLE = 'topics';
  private fetchInProgress: Promise<TopicDefinition[]> | null = null;

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    }
  }

  /**
   * Get all active topics, optionally filtered by language.
   * Uses Supabase with in-memory cache; falls back to hardcoded topics on failure.
   */
  async getTopics(language?: string): Promise<TopicDefinition[]> {
    const allTopics = await this.getAllActiveTopics();

    if (!language) {
      return allTopics;
    }

    return allTopics.filter(topic => {
      const langs = topic.languages;
      return langs.includes('all') || langs.includes(language);
    });
  }

  /**
   * Get a single topic by ID.
   */
  async getTopicById(id: string): Promise<TopicDefinition | undefined> {
    const allTopics = await this.getAllActiveTopics();
    return allTopics.find(t => t.id === id) || getHardcodedTopicById(id);
  }

  /**
   * Get topics list response (matching the TopicListResponse shape used by routes).
   * Mirrors the logic previously in TopicPodcastGenerator.getTopicsList().
   */
  async getTopicsList(language: string = 'en'): Promise<TopicListResponse> {
    const activeTopics = await this.getTopics(language);

    // Apply localized names/descriptions
    const localizedTopics = activeTopics.map(topic => ({
      ...topic,
      name: topic.localizedNames?.[language] || topic.name,
      description: topic.localizedDescriptions?.[language] || topic.description,
    }));

    // Build category counts from the filtered topics
    const categoryOrder: TopicCategory[] = [
      'news', 'technology', 'business', 'science', 'lifestyle', 'entertainment', 'sports',
    ];

    const categories = categoryOrder.map(cat => ({
      id: cat,
      name: CATEGORY_NAMES[cat],
      count: localizedTopics.filter(t => t.category === cat).length,
    })).filter(cat => cat.count > 0);

    // Sort: locale-specific topics first, then universal
    const sortedTopics = localizedTopics.sort((a, b) => {
      const aIsLocal = !a.languages.includes('all');
      const bIsLocal = !b.languages.includes('all');
      if (aIsLocal && !bIsLocal) return -1;
      if (!aIsLocal && bIsLocal) return 1;
      return 0;
    });

    return {
      topics: sortedTopics,
      categories,
    };
  }

  /**
   * Get all active topics (with caching).
   */
  private async getAllActiveTopics(): Promise<TopicDefinition[]> {
    // Return cached data if still fresh
    if (this.cache && (Date.now() - this.cache.fetchedAt) < this.CACHE_TTL_MS) {
      return this.cache.topics;
    }

    // Deduplicate concurrent fetches
    if (this.fetchInProgress) {
      return this.fetchInProgress;
    }

    this.fetchInProgress = this.fetchFromSupabase();

    try {
      const topics = await this.fetchInProgress;
      return topics;
    } finally {
      this.fetchInProgress = null;
    }
  }

  /**
   * Fetch topics from Supabase and update cache.
   * Falls back to hardcoded topics on any error.
   */
  private async fetchFromSupabase(): Promise<TopicDefinition[]> {
    if (!this.supabase) {
      console.log('[TopicsService] No Supabase client, using hardcoded topics');
      return getHardcodedActiveTopics();
    }

    try {
      const { data, error } = await this.supabase
        .from(this.TABLE)
        .select('*')
        .eq('is_active', true);

      if (error) {
        console.error('[TopicsService] Supabase fetch error, falling back to hardcoded topics:', error.message);
        return this.getFallbackTopics();
      }

      if (!data || data.length === 0) {
        console.warn('[TopicsService] No topics in Supabase table, falling back to hardcoded topics');
        return this.getFallbackTopics();
      }

      const supabaseTopics = data.map(row => this.mapRowToTopicDefinition(row));

      // Merge with hardcoded topics: Supabase topics take precedence by ID
      const supabaseIds = new Set(supabaseTopics.map(t => t.id));
      const hardcodedOnly = getHardcodedActiveTopics().filter(t => !supabaseIds.has(t.id));
      const topics = [...supabaseTopics, ...hardcodedOnly];

      // Update cache
      this.cache = {
        topics,
        fetchedAt: Date.now(),
      };

      return topics;
    } catch (err) {
      console.error('[TopicsService] Unexpected error fetching topics, falling back to hardcoded:', err);
      return this.getFallbackTopics();
    }
  }

  /**
   * Return hardcoded topics as fallback (also populates cache briefly to avoid hammering).
   */
  private getFallbackTopics(): TopicDefinition[] {
    const fallback = getHardcodedActiveTopics();
    // Cache the fallback for 1 minute so we don't retry Supabase on every request
    this.cache = {
      topics: fallback,
      fetchedAt: Date.now() - (this.CACHE_TTL_MS - 60_000),
    };
    return fallback;
  }

  /**
   * Map a Supabase row to a TopicDefinition.
   */
  private mapRowToTopicDefinition(row: Record<string, unknown>): TopicDefinition {
    return {
      id: row.id as string,
      name: row.name as string,
      description: row.description as string,
      icon: row.icon as string,
      color: row.color as string,
      category: row.category as TopicCategory,
      sources: (row.sources as TopicDefinition['sources']) || [],
      promptContext: (row.prompt_context as string) || '',
      targetDurationMinutes: (row.target_duration_minutes as number) || 4,
      isActive: row.is_active as boolean,
      languages: (row.languages as string[]) || ['all'],
      localizedNames: (row.localized_names as Record<string, string>) || undefined,
      localizedDescriptions: (row.localized_descriptions as Record<string, string>) || undefined,
    };
  }

  /**
   * Invalidate the cache so the next request fetches fresh data.
   */
  invalidateCache(): void {
    this.cache = null;
  }
}

// Export singleton
export const topicsService = new TopicsService();
