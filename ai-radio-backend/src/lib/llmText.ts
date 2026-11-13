/**
 * One text-generation call for the podcast scripts ("topic_script") and Ask the hosts ("ask_script", "ask_review"), with a provider switch.
 *
 *   LLM_PROVIDER = openrouter | anthropic
 *     openrouter  (default once OPENROUTER_API_KEY is set) OpenRouter chat completions, model OPENROUTER_MODEL (default openai/gpt-6-luna),
 *                 then OPENROUTER_FALLBACK_MODEL (default openai/gpt-5.6-luna; empty string = none): the same pair, env names and
 *                 request body (reasoning off) as the radio orchestrator. A failure NEVER falls through to Anthropic.
 *     anthropic   the previous behaviour (Claude, model chosen by the caller). Rollback = set LLM_PROVIDER=anthropic.
 *   If LLM_PROVIDER is unset AND there is no OPENROUTER_API_KEY, the provider is anthropic (and a warning says so): a deploy made before
 *   the key is set keeps working exactly as before instead of failing every script. An explicit LLM_PROVIDER=openrouter without a key fails.
 *
 * Every call is recorded in the usage module under the requested model id with that model's price (llmUsage.js PRICES), so the usage
 * tables and the daily budget stay truthful. Prompts and replies are never logged.
 */
import Anthropic from '@anthropic-ai/sdk';
import { instrumentAnthropic, llm, withFeature } from './llm';
import { assertLlmBudget } from './llmBudget';
import { costOf } from './llmUsage';
import { reportLlmError } from './monitoring';

export type LlmProvider = 'openrouter' | 'anthropic';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
export const OPENROUTER_DEFAULT_MODEL = 'openai/gpt-6-luna';
export const OPENROUTER_FALLBACK_MODEL = 'openai/gpt-5.6-luna';

let warnedDefault = false;

/** `override` (e.g. ASK_REVIEW_PROVIDER) wins over LLM_PROVIDER when it is a valid value. */
export function readProvider(env: NodeJS.ProcessEnv = process.env, override?: string): LlmProvider {
  for (const raw of [override, env.LLM_PROVIDER]) {
    const v = (raw ?? '').trim().toLowerCase();
    if (v === 'anthropic' || v === 'openrouter') return v;
  }
  if ((env.OPENROUTER_API_KEY ?? '').trim()) return 'openrouter';
  if (!warnedDefault) {
    warnedDefault = true;
    console.warn('[llm] LLM_PROVIDER and OPENROUTER_API_KEY are both unset: using anthropic (set OPENROUTER_API_KEY to move scripts to OpenRouter)');
  }
  return 'anthropic';
}

export class OpenRouterError extends Error {
  constructor(message: string, readonly status?: number, readonly kind: 'http' | 'network' | 'timeout' | 'invalid' | 'empty' | 'config' = 'http') {
    super(message);
    this.name = 'OpenRouterError';
  }
}

export interface TextRequest {
  /** Low-cardinality usage label: topic_script, ask_script, ask_review. */
  feature: string;
  system?: string;
  user: string;
  maxTokens: number;
  temperature?: number;
  /** Model used when the provider is anthropic. */
  anthropicModel: string;
  /** Anthropic only: send thinking: disabled (Haiku review). */
  disableThinking?: boolean;
  /** Forces a provider for this call (e.g. ASK_REVIEW_PROVIDER); otherwise LLM_PROVIDER decides. */
  provider?: LlmProvider;
}

export interface TextResult {
  text: string;
  inputTokens: number;
  outputTokens: number;
  provider: LlmProvider;
  model: string;
  costUsd: number;
  /** The model stopped at max_tokens (the reply may be cut off). */
  truncated: boolean;
}

export interface LlmTextDeps {
  env?: NodeJS.ProcessEnv;
  fetch?: typeof fetch;
  /** Test hook: replaces the Anthropic client. */
  anthropic?: Pick<Anthropic, 'messages'>;
}

let sharedAnthropic: Anthropic | null = null;
function anthropicClient(env: NodeJS.ProcessEnv): Pick<Anthropic, 'messages'> {
  if (!sharedAnthropic) sharedAnthropic = instrumentAnthropic(new Anthropic({ apiKey: env.ANTHROPIC_API_KEY }));
  return sharedAnthropic;
}

const numEnv = (v: string | undefined, dflt: number) => {
  const n = Number((v ?? '').trim());
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n > 0 ? n : dflt;
};

export function openRouterModels(env: NodeJS.ProcessEnv = process.env): string[] {
  const primary = (env.OPENROUTER_MODEL ?? '').trim() || OPENROUTER_DEFAULT_MODEL;
  const fbRaw = env.OPENROUTER_FALLBACK_MODEL;
  const fallback = fbRaw === undefined ? OPENROUTER_FALLBACK_MODEL : fbRaw.trim();
  return fallback && fallback !== primary ? [primary, fallback] : [primary];
}

interface OpenRouterBody {
  choices?: Array<{ message?: { content?: unknown }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; prompt_tokens_details?: { cached_tokens?: number } };
  error?: unknown;
}

