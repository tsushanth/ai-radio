/**
 * Reddit via the public Atom feeds (https://www.reddit.com/r/<sub>/top/.rss?t=day).
 *
 * Why this exists: Reddit's edge answers "You've been blocked by network security" (HTTP 403, HTML body)
 * for the .json endpoints from any client without a browser session and for oauth.reddit.com from
 * datacenter addresses, even with a valid app-only token. The Atom feeds are still served, but with a
 * very small unauthenticated budget (about one request per rate window, reported in x-ratelimit-* headers),
 * so every request goes through one global gate that honours those headers, results are cached, and a
 * block or an exhausted window fails fast so the caller can fall back to other sources.
 */

import Parser from 'rss-parser';
import type { AggregatedStory, ContentSource } from '../../types/topics';

export class RedditRssError extends Error {
  constructor(message: string, readonly kind: 'blocked' | 'rate_limited' | 'http' | 'network' | 'invalid') {
    super(message);
    this.name = 'RedditRssError';
  }
}

const parser = new Parser({ timeout: 10000 });

const SUBREDDIT_RE = /^[A-Za-z0-9_]{1,40}(\+[A-Za-z0-9_]{1,40}){0,9}$/;

const num = (name: string, fallback: number): number => {
  const v = Number(process.env[name]);
  return Number.isFinite(v) && v >= 0 && process.env[name] !== undefined && process.env[name] !== '' ? v : fallback;
};

/** Max time one call will wait for the rate window to reopen before giving up (so topic generation never stalls). */
const maxWaitMs = () => num('REDDIT_RSS_MAX_WAIT_MS', 60_000);
/** A fresh cache entry is served without any request. */
const cacheTtlMs = () => num('REDDIT_RSS_CACHE_TTL_MS', 30 * 60_000);
/** A stale cache entry is still served when Reddit refuses us (topics are daily, day-old posts beat nothing). */
const staleMaxMs = () => num('REDDIT_RSS_STALE_MS', 24 * 60 * 60_000);
/** After a block (403) stop sending requests for this long. */
const blockBackoffMs = () => num('REDDIT_RSS_BLOCK_BACKOFF_MS', 15 * 60_000);

