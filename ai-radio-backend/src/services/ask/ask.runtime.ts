/**
 * Real wiring for "Ask the hosts" (ask.ts is the logic): Supabase store, Anthropic calls, Piper speech, public-bucket upload.
 * Created lazily on the first request after the feature flag is on, so a disabled deployment builds no clients.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';
import { generateText, readProvider } from '../../lib/llmText';
import { llmBudget } from '../../lib/llmBudget';
import { openaiTTS, type VoiceConfig } from '../tts/openai.tts';
import { concatenateBuffers } from '../tts/audio.utils';
import type { ModelCall } from '../scheduler/topic-suggest';
import { onDemandLanguages } from '../tts/piper-languages';
import {
  AskConfig, AskDeps, AskPatch, AskRow, AskState, AskStore, JobGate, REVIEW_SYSTEM_PROMPT,
  newAskState, readAskConfig,
} from './ask';

const TABLE = 'ask_episodes';
const BUCKET = 'topic-podcasts'; // existing public bucket (allowed types: audio/mpeg); ask audio lives under ask/

interface DbRow {
  id: string; install_id: string | null; request_text: string; language: string; status: AskRow['status']; reason: string | null;
  title: string | null; description: string | null; audio_url: string | null; duration_seconds: number | null; sources: unknown;
  input_tokens: number; output_tokens: number; tts_seconds: number; created_at: string; updated_at: string;
}

const mapRow = (d: DbRow): AskRow => ({
  id: d.id, installId: d.install_id, requestText: d.request_text, language: d.language, status: d.status, reason: d.reason,
  title: d.title, description: d.description, audioUrl: d.audio_url, durationSeconds: d.duration_seconds,
  sources: Array.isArray(d.sources) ? (d.sources as AskRow['sources']) : [],
  inputTokens: d.input_tokens ?? 0, outputTokens: d.output_tokens ?? 0, ttsSeconds: d.tts_seconds ?? 0,
  createdAt: d.created_at, updatedAt: d.updated_at,
});

export class SupabaseAskStore implements AskStore {
  constructor(private readonly db: SupabaseClient) {}

  async insert(r: { installId: string | null; requestText: string; language: string }): Promise<AskRow> {
    const { data, error } = await this.db.from(TABLE)
      .insert({ install_id: r.installId, request_text: r.requestText, language: r.language })
      .select('*').single();
    if (error || !data) throw new Error(`ask insert: ${error?.message ?? 'no row'}`);
    return mapRow(data as DbRow);
  }

  async get(id: string): Promise<AskRow | null> {
    const { data, error } = await this.db.from(TABLE).select('*').eq('id', id).maybeSingle();
    if (error) throw new Error(`ask get: ${error.message}`);
    return data ? mapRow(data as DbRow) : null;
  }

  async update(id: string, p: AskPatch): Promise<void> {
    const patch: Record<string, unknown> = {};
    if (p.status !== undefined) patch.status = p.status;
    if (p.reason !== undefined) patch.reason = p.reason;
    if (p.title !== undefined) patch.title = p.title;
    if (p.description !== undefined) patch.description = p.description;
    if (p.audioUrl !== undefined) patch.audio_url = p.audioUrl;
    if (p.durationSeconds !== undefined) patch.duration_seconds = p.durationSeconds == null ? null : Math.round(p.durationSeconds);
    if (p.sources !== undefined) patch.sources = p.sources;
    if (p.script !== undefined) patch.script = p.script;
    if (p.inputTokens !== undefined) patch.input_tokens = p.inputTokens;
    if (p.outputTokens !== undefined) patch.output_tokens = p.outputTokens;
    if (p.ttsSeconds !== undefined) patch.tts_seconds = Math.round(p.ttsSeconds);
    if (p.status && ['completed', 'rejected', 'no_coverage', 'failed'].includes(p.status)) patch.completed_at = new Date().toISOString();
    const { error } = await this.db.from(TABLE).update(patch).eq('id', id).not('status', 'in', '(completed,rejected,no_coverage,failed)');
    if (error) throw new Error(`ask update: ${error.message}`);
  }

  async countInstallSince(installId: string, iso: string): Promise<number> {
    const { count, error } = await this.db.from(TABLE).select('id', { count: 'exact', head: true }).eq('install_id', installId).gte('created_at', iso);
    if (error) throw new Error(`ask countInstallSince: ${error.message}`);
    return count ?? 0;
  }

  async countStartedSince(iso: string): Promise<number> {
    const { count, error } = await this.db.from(TABLE).select('id', { count: 'exact', head: true })
      .gte('created_at', iso).not('status', 'in', '(rejected,no_coverage)');
    if (error) throw new Error(`ask countStartedSince: ${error.message}`);
    return count ?? 0;
  }

  async tokensSince(iso: string): Promise<number> {
    const { data, error } = await this.db.from(TABLE).select('input_tokens, output_tokens').gte('created_at', iso).limit(5000);
    if (error) throw new Error(`ask tokensSince: ${error.message}`);
    return (data ?? []).reduce((n, r) => n + (r.input_tokens ?? 0) + (r.output_tokens ?? 0), 0);
  }
}

/**
 * The two model calls, through lib/llmText: OpenRouter (gpt-6-luna) by default, Claude when LLM_PROVIDER=anthropic. ASK_REVIEW_PROVIDER
 * can pin the review (the safety gate) to a different provider than the script. The model names in AskConfig apply to the anthropic provider only;
 * OpenRouter models come from OPENROUTER_MODEL / OPENROUTER_FALLBACK_MODEL.
 */
