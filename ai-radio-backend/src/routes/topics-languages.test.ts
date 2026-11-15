/**
 * The additional podcast languages at the HTTP edge: off by default, Beta label, caps, pause / kill switch, topic list, episodes read,
 * the language list endpoint and the notifications lang. The generator is stubbed: no model, no speech, no database.
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
delete process.env.NEW_LANGUAGES;

import { MemoryControlStore } from '../services/languages/controls.store.ts';
import { NEW_LANGUAGES } from '../services/languages/registry.ts';

const store = new MemoryControlStore(NEW_LANGUAGES.map((l) => l.code));
const today = () => new Date().toISOString().slice(0, 10);
const topics: Record<string, any> = {
  'world-update': { id: 'world-update', name: 'World Update', description: 'd', category: 'news', languages: ['all'] },
  'tech-news': { id: 'tech-news', name: 'Tech News', description: 'd', category: 'technology', languages: ['all'] },
  'us-politics': { id: 'us-politics', name: 'US Politics', description: 'd', category: 'news', languages: ['en'] },
};
const gen = { calls: [] as Array<{ topicId: string; lang: string }>, existing: null as any };

let topicsRouter: express.Router; let configRouter: express.Router; let notifRouter: express.Router;
let guard: any; let controls: typeof import('../services/languages/controls').languageControls; let budget: any;

async function load() {
  const { topicPodcastGenerator } = await import('../services/content/topic.generator');
  const g = topicPodcastGenerator as any;
  g.getTopic = async (id: string) => topics[id];
  g.getExistingEpisode = async () => gen.existing;
  g.getRecentEpisodes = async (_t: string, _l: number, lang: string) => [{ id: `e-${lang}` }];
  g.getOrGenerateEpisode = async (topicId: string, _u: unknown, _f: boolean, lang: string) => {
    gen.calls.push({ topicId, lang });
    return { episode: { id: `${topicId}-d-${lang}`, status: 'completed', topicId, language: lang }, isNew: false, message: 'ok' };
  };
  const mod = await import('./topics');
  topicsRouter = mod.default; guard = mod.generateGuard;
  configRouter = (await import('./config')).default;
  notifRouter = (await import('./notifications')).default;
  controls = (await import('../services/languages/controls')).languageControls;
  controls.useStore(store);
  budget = (await import('../lib/llmBudget')).llmBudget;
}

beforeEach(async () => {
  if (!topicsRouter) await load();
  gen.calls.length = 0; gen.existing = null;
  store.flags.clear(); for (const l of NEW_LANGUAGES) store.flags.set(l.code, { language: l.code, enabled: false, beta: true, dailyCap: 8, voice: 'aria', voiceHost2: 'kai' });
  store.usage.clear(); store.breaker = { globalPaused: false, globalReason: null, ttsTrippedDay: null, ttsReason: null };
  controls.invalidate();
  for (const k of ['GENERATE_CALLER_DAILY_LIMIT', 'GENERATE_GLOBAL_DAILY_LIMIT', 'LANG_GLOBAL_DAILY_CAP', 'NEW_LANGUAGES', 'LLM_DAILY_CAP_CALLS']) delete process.env[k];
  budget.reset(); guard.day = '';
});

async function withServer(fn: (call: (method: string, path: string, body?: unknown) => Promise<{ status: number; json: any }>) => Promise<void>) {
  const app = express(); app.set('trust proxy', 1); app.use(express.json());
  app.use('/api/topics', topicsRouter); app.use('/api/config', configRouter); app.use('/api/notifications', notifRouter);
  const server = app.listen(0, '127.0.0.1'); await new Promise((r) => server.once('listening', r));
  try {
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
    await fn(async (method, path, body) => {
      const res = await fetch(base + path, { method, headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) });
      const text = await res.text();
      return { status: res.status, json: text ? JSON.parse(text) : null };
    });
  } finally { server.close(); }
}
const on = (l: string, patch: Record<string, unknown> = {}) => controls.setFlag(l, { enabled: true, ...patch } as any, 'test');

test('default OFF: a new language is refused with status unavailable, nothing is generated, no slot or allowance is used', async () => {
  await withServer(async (call) => {
    const r = await call('POST', '/topics/world-update/generate', { language: 'cs' });
    assert.equal(r.status, 400); assert.equal(r.json.error, 'language_unavailable'); assert.equal(r.json.status, 'unavailable');
  });
  assert.equal(gen.calls.length, 0); assert.equal((await store.getUsage(today())).episodesTotal, 0);
});

test('enabled (Beta): generation starts in the background, the answer is the generating stub with beta true, one slot is used', async () => {
  await on('cs');
  await withServer(async (call) => {
    const r = await call('POST', '/topics/world-update/generate', { language: 'cs' });
    assert.equal(r.status, 200); assert.equal(r.json.data.beta, true); assert.equal(r.json.data.episode.status, 'generating'); assert.equal(r.json.data.episode.language, 'cs');
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(gen.calls, [{ topicId: 'world-update', lang: 'cs' }]);
  assert.equal((await store.getUsage(today())).languages.cs.episodes, 1);
});

test('beta false is reported as beta false', async () => {
  await on('nl', { beta: false });
  await withServer(async (call) => {
    assert.equal((await call('POST', '/topics/world-update/generate', { language: 'nl' })).json.data.beta, false);
  });
});

test('a topic outside the 12 launch topics is not offered in a new language', async () => {
  await on('pl');
  await withServer(async (call) => {
    const r = await call('POST', '/topics/us-politics/generate', { language: 'pl' });
    assert.equal(r.status, 400); assert.equal(r.json.status, 'unavailable');
  });
  assert.equal(gen.calls.length, 0);
});

test('per-language daily cap: 429 daily_limit with status daily_cap_reached and scope language', async () => {
  await on('ro', { dailyCap: 1 });
  await withServer(async (call) => {
    assert.equal((await call('POST', '/topics/world-update/generate', { language: 'ro' })).status, 200);
    const r = await call('POST', '/topics/tech-news/generate', { language: 'ro' });
    assert.equal(r.status, 429); assert.equal(r.json.error, 'daily_limit'); assert.equal(r.json.status, 'daily_cap_reached'); assert.equal(r.json.scope, 'language');
  });
});

test('global cap across languages: 429 with scope global', async () => {
  process.env.LANG_GLOBAL_DAILY_CAP = '1';
  await on('sv'); await on('hu');
  await withServer(async (call) => {
    assert.equal((await call('POST', '/topics/world-update/generate', { language: 'sv' })).status, 200);
    const r = await call('POST', '/topics/world-update/generate', { language: 'hu' });
    assert.equal(r.status, 429); assert.equal(r.json.scope, 'global');
  });
});

test('kill switch / breaker: 503 language_paused with status paused; an episode that already exists is still served', async () => {
  await on('uk');
  await store.setGlobalPause(true, 'test'); controls.invalidate();
  await withServer(async (call) => {
    const r = await call('POST', '/topics/world-update/generate', { language: 'uk' });
    assert.equal(r.status, 503); assert.equal(r.json.error, 'language_paused'); assert.equal(r.json.status, 'paused');
    gen.existing = { id: 'e', status: 'completed', language: 'uk' };
    const served = await call('POST', '/topics/world-update/generate', { language: 'uk' });
    assert.equal(served.status, 200); assert.equal(served.json.data.episode.status, 'completed'); assert.equal(served.json.data.beta, true);
  });
  assert.equal((await store.getUsage(today())).episodesTotal, 0);
});

test('the shared LLM budget and per-caller allowance still apply to a new language', async () => {
  await on('cs');
  process.env.GENERATE_CALLER_DAILY_LIMIT = '0';
  await withServer(async (call) => {
    const r = await call('POST', '/topics/world-update/generate', { language: 'cs' });
    assert.equal(r.status, 429); assert.equal(r.json.error, 'daily_limit');
  });
  assert.equal((await store.getUsage(today())).episodesTotal, 0, 'the persisted slot is only taken after the allowances pass');
  delete process.env.GENERATE_CALLER_DAILY_LIMIT;
});

test('English and the Piper languages are untouched: no flag needed, no new-language usage', async () => {
  await withServer(async (call) => {
    assert.equal((await call('POST', '/topics/world-update/generate', { language: 'en' })).status, 200);
    assert.equal((await call('POST', '/topics/world-update/generate', { language: 'de' })).status, 200);
    const unknown = await call('POST', '/topics/world-update/generate', { language: 'xx' });
    assert.equal(unknown.status, 400); assert.equal(unknown.json.error, 'language_unavailable');
  });
  await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(gen.calls.map((c) => c.lang).sort(), ['de', 'en']);
  assert.equal((await store.getUsage(today())).episodesTotal, 0);
});

test('episodes list: refused while the language is off, served when on (also while paused)', async () => {
  await withServer(async (call) => {
    assert.equal((await call('GET', '/topics/world-update/episodes?lang=cs')).status, 400);
    await on('cs');
    const ok = await call('GET', '/topics/world-update/episodes?lang=cs');
    assert.equal(ok.status, 200); assert.equal(ok.json.data.episodes.length, 1);
    await store.setGlobalPause(true, 'x'); controls.invalidate();
    assert.equal((await call('GET', '/topics/world-update/episodes?lang=cs')).status, 200);
    assert.equal((await call('GET', '/topics/world-update/episodes?lang=en')).status, 200);
  });
});

test('GET /config/languages lists only enabled languages with status and Beta; paused languages say paused', async () => {
  await withServer(async (call) => {
    assert.deepEqual((await call('GET', '/config/languages')).json, { success: true, data: { languages: [] } });
    await on('cs'); await on('ru', { beta: false });
    const r = (await call('GET', '/config/languages')).json.data.languages;
    assert.deepEqual(r.map((l: any) => [l.code, l.status, l.beta]), [['cs', 'beta', true], ['ru', 'on', false]]);
    assert.equal(r[1].nativeName, 'Русский');
    await store.setGlobalPause(true, 'x'); controls.invalidate();
    assert.ok((await call('GET', '/config/languages')).json.data.languages.every((l: any) => l.status === 'paused'));
  });
});

test('notifications /event accepts a two or three letter lang (fil), drops anything else', async () => {
  const logs: string[] = []; const orig = console.log;
  console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ')); };
  try {
    await withServer(async (call) => {
      for (const lang of ['fil', 'cs', 'FIL', 'filx', 'f', 'f1l']) {
        const r = await call('POST', '/notifications/event', { event: 'language_picked', install_id: 'abcdef0123456789', lang });
        assert.equal(r.status, 204);
      }
    });
  } finally { console.log = orig; }
  const langs = logs.filter((l) => l.startsWith('[BriefingEvent]')).map((l) => JSON.parse(l.replace('[BriefingEvent] ', '')).lang);
  assert.deepEqual(langs, ['fil', 'cs', undefined, undefined, undefined, undefined]);
});
