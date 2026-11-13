/**
 * Reddit content from the Arctic Shift public archive (https://github.com/ArthurHeitmann/arctic_shift/blob/master/api/README.md),
 * replacing reddit.com's .rss feeds, which Reddit ends on 2026-11-13.
 *
 * It is a community-run service with no uptime guarantee, so: one global queue with at least 2 s between requests (ARCHIVE_MIN_GAP_MS),
 * a per-subreddit per-day cache, a 15 s timeout, one gentle retry of the archive's "422 Timeout. Maybe slow down a bit", and every other
 * error, 429, odd body or empty answer is a failure the caller falls through on (a failed subreddit is also remembered for 30 minutes
 * so a batch of topics does not hammer a service that just refused us).
 *
 * Request: GET {base}/api/posts/search?subreddit=<sub>&after=<epoch>&before=<epoch>&limit=100&sort=desc&fields=...
 * Fields requested are an explicit allowlist. `author` is never requested, so no username can reach a prompt or the database.
 * (`permalink`, which the API rejects as a field, is rebuilt from the post id.)
 * Comments (only for discussion-style topics): GET {base}/api/comments/search?link_id=<post id>&limit=100&fields=body,score,parent_id
 */

import type { AggregatedStory } from '../../types/topics';

export const ARCHIVE_BASE = 'https://arctic-shift.photon-reddit.com';
export const ARCHIVE_TIMEOUT_MS = 15_000;
const SUBREDDIT_RE = /^[A-Za-z0-9_]{1,40}$/;
const POST_FIELDS = 'id,title,selftext,score,num_comments,created_utc,over_18';
const COMMENT_FIELDS = 'body,score,parent_id';

export class ArchiveError extends Error {
  constructor(message: string, readonly kind: 'invalid' | 'rate_limited' | 'http' | 'network' | 'empty' | 'backoff' | 'timeout') {
    super(message);
    this.name = 'ArchiveError';
  }
}

const num = (name: string, fallback: number, env: NodeJS.ProcessEnv): number => {
  const raw = env[name];
  const v = Number(raw);
  return raw !== undefined && raw !== '' && Number.isFinite(v) && v >= 0 ? v : fallback;
};

export interface ArchiveOptions {
  maxItems?: number;
  /** Posts below this score are ignored (posts only minutes old show score 1). Default 5. */
  minScore?: number;
  /** Fetch top replies for the best posts (discussion-style topics only). */
  comments?: boolean;
}

export interface ArchiveDeps {
  fetchFn?: typeof fetch;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  env?: NodeJS.ProcessEnv;
}

interface ArchivePost { id?: string; title?: string; selftext?: string; score?: number; num_comments?: number; created_utc?: number; over_18?: boolean }
interface ArchiveComment { body?: string; score?: number; parent_id?: string }

const dayKey = (ms: number): string => new Date(ms).toISOString().slice(0, 10);
const cache = new Map<string, { day: string; posts: ArchivePost[] }>();
const failedUntil = new Map<string, number>();
let nextRequestAt = 0;
let queue: Promise<unknown> = Promise.resolve();

/** Test hook. */
export function resetArchiveState(): void {
  cache.clear();
  failedUntil.clear();
  nextRequestAt = 0;
  queue = Promise.resolve();
}

function inQueue<T>(task: () => Promise<T>): Promise<T> {
  const run = queue.then(task, task);
  queue = run.catch(() => undefined);
  return run;
}

type Resolved = Required<Pick<ArchiveDeps, 'fetchFn' | 'now' | 'sleep'>> & { env: NodeJS.ProcessEnv };
const resolve = (deps: ArchiveDeps): Resolved => ({
  fetchFn: deps.fetchFn ?? fetch,
  now: deps.now ?? Date.now,
  sleep: deps.sleep ?? ((ms: number) => new Promise<void>(r => setTimeout(r, ms))),
  env: deps.env ?? process.env,
});

/** One request through the global gate: serialised, spaced at least ARCHIVE_MIN_GAP_MS (default 2000) after the previous one. */
async function gatedGet(url: string, d: Resolved): Promise<unknown> {
  return inQueue(async () => {
    const gap = num('ARCHIVE_MIN_GAP_MS', 2000, d.env);
    const wait = nextRequestAt - d.now();
    if (wait > 0) await d.sleep(wait);
    nextRequestAt = d.now() + gap;
    let res: Response;
    try {
      res = await d.fetchFn(url, {
        headers: { Accept: 'application/json', 'User-Agent': d.env.ARCHIVE_USER_AGENT?.trim() || 'Audexa/1.0 (podcast source; contact via audexa.app)' },
        signal: AbortSignal.timeout(ARCHIVE_TIMEOUT_MS),
      });
    } catch (e) {
      throw new ArchiveError(`Archive request failed (${e instanceof Error ? e.name : 'Error'})`, 'network');
    }
    if (res.status === 429) {
      const reset = Number(res.headers.get('retry-after') ?? res.headers.get('x-ratelimit-reset'));
      nextRequestAt = Math.max(nextRequestAt, d.now() + (Number.isFinite(reset) && reset > 0 ? reset * 1000 : 60_000));
      throw new ArchiveError('Archive rate limit (429)', 'rate_limited');
    }
    // 422 "Timeout. Maybe slow down a bit" is how the archive reports a busy moment (seen live on large subreddits).
    if (res.status === 422) throw new ArchiveError('Archive timeout (422)', 'timeout');
    if (!res.ok) throw new ArchiveError(`Archive error (${res.status})`, 'http');
    try { return await res.json(); } catch { throw new ArchiveError('Archive answer is not JSON', 'http'); }
  });
}

