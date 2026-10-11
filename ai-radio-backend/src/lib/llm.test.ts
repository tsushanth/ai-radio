// Claude spend accounting, enabled path: a (fake) ingest key is set, so rows are recorded and sent.
// The Anthropic SDK is real; only the network (globalThis.fetch) is faked, so these tests cover the actual wiring in the services.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.GOOGLE_CLIENT_ID = 'g';
process.env.GOOGLE_CLIENT_SECRET = 'g';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
process.env.LLM_USAGE_KEY = 'test-ingest-key';
process.env.LLM_USAGE_URL = 'https://usage.test/v1/llm';

type Sent = { key: string; items: Array<Record<string, any>> };
const sent: Sent[] = [];
let usageStatus = 200;
let usageThrows = false;
let usageHangs = false;
let answer = JSON.stringify({ answer: 'ok', sources: [], suggestedQuestions: [] });

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(typeof input === 'string' ? input : input.url);
  if (url.startsWith('https://usage.test')) {
    if (usageHangs) return new Promise<Response>(() => {});
    if (usageThrows) throw new Error('worker down');
    const headers = init.headers as Record<string, string>;
    sent.push({ key: headers['X-Report-Key'], items: JSON.parse(init.body).items });
    return new Response('{}', { status: usageStatus });
  }
  if (url.includes('api.anthropic.com')) {
    return new Response(JSON.stringify({
      id: 'msg_1', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: answer }],
      usage: { input_tokens: 1000, output_tokens: 500, cache_read_input_tokens: 200, cache_creation_input_tokens: 0 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('unexpected fetch ' + url);
}) as typeof fetch;

const ctx = { type: 'episode', title: 'T', summary: 's', transcript: 't' } as any;

async function flushed() {
  const { llm } = await import('./llm.ts');
  sent.length = 0;
  await llm.flush();
  return sent.flatMap((s) => s.items);
}

test('a service call is recorded under its feature label with tokens and cost, and sent with the ingest key', async () => {
  const { QAGenerator } = await import('../services/content/qa.generator.ts');
  await flushed(); // drain anything earlier
  const gen = new QAGenerator();
  const res = await (gen as any).generateAnswer('why?', ctx, []);
  assert.equal(res.answer, 'ok');
  const items = await flushed();
  assert.equal(sent[0].key, 'test-ingest-key');
  assert.equal(items.length, 1);
  assert.equal(items[0].feature, 'qa');
  assert.equal(items[0].model, 'claude-sonnet-4-6');
  assert.equal(items[0].calls, 1);
  assert.equal(items[0].input_tokens, 1000);
  assert.equal(items[0].output_tokens, 500);
  assert.equal(items[0].cache_read_tokens, 200);
  assert.ok(Math.abs(items[0].cost_usd - (1000 * 3 + 500 * 15 + 200 * 0.3) / 1e6) < 1e-9);
});

test('rows hold only low-cardinality fields: no prompt, answer or id leaks into the report', async () => {
  const { QAGenerator } = await import('../services/content/qa.generator.ts');
  await flushed();
  const gen = new QAGenerator();
  await (gen as any).generateAnswer('SECRET-QUESTION-TEXT', { ...ctx, title: 'SECRET-TITLE' }, []);
  await flushed();
  const body = JSON.stringify(sent);
  assert.ok(!body.includes('SECRET'));
  assert.ok(!body.includes('ok"'), 'answer text must not be sent');
  for (const it of sent.flatMap((s) => s.items)) {
    assert.deepEqual(Object.keys(it).sort(), ['cache_read_tokens', 'cache_write_tokens', 'calls', 'cost_usd', 'day', 'errors', 'feature', 'input_tokens', 'model', 'output_tokens']);
  }
});

test('script generator labels its call "script", but an outer daily_brief label wins', async () => {
  const { ScriptGeneratorService } = await import('../services/ai/script.generator.ts');
  const { withFeature } = await import('./llm.ts');
  const gen = new ScriptGeneratorService('sk-ant-test');
  await flushed();
  answer = '[]';
  try {
    await (gen as any).generateWithGPT4({ content: [], preferences: {} }).catch(() => {});
    const plain = await flushed();
    assert.deepEqual(plain.map((i) => i.feature), ['script']);
    await withFeature('daily_brief', () => (gen as any).generateWithGPT4({ content: [], preferences: {} }).catch(() => {}));
    const nested = await flushed();
    assert.deepEqual(nested.map((i) => i.feature), ['daily_brief']);
  } finally {
    answer = JSON.stringify({ answer: 'ok', sources: [], suggestedQuestions: [] });
  }
});

test('the daily brief scheduler wraps generation in the daily_brief label', () => {
  const src = fs.readFileSync(path.join(__dirname, '../services/scheduler/daily-brief.scheduler.ts'), 'utf8');
  assert.match(src, /withFeature\('daily_brief',\s*\(\) => this\.generateForUserUnlabelled\(user\)\)/);
  // both entry points (batch loop and manual trigger) go through generateForUser
  assert.equal((src.match(/this\.generateForUser\(user\)/g) || []).length, 2);
});

test('every Anthropic client is instrumented and every messages.create is labelled (guards future call sites)', () => {
  const root = path.join(__dirname, '..');
  const expected: Record<string, string[]> = {
    'services/content/topic.generator.ts': ['topic_script'],
    'services/content/livestation.generator.ts': ['live_station_news', 'live_station'],
    'services/content/interactions.service.ts': ['interaction'],
    'services/content/deepdive.generator.ts': ['deepdive_research', 'deepdive'],
    'services/content/qa.generator.ts': ['qa'],
    'services/ai/script.generator.ts': ['script'],
    'services/content/customsource.service.ts': ['custom_source'],
  };
  const walk = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? walk(path.join(d, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [path.join(d, e.name)] : []);
  const seen = new Set<string>();
  for (const file of walk(root)) {
    const rel = path.relative(root, file);
    if (rel.startsWith('lib/')) continue;
    const src = fs.readFileSync(file, 'utf8');
    const creates = src.match(/\.messages\.(create|stream)\(/g) || [];
    const clients = src.match(/new Anthropic\(/g) || [];
    if (!creates.length && !clients.length) continue;
    seen.add(rel);
    assert.ok(expected[rel], `${rel} uses Anthropic but is not in the instrumented list`);
    assert.equal((src.match(/instrumentAnthropic\(new Anthropic\(/g) || []).length, clients.length, `${rel}: un-instrumented client`);
    const labels = [...src.matchAll(/with(?:Default)?Feature\('([a-z_]+)', \(\) => this\.anthropic\.messages\.(?:create|stream)\(/g)].map((m) => m[1]);
    assert.deepEqual(labels, expected[rel], `${rel}: labels`);
    assert.equal(labels.length, creates.length, `${rel}: unlabelled call`);
  }
  assert.deepEqual([...seen].sort(), Object.keys(expected).sort());
});

test('a failing usage report (worker down, 500, rejected key) never throws into the generation', async () => {
  const { QAGenerator } = await import('../services/content/qa.generator.ts');
  const { llm } = await import('./llm.ts');
  const gen = new QAGenerator();
  for (const mode of ['throws', '500', '401']) {
    usageThrows = mode === 'throws';
    usageStatus = mode === '500' ? 500 : mode === '401' ? 401 : 200;
    const res = await (gen as any).generateAnswer('q', ctx, []);
    assert.equal(res.answer, 'ok');
    await assert.doesNotReject(llm.flush());
  }
  usageThrows = false; usageStatus = 200;
});

test('a failed Claude call is counted as an error and the original error still reaches the caller', async () => {
  const { QAGenerator } = await import('../services/content/qa.generator.ts');
  await flushed();
  const gen = new QAGenerator();
  const prev = globalThis.fetch;
  const wrapped = (async (input: any, init?: any) => {
    if (String(typeof input === 'string' ? input : input.url).includes('api.anthropic.com')) return new Response('{"error":{"type":"invalid_request_error","message":"bad"}}', { status: 400, headers: { 'content-type': 'application/json' } });
    return prev(input, init);
  }) as typeof fetch;
  // client captured fetch at construction, so build a new generator while the failing fetch is installed
  globalThis.fetch = wrapped;
  const failing = new QAGenerator();
  try {
    await assert.rejects((failing as any).generateAnswer('q', ctx, []));
  } finally { globalThis.fetch = prev; }
  void gen;
  const items = await flushed();
  assert.equal(items.length, 1);
  assert.equal(items[0].feature, 'qa');
  assert.equal(items[0].errors, 1);
  assert.equal(items[0].cost_usd, 0);
});

test('flushLlmUsage gives up after the cap even when the Worker hangs', async () => {
  const { QAGenerator } = await import('../services/content/qa.generator.ts');
  const { flushLlmUsage } = await import('./llm.ts');
  await flushed();
  const gen = new QAGenerator();
  await (gen as any).generateAnswer('q', ctx, []);
  const { llm } = await import('./llm.ts');
  assert.ok(llm.pending() > 0, 'a row must be waiting so the flush really hangs');
  usageHangs = true;
  const t0 = Date.now();
  try { await flushLlmUsage(150); } finally { usageHangs = false; }
  assert.ok(Date.now() - t0 < 1000);
});

