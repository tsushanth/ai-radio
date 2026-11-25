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


// ---------------------------------------------------------------------------------------------------------------------
// Wave 3: additive language list, stations, generating hint, old clients

const WAVE3 = ['ar', 'ca', 'hr', 'ms', 'no', 'sk', 'sl', 'sr', 'th', 'vi', 'zh'];

test('GET /config/languages: original keys unchanged, additive flag / dir / podcast / uiTag; old clients that read code, status, beta are unaffected', async () => {
  await on('cs'); await on('ca'); await on('ar');
  await withServer(async (call) => {
    const r = await call('GET', '/config/languages');
    assert.equal(r.status, 200); assert.equal(r.json.success, true);
    const by = Object.fromEntries(r.json.data.languages.map((l: any) => [l.code, l]));
    assert.deepEqual(by.cs, { code: 'cs', name: 'Czech', nativeName: 'Čeština', status: 'beta', beta: true, wave: 1, flag: '🇨🇿', dir: 'ltr', podcast: true, uiTag: 'cs' });
    assert.deepEqual(by.ca, { code: 'ca', name: 'Catalan', nativeName: 'Català', status: 'beta', beta: true, wave: 3, flag: null, dir: 'ltr', podcast: true });
    assert.equal(by.ar.dir, 'rtl');
    // what the shipped Android parser reads (RemoteLanguages: code, status, beta): present and of the same type for every entry
    for (const l of r.json.data.languages) { assert.equal(typeof l.code, 'string'); assert.ok(['on', 'beta', 'paused'].includes(l.status)); assert.equal(typeof l.beta, 'boolean'); }
  });
});

test('GET /config/languages: all 11 wave 3 languages are absent while their flags are off (14 + enabled only)', async () => {
  await on('cs');
  await withServer(async (call) => {
    const codes = (await call('GET', '/config/languages')).json.data.languages.map((l: any) => l.code);
    assert.deepEqual(codes, ['cs']);
    for (const l of WAVE3) assert.ok(!codes.includes(l), l);
  });
});

test('GET /config/stations: flags off or controls unreadable -> English live station only, with the existing mount URLs', async () => {
  const { stationOverrides } = await import('../services/languages/stations');
  stationOverrides.countPlayable = async () => { throw new Error('should not be asked'); };
  process.env.RADIO_STREAM_BASE_URL = 'https://radio.audexa.app';
  const radioEnv = (await import('../config/environment')).env as any; radioEnv.RADIO_STREAM_BASE_URL = 'https://radio.audexa.app';
  const { resetStationsCache } = await import('./config');
  resetStationsCache();
  await withServer(async (call) => {
    const r = await call('GET', '/config/stations');
    assert.equal(r.status, 200);
    assert.deepEqual(r.json.data.stations, [{ code: 'en', name: 'English', nativeName: 'English', kind: 'live', streamUrl: 'https://radio.audexa.app/stream', statusUrl: 'https://radio.audexa.app/api/status', enabled: true, dir: 'ltr' }]);
    store.failing = true; controls.invalidate(); resetStationsCache();
    const bad = await call('GET', '/config/stations');
    assert.equal(bad.status, 200); assert.deepEqual(bad.json.data.stations.map((s: any) => s.code), ['en']);
    store.failing = false;
  });
  delete (stationOverrides as any).countPlayable;
});

test('GET /config/stations: an enabled language is a playlist station only when it has playable audio; database errors degrade to English', async () => {
  const { stationOverrides } = await import('../services/languages/stations');
  const { resetStationsCache } = await import('./config');
  await on('ca'); await on('vi'); await on('sr'); await on('zh', {});
  let asked: string[][] = [];
  stationOverrides.countPlayable = async (l) => { asked.push(l); return { ca: 3, sr: 1, zh: 5, vi: 0 }; };
  resetStationsCache();
  await withServer(async (call) => {
    const r = await call('GET', '/config/stations');
    const st = r.json.data.stations;
    assert.deepEqual(st.map((s: any) => s.code), ['en', 'ca', 'sr', 'zh']); // vi is enabled but has zero audio: not a station
    assert.deepEqual(st[1], { code: 'ca', name: 'Catalan', nativeName: 'Català', kind: 'playlist', playlistUrl: '/api/config/stations/ca/playlist', enabled: true, dir: 'ltr' });
    assert.ok(!('streamUrl' in st[1]) && !('statusUrl' in st[1]));
    assert.deepEqual([...asked[0]].sort(), ['ca', 'sr', 'vi', 'zh']);
    // cached for 60 s: a second call does not ask again
    await call('GET', '/config/stations'); assert.equal(asked.length, 1);
    // database failure -> English only
    resetStationsCache(); stationOverrides.countPlayable = async () => { throw new Error('db down'); };
    assert.deepEqual((await call('GET', '/config/stations')).json.data.stations.map((s: any) => s.code), ['en']);
  });
  delete (stationOverrides as any).countPlayable;
});

