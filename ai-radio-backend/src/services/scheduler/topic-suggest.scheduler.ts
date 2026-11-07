/**
 * Topic-suggestion scheduler: wires topic-suggest.ts (the logic) to Supabase, the Anthropic SDK and a timer.
 *
 * OFF unless TOPIC_SUGGEST_PROCESSING=on. When on, it checks for one pending request every TOPIC_SUGGEST_INTERVAL_MS (default 60 s),
 * and stops for the day at TOPIC_SUGGEST_DAILY_CAP (default 20) model calls or TOPIC_SUGGEST_DAILY_TOKEN_CAP tokens.
 */
import Anthropic from '@anthropic-ai/sdk';
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';
import { instrumentAnthropic, withFeature } from '../../lib/llm';
import { reportFailure } from '../../lib/failureReporter';
import {
  FinishPatch, ModelCall, SYSTEM_PROMPT, SuggestDeps, SuggestStore, SuggestionRequest, TopicRow,
  attemptsOf, newState, processNextRequest, readSuggestConfig,
} from './topic-suggest';

const TABLE = 'topic_requests';
const COLUMNS = 'id, topic_name, language, description, error';

export class SupabaseSuggestStore implements SuggestStore {
  constructor(private readonly db: SupabaseClient) {}

  async requeueStale(cutoffIso: string, maxAttempts: number): Promise<number> {
    const { data, error } = await this.db.from(TABLE).select('id, error').eq('status', 'processing').lt('updated_at', cutoffIso).limit(50);
    if (error) throw new Error(`requeueStale: ${error.message}`);
    let n = 0;
    for (const row of data ?? []) {
      const next = attemptsOf(row.error) + 1;
      const patch = next >= maxAttempts
        ? { status: 'failed', error: `gave_up_after_${next}: interrupted` }
        : { status: 'pending', error: `attempt=${next} interrupted` };
      const { data: done } = await this.db.from(TABLE).update(patch).eq('id', row.id).eq('status', 'processing').lt('updated_at', cutoffIso).select('id');
      n += done?.length ?? 0;
    }
    return n;
  }

  async claimNextPending(): Promise<SuggestionRequest | null> {
    const { data, error } = await this.db.from(TABLE).select('id').eq('status', 'pending').order('created_at', { ascending: true }).limit(1);
    if (error) throw new Error(`claimNextPending: ${error.message}`);
    const id = data?.[0]?.id;
    if (!id) return null;
    const { data: claimed, error: upErr } = await this.db.from(TABLE).update({ status: 'processing' }).eq('id', id).eq('status', 'pending').select(COLUMNS);
    if (upErr) throw new Error(`claimNextPending: ${upErr.message}`);
    return (claimed?.[0] as SuggestionRequest | undefined) ?? null;
  }

  async finishedSince(iso: string): Promise<Array<{ error: string | null }>> {
    const { data, error } = await this.db.from(TABLE).select('error').in('status', ['completed', 'rejected', 'failed']).gte('updated_at', iso).limit(2000);
    if (error) throw new Error(`finishedSince: ${error.message}`);
    return (data ?? []) as Array<{ error: string | null }>;
  }

  async countActiveTopics(): Promise<number> {
    const { count, error } = await this.db.from('topics').select('id', { count: 'exact', head: true }).eq('is_active', true);
    if (error) throw new Error(`countActiveTopics: ${error.message}`);
    return count ?? 0;
  }

  async listTopics(): Promise<Array<{ id: string; name: string }>> {
    const { data, error } = await this.db.from('topics').select('id, name').limit(500);
    if (error) throw new Error(`listTopics: ${error.message}`);
    return (data ?? []) as Array<{ id: string; name: string }>;
  }

  async insertTopic(row: TopicRow): Promise<'inserted' | 'conflict'> {
    const { error } = await this.db.from('topics').insert(row);
    if (!error) return 'inserted';
    if (error.code === '23505') return 'conflict';
    throw new Error(`insertTopic: ${error.message}`);
  }

