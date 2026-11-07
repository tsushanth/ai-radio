/**
 * Content Aggregator Service
 * Fetches and aggregates content from various sources (RSS, Reddit, HackerNews)
 */

import Parser from 'rss-parser';
import { fetchRedditRss } from './reddit.rss';
import type {
  ContentSource,
  AggregatedStory,
  TopicContent,
  TopicDefinition,
} from '../../types/topics';

/** Reddit asks for a descriptive, unique User-Agent. Use the configured REDDIT_USER_AGENT secret, else the old literal. */
export function redditUserAgent(): string {
  return process.env.REDDIT_USER_AGENT?.trim() || 'BriefCast/1.0 (by /u/BriefCastApp)';
}

/**
 * Opt-in switch for the Reddit OAuth API (needs REDDIT_CLIENT_ID/SECRET). OFF by default: oauth.reddit.com answers 403
 * "blocked by network security" to datacenter addresses even with a valid token, so the public Atom feed is the default path.
 */
export function redditOAuthEnabled(): boolean {
  const v = (process.env.REDDIT_USE_OAUTH ?? '').trim().toLowerCase();
  return ['1', 'true', 'on', 'yes'].includes(v) && !!process.env.REDDIT_CLIENT_ID && !!process.env.REDDIT_CLIENT_SECRET;
}

/**
 * Opt-in switch for the Google News fallback (third-party source). OFF by default; set GOOGLE_NEWS_FALLBACK=1 (or "true"/"on"/"yes") to enable.
 * Read on every call so it can be flipped with `fly secrets set` without a code change.
 */
export function googleNewsFallbackEnabled(): boolean {
  const v = (process.env.GOOGLE_NEWS_FALLBACK ?? '').trim().toLowerCase();
  return ['1', 'true', 'on', 'yes'].includes(v);
}

/** Google News RSS search URL for a topic's own name, restricted to the last two days. Public, no key, not blocked on cloud IPs. */
export function googleNewsSearchUrl(topicName: string): string {
  const q = encodeURIComponent(`${topicName.trim()} when:2d`);
  return `https://news.google.com/rss/search?q=${q}&hl=en-US&gl=US&ceid=US:en`;
}

const rssParser = new Parser({
  timeout: 10000,
  headers: {
    'User-Agent': 'BriefCast/1.0 (Content Aggregator)',
  },
});

/**
 * HackerNews API types
 */
interface HNStory {
  id: number;
  title: string;
  url?: string;
  score: number;
  by: string;
  time: number;
  descendants?: number;
  type: string;
}

/**
 * Reddit API types
 */
interface RedditPost {
  data: {
    title: string;
    selftext?: string;
    url: string;
    score: number;
    num_comments: number;
    author: string;
    created_utc: number;
    permalink: string;
    is_self: boolean;
    stickied?: boolean;
    over_18?: boolean;
  };
}

interface RedditResponse {
  data: {
    children: RedditPost[];
  };
}

interface RedditTokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

export class ContentAggregatorService {
  private readonly HN_API_BASE = 'https://hacker-news.firebaseio.com/v0';
  private readonly REDDIT_OAUTH_BASE = 'https://oauth.reddit.com';

  // Reddit OAuth token cache
  private redditAccessToken: string | null = null;
  private redditTokenExpiry: number = 0;

  /**
   * Aggregate content for a topic from all its sources
   */
  async aggregateTopicContent(topic: TopicDefinition): Promise<TopicContent> {
    const stories: AggregatedStory[] = [];
    let successfulSources = 0;

    console.log(`📰 Aggregating content for topic: ${topic.name}`);

    // If no sources configured, fall back to HackerNews search using topic name
    const sources = topic.sources && topic.sources.length > 0
      ? topic.sources
      : [{
          type: 'hackernews' as const,
          name: 'HackerNews',
          keywords: topic.name.split(/\s+/).concat(
            topic.description ? topic.description.split(/\s+/).slice(0, 5) : []
          ),
          maxItems: 15,
        }];

    for (const source of sources) {
      try {
        const sourceStories = await this.fetchFromSource(source);
        stories.push(...sourceStories);
        successfulSources++;
        console.log(`  ✅ ${source.name}: ${sourceStories.length} stories`);
      } catch (error) {
        console.error(`  ❌ ${source.name} failed:`, error instanceof Error ? error.message : error);
      }
    }

    // Configured sources gave nothing (e.g. a single-subreddit topic while Reddit blocks us): search news for the topic name.
    // This runs before the HackerNews keyword fallback, which only keeps titles containing the topic's words and is tech-only.
    if (stories.length === 0 && googleNewsFallbackEnabled()) {
      console.log(`  ⚠️ No stories from configured sources, trying Google News search for "${topic.name}"`);
      try {
        const newsStories = await this.fetchGoogleNews(topic.name);
        stories.push(...newsStories);
        if (newsStories.length > 0) successfulSources++;
        console.log(`  ✅ Google News fallback: ${newsStories.length} stories`);
      } catch (error) {
        console.error(`  ❌ Google News fallback failed:`, error instanceof Error ? error.message : error);
      }
    }

    // Still nothing: fall back to HackerNews keyword search
    if (stories.length === 0) {
      console.log(`  ⚠️ No stories from configured sources, falling back to HackerNews for "${topic.name}"`);
      try {
        const fallbackSource = {
          type: 'hackernews' as const,
          name: 'HackerNews (fallback)',
          keywords: topic.name.split(/\s+/).concat(
            topic.description ? topic.description.split(/\s+/).slice(0, 5) : []
          ),
          maxItems: 15,
        };
        const fallbackStories = await this.fetchFromSource(fallbackSource);
        stories.push(...fallbackStories);
        successfulSources++;
        console.log(`  ✅ HackerNews fallback: ${fallbackStories.length} stories`);
      } catch (error) {
        console.error(`  ❌ HackerNews fallback failed:`, error instanceof Error ? error.message : error);
      }
    }

    // Sort by score/relevance and deduplicate
    const uniqueStories = this.deduplicateStories(stories);
    const sortedStories = this.sortByRelevance(uniqueStories);

    // Limit to top stories
    const topStories = sortedStories.slice(0, 15);

    console.log(`📊 Total: ${topStories.length} unique stories from ${successfulSources}/${sources.length} sources`);

    return {
      topicId: topic.id,
      date: this.getTodayDate(),
      stories: topStories,
      fetchedAt: new Date(),
      totalSources: sources.length,
      successfulSources,
    };
  }

