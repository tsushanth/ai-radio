// Provider switch, OpenRouter request shape, fallback, no-Anthropic-on-failure, usage + budget accounting. Network (globalThis.fetch) is mocked.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), SUPABASE_URL: 'https://example.supabase.co', SUPABASE_SERVICE_KEY: 'svc',
  GOOGLE_CLIENT_ID: 'g', GOOGLE_CLIENT_SECRET: 'g', ANTHROPIC_API_KEY: 'sk-ant-test',
});
delete process.env.LLM_USAGE_KEY; delete process.env.FAILURE_REPORTER_KEY;

type Call = { url: string; body: any; headers: Record<string, string> };
const calls: Call[] = [];
let handler: (c: Call) => Response | Promise<Response> = () => new Response('{}', { status: 500 });

const orOk = (text: string, over: Record<string, unknown> = {}) => new Response(JSON.stringify({
  id: 'gen-1', model: 'openai/gpt-6-luna-20261001', choices: [{ message: { role: 'assistant', content: text }, finish_reason: 'stop' }],
  usage: { prompt_tokens: 1000, completion_tokens: 500, prompt_tokens_details: { cached_tokens: 200 }, cost: 0.0004 }, ...over,
}), { status: 200, headers: { 'content-type': 'application/json' } });

globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(typeof input === 'string' ? input : input.url);
  const c: Call = { url, body: init?.body ? JSON.parse(init.body) : undefined, headers: init?.headers ?? {} };
  calls.push(c);
  return handler(c);
}) as typeof fetch;

const REQ = { feature: 'topic_script', system: 'SYS', user: 'USR', maxTokens: 3000, temperature: 0.7, anthropicModel: 'claude-sonnet-4-6' } as const;

beforeEach(async () => {
  calls.length = 0;
  for (const k of ['LLM_PROVIDER', 'OPENROUTER_API_KEY', 'OPENROUTER_MODEL', 'OPENROUTER_FALLBACK_MODEL', 'ASK_REVIEW_PROVIDER', 'LLM_DAILY_CAP_USD', 'LLM_DAILY_CAP_CALLS', 'LLM_BUDGET']) delete process.env[k];
  (await import('./llmBudget.ts')).llmBudget.reset();
});

test('provider: explicit value wins; unset + key = openrouter; unset + no key = anthropic (a deploy before the key is set keeps working)', async () => {
  const { readProvider } = await import('./llmText.ts');
  assert.equal(readProvider({ LLM_PROVIDER: 'anthropic', OPENROUTER_API_KEY: 'k' }), 'anthropic');
  assert.equal(readProvider({ LLM_PROVIDER: ' OpenRouter ' }), 'openrouter');
  assert.equal(readProvider({ OPENROUTER_API_KEY: 'k' }), 'openrouter');
  assert.equal(readProvider({}), 'anthropic');
  assert.equal(readProvider({ LLM_PROVIDER: 'gemini', OPENROUTER_API_KEY: 'k' }), 'openrouter', 'an unknown value is ignored');
  assert.equal(readProvider({ LLM_PROVIDER: 'openrouter' }, 'anthropic'), 'anthropic', 'a per-feature override wins');
});

test('openrouter: one POST with the radio\'s default model, system + user messages, reasoning off, bearer key; returns text and tokens', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  handler = () => orOk('[{"speaker":"host1","text":"hi"}]');
  const { generateText } = await import('./llmText.ts');
  const r = await generateText(REQ);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, 'https://openrouter.ai/api/v1/chat/completions');
  assert.equal(calls[0].headers.Authorization, 'Bearer sk-or-test');
  assert.deepEqual(calls[0].body, {
    model: 'openai/gpt-6-luna', messages: [{ role: 'system', content: 'SYS' }, { role: 'user', content: 'USR' }],
    temperature: 0.7, max_tokens: 3000, reasoning: { enabled: false },
  });
  assert.deepEqual([r.provider, r.model, r.text, r.inputTokens, r.outputTokens, r.truncated], ['openrouter', 'openai/gpt-6-luna', '[{"speaker":"host1","text":"hi"}]', 1000, 500, false]);
  // 800 uncached in at $0.10/M, 200 cached at $0.01/M, 500 out at $0.50/M
  assert.ok(Math.abs(r.costUsd - (800 * 0.1 + 200 * 0.01 + 500 * 0.5) / 1e6) < 1e-12);
});

