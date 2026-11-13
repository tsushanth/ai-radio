/**
 * Environment flags for the podcast source chain (same names as the radio, audexa-radio/fly/README.md). All are read on every call so
 * a `fly secrets set` takes effect on the next restart without a code change. The Exa key is read only inside exa.client.ts and is
 * never logged.
 */

const truthy = (v: string | undefined): boolean => ['1', 'true', 'on', 'yes'].includes((v ?? '').trim().toLowerCase());
const falsy = (v: string | undefined): boolean => ['0', 'false', 'off', 'no'].includes((v ?? '').trim().toLowerCase());
const defaultOn = (v: string | undefined): boolean => (v === undefined || v.trim() === '' ? true : !falsy(v));

/** Exa news search. Default OFF. */
export function exaSourceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return truthy(env.SOURCE_EXA_ENABLED);
}

/**
 * Master switch for every Reddit source of a topic. Default ON, but fail-soft: a 403/429/empty answer is a failed source that falls
 * through to the rest of the chain. Set 0 to stop all Reddit requests (archive and reddit.com).
 */
export function redditSourceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return defaultOn(env.SOURCE_REDDIT_ENABLED);
}

/** Reddit content from the Arctic Shift archive (the replacement for reddit.com .rss). Default ON. */
export function redditArchiveEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return redditSourceEnabled(env) && defaultOn(env.SOURCE_REDDIT_ARCHIVE_ENABLED);
}

/** reddit.com's own feed (.rss, and OAuth when opted in). Default ON and fail-soft; Reddit ends RSS on 2026-11-13. */
export function redditRssEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return redditSourceEnabled(env) && defaultOn(env.SOURCE_REDDIT_RSS_ENABLED);
}

/** Last-good feed cache (final step of the chain). Default OFF until migration 013 is applied. */
export function sourceCacheEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return truthy(env.SOURCE_CACHE_ENABLED);
}

/** Hard cap on Exa searches per UTC day (alert line at 80%). */
export function exaDailyCap(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.EXA_DAILY_CAP);
  return Number.isFinite(n) && env.EXA_DAILY_CAP !== undefined && env.EXA_DAILY_CAP.trim() !== '' && n >= 0 ? Math.floor(n) : 80;
}

/** How old the last good feed stories may be to still be used as the final fallback. */
export function sourceCacheStaleHours(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.SOURCE_CACHE_STALE_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 72;
}

/** Topics marked `disabled` in source-policy.ts are hidden and skipped by the batch. SOURCE_POLICY_DISABLE=0 turns that off. */
export function policyDisablingEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return defaultOn(env.SOURCE_POLICY_DISABLE);
}