  async topicExists(id: string): Promise<boolean> {
    const { data, error } = await this.db.from('topics').select('id').eq('id', id).limit(1);
    if (error) throw new Error(`topicExists: ${error.message}`);
    return (data?.length ?? 0) > 0;
  }

  async finish(id: string, patch: FinishPatch): Promise<void> {
    const { error } = await this.db.from(TABLE).update(patch).eq('id', id).eq('status', 'processing');
    if (error) throw new Error(`finish: ${error.message}`);
  }
}

export class TopicSuggestScheduler {
  private anthropic: Anthropic;
  private readonly state = newState();
  private timer: NodeJS.Timeout | null = null;
  private running = false;
  private deps: SuggestDeps | null = null;

  constructor() {
    this.anthropic = instrumentAnthropic(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));
  }

  private getDeps(): SuggestDeps {
    if (!this.deps) {
      const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      this.deps = {
        store: new SupabaseSuggestStore(db),
        classify: (req, language, existing) => this.classify(req, language, existing),
        fetchFn: fetch,
        now: () => new Date(),
        log: (m) => console.log(m),
        config: readSuggestConfig(),
        state: this.state,
      };
    }
    return this.deps;
  }

  start(): void {
    const config = readSuggestConfig();
    if (!config.enabled) {
      console.log('[topic-suggest] processing is OFF (set TOPIC_SUGGEST_PROCESSING=on to enable)');
      return;
    }
    if (this.timer) return;
    const everyMs = Math.max(15_000, Number(process.env.TOPIC_SUGGEST_INTERVAL_MS) || 60_000);
    console.log(`[topic-suggest] processing is ON: every ${everyMs / 1000}s, daily cap ${config.dailyCap}, token cap ${config.dailyTokenCap}, topic ceiling ${config.maxTotalTopics}`);
    this.timer = setInterval(() => void this.tick(), everyMs);
    this.timer.unref();
    setTimeout(() => void this.tick(), 20_000).unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await processNextRequest(this.getDeps());
      if (result.outcome === 'daily_cap' || result.outcome === 'token_cap' || result.outcome === 'topic_ceiling') {
        // quiet, once per outcome per hour is enough: console only
        console.log(`[topic-suggest] skipped: ${result.outcome} (requests stay pending)`);
      } else if (result.outcome === 'failed' || result.outcome === 'created' || result.outcome === 'linked' || result.outcome === 'rejected') {
        console.log(`[topic-suggest] request ${result.requestId} -> ${result.outcome}${result.reason ? ` (${result.reason})` : ''}`);
      }
    } catch (e) {
      // processNextRequest does not throw; this is a last-resort guard
      reportFailure('topic_suggest_tick_error', e instanceof Error ? e : new Error(String(e)));
    } finally {
      this.running = false;
    }
  }

  /** One model call. Reports tokens to the shared usage accounting under the label 'topic_suggest'. */
  private async classify(req: SuggestionRequest, language: string, existing: Array<{ id: string; name: string }>): Promise<ModelCall> {
    const payload = JSON.stringify({
      suggestion: { name: req.topic_name.trim(), description: (req.description ?? '').trim(), language },
      existing_topics: existing.map((t) => ({ id: t.id, name: t.name })),
    });
    const response = await withFeature('topic_suggest', () => this.anthropic.messages.create({
      model: process.env.TOPIC_SUGGEST_MODEL || 'claude-haiku-5-5',
      system: SYSTEM_PROMPT,
      messages: [{ role: 'user', content: `<suggestion>\n${payload}\n</suggestion>` }],
      max_tokens: 700,
      thinking: { type: 'disabled' },
    }));
    const block = response.content.find((b) => b.type === 'text');
    return {
      text: block && block.type === 'text' ? block.text : '',
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
  }
}

export const topicSuggestScheduler = new TopicSuggestScheduler();
