/**
 * Per-topic source policy for the podcast pipeline.
 *
 * Why: Reddit ends RSS support on 2026-11-13, and 46 of the 54 English daily topics list a Reddit source. The live topic catalog lives in
 * the Supabase `topics` table (not touched by this change), so per-topic decisions are kept in code, keyed by topic id.
 *
 * Chain per topic (see aggregator.service.ts), the same shape as the radio (audexa-radio, PR #56):
 *   1. The topic's own sources: RSS and HackerNews as listed in the catalog, and each Reddit source read from the Arctic Shift archive
 *      first (SOURCE_REDDIT_ARCHIVE_ENABLED, default on), then reddit.com's .rss (SOURCE_REDDIT_RSS_ENABLED, default on, dies
 *      2026-11-13). Then the Google News / HackerNews keyword fallbacks when nothing came back.
 *   2. Exa `lite` news search, only for topics with an `exa` entry here AND SOURCE_EXA_ENABLED on (default off) and the daily budget
 *      allowing it. `position: 'first'` runs it before step 1; 'fallback' only when step 1 left the topic with fewer than MIN_STORIES
 *      fresh stories.
 *   3. The last good feed stories for the topic (SOURCE_CACHE_ENABLED, never Exa text).
 *
 * `disabled` topics are hidden from the topic list and skipped by the daily batch (SOURCE_POLICY_DISABLE=0 switches that off).
 * Topics without an entry (user-suggested topics) never use Exa. The full table with reasons is docs/podcast-sources-exa-fallback.md.
 */
import { policyDisablingEnabled } from './source-flags';

export interface ExaTopicConfig {
  /** Natural-language query sent to Exa (the quickstart recommends full sentences naming the subject and source type). */
  query: string;
  /** Exa category. Omit for topics where `news` would exclude the best sources. */
  category?: 'news';
  /** Only results published in the last N hours. Default 48; a slow topic may widen to 168 (7 days). */
  windowHours?: number;
  /** "first": before the feed sources. "fallback": only after the feeds left the topic thin. */
  position: 'first' | 'fallback';
}

/**
 * Reddit archive settings for a topic. `subreddit` replaces ALL of the catalog's own Reddit sources of that topic (for show topics the
 * catalog name is the topic id, which Reddit cannot have because of the hyphens), so the show reads its real community.
 */
export interface ArchiveTopicConfig {
  subreddit?: string;
  /** Also fetch the top replies of the best 3 posts (discussion-style shows). */
  comments?: boolean;
  minScore?: number;
  maxItems?: number;
}

export type SourceGroup = 'exa' | 'feeds' | 'show' | 'disabled' | 'unchanged';

export interface TopicSourcePolicy {
  group: SourceGroup;
  /** Present only for topics on the Exa chain. */
  exa?: ExaTopicConfig;
  /** Present only for show topics that read a real subreddit through the archive. */
  archive?: ArchiveTopicConfig;
  /** Present when the topic is switched off: why, and what would bring it back. */
  disabled?: string;
  /** Reason for the choice, shown in the docs table. */
  reason: string;
  /** What the catalog's own Reddit sources look like: 'none', 'ok' (valid subreddit name) or 'invalid' (never reached Reddit). */
  reddit: 'none' | 'ok' | 'invalid';
}

const feeds = (reason: string): TopicSourcePolicy => ({ group: 'feeds', reason, reddit: 'ok' });
const archived = (archive: ArchiveTopicConfig, reason: string, reddit: 'ok' | 'invalid' = 'invalid'): TopicSourcePolicy => ({ group: 'show', archive, reason, reddit });
const show = (reason: string): TopicSourcePolicy => ({ group: 'show', reason, reddit: 'invalid' });
const off = (disabled: string): TopicSourcePolicy => ({ group: 'disabled', disabled, reason: disabled, reddit: 'invalid' });
const unchanged = (reason: string): TopicSourcePolicy => ({ group: 'unchanged', reddit: 'none', reason });

