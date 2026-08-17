/**
 * Custom Source Service
 * Manages user-added RSS feeds, newsletters, and websites
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/environment';
import type {
  CustomSource,
  CustomSourceItem,
  CustomSourceAddRequest,
  CustomSourceAddResponse,
  CustomSourcesResponse,
  CustomSourceDetailResponse,
  CustomSourceRefreshResponse,
  CustomSourceValidateResponse,
  CustomSourceDbRecord,
  CustomSourceItemDbRecord,
  CustomSourceType,
  CustomSourceStatus,
  RSSFeedItem,
  RSSFeedMetadata,
} from '../../types/customsource';

export class CustomSourceService {
  private supabase: SupabaseClient | null = null;
  private anthropic: Anthropic;
  private readonly SOURCES_TABLE = 'custom_sources';
  private readonly ITEMS_TABLE = 'custom_source_items';

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    }
    this.anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  /**
   * Validate a source URL before adding
   */
  async validateSource(url: string, sourceType: CustomSourceType): Promise<CustomSourceValidateResponse> {
    try {
      // Basic URL validation
      const parsedUrl = new URL(url);

      if (sourceType === 'rss' || sourceType === 'podcast') {
        // Try to fetch and parse RSS
        const feedData = await this.fetchRSSFeed(url);
        return {
          isValid: true,
          sourceType,
          suggestedName: feedData.title,
          itemCount: feedData.itemCount,
        };
      }

      if (sourceType === 'youtube') {
        // Validate YouTube channel URL
        const isValid = this.isValidYouTubeUrl(url);
        return {
          isValid,
          sourceType,
          suggestedName: await this.getYouTubeChannelName(url),
          error: isValid ? undefined : 'Invalid YouTube channel URL',
        };
      }

      if (sourceType === 'website') {
        // Try to fetch website
        const response = await fetch(url, { method: 'HEAD' });
        return {
          isValid: response.ok,
          sourceType,
          suggestedName: parsedUrl.hostname,
          error: response.ok ? undefined : 'Website not accessible',
        };
      }

      if (sourceType === 'newsletter') {
        // Newsletter validation is different - just validate email format
        return {
          isValid: true,
          sourceType,
          suggestedName: url.split('@')[1]?.split('.')[0] || 'Newsletter',
        };
      }

      return {
        isValid: false,
        error: 'Unsupported source type',
      };
    } catch (error) {
      return {
        isValid: false,
        error: error instanceof Error ? error.message : 'Validation failed',
      };
    }
  }

  /**
   * Add a new custom source
   */
  async addSource(request: CustomSourceAddRequest): Promise<CustomSourceAddResponse> {
    const { url, sourceType, name, userId } = request;

    // Validate first
    const validation = await this.validateSource(url, sourceType);
    if (!validation.isValid) {
      throw new Error(validation.error || 'Invalid source');
    }

    // Check for duplicates
    if (this.supabase) {
      const { data: existing } = await this.supabase
        .from(this.SOURCES_TABLE)
        .select('id')
        .eq('user_id', userId)
        .eq('url', url)
        .single();

      if (existing) {
        throw new Error('This source has already been added');
      }
    }

    // Create source
    const sourceId = `src-${userId.substring(0, 8)}-${Date.now()}`;
    const source: CustomSource = {
      id: sourceId,
      userId,
      name: name || validation.suggestedName || url,
      url,
      sourceType,
      color: this.getColorForType(sourceType),
      isActive: true,
      itemCount: validation.itemCount || 0,
      status: 'pending',
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save to database
    await this.saveSource(source);

    // Fetch initial items
    try {
      await this.refreshSource(sourceId, userId);
      source.status = 'active';
      source.lastFetchedAt = new Date();
      await this.saveSource(source);
    } catch (error) {
      console.error('[CustomSource] Failed to fetch initial items:', error);
      source.status = 'error';
      source.errorMessage = error instanceof Error ? error.message : 'Failed to fetch';
      await this.saveSource(source);
    }

    console.log(`[CustomSource] Added source: ${source.name} (${sourceType})`);

    return {
      source,
      message: `Successfully added ${source.name}`,
    };
  }

  /**
   * Get all sources for a user
   */
  async getSources(userId: string): Promise<CustomSourcesResponse> {
    if (!this.supabase) {
      return { sources: [], total: 0 };
    }

    const { data, error, count } = await this.supabase
      .from(this.SOURCES_TABLE)
      .select('*', { count: 'exact' })
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      console.error('[CustomSource] Failed to fetch sources:', error);
      return { sources: [], total: 0 };
    }

    const sources = (data || []).map(this.mapDbToSource);

    return {
      sources,
      total: count || 0,
    };
  }

  /**
   * Get source detail with items
   */
  async getSourceDetail(
    sourceId: string,
    userId: string,
    limit: number = 20,
    offset: number = 0
  ): Promise<CustomSourceDetailResponse | null> {
    if (!this.supabase) return null;

    // Get source
    const { data: sourceData, error: sourceError } = await this.supabase
      .from(this.SOURCES_TABLE)
      .select('*')
      .eq('id', sourceId)
      .eq('user_id', userId)
      .single();

    if (sourceError || !sourceData) return null;

    const source = this.mapDbToSource(sourceData);

    // Get items
    const { data: itemsData, count } = await this.supabase
      .from(this.ITEMS_TABLE)
      .select('*', { count: 'exact' })
      .eq('source_id', sourceId)
      .order('published_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const items = (itemsData || []).map(this.mapDbToItem);

    return {
      source,
      items,
      hasMore: (count || 0) > offset + limit,
    };
  }

  /**
   * Refresh a source (fetch new items)
   */
  async refreshSource(sourceId: string, userId: string): Promise<CustomSourceRefreshResponse> {
    // Get source
    const detail = await this.getSourceDetail(sourceId, userId, 1, 0);
    if (!detail) {
      throw new Error('Source not found');
    }

    const { source } = detail;

    console.log(`[CustomSource] Refreshing ${source.name}...`);

    let newItemCount = 0;

    try {
      if (source.sourceType === 'rss' || source.sourceType === 'podcast') {
        newItemCount = await this.fetchAndSaveRSSItems(source);
      } else if (source.sourceType === 'website') {
        newItemCount = await this.fetchAndSaveWebsiteContent(source);
      }

      // Update source
      source.lastFetchedAt = new Date();
      source.status = 'active';
      source.errorMessage = undefined;
      source.updatedAt = new Date();
      await this.saveSource(source);

      // Update item count
      if (this.supabase) {
        const { count } = await this.supabase
          .from(this.ITEMS_TABLE)
          .select('*', { count: 'exact', head: true })
          .eq('source_id', sourceId);

        source.itemCount = count || 0;
        await this.saveSource(source);
      }

      console.log(`[CustomSource] Refresh complete: ${newItemCount} new items`);

      return {
        source,
        newItemCount,
        message: newItemCount > 0 ? `Found ${newItemCount} new items` : 'No new items',
      };
    } catch (error) {
      console.error('[CustomSource] Refresh failed:', error);

      source.status = 'error';
      source.errorMessage = error instanceof Error ? error.message : 'Refresh failed';
      source.updatedAt = new Date();
      await this.saveSource(source);

      throw error;
    }
  }

  /**
   * Delete a source
   */
  async deleteSource(sourceId: string, userId: string): Promise<boolean> {
    if (!this.supabase) return false;

    // Delete items first
    await this.supabase
      .from(this.ITEMS_TABLE)
      .delete()
      .eq('source_id', sourceId);

    // Delete source
    const { error } = await this.supabase
      .from(this.SOURCES_TABLE)
      .delete()
      .eq('id', sourceId)
      .eq('user_id', userId);

    return !error;
  }

  /**
   * Toggle source active state
   */
  async toggleSource(sourceId: string, userId: string, isActive: boolean): Promise<CustomSource | null> {
    if (!this.supabase) return null;

    const { data, error } = await this.supabase
      .from(this.SOURCES_TABLE)
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', sourceId)
      .eq('user_id', userId)
      .select()
      .single();

    if (error || !data) return null;

    return this.mapDbToSource(data);
  }

  /**
   * Mark item as read
   */
  async markItemRead(itemId: string, sourceId: string): Promise<boolean> {
    if (!this.supabase) return false;

    const { error } = await this.supabase
      .from(this.ITEMS_TABLE)
      .update({ is_read: true })
      .eq('id', itemId)
      .eq('source_id', sourceId);

    return !error;
  }

  /**
   * Toggle item inclusion in daily brief
   */
  async toggleItemInBrief(itemId: string, sourceId: string, include: boolean): Promise<boolean> {
    if (!this.supabase) return false;

    const { error } = await this.supabase
      .from(this.ITEMS_TABLE)
      .update({ is_included_in_brief: include })
      .eq('id', itemId)
      .eq('source_id', sourceId);

    return !error;
  }

  /**
   * Get items to include in daily brief
   */
  async getItemsForBrief(userId: string, limit: number = 10): Promise<CustomSourceItem[]> {
    if (!this.supabase) return [];

    // Get user's active sources
    const { data: sources } = await this.supabase
      .from(this.SOURCES_TABLE)
      .select('id')
      .eq('user_id', userId)
      .eq('is_active', true);

    if (!sources || sources.length === 0) return [];

    const sourceIds = sources.map(s => s.id);

    // Get recent unread items marked for brief
    const { data } = await this.supabase
      .from(this.ITEMS_TABLE)
      .select('*')
      .in('source_id', sourceIds)
      .eq('is_included_in_brief', true)
      .eq('is_read', false)
      .order('published_at', { ascending: false })
      .limit(limit);

    return (data || []).map(this.mapDbToItem);
  }

  // ============ Private Methods ============

  /**
   * Fetch RSS feed metadata
   */
  private async fetchRSSFeed(url: string): Promise<RSSFeedMetadata> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error('Failed to fetch RSS feed');
    }

    const text = await response.text();

    // Simple XML parsing for RSS/Atom
    const titleMatch = text.match(/<title>([^<]+)<\/title>/);
    const itemMatches = text.match(/<item>|<entry>/g);

    return {
      title: titleMatch?.[1] || 'RSS Feed',
      itemCount: itemMatches?.length || 0,
    };
  }

  /**
   * Fetch and save RSS items
   */
  private async fetchAndSaveRSSItems(source: CustomSource): Promise<number> {
    const response = await fetch(source.url);
    if (!response.ok) {
      throw new Error('Failed to fetch RSS feed');
    }

    const text = await response.text();
    const items = this.parseRSSItems(text);

    let newCount = 0;

    for (const item of items.slice(0, 50)) {
      // Max 50 items
      const itemId = `item-${source.id}-${this.hashString(item.guid || item.link)}`;

      // Check if already exists
      if (this.supabase) {
        const { data: existing } = await this.supabase
          .from(this.ITEMS_TABLE)
          .select('id')
          .eq('id', itemId)
          .single();

        if (existing) continue;
      }

      const sourceItem: CustomSourceItem = {
        id: itemId,
        sourceId: source.id,
        title: item.title,
        url: item.link,
        content: item.content || item.description,
        summary: await this.summarizeContent(item.content || item.description || ''),
        author: item.author,
        publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
        fetchedAt: new Date(),
        isRead: false,
        isIncludedInBrief: true,
      };

      await this.saveItem(sourceItem);
      newCount++;
    }

    return newCount;
  }

  /**
   * Fetch and save website content
   */
  private async fetchAndSaveWebsiteContent(source: CustomSource): Promise<number> {
    // For websites, we'd use a scraping service or API
    // For now, just create a placeholder item
    const itemId = `item-${source.id}-${Date.now()}`;

    const sourceItem: CustomSourceItem = {
      id: itemId,
      sourceId: source.id,
      title: `Update from ${source.name}`,
      url: source.url,
      content: 'Website content would be scraped here',
      fetchedAt: new Date(),
      isRead: false,
      isIncludedInBrief: false,
    };

    await this.saveItem(sourceItem);
    return 1;
  }

  /**
   * Parse RSS items from XML
   */
  private parseRSSItems(xml: string): RSSFeedItem[] {
    const items: RSSFeedItem[] = [];

    // Simple regex-based parsing (in production, use a proper XML parser)
    const itemRegex = /<item>([\s\S]*?)<\/item>|<entry>([\s\S]*?)<\/entry>/g;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
      const itemXml = match[1] || match[2];

      const title = this.extractXmlValue(itemXml, 'title');
      const link =
        this.extractXmlValue(itemXml, 'link') ||
        this.extractXmlAttribute(itemXml, 'link', 'href');
      const description = this.extractXmlValue(itemXml, 'description');
      const content =
        this.extractXmlValue(itemXml, 'content:encoded') ||
        this.extractXmlValue(itemXml, 'content');
      const author =
        this.extractXmlValue(itemXml, 'author') ||
        this.extractXmlValue(itemXml, 'dc:creator');
      const pubDate =
        this.extractXmlValue(itemXml, 'pubDate') ||
        this.extractXmlValue(itemXml, 'published');
      const guid =
        this.extractXmlValue(itemXml, 'guid') || this.extractXmlValue(itemXml, 'id');

      if (title && link) {
        items.push({
          title: this.decodeHtmlEntities(title),
          link,
          description: description ? this.decodeHtmlEntities(description) : undefined,
          content: content ? this.stripHtml(content) : undefined,
          author,
          pubDate,
          guid,
        });
      }
    }

    return items;
  }

  /**
   * Summarize content using GPT
   */
  private async summarizeContent(content: string): Promise<string> {
    if (!content || content.length < 100) return content;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-haiku-4-5-20251001',
        system: 'Summarize the following content in 1-2 sentences.',
        messages: [
          { role: 'user', content: content.substring(0, 2000) },
        ],
        max_tokens: 100,
      });

      return (response.content[0]?.type === 'text' ? response.content[0].text : '') || content.substring(0, 200);
    } catch {
      return content.substring(0, 200);
    }
  }

  /**
   * Save source to database
   */
  private async saveSource(source: CustomSource): Promise<void> {
    if (!this.supabase) return;

    const dbRecord: CustomSourceDbRecord = {
      id: source.id,
      user_id: source.userId,
      name: source.name,
      url: source.url,
      source_type: source.sourceType,
      icon: source.icon,
      color: source.color,
      is_active: source.isActive,
      last_fetched_at: source.lastFetchedAt?.toISOString(),
      item_count: source.itemCount,
      status: source.status,
      error_message: source.errorMessage,
      created_at: source.createdAt.toISOString(),
      updated_at: source.updatedAt.toISOString(),
    };

    const { error } = await this.supabase
      .from(this.SOURCES_TABLE)
      .upsert(dbRecord, { onConflict: 'id' });

    if (error) {
      console.error('[CustomSource] Failed to save source:', error);
    }
  }

  /**
   * Save item to database
   */
  private async saveItem(item: CustomSourceItem): Promise<void> {
    if (!this.supabase) return;

    const dbRecord: CustomSourceItemDbRecord = {
      id: item.id,
      source_id: item.sourceId,
      title: item.title,
      url: item.url,
      content: item.content,
      summary: item.summary,
      author: item.author,
      published_at: item.publishedAt?.toISOString(),
      fetched_at: item.fetchedAt.toISOString(),
      is_read: item.isRead,
      is_included_in_brief: item.isIncludedInBrief,
    };

    const { error } = await this.supabase
      .from(this.ITEMS_TABLE)
      .upsert(dbRecord, { onConflict: 'id' });

    if (error) {
      console.error('[CustomSource] Failed to save item:', error);
    }
  }

  /**
   * Map database record to source
   */
  private mapDbToSource(data: Record<string, unknown>): CustomSource {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      name: data.name as string,
      url: data.url as string,
      sourceType: data.source_type as CustomSourceType,
      icon: data.icon as string | undefined,
      color: data.color as string,
      isActive: data.is_active as boolean,
      lastFetchedAt: data.last_fetched_at
        ? new Date(data.last_fetched_at as string)
        : undefined,
      itemCount: data.item_count as number,
      status: data.status as CustomSourceStatus,
      errorMessage: data.error_message as string | undefined,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
    };
  }

  /**
   * Map database record to item
   */
  private mapDbToItem(data: Record<string, unknown>): CustomSourceItem {
    return {
      id: data.id as string,
      sourceId: data.source_id as string,
      title: data.title as string,
      url: data.url as string,
      content: data.content as string | undefined,
      summary: data.summary as string | undefined,
      author: data.author as string | undefined,
      publishedAt: data.published_at
        ? new Date(data.published_at as string)
        : undefined,
      fetchedAt: new Date(data.fetched_at as string),
      isRead: data.is_read as boolean,
      isIncludedInBrief: data.is_included_in_brief as boolean,
    };
  }

  // ============ Helper Methods ============

  private getColorForType(type: CustomSourceType): string {
    const colors: Record<CustomSourceType, string> = {
      rss: '#F59E0B',
      newsletter: '#8B5CF6',
      website: '#10B981',
      youtube: '#EF4444',
      podcast: '#3B82F6',
    };
    return colors[type] || '#6B7280';
  }

  private isValidYouTubeUrl(url: string): boolean {
    return (
      url.includes('youtube.com/@') ||
      url.includes('youtube.com/channel/') ||
      url.includes('youtube.com/c/')
    );
  }

  private async getYouTubeChannelName(url: string): Promise<string> {
    const match = url.match(/@([^/]+)|\/c\/([^/]+)|\/channel\/([^/]+)/);
    return match?.[1] || match?.[2] || match?.[3] || 'YouTube Channel';
  }

  private extractXmlValue(xml: string, tag: string): string | undefined {
    const regex = new RegExp(`<${tag}[^>]*><!\\[CDATA\\[([\\s\\S]*?)\\]\\]></${tag}>|<${tag}[^>]*>([^<]*)</${tag}>`, 'i');
    const match = xml.match(regex);
    return match?.[1] || match?.[2];
  }

  private extractXmlAttribute(xml: string, tag: string, attr: string): string | undefined {
    const regex = new RegExp(`<${tag}[^>]*${attr}="([^"]*)"`, 'i');
    const match = xml.match(regex);
    return match?.[1];
  }

  private decodeHtmlEntities(text: string): string {
    return text
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
  }

  private stripHtml(html: string): string {
    return html.replace(/<[^>]*>/g, '').trim();
  }

  private hashString(str: string): string {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = (hash << 5) - hash + char;
      hash = hash & hash;
    }
    return Math.abs(hash).toString(36);
  }
}

// Export singleton
export const customSourceService = new CustomSourceService();