export function archivePostsUrl(sub: string, nowMs: number, hours = 48): string {
  const before = Math.floor(nowMs / 1000);
  const after = before - hours * 3600;
  return `${ARCHIVE_BASE}/api/posts/search?subreddit=${sub}&after=${after}&before=${before}&limit=100&sort=desc&fields=${POST_FIELDS}`;
}

export function archiveCommentsUrl(postId: string): string {
  return `${ARCHIVE_BASE}/api/comments/search?link_id=${postId}&limit=100&fields=${COMMENT_FIELDS}`;
}

const REMOVED = /^\[(removed|deleted)\]$/i;
const clean = (s: string | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** Posts of the last 48 h for a subreddit, cached for the UTC day. Throws ArchiveError on any failure or an empty answer. */
async function postsFor(sub: string, d: Resolved): Promise<ArchivePost[]> {
  const key = sub.toLowerCase();
  const now = d.now();
  const hit = cache.get(key);
  if (hit && hit.day === dayKey(now)) return hit.posts;
  if ((failedUntil.get(key) ?? 0) > now) throw new ArchiveError(`Archive recently failed for r/${sub} (backing off)`, 'backoff');
  try {
    let json: { data?: unknown };
    try {
      json = (await gatedGet(archivePostsUrl(sub, now), d)) as { data?: unknown };
    } catch (e) {
      if (!(e instanceof ArchiveError) || e.kind !== 'timeout') throw e;
      await d.sleep(3000); // one gentle retry when the archive was only momentarily busy
      json = (await gatedGet(archivePostsUrl(sub, d.now()), d)) as { data?: unknown };
    }
    if (!Array.isArray(json?.data)) throw new ArchiveError('Archive answer has no data array', 'http');
    if (json.data.length === 0) throw new ArchiveError(`Archive returned no posts for r/${sub}`, 'empty');
    cache.set(key, { day: dayKey(now), posts: json.data as ArchivePost[] });
    return json.data as ArchivePost[];
  } catch (e) {
    failedUntil.set(key, now + 30 * 60_000);
    throw e;
  }
}

async function topComments(postId: string, d: Resolved): Promise<string[]> {
  try {
    const json = (await gatedGet(archiveCommentsUrl(postId), d)) as { data?: ArchiveComment[] };
    if (!Array.isArray(json?.data)) return [];
    return json.data
      .filter(c => typeof c.body === 'string' && !REMOVED.test(c.body.trim()) && c.parent_id === `t3_${postId}`)
      .map(c => ({ text: clean(c.body), score: c.score ?? 0 }))
      .filter(c => c.text.length >= 40 && c.text.length <= 1200 && !/https?:\/\//i.test(c.text))
      // Fresh comments all show score 1 (the archive snapshots them minutes after posting), so ties go to the longer, more substantive reply.
      .sort((a, b) => b.score - a.score || b.text.length - a.text.length)
      .slice(0, 3)
      .map(c => c.text.slice(0, 300));
  } catch {
    return []; // comments are an extra: the post alone is still a usable story
  }
}

/**
 * Top posts of the last 48 h for r/<subreddit>, ranked by score, as stories attributed as "discussion on r/<sub>".
 * Throws ArchiveError when the archive fails, returns nothing, or no post clears the score floor.
 */
export async function fetchRedditArchive(
  source: { name?: string; subreddit?: string; maxItems?: number },
  opts: ArchiveOptions = {},
  deps: ArchiveDeps = {},
): Promise<AggregatedStory[]> {
  const sub = source.subreddit?.trim().replace(/^r\//i, '');
  if (!sub || !SUBREDDIT_RE.test(sub)) throw new ArchiveError(`Invalid subreddit "${source.subreddit}"`, 'invalid');
  const maxItems = opts.maxItems ?? source.maxItems ?? 10;
  const minScore = opts.minScore ?? 5;
  const d = resolve(deps);

  const posts = await postsFor(sub, d);
  const ranked = posts
    .filter(p => p.id && p.title && !p.over_18 && (p.score ?? 0) >= minScore)
    .filter(p => !REMOVED.test(clean(p.title)))
    .sort((a, b) => (b.score ?? 0) - (a.score ?? 0))
    .slice(0, maxItems);
  if (ranked.length === 0) throw new ArchiveError(`No posts in r/${sub} reached score ${minScore}`, 'empty');

  const stories: AggregatedStory[] = [];
  for (let i = 0; i < ranked.length; i++) {
    const p = ranked[i];
    const body = REMOVED.test(clean(p.selftext)) ? '' : clean(p.selftext);
    let excerpt = body.slice(0, 600);
    if (opts.comments && i < 3) {
      const comments = await topComments(p.id as string, d);
      if (comments.length) excerpt = `${excerpt}${excerpt ? ' ' : ''}Top replies: ${comments.map((c, n) => `(${n + 1}) ${c}`).join(' ')}`;
    }
    stories.push({
      title: clean(p.title),
      source: `discussion on r/${sub}`,
      sourceType: 'reddit',
      summary: body.slice(0, 300) || undefined,
      excerpt: excerpt || undefined,
      url: `https://www.reddit.com/r/${sub}/comments/${p.id}/`,
      score: p.score,
      commentCount: p.num_comments,
      publishedAt: typeof p.created_utc === 'number' ? new Date(p.created_utc * 1000) : undefined,
      // author: deliberately never requested or stored
    });
  }
  return stories;
}
