/**
 * POST /api/topics/:id/generate protection: forceRegenerate is admin-only (others are served as a normal request), new generations are
 * capped per caller and globally, the persisted LLM budget turns requests into "Try again tomorrow", and the request the shipped Android
 * app sends (no token, no install id, language only) keeps working. The generator is stubbed: no LLM, no database.
 */
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';

Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_KEY: 'test-service-key',
  GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', ANTHROPIC_API_KEY: 'x', BATCH_SECRET: 'admin-secret-for-tests',
});
delete process.env.LLM_USAGE_KEY;

const TOPIC = { id: 'tech-news', name: 'Tech News', description: 'd' };
type Gen = { calls: Array<{ topicId: string; force: boolean; lang: string }>; existing: any; throws?: unknown };
const gen: Gen = { calls: [], existing: null };

let router: express.Router;
let guard: { take(k: string): { allowed: boolean } };
let budget: typeof import('../lib/llmBudget').llmBudget;

async function load() {
  const { topicPodcastGenerator } = await import('../services/content/topic.generator');
  const g = topicPodcastGenerator as any;
  g.getTopic = async (id: string) => (id === TOPIC.id ? TOPIC : undefined);
  g.getExistingEpisode = async () => gen.existing;
  g.getOrGenerateEpisode = async (topicId: string, _u: unknown, force: boolean, lang: string) => {
    gen.calls.push({ topicId, force, lang });
    if (gen.throws) throw gen.throws;
    return { episode: { id: `${topicId}-d-${lang}`, status: force ? 'generating' : 'completed', topicId, language: lang }, isNew: !gen.existing, message: 'ok' };
  };
  const mod = await import('./topics');
  router = mod.default;
  budget = (await import('../lib/llmBudget')).llmBudget;
  guard = mod.generateGuard;
}

beforeEach(async () => {
  if (!router) await load();
  gen.calls.length = 0; gen.existing = null; gen.throws = undefined;
  for (const k of ['GENERATE_CALLER_DAILY_LIMIT', 'GENERATE_GLOBAL_DAILY_LIMIT', 'LLM_DAILY_CAP_CALLS', 'LLM_DAILY_CAP_USD', 'LLM_BUDGET']) delete process.env[k];
  budget.reset();
  // fresh allowances for every test: a day that never matches resets the counters
  (guard as any).day = '';
});

