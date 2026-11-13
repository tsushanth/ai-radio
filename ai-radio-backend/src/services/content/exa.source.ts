/**
 * Exa step of the source chain for one topic: per-topic once-a-day cache, persisted daily cap with an 80% alert, the search itself,
 * and the quality filter. Returns stories, or undefined meaning "Exa gave nothing usable: fall through to the next source".
 * It never throws.
 */
import type { AggregatedStory, TopicDefinition } from '../../types/topics';
import { reportFailure } from '../../lib/failureReporter';
import { exaSearch, ExaError, type ExaClientDeps } from './exa.client';
import { filterExaResults, MAX_EXCERPT_CHARS, MIN_USABLE_RESULTS } from './exa.filter';
import { DEFAULT_EXA_WINDOW_HOURS, type ExaTopicConfig } from './source-policy';
import { exaDailyCap } from './source-flags';
import { getSourceStateStore, utcDay, type SourceStateStore } from './source-state.store';

export const EXA_NUM_RESULTS = 8;
export const EXA_ALERT_FRACTION = 0.8;

export interface ExaSourceDeps {
  store?: SourceStateStore;
  client?: ExaClientDeps;
  now?: () => Date;
  env?: NodeJS.ProcessEnv;
  report?: (flow: string, err: unknown, context?: Record<string, string>) => void;
  log?: (msg: string) => void;
  warn?: (msg: string) => void;
  search?: typeof exaSearch;
}

const inflight = new Map<string, Promise<AggregatedStory[] | undefined>>();
const alertedDays = new Set<string>();
const capLoggedDays = new Set<string>();
const authAlerted = new Set<string>();

/** Test hook. */
export function resetExaSourceState(): void {
  inflight.clear();
  alertedDays.clear();
  capLoggedDays.clear();
  authAlerted.clear();
}

export function fetchExaStories(
  topic: Pick<TopicDefinition, 'id' | 'name'>,
  cfg: ExaTopicConfig,
  deps: ExaSourceDeps = {},
): Promise<AggregatedStory[] | undefined> {
  const now = (deps.now ?? (() => new Date()))();
  const key = `${topic.id}|${utcDay(now)}`;
  const running = inflight.get(key);
  if (running) return running;
  const p = run(topic, cfg, deps, now).catch((e) => {
    (deps.warn ?? console.warn)(`  [exa] ${topic.id}: unexpected ${e instanceof Error ? e.name : 'error'}`);
    return undefined;
  }).finally(() => { inflight.delete(key); });
  inflight.set(key, p);
  return p;
}

async function run(
  topic: Pick<TopicDefinition, 'id' | 'name'>,
  cfg: ExaTopicConfig,
  deps: ExaSourceDeps,
  now: Date,
): Promise<AggregatedStory[] | undefined> {
  const store = deps.store ?? getSourceStateStore();
  const log = deps.log ?? console.log;
  const warn = deps.warn ?? console.warn;
  const report = deps.report ?? reportFailure;
  const day = utcDay(now);
  const cap = exaDailyCap(deps.env);

  // 1. Once per topic per day: reuse today's result, or do not retry today's failure.
  let state;
  try {
    state = await store.getTopicState(topic.id);
  } catch {
    warn(`  [exa] ${topic.id}: source state unavailable, skipping Exa (fails closed)`);
    return undefined;
  }
  if (state?.exaAttemptDay === day) {
    if (state.exaAttemptOk && state.exaStories?.length) {
      log(`  [exa] ${topic.id}: using today's cached search (${state.exaStories.length} stories)`);
      return state.exaStories;
    }
    log(`  [exa] ${topic.id}: already searched today without usable results, not retrying until tomorrow`);
    return undefined;
  }

  // 2. Hard daily cap, taken atomically in the database.
  if (cap <= 0) return undefined;
  let reserved;
  try {
    reserved = await store.reserveExaSearch(day, cap);
  } catch {
    warn('  [exa] daily counter unavailable, skipping Exa (fails closed)');
    return undefined;
  }
  if (!reserved.allowed) {
    if (!capLoggedDays.has(day)) {
      capLoggedDays.add(day);
      warn(`  [exa] daily cap reached (${cap}/${cap}), no more Exa searches today`);
      report('exa_daily_cap_reached', new Error('Exa daily search cap reached'), { cap: String(cap) });
    }
    return undefined;
  }
  const threshold = Math.ceil(cap * EXA_ALERT_FRACTION);
  if (reserved.count >= threshold && !alertedDays.has(day)) {
    alertedDays.add(day);
    warn(`  [exa] ALERT: ${reserved.count}/${cap} daily searches used (${Math.round((reserved.count / cap) * 100)}%)`);
    report('exa_daily_cap_80pct', new Error('Exa daily search count reached 80% of the cap'), { used: String(reserved.count), cap: String(cap) });
  }

  // 3. The search.
  const windowHours = cfg.windowHours ?? DEFAULT_EXA_WINDOW_HOURS;
  const since = new Date(now.getTime() - windowHours * 3600_000);
  const search = deps.search ?? exaSearch;
  let stories: AggregatedStory[] | undefined;
  try {
    const res = await search(
      { query: cfg.query, category: cfg.category, numResults: EXA_NUM_RESULTS, startPublishedDate: since, maxCharacters: MAX_EXCERPT_CHARS },
      { env: deps.env, ...deps.client },
    );
    const { stories: usable, dropped } = filterExaResults(res.results, { now, since, max: EXA_NUM_RESULTS });
    if (usable.length < MIN_USABLE_RESULTS) {
      warn(`  [exa] ${topic.id}: only ${usable.length} usable of ${res.results.length} results (dropped ${JSON.stringify(dropped)}), falling through`);
    } else {
      stories = usable;
      log(`  [exa] ${topic.id}: ${usable.length} usable of ${res.results.length} results (search ${reserved.count}/${cap} today)`);
    }
  } catch (e) {
    const kind = e instanceof ExaError ? e.kind : 'unknown';
    warn(`  [exa] ${topic.id}: search failed (${kind}${e instanceof ExaError && e.status ? ` ${e.status}` : ''}), falling through`);
    if ((kind === 'auth' || kind === 'credit') && !authAlerted.has(kind)) {
      authAlerted.add(kind);
      report(`exa_${kind}`, new Error(kind === 'auth' ? 'Exa rejected the API key' : 'Exa credit exhausted'), { status: String((e as ExaError).status ?? 0) });
    }
  }

  // 4. Remember the outcome so this topic is not searched again today.
  try {
    await store.saveExaResult(topic.id, day, !!stories, stories);
  } catch {
    warn(`  [exa] ${topic.id}: could not save the search result`);
  }
  return stories;
}