export interface RedditRssDeps {
  fetchFn?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

interface CacheEntry { at: number; stories: AggregatedStory[] }

const cache = new Map<string, CacheEntry>();
let nextAllowedAt = 0;
let blockedUntil = 0;
let queue: Promise<unknown> = Promise.resolve();

/** Test hook: forget cache, rate window and block state. */
export function resetRedditRssState(): void {
  cache.clear();
  nextAllowedAt = 0;
  blockedUntil = 0;
  queue = Promise.resolve();
}

export function redditRssUrl(subreddit: string, period: 'day' | 'week' = 'day', limit = 25): string {
  return `https://www.reddit.com/r/${subreddit}/top/.rss?t=${period}&limit=${limit}`;
}

function htmlToText(html: string): string {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#32;/g, ' ')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

/** Parse a Reddit Atom feed into stories. Link posts point at the external article, text posts at the thread. */
export async function parseRedditAtom(xml: string, sourceName: string, maxItems: number): Promise<AggregatedStory[]> {
  const feed = await parser.parseString(xml);
  const stories: AggregatedStory[] = [];
  for (const item of feed.items) {
    if (!item.title) continue;
    const html = item.content || '';
    const threadUrl = item.link;
    // The "[link]" anchor holds the submitted URL; for text posts it equals the thread URL.
    const m = html.match(/<a href="([^"]+)">\[link\]<\/a>/);
    const submitted = m ? m[1].replace(/&amp;/g, '&') : undefined;
    const isExternal = !!submitted && !/^https?:\/\/(www\.|old\.)?reddit\.com\//i.test(submitted);
    // Text of a self post lives in the "md" div; link posts only carry the "submitted by" footer.
    const md = html.match(/<div class="md">([\s\S]*?)<\/div>\s*<!-- SC_ON -->/);
    const summary = md ? htmlToText(md[1]).substring(0, 300) : undefined;
    stories.push({
      title: item.title,
      source: sourceName,
      sourceType: 'reddit' as const,
      summary: summary || undefined,
      url: isExternal ? submitted : threadUrl,
      publishedAt: item.isoDate ? new Date(item.isoDate) : undefined,
      author: item.author?.replace(/^\/u\//, ''),
    });
    if (stories.length >= maxItems) break;
  }
  return stories;
}

/** Serialise callers so concurrent topic generations cannot burst past the rate window. */
function inQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

function readWindow(res: Response, now: number): number {
  const remaining = Number(res.headers.get('x-ratelimit-remaining'));
  const reset = Number(res.headers.get('x-ratelimit-reset'));
  const retryAfter = Number(res.headers.get('retry-after'));
  if (res.status === 429) {
    const s = Number.isFinite(retryAfter) && retryAfter > 0 ? retryAfter : Number.isFinite(reset) && reset > 0 ? reset : 60;
    return now + s * 1000 + 500;
  }
  if (Number.isFinite(remaining) && remaining < 1 && Number.isFinite(reset) && reset > 0) return now + reset * 1000 + 500;
  return now;
}

/**
 * Fetch top posts of the last day for a subreddit from its Atom feed.
 * Throws RedditRssError when Reddit blocks or throttles us and no cached copy (fresh or stale) exists.
 */
export async function fetchRedditRss(
  source: Pick<ContentSource, 'name' | 'subreddit' | 'maxItems'>,
  userAgent: string,
  deps: RedditRssDeps = {},
): Promise<AggregatedStory[]> {
  const sub = source.subreddit?.trim();
  if (!sub || !SUBREDDIT_RE.test(sub)) throw new RedditRssError(`Invalid subreddit "${source.subreddit}"`, 'invalid');
  const maxItems = source.maxItems || 10;
  const fetchFn = deps.fetchFn ?? fetch;
  const now = deps.now ?? Date.now;
  const sleep = deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms)));
  const key = sub.toLowerCase();

  const cached = () => cache.get(key);
  const asSource = (stories: AggregatedStory[]) => stories.slice(0, maxItems).map(s => ({ ...s, source: source.name }));

  const hit = cached();
  if (hit && now() - hit.at < cacheTtlMs()) return asSource(hit.stories);

  const serveStaleOr = (err: RedditRssError): AggregatedStory[] => {
    const stale = cached();
    if (stale && now() - stale.at < staleMaxMs()) {
      console.warn(`  ⚠️ Reddit r/${sub}: ${err.message}; serving cached copy from ${Math.round((now() - stale.at) / 60000)} min ago`);
      return asSource(stale.stories);
    }
    throw err;
  };

  return inQueue(async () => {
    // Another caller may have filled the cache while we waited in the queue.
    const again = cached();
    if (again && now() - again.at < cacheTtlMs()) return asSource(again.stories);

    for (let attempt = 0; attempt < 2; attempt++) {
      if (now() < blockedUntil) {
        return serveStaleOr(new RedditRssError('Reddit is blocking this server (backing off)', 'blocked'));
      }
      const wait = nextAllowedAt - now();
      if (wait > maxWaitMs()) {
        return serveStaleOr(new RedditRssError(`Reddit rate window closed for ${Math.ceil(wait / 1000)}s`, 'rate_limited'));
      }
      if (wait > 0) await sleep(wait);

      let res: Response;
      try {
        res = await fetchFn(redditRssUrl(sub), {
          headers: { 'User-Agent': userAgent, 'Accept': 'application/atom+xml, application/xml;q=0.9, */*;q=0.1' },
          signal: AbortSignal.timeout(10000),
        });
      } catch (e) {
        return serveStaleOr(new RedditRssError(`Reddit feed request failed: ${e instanceof Error ? e.message : e}`, 'network'));
      }

      nextAllowedAt = Math.max(nextAllowedAt, readWindow(res, now()));

      if (res.status === 403) {
        blockedUntil = now() + blockBackoffMs();
        return serveStaleOr(new RedditRssError('Reddit feed error: 403 (blocked by network security)', 'blocked'));
      }
      if (res.status === 429) {
        if (attempt === 0) continue; // the gate now knows the reset time; retry once if it fits in maxWait
        return serveStaleOr(new RedditRssError('Reddit feed error: 429', 'rate_limited'));
      }
      if (!res.ok) return serveStaleOr(new RedditRssError(`Reddit feed error: ${res.status}`, 'http'));

      let stories: AggregatedStory[];
      try {
        stories = await parseRedditAtom(await res.text(), source.name, 25);
      } catch (e) {
        return serveStaleOr(new RedditRssError(`Reddit feed was not valid Atom: ${e instanceof Error ? e.message : e}`, 'invalid'));
      }
      cache.set(key, { at: now(), stories });
      return asSource(stories);
    }
    return serveStaleOr(new RedditRssError('Reddit feed error: 429', 'rate_limited'));
  });
}
