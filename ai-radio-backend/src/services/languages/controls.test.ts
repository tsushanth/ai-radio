import test from 'node:test';
import assert from 'node:assert/strict';
import { LanguageControls, TtsBreakerTripped, readControlsConfig, type Denied } from './controls.ts';
import { MemoryControlStore } from './controls.store.ts';
import { NEW_LANGUAGES } from './registry.ts';

const CODES = NEW_LANGUAGES.map((l) => l.code);
const NOW = new Date('2026-11-15T10:00:00Z');

function make(env: Record<string, string> = {}, clock = { now: NOW }) {
  const store = new MemoryControlStore(CODES);
  const logs: string[] = [];
  const c = new LanguageControls({ store, env, now: () => clock.now, log: (m) => logs.push(m) });
  return { store, c, logs, clock };
}
const denied = (r: unknown) => r as Denied;

test('defaults: every language is OFF, so nothing is available and nothing is listed', async () => {
  const { c } = make();
  assert.equal(await c.isEnabled('cs'), false);
  assert.deepEqual(await c.publicList(), []);
  const r = denied(await c.admitGeneration('cs', 'world-update'));
  assert.equal(r.ok, false); assert.equal(r.http, 400); assert.equal(r.status, 'unavailable'); assert.equal(r.error, 'language_unavailable');
});

test('config defaults: 35 a day for all languages, 150000 characters a day', () => {
  const cfg = readControlsConfig({});
  assert.equal(cfg.globalDailyCap, 35); assert.equal(cfg.ttsDailyChars, 150_000); assert.equal(cfg.killSwitch, false);
});

test('an enabled language is admitted for a launch topic, labelled Beta, with the default 8 a day', async () => {
  const { c, store } = make();
  await c.setFlag('cs', { enabled: true }, 't');
  const a = await c.admitGeneration('cs', 'world-update');
  assert.equal(a.ok, true); assert.equal((a as any).beta, true); assert.equal((a as any).flag.dailyCap, 8);
  assert.deepEqual(await c.publicList(), [{ code: 'cs', name: 'Czech', nativeName: 'Čeština', status: 'beta', beta: true, wave: 1, flag: '🇨🇿', dir: 'ltr', podcast: true, uiTag: 'cs' }]);
  await c.setFlag('cs', { beta: false }, 't');
  assert.equal((await c.publicList())[0].status, 'on');
  assert.equal(store.flags.get('cs')!.updatedBy, 't');
});

test('a topic that is not one of the 12 launch topics is not offered in a new language', async () => {
  const { c } = make();
  await c.setFlag('pl', { enabled: true }, 't');
  const r = denied(await c.admitGeneration('pl', 'us-politics'));
  assert.equal(r.status, 'unavailable'); assert.equal(r.reason, 'topic_not_offered');
});

test('unknown languages (including the Piper ones) have no flag and are unavailable', async () => {
  const { c } = make();
  assert.equal(await c.isEnabled('de'), false);
  assert.equal(denied(await c.admitGeneration('de', 'world-update')).status, 'unavailable');
  await assert.rejects(c.setFlag('de', { enabled: true }, 't'), /unknown new language/);
});

test('per-language daily cap: the 9th episode of a language is refused with daily_cap_reached, other languages are unaffected', async () => {
  const { c } = make();
  await c.setFlag('cs', { enabled: true }, 't'); await c.setFlag('nl', { enabled: true }, 't');
  for (let i = 0; i < 8; i++) assert.equal((await c.reserveEpisode('cs')).ok, true);
  const r = denied(await c.reserveEpisode('cs'));
  assert.equal(r.http, 429); assert.equal(r.status, 'daily_cap_reached'); assert.equal(r.error, 'daily_limit'); assert.equal(r.scope, 'language');
  assert.equal((await c.reserveEpisode('nl')).ok, true);
});

test('the cap is adjustable by data and resets with the UTC day', async () => {
  const { c, clock } = make();
  await c.setFlag('sv', { enabled: true, dailyCap: 1 }, 't');
  assert.equal((await c.reserveEpisode('sv')).ok, true);
  assert.equal(denied(await c.reserveEpisode('sv')).status, 'daily_cap_reached');
  clock.now = new Date('2026-11-16T00:00:05Z');
  assert.equal((await c.reserveEpisode('sv')).ok, true);
});

