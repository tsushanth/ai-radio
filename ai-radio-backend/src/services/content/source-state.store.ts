/**
 * Persisted state for the podcast source chain (Supabase, service role only; migration 013):
 *  - a daily Exa search counter with an atomic reserve (`exa_reserve_search`), so the hard cap holds across restarts and machines;
 *  - one row per topic: whether Exa was searched today (at most once per topic per UTC day) with that day's Exa stories, and the last
 *    good FEED stories (RSS/HN/Reddit, never Exa text), used as the final fallback when every live source fails. Same split as the radio.
 *
 * Every method may throw (table missing, network). Callers treat a throw as "unknown": Exa fails closed, the last-good cache is skipped.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { AggregatedStory } from '../../types/topics';

export interface TopicSourceState {
  topicId: string;
  /** UTC day (YYYY-MM-DD) on which Exa was last searched for this topic, whether that search produced usable stories, and the stories. */
  exaAttemptDay?: string;
  exaAttemptOk?: boolean;
  exaStories?: AggregatedStory[];
  /** Last good feed stories (RSS / HackerNews / Reddit). */
  stories?: AggregatedStory[];
  storiesAt?: Date;
}

export interface SourceStateStore {
  /** Atomically takes one search from the day's budget. count is the number used including this one when allowed. */
  reserveExaSearch(day: string, cap: number): Promise<{ allowed: boolean; count: number }>;
  getTopicState(topicId: string): Promise<TopicSourceState | undefined>;
  /** Records today's Exa outcome (stories only when ok). */
  saveExaResult(topicId: string, day: string, ok: boolean, stories?: AggregatedStory[]): Promise<void>;
  saveGoodStories(topicId: string, stories: AggregatedStory[], at: Date): Promise<void>;
}

export const utcDay = (d: Date): string => d.toISOString().slice(0, 10);

/** Stories go through JSON in the database: Dates come back as strings. */
export function reviveStories(raw: unknown): AggregatedStory[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((s: any) => ({ ...s, publishedAt: s?.publishedAt ? new Date(s.publishedAt) : undefined }));
}

export class MemorySourceStateStore implements SourceStateStore {
  readonly counts = new Map<string, number>();
  readonly topics = new Map<string, TopicSourceState>();
  async reserveExaSearch(day: string, cap: number) {
    const n = this.counts.get(day) ?? 0;
    if (n >= cap) return { allowed: false, count: n };
    this.counts.set(day, n + 1);
    return { allowed: true, count: n + 1 };
  }
  async getTopicState(topicId: string) {
    const s = this.topics.get(topicId);
    return s ? { ...s } : undefined;
  }
  async saveExaResult(topicId: string, day: string, ok: boolean, stories?: AggregatedStory[]) {
    this.topics.set(topicId, { ...(this.topics.get(topicId) ?? { topicId }), exaAttemptDay: day, exaAttemptOk: ok, exaStories: ok ? stories : undefined });
  }
  async saveGoodStories(topicId: string, stories: AggregatedStory[], at: Date) {
    this.topics.set(topicId, { ...(this.topics.get(topicId) ?? { topicId }), stories, storiesAt: at });
  }
}

const TOPIC_TABLE = 'topic_source_state';

export class SupabaseSourceStateStore implements SourceStateStore {
  constructor(private readonly db: SupabaseClient) {}

  async reserveExaSearch(day: string, cap: number) {
    const { data, error } = await this.db.rpc('exa_reserve_search', { p_day: day, p_cap: cap });
    if (error) throw new Error(`exa_reserve_search failed: ${error.message}`);
    const n = Number(data);
    if (!Number.isFinite(n)) throw new Error('exa_reserve_search returned no count');
    return n < 0 ? { allowed: false, count: cap } : { allowed: true, count: n };
  }

  async getTopicState(topicId: string) {
    const { data, error } = await this.db.from(TOPIC_TABLE).select('*').eq('topic_id', topicId).maybeSingle();
    if (error) throw new Error(`topic_source_state read failed: ${error.message}`);
    if (!data) return undefined;
    return {
      topicId,
      exaAttemptDay: data.exa_attempt_day ?? undefined,
      exaAttemptOk: data.exa_attempt_ok ?? undefined,
      exaStories: data.exa_stories ? reviveStories(data.exa_stories) : undefined,
      stories: data.stories ? reviveStories(data.stories) : undefined,
      storiesAt: data.stories_at ? new Date(data.stories_at) : undefined,
    } as TopicSourceState;
  }

  async saveExaResult(topicId: string, day: string, ok: boolean, stories?: AggregatedStory[]) {
    const { error } = await this.db.from(TOPIC_TABLE).upsert(
      { topic_id: topicId, exa_attempt_day: day, exa_attempt_ok: ok, exa_stories: ok ? stories ?? null : null, updated_at: new Date().toISOString() },
      { onConflict: 'topic_id' },
    );
    if (error) throw new Error(`topic_source_state write failed: ${error.message}`);
  }

  async saveGoodStories(topicId: string, stories: AggregatedStory[], at: Date) {
    const { error } = await this.db.from(TOPIC_TABLE).upsert(
      { topic_id: topicId, stories, stories_at: at.toISOString(), updated_at: new Date().toISOString() },
      { onConflict: 'topic_id' },
    );
    if (error) throw new Error(`topic_source_state write failed: ${error.message}`);
  }
}

let shared: SourceStateStore | undefined;

/** Supabase when SUPABASE_URL and SUPABASE_SERVICE_KEY are set, else an in-process store (local development only). */
export function getSourceStateStore(env: NodeJS.ProcessEnv = process.env): SourceStateStore {
  if (shared) return shared;
  shared = env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY
    ? new SupabaseSourceStateStore(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY))
    : new MemorySourceStateStore();
  return shared;
}

/** Test hook. */
export function setSourceStateStore(store: SourceStateStore | undefined): void {
  shared = store;
}