test('OPENROUTER_MODEL / OPENROUTER_FALLBACK_MODEL are honoured (same env names as the radio orchestrator)', async () => {
  const { openRouterModels } = await import('./llmText.ts');
  assert.deepEqual(openRouterModels({}), ['openai/gpt-6-luna', 'openai/gpt-5.6-luna']);
  assert.deepEqual(openRouterModels({ OPENROUTER_MODEL: 'a/b', OPENROUTER_FALLBACK_MODEL: 'c/d' }), ['a/b', 'c/d']);
  assert.deepEqual(openRouterModels({ OPENROUTER_FALLBACK_MODEL: '' }), ['openai/gpt-6-luna'], 'empty = no fallback');
  assert.deepEqual(openRouterModels({ OPENROUTER_MODEL: 'x/y', OPENROUTER_FALLBACK_MODEL: 'x/y' }), ['x/y']);
});

test('primary fails (5xx, empty content, network): the fallback model answers; still NO Anthropic call', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  const { generateText } = await import('./llmText.ts');
  for (const first of [() => new Response('boom', { status: 503 }), () => orOk('   '), () => { throw new TypeError('fetch failed'); }]) {
    calls.length = 0;
    let n = 0;
    handler = () => (++n === 1 ? first() : orOk('{"ok":true}'));
    const r = await generateText(REQ);
    assert.equal(r.model, 'openai/gpt-5.6-luna');
    assert.deepEqual(calls.map((c) => c.body.model), ['openai/gpt-6-luna', 'openai/gpt-5.6-luna']);
    assert.ok(calls.every((c) => c.url.startsWith('https://openrouter.ai/')));
  }
});

test('both models fail: the error reaches the caller, no Anthropic call is made, and a 401/402 skips the fallback (same key)', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  const { generateText, OpenRouterError } = await import('./llmText.ts');
  handler = () => new Response('{"error":"down"}', { status: 502 });
  await assert.rejects(generateText(REQ), (e: unknown) => e instanceof OpenRouterError && e.status === 502);
  assert.equal(calls.length, 2);
  assert.ok(calls.every((c) => !c.url.includes('anthropic')), 'never falls back to Anthropic');

  calls.length = 0;
  handler = () => new Response('{"error":"insufficient credits"}', { status: 402 });
  await assert.rejects(generateText(REQ), (e: unknown) => e instanceof OpenRouterError && e.status === 402);
  assert.equal(calls.length, 1, 'a credit/auth problem is not retried on a second model');
});

test('an explicit LLM_PROVIDER=openrouter without a key fails clearly instead of calling Anthropic', async () => {
  process.env.LLM_PROVIDER = 'openrouter';
  const { generateText } = await import('./llmText.ts');
  await assert.rejects(generateText(REQ), /OPENROUTER_API_KEY is not set/);
  assert.equal(calls.length, 0);
});

test('LLM_PROVIDER=anthropic: the old path (Claude, caller model, thinking flag) and zero OpenRouter traffic; rollback is this one env change', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  process.env.LLM_PROVIDER = 'anthropic';
  handler = (c) => c.url.includes('api.anthropic.com')
    ? new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: 'hello' }], usage: { input_tokens: 1000, output_tokens: 500 } }), { status: 200, headers: { 'content-type': 'application/json' } })
    : new Response('unexpected', { status: 500 });
  const { generateText } = await import('./llmText.ts');
  const r = await generateText({ ...REQ, disableThinking: true });
  assert.deepEqual([r.provider, r.model, r.text], ['anthropic', 'claude-sonnet-4-6', 'hello']);
  assert.ok(Math.abs(r.costUsd - (1000 * 3 + 500 * 15) / 1e6) < 1e-12);
  assert.equal(calls.length, 1);
  assert.match(calls[0].url, /api\.anthropic\.com/);
  assert.equal(calls[0].body.model, 'claude-sonnet-4-6');
  assert.deepEqual(calls[0].body.thinking, { type: 'disabled' });
  assert.equal(calls[0].body.system, 'SYS');
});