  /**
   * Fetch content from a single source
   */
  private async fetchFromSource(source: ContentSource): Promise<AggregatedStory[]> {
    switch (source.type) {
      case 'rss':
        return this.fetchRSS(source);
      case 'hackernews':
        return this.fetchHackerNews(source);
      case 'reddit':
        return this.fetchReddit(source);
      default:
        console.warn(`Unknown source type: ${source.type}`);
        return [];
    }
  }

  /**
   * Fetch from RSS feed
   */
  private async fetchRSS(source: ContentSource): Promise<AggregatedStory[]> {
    if (!source.url) {
      throw new Error('RSS source requires URL');
    }

    const feed = await rssParser.parseURL(source.url);
    const maxItems = source.maxItems || 10;

    return feed.items.slice(0, maxItems).map(item => ({
      title: item.title || 'Untitled',
      source: source.name,
      sourceType: 'rss' as const,
      summary: item.contentSnippet?.substring(0, 300) || item.content?.substring(0, 300),
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
      author: item.creator || item.author,
    }));
  }

  /**
   * Fallback: latest news items for a topic name from the Google News RSS search feed.
   */
  async fetchGoogleNews(topicName: string, maxItems = 12): Promise<AggregatedStory[]> {
    if (!topicName.trim()) return [];
    const res = await fetch(googleNewsSearchUrl(topicName), {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; BriefCast/1.0)' },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`Google News error: ${res.status}`);
    const feed = await rssParser.parseString(await res.text());
    return feed.items.slice(0, maxItems).filter(i => i.title).map(item => ({
      title: item.title as string,
      source: 'Google News (fallback)',
      sourceType: 'rss' as const,
      url: item.link,
      publishedAt: item.pubDate ? new Date(item.pubDate) : undefined,
    }));
  }

  /**
   * Fetch from HackerNews
   */
  private async fetchHackerNews(source: ContentSource): Promise<AggregatedStory[]> {
    const maxItems = source.maxItems || 10;
    const keywords = source.keywords || [];

    // Get top stories
    const topStoriesRes = await fetch(`${this.HN_API_BASE}/topstories.json`);
    const topStoryIds = (await topStoriesRes.json()) as number[];

    // Fetch more stories than needed to filter
    const storiesToFetch = keywords.length > 0 ? Math.min(100, topStoryIds.length) : maxItems;
    const storyPromises = topStoryIds.slice(0, storiesToFetch).map(id =>
      fetch(`${this.HN_API_BASE}/item/${id}.json`).then(res => res.json() as Promise<HNStory>)
    );

    const stories = await Promise.all(storyPromises);

    // Filter by keywords if specified
    let filteredStories = stories.filter(s => s && s.type === 'story');

    if (keywords.length > 0) {
      const keywordsLower = keywords.map(k => k.toLowerCase());
      filteredStories = filteredStories.filter(story => {
        const titleLower = story.title.toLowerCase();
        return keywordsLower.some(kw => titleLower.includes(kw));
      });
    }

    return filteredStories.slice(0, maxItems).map(story => ({
      title: story.title,
      source: source.name,
      sourceType: 'hackernews' as const,
      url: story.url,
      score: story.score,
      commentCount: story.descendants,
      publishedAt: new Date(story.time * 1000),
      author: story.by,
    }));
  }

  /**
   * Get Reddit OAuth access token (app-only authentication)
   */
  private async getRedditAccessToken(): Promise<string> {
    // Return cached token if still valid (with 60s buffer)
    if (this.redditAccessToken && Date.now() < this.redditTokenExpiry - 60000) {
      return this.redditAccessToken;
    }

    const clientId = process.env.REDDIT_CLIENT_ID;
    const clientSecret = process.env.REDDIT_CLIENT_SECRET;

    if (!clientId || !clientSecret) {
      throw new Error('Reddit API credentials not configured');
    }

    // Reddit OAuth2 app-only (client credentials) flow
    const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

    const res = await fetch('https://www.reddit.com/api/v1/access_token', {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${auth}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent': redditUserAgent(),
      },
      body: 'grant_type=client_credentials',
    });

    if (!res.ok) {
      const errorText = await res.text();
      throw new Error(`Reddit OAuth error: ${res.status} - ${errorText}`);
    }

    const data = (await res.json()) as RedditTokenResponse;

    this.redditAccessToken = data.access_token;
    this.redditTokenExpiry = Date.now() + (data.expires_in * 1000);

    console.log('🔐 Reddit OAuth token obtained successfully');
    return this.redditAccessToken;
  }

