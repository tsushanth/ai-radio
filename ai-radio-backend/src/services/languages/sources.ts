/**
 * Story sources for the additional languages. No Exa, no Reddit, no per-language curation beyond a short feed table:
 *
 *   native topics     publisher RSS (general news topics only) then Google News section feeds for the language's edition
 *                     (https://news.google.com/rss/headlines/section/topic/<SECTION>?hl=..&gl=..&ceid=..), in the local language.
 *   translate topics  (gaming, eli5, simulate-this) and native topics that came back with too few stories: the topic's normal English
 *                     sources (headline preview mode: no Exa, no Reddit replies), retold in the target language by the script prompt.
 *
 * Licensing note: Google News RSS terms are not a commercial licence. Same practice as the English path today (Ask, suggested topics):
 * headlines and outlet names only, paraphrased on air, no quotes (the prompt guardrails enforce that).
 */
import Parser from 'rss-parser';
import { contentAggregator, MIN_STORIES } from '../content/aggregator.service';
import type { AggregatedStory, TopicContent, TopicDefinition } from '../../types/topics';
import { launchTopic, type LanguageSpec } from './registry';

export interface PublisherFeed { name: string; url: string }

/**
 * Publisher feeds checked live on 2026-11-15 (up and fresh). Public broadcasters and wire services preferred. Meduza is deliberately
 * not used for ru. Dead or blocked then: Kathimerini, NDTV Hindi, Telex, Polskie Radio, Agerpres, NHK (stale since August), DW Polish.
 */
export const PUBLISHER_FEEDS: Record<string, PublisherFeed[]> = {
  cs: [{ name: 'CT24', url: 'https://ct24.ceskatelevize.cz/rss/hlavni-zpravy' }, { name: 'iROZHLAS', url: 'https://www.irozhlas.cz/rss/irozhlas' }],
  el: [{ name: 'ERT News', url: 'https://www.ertnews.gr/feed/' }],
  fi: [{ name: 'Yle', url: 'https://feeds.yle.fi/uutiset/v1/majorHeadlines/YLE_UUTISET.rss' }],
  hi: [{ name: 'BBC Hindi', url: 'https://feeds.bbci.co.uk/hindi/rss.xml' }],
  hu: [{ name: 'HVG', url: 'https://hvg.hu/rss' }],
  id: [{ name: 'Antara', url: 'https://www.antaranews.com/rss/terkini.xml' }, { name: 'BBC Indonesia', url: 'https://feeds.bbci.co.uk/indonesia/rss.xml' }],
  nl: [{ name: 'NOS', url: 'https://feeds.nos.nl/nosnieuwsalgemeen' }, { name: 'NU.nl', url: 'https://www.nu.nl/rss/Algemeen' }],
  pl: [{ name: 'TVN24', url: 'https://tvn24.pl/najnowsze.xml' }],
  ro: [{ name: 'Digi24', url: 'https://www.digi24.ro/rss' }],
  ru: [{ name: 'BBC Russian', url: 'https://feeds.bbci.co.uk/russian/rss.xml' }, { name: 'DW Russian', url: 'https://rss.dw.com/rdf/rss-ru-all' }],
  sv: [{ name: 'SVT', url: 'https://www.svt.se/nyheter/rss.xml' }, { name: 'Sveriges Radio', url: 'https://api.sr.se/api/rss/program/83?format=145' }],
  tr: [{ name: 'BBC Turkce', url: 'https://feeds.bbci.co.uk/turkce/rss.xml' }, { name: 'TRT Haber', url: 'https://www.trthaber.com/manset_articles.rss' }],
  uk: [{ name: 'Ukrainska Pravda', url: 'https://www.pravda.com.ua/rss/' }, { name: 'BBC Ukrainian', url: 'https://feeds.bbci.co.uk/ukrainian/rss.xml' }, { name: 'Ukrinform', url: 'https://www.ukrinform.ua/rss/block-lastnews' }],
};

export const GOOGLE_NEWS_SECTIONS = ['WORLD', 'NATION', 'BUSINESS', 'TECHNOLOGY', 'SCIENCE', 'HEALTH', 'ENTERTAINMENT', 'SPORTS'] as const;

export function googleNewsSectionUrl(spec: Pick<LanguageSpec, 'edition'>, section: string): string {
  return `https://news.google.com/rss/headlines/section/topic/${section}?${spec.edition}`;
}

const PER_FEED = 10;
const MAX_STORIES = 12;
const MAX_AGE_HOURS = 72;

export interface SourceDeps {
  /** Returns the feed XML. Default: fetch with a 10 s timeout. */
  fetchXml?: (url: string) => Promise<string>;
  /** The topic's English stories (preview mode: no Exa). */
  englishStories?: (topic: TopicDefinition) => Promise<TopicContent>;
  now?: () => number;
}

