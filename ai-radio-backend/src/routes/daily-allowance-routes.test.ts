/** The on-demand routes ask the daily allowance before spending, and only then. No network, no model calls. */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';

Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_KEY: 'test-service-key',
  GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', GOOGLE_REDIRECT_URI: 'https://example.invalid/callback', ANTHROPIC_API_KEY: 'x',
  PODCAST_RATE_LIMIT_MAX: '1000',
  ALLOWANCE_QA_CLIENT: '1', ALLOWANCE_TELL_ME_MORE_CLIENT: '1', ALLOWANCE_DEEPDIVE_CLIENT: '1', ALLOWANCE_STATION_CLIENT: '1',
});

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

test('each on-demand route stops spending at the client allowance', async (t) => {
  const reached: string[] = [];
  const stub = (target: any, method: string, result: unknown) => { target[method] = async () => { reached.push(method); return result; }; };
  const { qaGenerator } = await import('../services/content/qa.generator');
  const { deepDiveGenerator } = await import('../services/content/deepdive.generator');
  const { interactionsService } = await import('../services/content/interactions.service');
  const { liveStationGenerator } = await import('../services/content/livestation.generator');
  const { dailyAllowance } = await import('../lib/dailyAllowance');
  stub(qaGenerator, 'askQuestion', {});
  stub(deepDiveGenerator, 'generateDeepDive', {});
  stub(interactionsService, 'generateExpansion', { success: true });
  const old = { id: 'old', generatedAt: new Date(0), expiresAt: new Date(0), durationSeconds: 1 };
  let current: typeof old | undefined = old;
  const station = { id: 's1', name: 'S', refreshIntervalMinutes: 15 };
  stub(liveStationGenerator, 'incrementListenerCount', undefined);
  (liveStationGenerator as any).getStationDetail = async () => ({ station: { ...station, currentEpisode: current }, recentEpisodes: [] });
  let release: () => void = () => {};
  let hold: Promise<void> = Promise.resolve();
  (liveStationGenerator as any).generateEpisode = async () => { reached.push('generateEpisode'); await hold; return { ...old, id: 'new', generatedAt: new Date() }; };

  const app = express();
  app.set('trust proxy', 2); // as on Fly (lib/proxy.ts)
  app.use(express.json());
  app.use('/qa', (await import('./qa')).default);
  app.use('/deepdive', (await import('./deepdive')).default);
  app.use('/interactions', (await import('./interactions')).default);
  app.use('/livestation', (await import('./livestation')).default);
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  t.after(() => server.close());
  const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  const post = async (path: string, body: unknown, ip = '203.0.113.1') => {
    const r = await fetch(base + path, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': `${ip}, 198.51.100.1` }, body: JSON.stringify(body) });
    return { status: r.status, retryAfter: r.headers.get('retry-after'), body: (await r.json()) as any };
  };

  const cases: Array<[string, unknown, string, number]> = [
    ['/qa/ask', { question: 'why', contextType: 'topic', contextId: 'c', userId: 'install-1' }, 'askQuestion', 200],
    ['/interactions/tell-me-more', { context_type: 'topic', context_id: 'c' }, 'generateExpansion', 200],
    ['/deepdive/generate', { query: 'tides', userId: 'install-1' }, 'generateDeepDive', 202],
  ];
  for (const [path, body, method, ok] of cases) {
    reached.length = 0;
    assert.equal((await post(path, {})).status, 400, `${path}: an invalid request uses nothing`);
    assert.equal((await post(path, body)).status, ok, path);
    const second = await post(path, { ...(body as object), userId: 'install-2' });
    assert.equal(second.status, 429, `${path}: another id from the same address is the same client`);
    assert.ok(Number(second.retryAfter) > 0);
    assert.equal(second.body.success, false);
    assert.equal((await post(path, body, '203.0.113.2')).status, ok, `${path}: another client is served`);
    assert.deepEqual(reached.filter((m) => m === method).length, 2, path);
  }

  reached.length = 0;
  assert.equal((await post('/livestation/s1/refresh', {})).body.data.episode.id, 'new');
  const limited = await post('/livestation/s1/refresh', {});
  assert.equal(limited.status, 200);
  assert.equal(limited.body.data.episode.id, 'old', 'the latest episode is served');
  assert.equal((await post('/livestation/s1/tune-in', {})).body.data.episode.id, 'old');
  current = undefined;
  assert.equal((await post('/livestation/s1/tune-in', {})).status, 429);
  assert.equal((await post('/livestation/s1/refresh', {})).status, 429);
  assert.equal(reached.filter((m) => m === 'generateEpisode').length, 1);

  // Listeners who arrive while a station is being generated share that run and use nothing.
  dailyAllowance.reset();
  reached.length = 0;
  hold = new Promise<void>((resolve) => { release = resolve; });
  const both = [post('/livestation/s1/tune-in', {}, '203.0.113.5'), post('/livestation/s1/tune-in', {}, '203.0.113.6'), post('/livestation/s1/refresh', {}, '203.0.113.5')];
  await new Promise((resolve) => setTimeout(resolve, 200));
  release();
  assert.deepEqual((await Promise.all(both)).map((r) => r.body.data.episode.id), ['new', 'new', 'new']);
  assert.equal(reached.filter((m) => m === 'generateEpisode').length, 1);
});
