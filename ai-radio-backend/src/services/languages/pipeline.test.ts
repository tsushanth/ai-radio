/** The whole new-language episode with a mocked model, mocked sources and a mocked speech API: no network, no spend. */
import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, { NODE_ENV: 'test' });
import { buildNewLanguageEpisode, speakExistingScript, LanguageDeniedError, NoSourcesError } from './pipeline.ts';
import { LanguageControls, TtsBreakerTripped } from './controls.ts';
import { MemoryControlStore } from './controls.store.ts';
import { ReadAloudClient, TtsUnavailableError } from './tts.ts';
import { NEW_LANGUAGES } from './registry.ts';
import type { TextResult } from '../../lib/llmText.ts';

const topic = { id: 'tech-news', name: 'Tech News', description: 'd', icon: '', color: '', category: 'technology', sources: [], promptContext: 'x', targetDurationMinutes: 4, isActive: true, languages: ['all'] } as any;
const stories = [{ title: 'A', source: 'X', sourceType: 'rss' }, { title: 'B', source: 'Y', sourceType: 'rss' }, { title: 'C', source: 'Z', sourceType: 'rss' }] as any;
const long = 'Toto je dostatečně dlouhá věta slovy bez jakýchkoli číslic. '.repeat(3);
const SCRIPT = JSON.stringify(Array.from({ length: 6 }, (_, i) => ({ speaker: i % 2 ? 'host2' : 'host1', text: long, type: 'news' })));
const pcm = () => Buffer.alloc(24000 * 2, 3);

function setup(opts: { speech?: Array<number>; key?: string | undefined; stories?: any[]; script?: string; env?: Record<string, string> } = {}) {
  const store = new MemoryControlStore(NEW_LANGUAGES.map((l) => l.code));
  const controls = new LanguageControls({ store, env: opts.env ?? {}, log: () => {} });
  const speechCalls: any[] = []; const modelCalls: number[] = []; let n = 0;
  const fetchImpl = (async (_u: string, init: RequestInit) => {
    speechCalls.push(JSON.parse(String(init.body)));
    const a = (opts.speech ?? [200])[Math.min(n++, (opts.speech ?? [200]).length - 1)];
    return a === 200 ? new Response(pcm(), { status: 200 }) : new Response('x', { status: a });
  }) as unknown as typeof fetch;
  const deps = {
    controls,
    log: () => {},
    makeClient: (h: any) => new ReadAloudClient({ apiKey: () => ('key' in opts ? opts.key : 'k'), fetchImpl, sleep: async () => {}, maxConcurrent: 2, onChars: h.onChars, onOutOfCredits: h.onOutOfCredits }),
    fetchStories: async () => ({ stories: opts.stories ?? stories, sourceLanguage: 'native' as const, via: 'google' as const, totalSources: 1, successfulSources: 1 }),
    script: { log: () => {}, generate: async (): Promise<TextResult> => { modelCalls.push(1); return { text: opts.script ?? SCRIPT, inputTokens: 1, outputTokens: 1, provider: 'openrouter', model: 'm', costUsd: 0, truncated: false }; } },
  };
  return { store, controls, deps, speechCalls, modelCalls };
}
const enable = async (c: LanguageControls, l = 'cs') => { await c.setFlag(l, { enabled: true }, 't'); };

test('happy path: sources, script and speech come out as AudioSegments; 24 sentences are counted as characters; one slot stays used', async () => {
  const s = setup(); await enable(s.controls);
  await s.controls.reserveEpisode('cs');
  const out = await buildNewLanguageEpisode(topic, 'cs', '2026-11-15', s.deps);
  assert.equal(out.script.segments.length, 6); assert.equal(out.audioSegments.length, 6); assert.equal(out.beta, true);
  assert.ok(out.audioSegments.every((a) => a.duration_seconds > 0));
  assert.ok(s.speechCalls.length >= 6 && s.speechCalls.every((c) => c.language_code === 'cs' && ['aria', 'kai'].includes(c.voice) && !('normalize' in c)));
  const sent = s.speechCalls.reduce((n, c) => n + c.text.length, 0);
  assert.equal(out.ttsChars, sent);
  assert.equal((await s.store.getUsage(new Date().toISOString().slice(0, 10))).charsTotal, sent);
  assert.equal((await s.store.getUsage(new Date().toISOString().slice(0, 10))).episodesTotal, 1);
});

test('a language that is off is refused before any model or speech call, and the slot goes back', async () => {
  const s = setup();
  await assert.rejects(buildNewLanguageEpisode(topic, 'cs', '2026-11-15', s.deps), LanguageDeniedError);
  assert.equal(s.modelCalls.length, 0); assert.equal(s.speechCalls.length, 0);
});