async function withServer(fn: (post: (id: string, body: unknown, headers?: Record<string, string>) => Promise<Response>) => Promise<void>) {
  const app = express();
  app.set('trust proxy', 1);
  app.use(express.json());
  app.use('/api/topics', router);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api/topics`;
    await fn((id, body, headers = {}) => fetch(`${base}/${id}/generate`, { method: 'POST', headers: { 'Content-Type': 'application/json', ...headers }, body: JSON.stringify(body) }));
  } finally {
    server.close();
  }
}

const ADMIN = { Authorization: 'Bearer admin-secret-for-tests' };

test('the shipped app request (language only, no token, no install id) generates a missing episode: 200 and one generation', async () => {
  await withServer(async (post) => {
    const res = await post(TOPIC.id, { language: 'en' });
    assert.equal(res.status, 200);
    assert.deepEqual(gen.calls, [{ topicId: 'tech-news', force: false, lang: 'en' }]);
    assert.equal(((await res.json()) as any).data.episode.status, 'completed');
  });
});

test('forceRegenerate from anyone but the operator is served as a normal request: nothing is regenerated and the app does not see an error', async () => {
  for (const headers of [{}, { Authorization: 'Bearer wrong' }, { Authorization: 'Bearer ' }, { Authorization: 'Basic abc' }]) {
    gen.calls.length = 0; gen.existing = { id: 'e', status: 'completed' };
    await withServer(async (post) => {
      for (const body of [{ forceRegenerate: true, language: 'en' }, { force_regenerate: true, language: 'en' }]) {
        const res = await post(TOPIC.id, body, headers);
        assert.equal(res.status, 200, JSON.stringify(headers));
        assert.equal(((await res.json()) as any).data.episode.status, 'completed', 'the existing episode comes back, not a "generating" stub');
      }
    });
    assert.ok(gen.calls.every((c) => c.force === false), 'force never reaches the generator');
  }
});

test('the operator secret (Bearer BATCH_SECRET) may force a regeneration, and is not limited by the per-caller allowance', async () => {
  process.env.GENERATE_CALLER_DAILY_LIMIT = '0';
  gen.existing = { id: 'e', status: 'completed' };
  await withServer(async (post) => {
    for (let i = 0; i < 3; i++) {
      const res = await post(TOPIC.id, { forceRegenerate: true, language: 'en' }, ADMIN);
      assert.equal(res.status, 200); // async path: answers at once with what exists; the regeneration runs in the background
    }
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(gen.calls.filter((c) => c.force).length, 3);
});

test('an unset BATCH_SECRET never makes anyone an operator (fails closed)', async () => {
  const saved = process.env.BATCH_SECRET;
  delete process.env.BATCH_SECRET;
  try {
    gen.existing = { id: 'e', status: 'completed' };
    await withServer(async (post) => {
      await post(TOPIC.id, { forceRegenerate: true }, { Authorization: 'Bearer undefined' });
      await post(TOPIC.id, { forceRegenerate: true }, { Authorization: 'Bearer ' });
    });
    assert.ok(gen.calls.every((c) => !c.force));
  } finally { process.env.BATCH_SECRET = saved; }
});

test('per-caller daily allowance: new generations are counted, the next one is 429 "Try again tomorrow"; another caller is unaffected', async () => {
  process.env.GENERATE_CALLER_DAILY_LIMIT = '2';
  await withServer(async (post) => {
    assert.equal((await post(TOPIC.id, { installId: 'install-aaaa1111' })).status, 200);
    assert.equal((await post(TOPIC.id, { installId: 'install-aaaa1111' })).status, 200);
    const third = await post(TOPIC.id, { installId: 'install-aaaa1111' });
    assert.equal(third.status, 429);
    assert.deepEqual(await third.json(), { success: false, error: 'daily_limit', message: 'Try again tomorrow.' });
    assert.equal((await post(TOPIC.id, { installId: 'install-bbbb2222' })).status, 200);
    assert.equal(gen.calls.length, 3, 'the refused request never reached the generator');
  });
});

test('callers without an install id are keyed by IP (the shipped app): the same IP shares one allowance', async () => {
  process.env.GENERATE_CALLER_DAILY_LIMIT = '1';
  await withServer(async (post) => {
    assert.equal((await post(TOPIC.id, { language: 'en' })).status, 200);
    assert.equal((await post(TOPIC.id, { language: 'en' })).status, 429);
    assert.equal((await post(TOPIC.id, { language: 'en' }, { 'X-Forwarded-For': '203.0.113.9' })).status, 200, 'a different client IP (behind the proxy) has its own');
  });
});

test('serving an episode that already exists (completed or being generated) never uses an allowance; a failed one is retried and does', async () => {
  process.env.GENERATE_CALLER_DAILY_LIMIT = '1';
  await withServer(async (post) => {
    gen.existing = { id: 'e', status: 'completed' };
    for (let i = 0; i < 5; i++) assert.equal((await post(TOPIC.id, { language: 'en' })).status, 200);
    gen.existing = { id: 'e', status: 'generating' };
    for (let i = 0; i < 3; i++) assert.equal((await post(TOPIC.id, { language: 'en' })).status, 200);
    gen.existing = { id: 'e', status: 'failed' };
    assert.equal((await post(TOPIC.id, { language: 'en' })).status, 200);
    assert.equal((await post(TOPIC.id, { language: 'en' })).status, 429);
  });
});

test('global daily allowance stops new generations for everyone', async () => {
  process.env.GENERATE_GLOBAL_DAILY_LIMIT = '2';
  await withServer(async (post) => {
    assert.equal((await post(TOPIC.id, { installId: 'install-aaaa1111' })).status, 200);
    assert.equal((await post(TOPIC.id, { installId: 'install-bbbb2222' })).status, 200);
    assert.equal((await post(TOPIC.id, { installId: 'install-cccc3333' })).status, 429);
  });
});

test('unknown topic ids are 404 and use no allowance (junk ids cannot starve real users)', async () => {
  process.env.GENERATE_CALLER_DAILY_LIMIT = '1';
  await withServer(async (post) => {
    for (let i = 0; i < 4; i++) assert.equal((await post(`nope-${i}`, { language: 'en' })).status, 404);
    assert.equal((await post(TOPIC.id, { language: 'en' })).status, 200);
  });
});

test('persisted LLM budget used up: a request that needs a script is 429 "Try again tomorrow", an existing episode is still served', async () => {
  process.env.LLM_DAILY_CAP_CALLS = '1';
  budget.record({ ok: true, usd: 0.001 });
  await withServer(async (post) => {
    const res = await post(TOPIC.id, { language: 'en' });
    assert.equal(res.status, 429);
    assert.equal(((await res.json()) as any).message, 'Try again tomorrow.');
    assert.equal(gen.calls.length, 0);
    // admin force is capped too: the budget is a ceiling for everyone
    assert.equal((await post(TOPIC.id, { forceRegenerate: true }, ADMIN)).status, 429);
    gen.existing = { id: 'e', status: 'completed' };
    assert.equal((await post(TOPIC.id, { language: 'en' })).status, 200);
  });
});

test('the budget being hit while a blocking generation is running also answers 429 instead of 500', async () => {
  const { LlmBudgetExceeded } = await import('../lib/llmBudget');
  gen.throws = new LlmBudgetExceeded();
  await withServer(async (post) => {
    const res = await post(TOPIC.id, { language: 'en' });
    assert.equal(res.status, 429);
    assert.equal(((await res.json()) as any).error, 'daily_limit');
  });
});

test('non-English on-demand requests keep their existing language checks (400 for an unavailable language)', async () => {
  await withServer(async (post) => {
    const res = await post(TOPIC.id, { language: 'xx' });
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as any).error, 'language_unavailable');
  });
});