  /**
   * Fetch from Reddit: public Atom feed by default; OAuth API first only when REDDIT_USE_OAUTH is set
   * (falling back to the feed if OAuth is refused).
   */
  private async fetchReddit(source: ContentSource): Promise<AggregatedStory[]> {
    if (!source.subreddit) {
      throw new Error('Reddit source requires subreddit');
    }
    if (redditOAuthEnabled()) {
      try {
        return await this.fetchRedditOAuth(source);
      } catch (error) {
        console.warn(`  ⚠️ Reddit OAuth failed for r/${source.subreddit} (${error instanceof Error ? error.message : error}), using the public feed`);
      }
    }
    return fetchRedditRss(source, redditUserAgent());
  }

  /**
   * Fetch from Reddit using OAuth API
   */
  private async fetchRedditOAuth(source: ContentSource): Promise<AggregatedStory[]> {
    if (!source.subreddit) {
      throw new Error('Reddit source requires subreddit');
    }

    const maxItems = source.maxItems || 10;

    // Get OAuth token
    const accessToken = await this.getRedditAccessToken();

    // Use OAuth API endpoint
    const url = `${this.REDDIT_OAUTH_BASE}/r/${source.subreddit}/hot?limit=${maxItems * 2}`;

    const doFetch = () => fetch(url, {
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'User-Agent': redditUserAgent(),
      },
    });
    let res = await doFetch();
    // One retry for rate limits and transient server errors (not 403: that is a block, retrying will not help)
    if (res.status === 429 || res.status >= 500) {
      await new Promise(r => setTimeout(r, Number(process.env.REDDIT_RETRY_DELAY_MS ?? 1500)));
      res = await doFetch();
    }

    if (!res.ok) {
      throw new Error(`Reddit API error: ${res.status}`);
    }

    const data = (await res.json()) as RedditResponse;

    // Filter out stickied posts and NSFW content
    const posts = data.data.children
      .filter(post => !post.data.stickied && !post.data.over_18)
      .filter(post => !post.data.is_self || post.data.selftext) // Has content
      .slice(0, maxItems);

    return posts.map(post => ({
      title: post.data.title,
      source: source.name,
      sourceType: 'reddit' as const,
      summary: post.data.selftext?.substring(0, 300),
      url: post.data.is_self
        ? `https://reddit.com${post.data.permalink}`
        : post.data.url,
      score: post.data.score,
      commentCount: post.data.num_comments,
      publishedAt: new Date(post.data.created_utc * 1000),
      author: post.data.author,
    }));
  }

  /**
   * Remove duplicate stories based on title similarity
   */
  private deduplicateStories(stories: AggregatedStory[]): AggregatedStory[] {
    const seen = new Set<string>();
    const unique: AggregatedStory[] = [];

    for (const story of stories) {
      // Normalize title for comparison
      const normalizedTitle = story.title
        .toLowerCase()
        .replace(/[^\w\s]/g, '')
        .replace(/\s+/g, ' ')
        .trim();

      // Check for similar titles (first 50 chars)
      const titleKey = normalizedTitle.substring(0, 50);

      if (!seen.has(titleKey)) {
        seen.add(titleKey);
        unique.push(story);
      }
    }

    return unique;
  }

  /**
   * Sort stories by relevance (score, recency)
   */
  private sortByRelevance(stories: AggregatedStory[]): AggregatedStory[] {
    return stories.sort((a, b) => {
      // Score-based sorting (higher is better)
      const scoreA = a.score || 0;
      const scoreB = b.score || 0;

      if (scoreA !== scoreB) {
        return scoreB - scoreA;
      }

      // Recency-based sorting (newer is better)
      const timeA = a.publishedAt?.getTime() || 0;
      const timeB = b.publishedAt?.getTime() || 0;

      return timeB - timeA;
    });
  }

  /**
   * Get today's date in YYYY-MM-DD format
   */
  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Filter stories to last 24 hours
   */
  filterRecent(stories: AggregatedStory[], hoursAgo: number = 24): AggregatedStory[] {
    const cutoff = Date.now() - hoursAgo * 60 * 60 * 1000;

    return stories.filter(story => {
      if (!story.publishedAt) return true; // Keep if no date
      return story.publishedAt.getTime() > cutoff;
    });
  }
}

// Export singleton
export const contentAggregator = new ContentAggregatorService();
