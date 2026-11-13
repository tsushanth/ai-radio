/**
 * Environment flags for the podcast source chain. All read on every call so a `fly secrets set` takes effect on the next restart
 * without a code change. The Exa key is read only inside exa.client.ts and is never logged.
 */

const truthy = (v: string | undefined): boolean => ['1', 'true', 'on', 'yes'].includes((v ?? '').trim().toLowerCase());
const falsy = (v: string | undefined): boolean => ['0', 'false', 'off', 'no'].includes((v ?? '').trim().toLowerCase());

/** Exa news search at the head of the chain. Default OFF. */
export function exaSourceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return truthy(env.SOURCE_EXA_ENABLED);
}

/**
 * reddit.com's own feeds (.rss, and OAuth when opted in). Default ON, but fail-soft: Reddit RSS ends on 2026-11-13 and a 403/429/empty
 * answer is a failed source that falls through to the rest of the chain. Set SOURCE_REDDIT_ENABLED=0 to stop requesting reddit.com.
 */
export function redditSourceEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.SOURCE_REDDIT_ENABLED;
  if (v === undefined || v.trim() === '') return true;
  return !falsy(v);
}

/**
 * Reddit content from the Arctic Shift archive (the replacement for reddit.com .rss). Default ON; set 0 to stop using it.
 * Failures fall through to the rest of the chain either way.
 */
export function redditArchiveEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  const v = env.SOURCE_REDDIT_ARCHIVE_ENABLED;
  if (v === undefined || v.trim() === '') return true;
  return !falsy(v);
}

/** Last-good source cache (step 3 of the chain). Default OFF until migration 013 is applied. */
export function sourceCacheEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return truthy(env.SOURCE_CACHE_ENABLED);
}

/** Hard cap on Exa searches per UTC day. */
export function exaDailyCap(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.EXA_DAILY_CAP);
  return Number.isFinite(n) && env.EXA_DAILY_CAP !== undefined && env.EXA_DAILY_CAP.trim() !== '' && n >= 0 ? Math.floor(n) : 80;
}

/** How old the last good source text may be to still be used as the final fallback. */
export function sourceCacheStaleHours(env: NodeJS.ProcessEnv = process.env): number {
  const n = Number(env.SOURCE_CACHE_STALE_HOURS);
  return Number.isFinite(n) && n > 0 ? n : 72;
}