class AskModels {
  private static toCall(r: { text: string; inputTokens: number; outputTokens: number }): ModelCall {
    return { text: r.text, inputTokens: r.inputTokens, outputTokens: r.outputTokens };
  }

  async review(model: string, text: string, language: string): Promise<ModelCall> {
    const reviewProvider = (process.env.ASK_REVIEW_PROVIDER ?? '').trim() ? readProvider(process.env, process.env.ASK_REVIEW_PROVIDER) : undefined;
    return AskModels.toCall(await generateText({
      feature: 'ask_review', system: REVIEW_SYSTEM_PROMPT, user: `<request>\n${JSON.stringify({ text, language })}\n</request>`,
      maxTokens: 300, anthropicModel: model, disableThinking: true, provider: reviewProvider,
    }));
  }

  async script(model: string, system: string, user: string): Promise<ModelCall> {
    return AskModels.toCall(await generateText({
      feature: 'ask_script', system, user, maxTokens: 2600, temperature: 0.6, anthropicModel: model,
    }));
  }
}

export interface AskRuntime {
  config: AskConfig;
  state: AskState;
  store: AskStore;
  deps: AskDeps;
  gate: JobGate;
  languages: () => string[];
  /** True when today's persisted LLM budget (lib/llmBudget) is used up: new requests are turned away with "try again tomorrow". */
  budgetCapped: () => Promise<boolean>;
}

let runtime: AskRuntime | null = null;

export function getAskRuntime(): AskRuntime {
  if (runtime) return runtime;
  const config = readAskConfig();
  const state = newAskState();
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const store = new SupabaseAskStore(db);

  const models = new AskModels();

  const deps: AskDeps = {
    store, config, state,
    review: (text, language) => models.review(config.reviewModel, text, language),
    writeScript: (system, user) => models.script(config.scriptModel, system, user),
    synthesize: async (script, language) => {
      const voiceConfig: VoiceConfig = { host1: 'shimmer', host2: 'onyx', model: 'tts-1-hd', speed: 1.0, language };
      const segments = await openaiTTS.synthesizeScript(script, voiceConfig);
      return {
        audio: concatenateBuffers(segments.map((s) => s.buffer)),
        durationSeconds: openaiTTS.calculateTotalDuration(segments),
      };
    },
    upload: async (audio, id) => {
      const path = `ask/${id}.mp3`; // same as topic episodes: the bucket only accepts audio/mpeg
      const { error } = await db.storage.from(BUCKET).upload(path, audio, { contentType: 'audio/mpeg', cacheControl: '86400', upsert: true });
      if (error) throw new Error(`Upload failed: ${error.message}`);
      return db.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
    },
    fetchFn: fetch,
    now: () => new Date(),
    log: (m) => console.log(m),
  };

  runtime = {
    config, state, store, deps,
    gate: new JobGate(config.maxConcurrent, config.maxQueue),
    languages: () => ['en', ...onDemandLanguages()],
    budgetCapped: () => llmBudget.isCapped(),
  };
  return runtime;
}