test('global cap across languages (35 by default) with scope global', async () => {
  const { c } = make({ LANG_GLOBAL_DAILY_CAP: '5' });
  for (const l of ['cs', 'nl', 'pl']) await c.setFlag(l, { enabled: true, dailyCap: 100 }, 't');
  for (let i = 0; i < 3; i++) await c.reserveEpisode('cs');
  for (let i = 0; i < 2; i++) await c.reserveEpisode('nl');
  const r = denied(await c.reserveEpisode('pl'));
  assert.equal(r.status, 'daily_cap_reached'); assert.equal(r.scope, 'global');
});

test('a released slot is available again (generation failed before anything was spent)', async () => {
  const { c } = make();
  await c.setFlag('hu', { enabled: true, dailyCap: 1 }, 't');
  assert.equal((await c.reserveEpisode('hu')).ok, true);
  await c.releaseEpisode('hu');
  assert.equal((await c.reserveEpisode('hu')).ok, true);
});

test('kill switch (database): generation is paused with a clear status, listing shows paused, reading still works', async () => {
  const { c } = make();
  await c.setFlag('cs', { enabled: true }, 't');
  await c.setGlobalPause(true, 'testing');
  const r = denied(await c.admitGeneration('cs', 'world-update'));
  assert.equal(r.http, 503); assert.equal(r.status, 'paused'); assert.equal(r.error, 'language_paused');
  assert.equal(await c.isEnabled('cs'), true);
  assert.equal((await c.publicList())[0].status, 'paused');
  await c.setGlobalPause(false, null);
  assert.equal((await c.admitGeneration('cs', 'world-update')).ok, true);
});

test('kill switch (env NEW_LANGUAGES=off) pauses without touching the database', async () => {
  const { c } = make({ NEW_LANGUAGES: 'off' });
  await c.setFlag('cs', { enabled: true }, 't');
  assert.equal(denied(await c.admitGeneration('cs', 'world-update')).status, 'paused');
});

test('TTS breaker: counts characters, trips above 150000, pauses for the rest of that UTC day only', async () => {
  const { c, clock } = make();
  await c.setFlag('cs', { enabled: true }, 't');
  await c.reserveTtsChars('cs', 100_000);
  await c.reserveTtsChars('cs', 50_000); // exactly at the limit: allowed
  await assert.rejects(c.reserveTtsChars('cs', 1), (e) => e instanceof TtsBreakerTripped);
  assert.equal(denied(await c.admitGeneration('cs', 'world-update')).status, 'paused');
  await assert.rejects(c.reserveTtsChars('cs', 1), TtsBreakerTripped); // no further characters are counted while tripped
  clock.now = new Date('2026-11-16T00:00:30Z');
  c.invalidate();
  assert.equal((await c.admitGeneration('cs', 'world-update')).ok, true);
});

test('ttsCharsRemaining reflects the day and is 0 when the store is unreadable', async () => {
  const { c, store } = make();
  await c.reserveTtsChars('cs', 40_000);
  assert.equal(await c.ttsCharsRemaining(), 110_000);
  store.failing = true;
  assert.equal(await c.ttsCharsRemaining(), 0);
});

test('fail closed: an unreadable store turns every language off and refuses slots and speech', async () => {
  const { c, store, logs } = make();
  await c.setFlag('cs', { enabled: true }, 't');
  c.invalidate();
  store.failing = true;
  assert.equal(await c.isEnabled('cs'), false);
  assert.equal(denied(await c.admitGeneration('cs', 'world-update')).status, 'unavailable');
  assert.equal(denied(await c.reserveEpisode('cs')).status, 'unavailable');
  await assert.rejects(c.reserveTtsChars('cs', 10), TtsBreakerTripped);
  assert.deepEqual(await c.publicList(), []);
  assert.ok(logs.length > 0);
});