const defaultFetchXml = async (url: string): Promise<string> => {
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0 (compatible; AudexaBot/1.0)', Accept: 'application/rss+xml, application/xml, text/xml' }, signal: AbortSignal.timeout(10_000), redirect: 'follow' });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
};

const parser = new Parser();

/** Google News titles end with " - Outlet". */
export function splitGoogleTitle(raw: string): { title: string; source?: string } {
  const i = raw.lastIndexOf(' - ');
  if (i >= 4 && raw.length - i < 60) return { title: raw.slice(0, i).trim(), source: raw.slice(i + 3).trim() };
  return { title: raw.trim() };
}

const stripHtml = (s: string) => s.replace(/<[^>]*>/g, ' ').replace(/&nbsp;|&#160;/g, ' ').replace(/\s+/g, ' ').trim();

async function readFeed(url: string, sourceName: string, google: boolean, deps: SourceDeps): Promise<AggregatedStory[]> {
  const xml = await (deps.fetchXml ?? defaultFetchXml)(url);
  const feed = await parser.parseString(xml);
  const cutoff = (deps.now?.() ?? Date.now()) - MAX_AGE_HOURS * 3600_000;
  const out: AggregatedStory[] = [];
  for (const item of feed.items ?? []) {
    const raw = (item.title ?? '').trim();
    if (!raw) continue;
    const publishedAt = item.isoDate ? new Date(item.isoDate) : undefined;
    if (publishedAt && !Number.isNaN(publishedAt.getTime()) && publishedAt.getTime() < cutoff) continue;
    const t = google ? splitGoogleTitle(raw) : { title: raw, source: undefined };
    const summary = google ? undefined : stripHtml(item.contentSnippet ?? item.content ?? '').slice(0, 300) || undefined;
    out.push({ title: t.title, source: t.source ?? sourceName, sourceType: 'rss', summary, url: item.link, publishedAt: publishedAt && !Number.isNaN(publishedAt.getTime()) ? publishedAt : undefined });
    if (out.length >= PER_FEED) break;
  }
  return out;
}

const norm = (t: string) => t.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export function dedupeAndRank(stories: AggregatedStory[], prefer: string[] = []): AggregatedStory[] {
  const seen = new Set<string>();
  const unique = stories.filter((s) => { const k = norm(s.title).slice(0, 80); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  if (prefer.length === 0) return unique;
  const hit = (s: AggregatedStory) => { const t = ` ${norm(s.title)} `; return prefer.some((p) => t.includes(` ${p.toLowerCase()} `) || t.includes(p.toLowerCase())); };
  return [...unique.filter(hit), ...unique.filter((s) => !hit(s))];
}

export interface LanguageStories {
  stories: AggregatedStory[];
  /** 'native': local-language headlines. 'english': English stories the script must retell in the target language. */
  sourceLanguage: 'native' | 'english';
  /** Where they came from, for logs and tests. */
  via: 'publisher+google' | 'google' | 'english-translate' | 'english-fallback';
  totalSources: number;
  successfulSources: number;
}

export async function fetchLanguageStories(topic: TopicDefinition, spec: LanguageSpec, deps: SourceDeps = {}): Promise<LanguageStories> {
  const lt = launchTopic(topic.id);
  const english = async (via: LanguageStories['via']): Promise<LanguageStories> => {
    const get = deps.englishStories ?? ((t: TopicDefinition) => contentAggregator.aggregateTopicContent(t, { preview: true }));
    const c = await get(topic);
    return { stories: c.stories, sourceLanguage: 'english', via, totalSources: c.totalSources, successfulSources: c.successfulSources };
  };
  if (!lt || lt.mode === 'translate') return english('english-translate');

  const urls: Array<{ url: string; name: string; google: boolean }> = [];
  if (lt.publisherFirst) for (const f of PUBLISHER_FEEDS[spec.code] ?? []) urls.push({ url: f.url, name: f.name, google: false });
  for (const section of lt.sections ?? []) urls.push({ url: googleNewsSectionUrl(spec, section), name: 'Google News', google: true });

  const results = await Promise.allSettled(urls.map((u) => readFeed(u.url, u.name, u.google, deps)));
  const stories: AggregatedStory[] = [];
  let ok = 0;
  results.forEach((r) => { if (r.status === 'fulfilled') { ok++; stories.push(...r.value); } });
  const ranked = dedupeAndRank(stories, lt.prefer).slice(0, MAX_STORIES);
  if (ranked.length >= MIN_STORIES) {
    return { stories: ranked, sourceLanguage: 'native', via: lt.publisherFirst && PUBLISHER_FEEDS[spec.code] ? 'publisher+google' : 'google', totalSources: urls.length, successfulSources: ok };
  }
  console.warn(`[languages] ${spec.code}/${topic.id}: only ${ranked.length} local stories, retelling the English sources`);
  return english('english-fallback');
}
