/**
 * Turns raw Exa results into script-ready stories and drops what the bake-off found unusable:
 * hub/index/live-blog pages (short text), future-dated results (Exa publishedDate can be wrong), undated results, syndicated
 * duplicates and reposts, non-English pages, and personal/social pages (LinkedIn etc.).
 */
import type { AggregatedStory } from '../../types/topics';
import type { ExaResult } from './exa.client';

export const MIN_BODY_CHARS = 400;
export const MIN_USABLE_RESULTS = 3;
export const MAX_EXCERPT_CHARS = 1500;
/** Exa dates more than this far in the future are treated as wrong. */
export const FUTURE_SLACK_MS = 60 * 60 * 1000;

/** Social / personal-content hosts: never used as a news source. */
const BLOCKED_DOMAINS = ['linkedin.com', 'reddit.com', 'facebook.com', 'instagram.com', 'x.com', 'twitter.com', 'tiktok.com', 'youtube.com', 'quora.com'];
/** Aggregators and repost sites that copy other outlets' articles. */
const SYNDICATOR_DOMAINS = ['devdiscourse.com', 'newsbreak.com', 'msn.com', 'dailyhunt.in', 'flipboard.com', 'ground.news', 'smartnews.com', 'newsnow.co.uk'];
const HUB_LAST_SEGMENTS = /^(news|latest|latest-news|headlines|home|index|live|topics?|category|tag|tags|archive|section|sports?|world|business|politics|technology|tech|science|transactions)$/i;

const OUTLET_NAMES: Record<string, string> = {
  'cnbc.com': 'CNBC', 'bbc.com': 'the BBC', 'bbc.co.uk': 'the BBC', 'nytimes.com': 'The New York Times', 'washingtonpost.com': 'The Washington Post',
  'apnews.com': 'the Associated Press', 'reuters.com': 'Reuters', 'cnn.com': 'CNN', 'nbcnews.com': 'NBC News', 'pbs.org': 'PBS', 'npr.org': 'NPR',
  'politico.com': 'Politico', 'thehill.com': 'The Hill', 'techcrunch.com': 'TechCrunch', 'theverge.com': 'The Verge', 'wired.com': 'Wired',
  'arstechnica.com': 'Ars Technica', 'fortune.com': 'Fortune', 'businessinsider.com': 'Business Insider', 'bloomberg.com': 'Bloomberg',
  'wsj.com': 'The Wall Street Journal', 'ft.com': 'the Financial Times', 'espncricinfo.com': 'ESPNcricinfo', 'cricbuzz.com': 'Cricbuzz',
  'hindustantimes.com': 'Hindustan Times', 'space.com': 'Space.com', 'venturebeat.com': 'VentureBeat', 'yahoo.com': 'Yahoo', 'finance.yahoo.com': 'Yahoo Finance',
  'aljazeera.com': 'Al Jazeera', 'theguardian.com': 'The Guardian', 'axios.com': 'Axios', 'cbsnews.com': 'CBS News', 'abcnews.go.com': 'ABC News',
};

export function hostOf(url: string): string | undefined {
  try {
    const u = new URL(url);
    if (u.protocol !== 'https:' && u.protocol !== 'http:') return undefined;
    return u.hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return undefined;
  }
}

const inDomains = (host: string, list: string[]): boolean => list.some(d => host === d || host.endsWith(`.${d}`));

/** Outlet name to say on air: a known outlet name, else the site's main label capitalised (nzc.nz -> Nzc). */
export function outletName(url: string): string {
  const host = hostOf(url);
  if (!host) return 'the web';
  const exact = OUTLET_NAMES[host];
  if (exact) return exact;
  for (const [d, n] of Object.entries(OUTLET_NAMES)) if (host.endsWith(`.${d}`)) return n;
  const labels = host.split('.');
  const main = labels.length >= 3 && labels[labels.length - 2].length <= 3 ? labels[labels.length - 3] : labels[Math.max(0, labels.length - 2)];
  return main.charAt(0).toUpperCase() + main.slice(1);
}

function isHubUrl(url: string): boolean {
  try {
    const segs = new URL(url).pathname.split('/').filter(Boolean);
    if (segs.length === 0) return true;
    // One short word-only segment (/space, /markets) is a section page; real articles carry a date, an id or a long slug.
    if (segs.length === 1 && segs[0].length <= 20 && !/\d/.test(segs[0])) return true;
    return segs.length <= 2 && HUB_LAST_SEGMENTS.test(segs[segs.length - 1]);
  } catch {
    return true;
  }
}

function mostlyLatin(text: string): boolean {
  const sample = text.slice(0, 400);
  let letters = 0, foreign = 0;
  for (const ch of sample) {
    const c = ch.codePointAt(0) as number;
    if (/\p{L}/u.test(ch)) { letters++; if (c > 0x024f) foreign++; }
  }
  return letters === 0 || foreign / letters < 0.2;
}

const normText = (s: string): string => s.toLowerCase().replace(/[^\p{L}\p{N}\s]/gu, '').replace(/\s+/g, ' ').trim();

export interface FilterOptions {
  now: Date;
  /** Oldest acceptable publish time. */
  since: Date;
  max?: number;
}

export interface FilterOutcome {
  stories: AggregatedStory[];
  dropped: Record<string, number>;
}

export function filterExaResults(results: ExaResult[], opts: FilterOptions): FilterOutcome {
  const dropped: Record<string, number> = {};
  const drop = (why: string) => { dropped[why] = (dropped[why] ?? 0) + 1; };
  const stories: AggregatedStory[] = [];
  const seenTitle = new Set<string>();
  const seenBody = new Set<string>();
  const latest = opts.now.getTime() + FUTURE_SLACK_MS;

  for (const r of results) {
    const url = typeof r.url === 'string' ? r.url : '';
    const host = hostOf(url);
    const title = (r.title ?? '').replace(/\s+/g, ' ').trim();
    if (!host || !title) { drop('invalid'); continue; }
    if (inDomains(host, BLOCKED_DOMAINS)) { drop('blocked_domain'); continue; }
    if (inDomains(host, SYNDICATOR_DOMAINS)) { drop('syndicator'); continue; }

    const ts = r.publishedDate ? Date.parse(r.publishedDate) : NaN;
    if (!Number.isFinite(ts)) { drop('undated'); continue; }
    if (ts > latest) { drop('future_dated'); continue; }
    if (ts < opts.since.getTime()) { drop('outside_window'); continue; }

    const raw = (r.text && r.text.trim()) || (r.highlights ?? []).join(' ');
    const body = raw.replace(/\s+/g, ' ').trim();
    if (body.length < MIN_BODY_CHARS || isHubUrl(url)) { drop('hub_or_short'); continue; }
    if (!mostlyLatin(body)) { drop('non_english'); continue; }

    const tKey = normText(title).slice(0, 60);
    const bKey = normText(body).slice(0, 120);
    if (seenTitle.has(tKey) || seenBody.has(bKey)) { drop('duplicate'); continue; }
    seenTitle.add(tKey); seenBody.add(bKey);

    const excerpt = body.slice(0, MAX_EXCERPT_CHARS);
    stories.push({
      title,
      source: outletName(url),
      sourceType: 'web',
      summary: excerpt.slice(0, 300),
      excerpt,
      url,
      publishedAt: new Date(ts),
      // No author: bylines and handles are personal details we do not carry into scripts.
    });
    if (opts.max && stories.length >= opts.max) break;
  }
  return { stories, dropped };
}