test('no READALOUD_API_KEY: fails closed before the model is called, slot released', async () => {
  const s = setup({ key: undefined }); await enable(s.controls);
  await s.controls.reserveEpisode('cs');
  await assert.rejects(buildNewLanguageEpisode(topic, 'cs', '2026-11-15', s.deps), (e: any) => e instanceof TtsUnavailableError && e.reason === 'no_key');
  assert.equal(s.modelCalls.length, 0);
  assert.equal((await s.store.getUsage(new Date().toISOString().slice(0, 10))).episodesTotal, 0);
});

test('no sources: NoSourcesError before any model call, slot released', async () => {
  const s = setup({ stories: [] }); await enable(s.controls);
  await s.controls.reserveEpisode('cs');
  await assert.rejects(buildNewLanguageEpisode(topic, 'cs', '2026-11-15', s.deps), NoSourcesError);
  assert.equal(s.modelCalls.length, 0);
  assert.equal((await s.store.getUsage(new Date().toISOString().slice(0, 10))).episodesTotal, 0);
});

test('a script that keeps digits fails before any speech request and gives the slot back', async () => {
  const bad = JSON.stringify(Array.from({ length: 6 }, () => ({ speaker: 'host1', text: long + ' 2026', type: 'news' })));
  const s = setup({ script: bad }); await enable(s.controls);
  await s.controls.reserveEpisode('cs');
  await assert.rejects(buildNewLanguageEpisode(topic, 'cs', '2026-11-15', s.deps), /digits/);
  assert.equal(s.speechCalls.length, 0); assert.equal(s.modelCalls.length, 2);
  assert.equal((await s.store.getUsage(new Date().toISOString().slice(0, 10))).episodesTotal, 0);
});

test('the TTS character budget is checked before the first speech request: a script that does not fit is not spoken', async () => {
  const s = setup({ env: { LANG_TTS_DAILY_CHARS: '100' } }); await enable(s.controls);
  await s.controls.reserveEpisode('cs');
  await assert.rejects(buildNewLanguageEpisode(topic, 'cs', '2026-11-15', s.deps), TtsBreakerTripped);
  assert.equal(s.speechCalls.length, 0);
});

test('breaker trips in the middle of an episode: the rest is not sent and the slot stays counted (speech had started)', async () => {
  const s = setup({ env: { LANG_TTS_DAILY_CHARS: '600' } }); await enable(s.controls);
  // the script is about 6 x 180 = 1080 characters; the pre-check needs 600 left, so lower the day's total after it passes
  await s.store.addChars(new Date().toISOString().slice(0, 10), 'cs', 0);
  const orig = s.controls.ttsCharsRemaining.bind(s.controls);
  s.controls.ttsCharsRemaining = async () => { await orig(); return 100_000; };
  await s.controls.reserveEpisode('cs');
  await assert.rejects(buildNewLanguageEpisode(topic, 'cs', '2026-11-15', s.deps), TtsBreakerTripped);
  const sent = s.speechCalls.reduce((n, c) => n + c.text.length, 0);
  assert.ok(sent <= 600 + 200, `sent ${sent}`);
  assert.equal(await s.controls.pausedReason(), 'tts_breaker');
  assert.equal((await s.store.getUsage(new Date().toISOString().slice(0, 10))).episodesTotal, 1);
});

test('HTTP 402 pauses all new-language generation (global pause) and fails the episode as unavailable', async () => {
  const s = setup({ speech: [402] }); await enable(s.controls);
  await s.controls.reserveEpisode('cs');
  await assert.rejects(buildNewLanguageEpisode(topic, 'cs', '2026-11-15', s.deps), TtsUnavailableError);
  assert.equal(s.store.breaker.globalPaused, true); assert.equal(s.store.breaker.globalReason, 'readaloud_out_of_credits');
  assert.equal(await s.controls.pausedReason(), 'kill_switch');
});

test('speakExistingScript (admin regenerate-audio): needs the flag, key and an untripped breaker; takes no slot', async () => {
  const s = setup();
  const script = { total_segments: 1, estimated_duration_seconds: 5, generated_at: '', segments: [{ sequence: 1, speaker: 'host1', text: 'Ahoj.', type: 'news' }] } as any;
  await assert.rejects(speakExistingScript('cs', script, s.deps), LanguageDeniedError);
  await enable(s.controls);
  const segs = await speakExistingScript('cs', script, s.deps);
  assert.equal(segs.length, 1);
  assert.equal((await s.store.getUsage(new Date().toISOString().slice(0, 10))).episodesTotal, 0);
  await s.controls.setGlobalPause(true, 'x');
  await assert.rejects(speakExistingScript('cs', script, s.deps), TtsBreakerTripped);
});