export const TOPIC_SOURCE_POLICY: Record<string, TopicSourcePolicy> = {
  // --- Exa news ---
  'us-politics': {
    group: 'exa', reddit: 'ok',
    exa: { query: 'US politics news: Congress, White House, Senate, elections, legislation', category: 'news', position: 'first' },
    reason: 'Bake-off verdict better: the catalog source list is half broken (Politico 403, Aaj Tak 404, Indian/Hindi sources and r/IndianPolitics in a US topic). Exa returns AP, CNN, NBC, PBS, Politico, The Hill. First, so the broken list is only the fallback. The catalog row needs a data fix (not touched).',
  },
  'cricket-updates': {
    group: 'exa', reddit: 'none',
    exa: { query: 'cricket news: match results, series updates, player news', category: 'news', position: 'first' },
    reason: 'Bake-off verdict equal with richer text (Cricbuzz feed is 404, Cricinfo RSS stays as the fallback). Not Reddit-fed.',
  },
  'ai-ml': {
    group: 'exa', reddit: 'ok',
    exa: { query: 'latest news in AI and machine learning: new models, research results, open-source LLM releases', category: 'news', position: 'fallback' },
    reason: 'Replaces r/MachineLearning and r/LocalLLaMA (now read from the archive). Bake-off: 8 domains, 50% inside 24h. Exa only when feeds are thin.',
  },
  'startups-vc': {
    group: 'exa', reddit: 'ok',
    exa: { query: 'startup news: funding rounds, venture capital, founder stories, acquisitions', category: 'news', position: 'fallback' },
    reason: 'Bake-off verdict better: TechCrunch RSS gave 4 items in 48h, Exa 8 from 8 outlets. r/startups now read from the archive. Exa when feeds are thin.',
  },

  // --- Reddit-fed, kept on feeds + the archive (no Exa) ---
  'coding-dev': feeds('Bake-off: equal; HN, Dev.to and InfoQ are fresh and Exa returns small low-authority blogs. r/programming now read from the archive.'),
  'markets-finance': feeds('Bake-off: equal; CNBC and MarketWatch RSS are fully fresh (Yahoo Finance feed is 404, harmless). r/investing now from the archive.'),
  'space-nasa': feeds('Bake-off: Exa worse (2-3 domains); NASA and Space.com RSS are fresh. r/space now read from the archive.'),
  'gaming': feeds('Bake-off: Exa worse/equal; IGN and Kotaku RSS 20/20 fresh. r/Games now read from the archive.'),
  'science-discoveries': feeds('Not in the bake-off; Science Daily, Phys.org and HN RSS plus r/science from the archive.'),
  'health-wellness': feeds('Not in the bake-off; Medical News Today, NIH and HN RSS plus r/health from the archive (archive timed out once in testing).'),
  'crypto-blockchain': feeds('Not in the bake-off; CoinDesk, Cointelegraph and The Block RSS plus r/cryptocurrency from the archive.'),
  'daily-news': feeds('Not in the bake-off; BBC, NPR, CBS and German local RSS plus r/berlin from the archive.'),
  'tech-news': feeds('Not in the bake-off; HN, TechCrunch and The Verge plus r/technology from the archive. (Catalog also lists four sports feeds here: a data fix, not touched.)'),
  'f1-racing': feeds('Not in the bake-off; BBC Sport F1 and Auto Motor und Sport RSS plus r/f1 from the archive (archive timed out in testing).'),
  'nba-basketball': feeds('Not in the bake-off; Bleacher Report RSS and HN plus r/nba from the archive. (Catalog Twitter v1.1 source is dead: a data fix, not touched.)'),

  // --- Not Reddit-fed: unchanged ---
  'world-update': unchanged('Bake-off control: Al Jazeera, NPR, BBC RSS fully fresh. No change.'),
  'sports-roundup': unchanged('Bake-off control: ESPN/CBS/Yahoo RSS 36-50 fresh items; Exa returned hub pages. No change.'),
  'anime-manga': unchanged('RSS only, no Reddit. No change.'),
  'ai-artificial-intelligence': unchanged('RSS/HN only, no Reddit. No change.'),
  'european-news': unchanged('User-suggested topic on the Google News RSS fallback, no Reddit. No change (Exa would fit it better; later decision).'),
  'a24-studio': unchanged('User-suggested topic on the Google News RSS fallback, no Reddit. No change.'),
  'urban-beekeeping-for-beginners': unchanged('User-suggested topic on the Google News RSS fallback, no Reddit. No change.'),

  // --- Show topics. The catalog names a "subreddit" equal to the topic id. Reddit names cannot contain hyphens, so 31 of the 32 never
  //     reached Reddit (the archive returns 0 posts for them, checked live 2026-11-13) and ran on the HN keyword fallback; r/eli5 has a
  //     valid name but also returns 0 posts. Where a clearly matching real community exists and the archive returned live data, the
  //     topic reads it (explicit here, never silent). The others are disabled with the reason, or left as they are for an owner decision. ---
  'eli5': archived({ subreddit: 'explainlikeimfive', comments: true, minScore: 20 }, 'Real community is r/explainlikeimfive (live: 100 posts in 48 h, top 1663); r/eli5 returns 0 posts in the archive and 403 on reddit.com. Top replies included.', 'ok'),
  'tifu-radio': archived({ subreddit: 'tifu', minScore: 20 }, 'Real community is r/tifu (live: 22 posts in 48 h, top 3699). The show retells these stories; scripts must not carry usernames or personal details.'),
  'life-hacks': archived({ subreddit: 'LifeProTips', comments: true, minScore: 20 }, 'Real community is r/LifeProTips (live: 27 posts, top 1635). Replies help the "genius or wreck" verdict.'),
  'would-you-rather': archived({ subreddit: 'wouldyourather', comments: true, minScore: 10 }, 'Real community is r/wouldyourather (live: 87 posts, top 384). Replies carry the two sides.'),
  'plot-twist': archived({ subreddit: 'WritingPrompts', minScore: 20 }, 'Real community is r/WritingPrompts (live: 100 posts, top 979); prompts only, no replies.'),
  'future-shock': archived({ subreddit: 'Futurology', minScore: 50 }, 'Real community is r/Futurology (live: 29 posts, top 11903).'),
  'now-streaming': archived({ subreddit: 'movies', minScore: 100 }, 'Real community is r/movies (live: 100 posts, top 6203).'),
  'open-source-spotlight': archived({ subreddit: 'opensource', minScore: 10 }, 'Real community is r/opensource (live: 100 posts, top 143).'),
  'climate-watch': archived({ subreddit: 'climate', minScore: 50 }, 'Real community is r/climate (live: 79 posts in 48 h, top 1964; one request timed out in testing, so it can fail soft).'),

  // Owner decision: viable on a real subreddit (live data) but not enabled, so the topic keeps running as today (HN keyword fallback).
  'simulate-this': show('News-premised show ("historical figures react to today\'s news"), the most-played topic (27 plays in 7 days). r/worldnews headlines would fit (live: 100 posts, top 4532). NOT enabled: owner decision. Left as is.'),
  'dead-founders-club': show('News-premised show ("react to headlines"): r/technology or r/worldnews headlines would fit (live data). NOT enabled: owner decision. Left as is.'),
  'crypto-corner': show('Viable: r/CryptoCurrency (live: 100 posts, top 355), overlaps the crypto-blockchain topic. NOT enabled: owner decision. Left as is.'),
  'ai-research-frontier': show('r/MachineLearning (already read by ai-ml) would fit. NOT enabled: owner decision. Left as is.'),

  // Disabled with the reason: no usable source (invalid subreddit name, so today they only get the HN keyword fallback), and the real
  // community is thin, personal, sensitive or does not exist. Re-enable by adding an `archived(...)` entry once the owner agrees.
  'unpopular-opinions': off('Disabled: the real community r/unpopularopinion has live data (100 posts, top 1409) but unmoderated hot takes would be read out as a published podcast.'),
  'money-matters': off('Disabled: r/personalfinance has live data (100 posts) but is individuals\' finances (personal details).'),
  'career-crossroads': off('Disabled: r/careerguidance has live data (100 posts) but is individuals\' personal situations.'),
  'parenting-unfiltered': off('Disabled: r/Parenting has live data (100 posts) but is individuals\' family details.'),
  'roast-my-resume': off('Disabled: the catalog subreddit "roast-my-resume" has 0 posts (invalid name). r/resumes has live data (80 posts, top 66) but the posts are individuals\' resumes; Exa found only blogs and LinkedIn pages.'),
  'shower-thoughts': off('Disabled: r/Showerthoughts exists but only 1 post in 48 h cleared a score of 5 (the archive snapshots scores minutes after posting). Thin.'),
  'trolley-problem': off('Disabled: r/trolleyproblem exists but only 7 posts in 48 h, mostly image memes. Thin.'),
  'tech-support-theater': off('Disabled: r/talesfromtechsupport exists but only 4 posts in 48 h. Thin.'),
  'landlord-vs-tenant': off('Disabled: r/Tenant exists (47 posts, top 15) but is thin and individuals\' housing disputes.'),
  'heart-to-heart': off('Disabled: r/relationship_advice exists but is personal and sensitive (top score 2 in the window).'),
  'food-for-thought': off('Disabled: catalog subreddit has 0 posts (invalid name); the likely community r/Cooking could not be verified (the archive timed out).'),
  'health-check-show': off('Disabled: catalog subreddit has 0 posts (invalid name); wellness/fitness communities are personal health content and no safe one was chosen.'),
  'whats-trending': off('Disabled: catalog subreddit has 0 posts (invalid name); no single subreddit matches "what the internet is talking about".'),
  'side-hustle-hour': off('Disabled: catalog subreddit has 0 posts (invalid name); no matching community was checked.'),
  'startup-autopsy': off('Disabled: catalog subreddit has 0 posts (invalid name); the matching community r/startups is already read by startups-vc.'),
  'conspiracy-or-fact': off('Disabled: catalog subreddit has 0 posts (invalid name); r/conspiracy would feed misinformation into scripts.'),
  'am-i-overthinking': off('Disabled: catalog subreddit has 0 posts (invalid name); the matching communities are private individuals\' anxiety posts.'),
  'dating-app-diaries': off('Disabled: catalog subreddit has 0 posts (invalid name); the matching communities are personal and often NSFW.'),
  'ai-or-human': off('Disabled: catalog subreddit has 0 posts (invalid name); a game format with no community behind it.'),
};

/** Policy for a topic id, or undefined for topics that never use Exa (user-suggested topics, unknown ids). */
export function getSourcePolicy(topicId: string): TopicSourcePolicy | undefined {
  return TOPIC_SOURCE_POLICY[topicId];
}

export function getExaConfig(topicId: string): ExaTopicConfig | undefined {
  return TOPIC_SOURCE_POLICY[topicId]?.exa;
}

/** Why a topic is switched off, or undefined. SOURCE_POLICY_DISABLE=0 turns the whole mechanism off. */
export function disabledReason(topicId: string, env: NodeJS.ProcessEnv = process.env): string | undefined {
  if (!policyDisablingEnabled(env)) return undefined;
  return TOPIC_SOURCE_POLICY[topicId]?.disabled;
}

export const DEFAULT_EXA_WINDOW_HOURS = 48;