test('a per-call provider (ASK_REVIEW_PROVIDER) pins one call to Anthropic while the rest stays on OpenRouter', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  handler = (c) => c.url.includes('anthropic') ? new Response(JSON.stringify({ id: 'm', type: 'message', role: 'assistant', model: 'claude-haiku-5-5', stop_reason: 'end_turn', stop_sequence: null, content: [{ type: 'text', text: '{}' }], usage: { input_tokens: 10, output_tokens: 5 } }), { status: 200, headers: { 'content-type': 'application/json' } }) : orOk('x');
  const { generateText } = await import('./llmText.ts');
  assert.equal((await generateText({ ...REQ, provider: 'anthropic', anthropicModel: 'claude-haiku-5-5' })).provider, 'anthropic');
  assert.equal((await generateText(REQ)).provider, 'openrouter');
});

test('usage + budget: an OpenRouter call is recorded under the requested model id with the luna price (not an unknown-model estimate)', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  handler = () => orOk('x');
  const { generateText } = await import('./llmText.ts');
  const { llmBudget } = await import('./llmBudget.ts');
  const { llm } = await import('./llm.ts');
  assert.equal(llm.costOf('openai/gpt-6-luna', { input_tokens: 1_000_000, output_tokens: 1_000_000 }).estimated, false);
  assert.equal(llm.costOf('openai/gpt-5.6-luna', { input_tokens: 1_000_000, output_tokens: 0 }).usd, 0.2);
  await generateText(REQ);
  const st = await llmBudget.status();
  assert.equal(st.calls, 1);
  assert.ok(Math.abs(st.usd - (800 * 0.1 + 200 * 0.01 + 500 * 0.5) / 1e6) < 1e-12, 'budget is fed the same dollars as the usage tables');
});

test('usage rows: sent under the luna model id and the feature label, with correct tokens (central Worker mocked)', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  const sent: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const { createLlmUsage } = require('./llmUsage') as typeof import('./llmUsage');
  const usage = createLlmUsage({ app: 'audexa', key: 'k', url: 'https://usage.test/v1/llm', flushMs: 0, fetch: async (_u: string, init: any) => { sent.push(JSON.parse(init.body)); return new Response('{}'); } });
  usage.withFeature('topic_script', () => usage.record({ model: 'openai/gpt-6-luna', usage: { input_tokens: 800, output_tokens: 500, cache_read_input_tokens: 200 }, feature: 'topic_script' }));
  await usage.flush();
  const row = sent[0].items[0];
  assert.deepEqual([row.model, row.feature, row.calls, row.input_tokens, row.output_tokens, row.cache_read_tokens], ['openai/gpt-6-luna', 'topic_script', 1, 800, 500, 200]);
  assert.ok(Math.abs(row.cost_usd - (800 * 0.1 + 200 * 0.01 + 500 * 0.5) / 1e6) < 1e-6);
});

test('daily cap: generateText throws LlmBudgetExceeded BEFORE any network call, for both providers', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  process.env.LLM_DAILY_CAP_CALLS = '1';
  const { llmBudget, LlmBudgetExceeded } = await import('./llmBudget.ts');
  llmBudget.record({ ok: true, usd: 0 });
  const { generateText } = await import('./llmText.ts');
  await assert.rejects(generateText(REQ), LlmBudgetExceeded);
  process.env.LLM_PROVIDER = 'anthropic';
  await assert.rejects(generateText(REQ), LlmBudgetExceeded);
  assert.equal(calls.length, 0);
});

test('truncated replies are flagged; a body-level error and malformed JSON are failures', async () => {
  process.env.OPENROUTER_API_KEY = 'sk-or-test';
  process.env.OPENROUTER_FALLBACK_MODEL = '';
  const { generateText } = await import('./llmText.ts');
  handler = () => orOk('[{"a":1}', { choices: [{ message: { content: '[{"a":1}' }, finish_reason: 'length' }] });
  assert.equal((await generateText(REQ)).truncated, true);
  handler = () => new Response(JSON.stringify({ error: { message: 'rate' } }), { status: 200 });
  await assert.rejects(generateText(REQ), /error in body/);
  handler = () => new Response('not json', { status: 200 });
  await assert.rejects(generateText(REQ), /malformed/);
});