async function callOpenRouter(req: TextRequest, model: string, key: string, deps: LlmTextDeps, env: NodeJS.ProcessEnv): Promise<TextResult> {
  const doFetch = deps.fetch ?? globalThis.fetch;
  const timeoutMs = numEnv(env.OPENROUTER_TIMEOUT_SEC, 90) * 1000;
  const messages = [...(req.system ? [{ role: 'system', content: req.system }] : []), { role: 'user', content: req.user }];
  let res: Response;
  try {
    res = await doFetch(OPENROUTER_URL, {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', 'X-Title': 'Audexa Backend' },
      body: JSON.stringify({ model, messages, temperature: req.temperature ?? 0.7, max_tokens: req.maxTokens, reasoning: { enabled: false } }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (e) {
    const timedOut = e instanceof Error && (e.name === 'TimeoutError' || e.name === 'AbortError');
    throw new OpenRouterError(timedOut ? `OpenRouter exceeded ${Math.round(timeoutMs / 1000)}s` : `OpenRouter request failed: ${e instanceof Error ? e.name : 'error'}`, undefined, timedOut ? 'timeout' : 'network');
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.text()).slice(0, 160).replace(key, '***'); } catch { /* ignore */ }
    throw new OpenRouterError(`OpenRouter error ${res.status}: ${detail}`, res.status, 'http');
  }
  let data: OpenRouterBody;
  try { data = (await res.json()) as OpenRouterBody; } catch { throw new OpenRouterError('OpenRouter returned malformed JSON', undefined, 'invalid'); }
  if (!data || typeof data !== 'object') throw new OpenRouterError('OpenRouter returned an unexpected shape', undefined, 'invalid');
  if (data.error) throw new OpenRouterError(`OpenRouter error in body: ${JSON.stringify(data.error).slice(0, 160)}`, undefined, 'http');
  const choice = data.choices?.[0];
  const content = choice?.message?.content;
  if (typeof content !== 'string' || !content.trim()) throw new OpenRouterError('OpenRouter returned empty content', undefined, 'empty');

  const promptTokens = Number(data.usage?.prompt_tokens) || 0;
  const cached = Math.min(promptTokens, Number(data.usage?.prompt_tokens_details?.cached_tokens) || 0);
  const outputTokens = Number(data.usage?.completion_tokens) || 0;
  const usage = { input_tokens: promptTokens - cached, output_tokens: outputTokens, cache_read_input_tokens: cached };
  // The REQUESTED id keys the price (a response id with a date suffix could miss the table and be priced as an unknown model).
  llm.record({ model, usage, feature: req.feature });
  return { text: content, inputTokens: promptTokens, outputTokens, provider: 'openrouter', model, costUsd: costOf(model, usage).usd, truncated: choice?.finish_reason === 'length' };
}

async function viaOpenRouter(req: TextRequest, deps: LlmTextDeps, env: NodeJS.ProcessEnv): Promise<TextResult> {
  const key = (env.OPENROUTER_API_KEY ?? '').trim();
  if (!key) throw new OpenRouterError('LLM_PROVIDER is openrouter but OPENROUTER_API_KEY is not set', undefined, 'config');
  const models = openRouterModels(env);
  let last: unknown;
  for (let i = 0; i < models.length; i++) {
    try {
      return await callOpenRouter(req, models[i], key, deps, env);
    } catch (e) {
      last = e;
      llm.record({ model: models[i], feature: req.feature, ok: false });
      const status = e instanceof OpenRouterError ? e.status : undefined;
      if (status === 401 || status === 402 || status === 403) break; // key or credit problem: a second model on the same key cannot help
      if (i + 1 < models.length) console.warn(`[llm] OpenRouter ${models[i]} failed (${(e as Error).message.slice(0, 100)}); trying ${models[i + 1]}`);
    }
  }
  reportLlmError(last); // one alert per failure class (401/402 credit, 429, 5xx); request-level problems are not provider-wide
  throw last;
}

async function viaAnthropic(req: TextRequest, deps: LlmTextDeps, env: NodeJS.ProcessEnv): Promise<TextResult> {
  const client = deps.anthropic ?? anthropicClient(env);
  const response = await client.messages.create({
    model: req.anthropicModel,
    ...(req.system ? { system: req.system } : {}),
    messages: [{ role: 'user', content: req.user }],
    max_tokens: req.maxTokens,
    ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
    ...(req.disableThinking ? { thinking: { type: 'disabled' as const } } : {}),
  });
  const block = response.content.find((b) => b.type === 'text');
  const usage = response.usage;
  return {
    text: block && block.type === 'text' ? block.text : '',
    inputTokens: usage?.input_tokens ?? 0,
    outputTokens: usage?.output_tokens ?? 0,
    provider: 'anthropic',
    model: response.model || req.anthropicModel,
    costUsd: costOf(response.model || req.anthropicModel, usage as never).usd,
    truncated: response.stop_reason === 'max_tokens',
  };
}

/** Throws LlmBudgetExceeded when the daily budget is used up (before any spend). */
export async function generateText(req: TextRequest, deps: LlmTextDeps = {}): Promise<TextResult> {
  const env = deps.env ?? process.env;
  await assertLlmBudget();
  const provider = req.provider ?? readProvider(env);
  return withFeature(req.feature, () => (provider === 'anthropic' ? viaAnthropic(req, deps, env) : viaOpenRouter(req, deps, env)));
}