test('GET /config/stations/:code/playlist: 404 for a language that is off or unknown; the episodes for an enabled one', async () => {
  const { stationOverrides } = await import('../services/languages/stations');
  await on('ca'); await on('zh');
  stationOverrides.listPlayable = async (l) => [{ episodeId: `world-update-d-${l}`, topicId: 'world-update', title: 't', audioUrl: 'https://x.test/a.mp3', durationSeconds: 120, date: today() }];
  await withServer(async (call) => {
    assert.equal((await call('GET', '/config/stations/vi/playlist')).status, 404);
    assert.equal((await call('GET', '/config/stations/xx/playlist')).status, 404);
    const r = await call('GET', '/config/stations/ca/playlist');
    assert.equal(r.status, 200); assert.equal(r.json.data.items[0].audioUrl, 'https://x.test/a.mp3'); assert.equal(r.json.data.code, 'ca');
  });
  delete (stationOverrides as any).listPlayable;
});

test('on-demand path for a wave 3 language: the generating answer carries status generating and a retry hint; an existing completed episode does not', async () => {
  await on('sk');
  await withServer(async (call) => {
    const r = await call('POST', '/topics/world-update/generate', { language: 'sk' });
    assert.equal(r.status, 200); assert.equal(r.json.data.status, 'generating'); assert.equal(r.json.data.retryAfterSeconds, 45);
    assert.match(r.json.data.generatingMessage, /few minutes/);
    gen.existing = { id: 'e', status: 'generating', language: 'sk' };
    const poll = await call('GET', '/topics/world-update/episode?lang=sk');
    assert.equal(poll.json.data.status, 'generating'); assert.equal(poll.json.data.retryAfterSeconds, 45);
    gen.existing = { id: 'e', status: 'completed', language: 'sk' };
    const done = await call('POST', '/topics/world-update/generate', { language: 'sk' });
    assert.ok(!('retryAfterSeconds' in done.json.data));
  });
});

test('old clients: English and the Piper languages get no generating-hint fields and no new keys', async () => {
  await withServer(async (call) => {
    const r = await call('POST', '/topics/world-update/generate', { language: 'es' });
    assert.ok(!('retryAfterSeconds' in r.json.data) && !('status' in r.json.data));
  });
});

test('a wave 3 language that is off cannot be reached on any route: generate, episode and episodes are all language_unavailable', async () => {
  await withServer(async (call) => {
    for (const l of WAVE3) {
      assert.equal((await call('POST', '/topics/world-update/generate', { language: l })).json.error, 'language_unavailable', l);
      assert.equal((await call('GET', `/topics/world-update/episode?lang=${l}`)).status, 400, l);
      assert.equal((await call('GET', `/topics?lang=${l}`)).json.data.topics.length, 0, l);
    }
  });
  assert.equal(gen.calls.length, 0);
});

test('GET episode says topicOffered false only for a topic that is not made in that new language', async () => {
  await on('el');
  await withServer(async (call) => {
    const refused = await call('GET', '/topics/us-politics/episode?lang=el');
    assert.equal(refused.status, 200); assert.equal(refused.json.data.topicOffered, false); assert.equal(refused.json.data.episode.status, 'not_generated');
    assert.equal((await call('GET', '/topics/world-update/episode?lang=el')).json.data.topicOffered, undefined);
    assert.equal((await call('GET', '/topics/us-politics/episode?lang=en')).json.data.topicOffered, undefined);
  });
});
