/**
 * Content Aggregator Service
 * Fetches and aggregates content from various sources (RSS, Reddit, HackerNews)
 */

import Parser from 'rss-parser';
import { fetchRedditRss } from './reddit.rss';
import { fetchRedditArchive } from './reddit.archive';
import { fetchExaStories } from './exa.source';
import { getSourcePolicy } from './source-policy';
import { exaSourceEnabled, redditArchiveEnabled, redditSourceEnabled, sourceCacheEnabled, sourceCacheStaleHours } from './source-flags';
import { getSourceStateStore } from './source-state.store';
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

/** A step of the chain is accepted when it gives at least this many stories (the radio's min_results). */
export const MIN_STORIES = 3;
const FRESH_HOURS = 48;
const SUBREDDIT_NAME_RE = /^[A-Za-z0-9_]{1,40}$/;

export interface AggregateOptions {
  /** Headline previews: no Exa search and no reddit reply fetches. */
  preview?: boolean;
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
  async aggregateTopicContent(topic: TopicDefinition, opts: AggregateOptions = {}): Promise<TopicContent> {
    const stories: AggregatedStory[] = [];
    let successfulSources = 0;
    const policy = getSourcePolicy(topic.id);

    console.log(`📰 Aggregating content for topic: ${topic.name}`);

    // If no sources configured, fall back to HackerNews search using topic name
    const configured = topic.sources && topic.sources.length > 0
      ? topic.sources
      : [{
          type: 'hackernews' as const,
          name: 'HackerNews',
          keywords: topic.name.split(/\s+/).concat(
            topic.description ? topic.description.split(/\s+/).slice(0, 5) : []
          ),
          maxItems: 15,
        }];

    // Show topics whose catalog "subreddit" cannot exist read their real community instead (explicit in source-policy.ts).
    const sources = this.applyArchivePolicy(this.applySourceFixes(configured, policy), policy?.archive, opts);
    let totalSources = sources.length;

    // The chain (same as the radio): [Exa, feeds] when the topic's exaPosition is "first", else [feeds, Exa]; the first step that gives
    // at least MIN_STORIES wins; then the last good feed stories; Exa text is never kept as "last good".
    const exaCfg = !opts.preview && exaSourceEnabled() ? policy?.exa : undefined;
    const runExa = async (): Promise<boolean> => {
      if (!exaCfg) return false;
      const exaStories = await fetchExaStories(topic, exaCfg);
      if (!exaStories || exaStories.length < MIN_STORIES) return false;
      stories.length = 0;
      stories.push(...exaStories);
      successfulSources = 1;
      totalSources = 1;
      return true;
    };
    let decided = false;
    if (exaCfg?.position === 'first') decided = await runExa();
    if (!decided) {
      const feed = await this.collectFeedStories(topic, sources);
      stories.push(...feed.stories);
      successfulSources = feed.successfulSources;
      if (this.freshCount(stories) >= MIN_STORIES) {
        decided = true;
        if (sourceCacheEnabled()) await this.rememberStories(topic.id, this.limit(stories));
      } else if (exaCfg?.position !== 'first') {
        decided = await runExa();
      }
    }
    if (!decided && sourceCacheEnabled()) {
      const cached = await this.lastGoodStories(topic.id);
      if (cached && cached.length > stories.length) {
        console.log(`  ♻️ Live sources gave ${stories.length} stories; using the last good feed stories for ${topic.name} (${cached.length})`);
        stories.length = 0;
        stories.push(...cached);
      }
    }

    // Sort by score/relevance and deduplicate
    const uniqueStories = this.deduplicateStories(stories);
    const sortedStories = this.sortByRelevance(uniqueStories);

    // Limit to top stories
    const topStories = sortedStories.slice(0, 15);

    console.log(`📊 Total: ${topStories.length} unique stories from ${successfulSources}/${totalSources} sources`);

    return {
      topicId: topic.id,
      date: this.getTodayDate(),
      stories: topStories,
      fetchedAt: new Date(),
      totalSources,
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

  /** Step "feeds": every configured source, then the Google News and HackerNews keyword fallbacks when nothing came back. */
  private async collectFeedStories(topic: TopicDefinition, sources: ContentSource[]): Promise<{ stories: AggregatedStory[]; successfulSources: number }> {
    const stories: AggregatedStory[] = [];
    let successfulSources = 0;

    for (const source of sources) {
      // Reddit sources are skipped entirely only when both Reddit paths are switched off.
      if (source.type === 'reddit' && !redditArchiveEnabled() && !redditSourceEnabled()) {
        console.log(`  ⏭️ ${source.name}: Reddit sources are switched off`);
        continue;
      }
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

    return { stories, successfulSources };
  }

  private limit(stories: AggregatedStory[]): AggregatedStory[] {
    return this.sortByRelevance(this.deduplicateStories(stories)).slice(0, 15);
  }

  /** Catalog sources that are dead or wrong for the topic (source-policy.ts), dropped or repointed at aggregation time. */
  private applySourceFixes(sources: ContentSource[], policy: ReturnType<typeof getSourcePolicy>): ContentSource[] {
    if (!policy?.removeSources && !policy?.replaceUrls) return sources;
    const removed = new Set((policy.removeSources ?? []).map(r => r.name));
    return sources
      .filter(s => !removed.has(s.name))
      .map(s => (policy.replaceUrls?.[s.name] ? { ...s, url: policy.replaceUrls[s.name] } : s));
  }

  /** Reddit archive options from the policy: replace the catalog's Reddit sources for topics with a real-subreddit override. */
  private applyArchivePolicy(
    sources: ContentSource[],
    archive: { subreddit?: string; comments?: boolean; minScore?: number; maxItems?: number } | undefined,
    opts: AggregateOptions,
  ): ContentSource[] {
    if (!archive) return sources;
    const comments = archive.comments && !opts.preview;
    if (archive.subreddit && SUBREDDIT_NAME_RE.test(archive.subreddit)) {
      return [
        ...sources.filter(s => s.type !== 'reddit'),
        {
          type: 'reddit' as const,
          name: `r/${archive.subreddit}`,
          subreddit: archive.subreddit,
          maxItems: archive.maxItems ?? 10,
          archive: { comments, minScore: archive.minScore },
        },
      ];
    }
    return sources.map(s => (s.type === 'reddit' ? { ...s, archive: { comments, minScore: archive.minScore } } : s));
  }

  /** Stories published inside the freshness window; stories without a date count as fresh. */
  private freshCount(stories: AggregatedStory[]): number {
    const cutoff = Date.now() - FRESH_HOURS * 3600_000;
    return stories.filter(s => !s.publishedAt || s.publishedAt.getTime() >= cutoff).length;
  }

  private async lastGoodStories(topicId: string): Promise<AggregatedStory[] | undefined> {
    try {
      const state = await getSourceStateStore().getTopicState(topicId);
      if (!state?.stories?.length || !state.storiesAt) return undefined;
      const ageH = (Date.now() - state.storiesAt.getTime()) / 3600_000;
      return ageH <= sourceCacheStaleHours() ? state.stories : undefined;
    } catch {
      return undefined; // cache unavailable: the topic simply has no content
    }
  }

  private async rememberStories(topicId: string, stories: AggregatedStory[]): Promise<void> {
    try {
      await getSourceStateStore().saveGoodStories(topicId, stories.slice(0, 15), new Date());
    } catch (e) {
      console.warn(`  ⚠️ Could not save last good source text (${e instanceof Error ? e.message : 'error'})`);
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
    // 1. The archive (reddit.com's .rss ends on 2026-11-13). Any error, 429 or empty answer falls through to the feed below.
    if (redditArchiveEnabled()) {
      try {
        return await fetchRedditArchive(source, { maxItems: source.maxItems, minScore: source.archive?.minScore, comments: source.archive?.comments });
      } catch (error) {
        console.warn(`  ⚠️ Reddit archive failed for r/${source.subreddit} (${error instanceof Error ? error.message : error})`);
      }
    }
    // 2. reddit.com itself. A 403/429, an unparseable answer and an EMPTY answer are all failures (so a dead feed never counts as a source).
    if (!redditSourceEnabled()) {
      throw new Error(`No Reddit source available for r/${source.subreddit}`);
    }
    let stories: AggregatedStory[];
    if (redditOAuthEnabled()) {
      try {
        stories = await this.fetchRedditOAuth(source);
        if (stories.length > 0) return stories;
      } catch (error) {
        console.warn(`  ⚠️ Reddit OAuth failed for r/${source.subreddit} (${error instanceof Error ? error.message : error}), using the public feed`);
      }
    }
    stories = await fetchRedditRss(source, redditUserAgent());
    if (stories.length === 0) throw new Error(`Reddit feed for r/${source.subreddit} returned no posts`);
    return stories;
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