test('flag reads are cached for 30 seconds and a flip through the controls is visible at once', async () => {
  const { c, store } = make();
  await c.setFlag('cs', { enabled: true }, 't');
  assert.equal(await c.isEnabled('cs'), true);
  store.flags.get('cs')!.enabled = false; // changed behind the cache (another machine)
  assert.equal(await c.isEnabled('cs'), true);
  c.invalidate();
  assert.equal(await c.isEnabled('cs'), false);
});

test('flag patches are validated (cap range, voice id characters)', async () => {
  const { c } = make();
  await assert.rejects(c.setFlag('cs', { dailyCap: -1 }, 't'), /dailyCap/);
  await assert.rejects(c.setFlag('cs', { voice: 'Bad Voice!' }, 't'), /voice/);
  const f = await c.setFlag('cs', { voice: 'cora', voiceHost2: 'hugo' }, 't');
  assert.equal(f.voice, 'cora'); assert.equal(f.voiceHost2, 'hugo');
});

test('public list: the original keys keep their exact values, the new keys are additive (flag, dir, podcast, uiTag only when the app has one)', async () => {
  const { c } = make();
  for (const l of ['ca', 'sr', 'ar']) await c.setFlag(l, { enabled: true }, 't');
  const list = await c.publicList();
  const by = Object.fromEntries(list.map((e) => [e.code, e]));
  assert.deepEqual(Object.keys(by).sort(), ['ar', 'ca', 'sr']);
  for (const e of list) {
    // old clients read only these six: names, types and the status/beta/wave semantics are unchanged
    assert.equal(typeof e.name, 'string'); assert.equal(typeof e.nativeName, 'string'); assert.equal(e.status, 'beta'); assert.equal(e.beta, true); assert.equal(e.wave, 3);
    assert.equal(e.podcast, true);
  }
  assert.equal(by.ar.dir, 'rtl'); assert.equal(by.ar.uiTag, 'ar'); assert.equal(by.ar.flag, null);
  assert.equal(by.ca.dir, 'ltr'); assert.equal(by.ca.flag, null); assert.ok(!('uiTag' in by.ca));
  assert.equal(by.sr.flag, '🇷🇸'); assert.equal(by.sr.nativeName, 'Srpski');
});

test('wave 3: 11 languages registered, da is not a language', () => {
  const w3 = NEW_LANGUAGES.filter((l) => l.wave === 3).map((l) => l.code).sort();
  assert.deepEqual(w3, ['ar', 'ca', 'hr', 'ms', 'no', 'sk', 'sl', 'sr', 'th', 'vi', 'zh']);
  assert.ok(!CODES.includes('da'));
});

test('flags off fail closed for every wave 3 language: not listed, not admitted, not readable', async () => {
  const { c } = make();
  for (const l of NEW_LANGUAGES.filter((x) => x.wave === 3)) {
    assert.equal(await c.isEnabled(l.code), false, l.code);
    assert.equal(denied(await c.admitGeneration(l.code, 'world-update')).error, 'language_unavailable', l.code);
  }
  assert.deepEqual(await c.publicList(), []);
});

test('flags unreadable: nothing is listed and nothing is admitted (fail closed)', async () => {
  const { c, store } = make();
  await c.setFlag('vi', { enabled: true }, 't');
  c.invalidate(); store.failing = true;
  assert.deepEqual(await c.publicList(), []);
  assert.equal(denied(await c.admitGeneration('vi', 'world-update')).status, 'unavailable');
});

test('per-language cap 2 (wave 3 rows): the third request of the day is refused, other languages are not affected by it', async () => {
  const { c, store } = make();
  for (const l of ['ca', 'vi']) { await c.setFlag(l, { enabled: true, dailyCap: 2 }, 't'); }
  assert.equal((await c.reserveEpisode('ca')).ok, true); assert.equal((await c.reserveEpisode('ca')).ok, true);
  const third = denied(await c.reserveEpisode('ca'));
  assert.equal(third.status, 'daily_cap_reached'); assert.equal(third.scope, 'language');
  assert.equal((await c.reserveEpisode('vi')).ok, true);
  assert.equal(store.usage.get('2026-11-15|ca')!.episodes, 2);
});
