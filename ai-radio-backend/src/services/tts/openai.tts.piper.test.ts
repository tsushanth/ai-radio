import test, { afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { openaiTTS, MIN_SEGMENT_SUCCESS_RATIO } from './openai.tts.ts';
import { PiperBusyError, PIPER_SAMPLE_RATE } from './piper.client.ts';

const svc = openaiTTS as any;
const original = { synthesizeSegment: svc.synthesizeSegment, synthesize: svc.synthesize, fetch: globalThis.fetch, backend: process.env.TTS_BACKEND, token: process.env.PIPER_AUTH_TOKEN };
afterEach(() => {
  svc.synthesizeSegment = original.synthesizeSegment; svc.synthesize = original.synthesize; globalThis.fetch = original.fetch;
  if (original.backend === undefined) delete process.env.TTS_BACKEND; else process.env.TTS_BACKEND = original.backend;
  if (original.token === undefined) delete process.env.PIPER_AUTH_TOKEN; else process.env.PIPER_AUTH_TOKEN = original.token;
});

const script = (n: number) => ({ total_segments: n, segments: Array.from({ length: n }, (_, i) => ({ sequence: i + 1, speaker: i % 2 ? 'host2' : 'host1', type: 'news', text: `Segment ${i + 1}.` })) }) as any;
const voices = { host1: 'nova', host2: 'onyx', model: 'tts-1-hd', speed: 1 } as any;
const ok = (seg: any) => ({ buffer: Buffer.from('x'), duration_seconds: 10, speaker: seg.speaker, segment_type: 'news' });

test('an episode with enough spoken segments is accepted, skipping the odd failed one', async () => {
  svc.synthesizeSegment = async (seg: any) => { if (seg.sequence === 3) throw new Error('slow'); return ok(seg); };
  const out = await openaiTTS.synthesizeScript(script(8), voices); // 7/8 = 87%
  assert.equal(out.length, 7);
});

test('an episode with too few spoken segments fails instead of being published as a fragment', async () => {
  svc.synthesizeSegment = async (seg: any) => { if (seg.sequence > 2) throw new Error('slow'); return ok(seg); };
  await assert.rejects(openaiTTS.synthesizeScript(script(8), voices), /Too many segments failed/); // 2/8 = 25%
});

test('the cut-off is a share of the script: exactly at the minimum passes, one below fails', async () => {
  const need = Math.ceil(8 * MIN_SEGMENT_SUCCESS_RATIO);
  svc.synthesizeSegment = async (seg: any) => { if (seg.sequence > need) throw new Error('x'); return ok(seg); };
  assert.equal((await openaiTTS.synthesizeScript(script(8), voices)).length, need);
  svc.synthesizeSegment = async (seg: any) => { if (seg.sequence > need - 1) throw new Error('x'); return ok(seg); };
  await assert.rejects(openaiTTS.synthesizeScript(script(8), voices), /Too many segments/);
});

test('when Piper is busy the whole episode is deferred: the error comes out and no later segment is tried', async () => {
  const tried: number[] = [];
  svc.synthesizeSegment = async (seg: any) => { tried.push(seg.sequence); if (seg.sequence === 2) throw new PiperBusyError('busy'); return ok(seg); };
  await assert.rejects(openaiTTS.synthesizeScript(script(8), voices), (e) => e instanceof PiperBusyError);
  assert.deepEqual(tried, [1, 2]);
});

test('a busy Piper is not retried inside the segment', async () => {
  let calls = 0;
  svc.synthesize = async () => { calls++; throw new PiperBusyError('busy'); };
  await assert.rejects(openaiTTS.synthesizeWithRetry({ text: 'Hi.', voice: 'nova', speed: 1 } as any), (e) => e instanceof PiperBusyError);
  assert.equal(calls, 1);
});

test('ordinary failures are still retried', async () => {
  let calls = 0;
  svc.synthesize = async () => { calls++; if (calls < 3) throw new Error('blip'); return { audio_buffer: Buffer.from('x'), duration_seconds: 1, format: 'wav' }; };
  const r = await openaiTTS.synthesizeWithRetry({ text: 'Hi.', voice: 'nova', speed: 1 } as any, 3);
  assert.equal(calls, 3); assert.equal(r.duration_seconds, 1);
});

test('with TTS_BACKEND=piper, host voices map to the warm female and warm male Piper voices and the audio is a WAV', async () => {
  process.env.TTS_BACKEND = 'piper'; process.env.PIPER_AUTH_TOKEN = 'tok';
  const voicesSeen: string[] = [];
  globalThis.fetch = (async (url: string, init?: RequestInit) => {
    if (String(url).endsWith('/health')) return new Response(JSON.stringify({ active: 0 }));
    voicesSeen.push(JSON.parse(String(init!.body)).voice);
    return new Response(Buffer.alloc(PIPER_SAMPLE_RATE * 2, 1));
  }) as typeof fetch;
  const f = await openaiTTS.synthesize({ text: 'Hi.', voice: 'nova', speed: 1 } as any);
  const m = await openaiTTS.synthesize({ text: 'Hi.', voice: 'onyx', speed: 1 } as any);
  assert.deepEqual(voicesSeen, ['custom:en-us-warm-f', 'custom:en-us-warm-m']);
  assert.equal(f.format, 'wav'); assert.equal(f.audio_buffer.subarray(0, 4).toString(), 'RIFF'); assert.ok(Math.abs(f.duration_seconds - 1) < 0.01); assert.ok(m.duration_seconds > 0);
});

test('with TTS_BACKEND=piper, a non-English segment is refused before anything is sent', async () => {
  process.env.TTS_BACKEND = 'piper'; process.env.PIPER_AUTH_TOKEN = 'tok';
  let sent = 0; globalThis.fetch = (async () => { sent++; return new Response('x'); }) as typeof fetch;
  await assert.rejects(openaiTTS.synthesize({ text: 'Hola.', voice: 'nova', speed: 1, language_code: 'es' } as any), /English only/);
  assert.equal(sent, 0);
});
