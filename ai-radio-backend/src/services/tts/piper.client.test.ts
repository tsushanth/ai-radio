import test from 'node:test';
import assert from 'node:assert/strict';
import { PiperTtsClient, PiperBusyError, PiperError, splitText, pcmToWav, PIPER_SAMPLE_RATE } from './piper.client.ts';

const TOKEN = 'tok_secret_value_123';
const pcm = (seconds: number) => Buffer.alloc(Math.round(seconds * PIPER_SAMPLE_RATE * 2), 1);

/** A fake Piper: scripted /health answers, scripted /v1/tts/stream answers, and a log of everything that happened in order. */
function fake(opts: { health?: Array<number | 'bad' | 'bad-but-busy' | 'throw'>; tts?: Array<number | { status: number; retryAfter?: string }>; audio?: Buffer | ((call: number) => Buffer) } = {}) {
  const log: string[] = []; const posts: Array<{ headers: Record<string, string>; body: any }> = [];
  let h = 0, t = 0, calls = 0, inflight = 0, maxInflight = 0; let clock = 0;
  const fetchImpl = (async (url: string, init?: RequestInit) => {
    if (url.endsWith('/health')) {
      const next = opts.health?.[Math.min(h++, (opts.health?.length ?? 1) - 1)] ?? 0; log.push(`health:${next}`);
      if (next === 'throw') throw new Error('down');
      if (next === 'bad') return new Response('x', { status: 500 });
      if (next === 'bad-but-busy') return new Response(JSON.stringify({ active: 9 }), { status: 500 });
      return new Response(JSON.stringify({ active: next }), { status: 200 });
    }
    calls++; inflight++; maxInflight = Math.max(maxInflight, inflight); log.push('post');
    posts.push({ headers: init!.headers as Record<string, string>, body: JSON.parse(String(init!.body)) });
    await new Promise((r) => setTimeout(r, 5));
    inflight--;
    const step = opts.tts?.[Math.min(t++, (opts.tts?.length ?? 1) - 1)] ?? 200;
    const status = typeof step === 'number' ? step : step.status;
    if (status !== 200) return new Response('nope ' + TOKEN, { status, headers: typeof step === 'object' && step.retryAfter ? { 'retry-after': step.retryAfter } : {} });
    const audio = typeof opts.audio === 'function' ? opts.audio(calls) : opts.audio;
    return new Response(audio ?? pcm(1), { status: 200 });
  }) as unknown as typeof fetch;
  const sleeps: number[] = [];
  const sleep = async (ms: number) => { sleeps.push(ms); clock += ms; };
  const client = (extra: Record<string, unknown> = {}) => new PiperTtsClient({ baseUrl: 'http://piper.test/', token: TOKEN, fetchImpl, sleep, now: () => clock, pollMs: 2000, maxWaitMs: 10_000, retries: 3, ...extra });
  return { client, log, posts, sleeps, maxInflight: () => maxInflight };
}

test('splitText keeps every word, splits at sentence ends, and never exceeds the limit', () => {
  const text = Array.from({ length: 40 }, (_, i) => `This is sentence number ${i} of the script.`).join(' ');
  const chunks = splitText(text, 200);
  assert.ok(chunks.length > 1); assert.ok(chunks.every((c) => c.length <= 200));
  assert.equal(chunks.join(' '), text);
  assert.ok(chunks.slice(0, -1).every((c) => /[.!?]$/.test(c)), 'chunks end at sentence boundaries');
});

test('splitText hard-splits one enormous sentence on whitespace and returns nothing for empty text', () => {
  const long = Array.from({ length: 300 }, () => 'word').join(' ');
  const chunks = splitText(long, 100);
  assert.ok(chunks.every((c) => c.length <= 100)); assert.equal(chunks.join(' '), long);
  assert.deepEqual(splitText('   '), []);
});

test('pcmToWav writes a valid 44 byte header for 24 kHz mono 16-bit and keeps the audio', () => {
  const data = pcm(0.5); const wav = pcmToWav(data);
  assert.equal(wav.subarray(0, 4).toString(), 'RIFF'); assert.equal(wav.subarray(8, 12).toString(), 'WAVE'); assert.equal(wav.subarray(36, 40).toString(), 'data');
  assert.equal(wav.readUInt32LE(4), wav.length - 8); assert.equal(wav.readUInt32LE(24), 24000); assert.equal(wav.readUInt16LE(22), 1); assert.equal(wav.readUInt16LE(34), 16);
  assert.equal(wav.readUInt32LE(40), data.length); assert.equal(wav.length, 44 + data.length);
});

test('a request goes to /v1/tts/stream with the bearer token, the voice, speed and pcm format, and the duration comes from the audio', async () => {
  const f = fake({ audio: pcm(2) });
  const r = await f.client().synthesize('Hello there.', 'custom:en-us-warm-f', 1.1);
  assert.deepEqual(f.posts[0].body, { text: 'Hello there.', voice: 'custom:en-us-warm-f', speed: 1.1, format: 'pcm_24000' });
  assert.equal(f.posts[0].headers.Authorization, `Bearer ${TOKEN}`);
  assert.ok(Math.abs(r.durationSeconds - 2) < 0.001); assert.equal(r.wav.subarray(0, 4).toString(), 'RIFF');
});

test('it waits while Piper reports busy sessions and only sends once it is quiet', async () => {
  const f = fake({ health: [3, 3, 0] });
  await f.client().synthesize('Hi.', 'v');
  assert.deepEqual(f.log, ['health:3', 'health:3', 'health:0', 'post']);
  assert.deepEqual(f.sleeps, [2000, 2000]);
});

test('below the busy threshold it does not wait', async () => {
  const f = fake({ health: [1] });
  await f.client().synthesize('Hi.', 'v');
  assert.deepEqual(f.log, ['health:1', 'post']); assert.deepEqual(f.sleeps, []);
});

test('still busy after the wait: PiperBusyError and nothing is sent (the episode is deferred)', async () => {
  const f = fake({ health: [5] });
  await assert.rejects(f.client().synthesize('Hi.', 'v'), (e) => e instanceof PiperBusyError);
  assert.deepEqual(f.posts, []); assert.ok(f.sleeps.length >= 4);
});

test('onBusyTimeout "proceed" sends anyway, as the live radio does', async () => {
  const f = fake({ health: [5] });
  await f.client({ onBusyTimeout: 'proceed' }).synthesize('Hi.', 'v');
  assert.equal(f.posts.length, 1);
});

test('an unusable /health (error status or unreachable) does not block the request', async () => {
  for (const h of ['bad', 'throw'] as const) {
    const f = fake({ health: [h] }); await f.client().synthesize('Hi.', 'v'); assert.equal(f.posts.length, 1, h);
  }
});

test('503 and 429 are retried after the server\'s Retry-After, with growing delays, then succeed', async () => {
  const f = fake({ tts: [{ status: 503, retryAfter: '3' }, { status: 429 }, 200] });
  await f.client().synthesize('Hi.', 'v');
  assert.equal(f.posts.length, 3);
  assert.deepEqual(f.sleeps, [3000, 2000]); // 3s * 2^0, then default 1s * 2^1
});

test('it gives up after the retries with a short error that never contains the token', async () => {
  const f = fake({ tts: [503] });
  await assert.rejects(f.client({ retries: 2 }).synthesize('Hi.', 'v'), (e: Error) => e instanceof PiperError && !(e instanceof PiperBusyError) && !e.message.includes(TOKEN) && /3 attempts/.test(e.message));
  assert.equal(f.posts.length, 3);
});

test('other server errors are not retried and do not leak the token or the response body', async () => {
  const f = fake({ tts: [401] });
  await assert.rejects(f.client().synthesize('Hi.', 'v'), (e: Error) => e instanceof PiperError && !e.message.includes(TOKEN) && !/nope/.test(e.message));
  assert.equal(f.posts.length, 1);
});

test('empty audio is an error, not a silent episode', async () => {
  const f = fake({ audio: Buffer.alloc(0) });
  await assert.rejects(f.client().synthesize('Hi.', 'v'), PiperError);
});

test('long text is sent in order, one chunk per request, and the audio is joined', async () => {
  const f = fake({ audio: pcm(1) });
  const text = Array.from({ length: 60 }, (_, i) => `Sentence ${i} is here and it keeps going for a while.`).join(' ');
  const r = await f.client().synthesize(text, 'v');
  const sent = f.posts.map((p) => p.body.text);
  assert.ok(sent.length > 1); assert.equal(sent.join(' '), text); assert.ok(Math.abs(r.durationSeconds - sent.length) < 0.01);
});

test('only one request is in flight at a time, even when several are asked for at once', async () => {
  const f = fake(); const c = f.client();
  await Promise.all([c.synthesize('One.', 'v'), c.synthesize('Two.', 'v'), c.synthesize('Three.', 'v')]);
  assert.equal(f.maxInflight(), 1); assert.deepEqual(f.posts.map((p) => p.body.text), ['One.', 'Two.', 'Three.']);
});

test('a failed request does not stop the ones queued behind it', async () => {
  const f = fake({ tts: [401, 200] }); const c = f.client();
  const [a, b] = await Promise.allSettled([c.synthesize('Bad.', 'v'), c.synthesize('Good.', 'v')]);
  assert.equal(a.status, 'rejected'); assert.equal(b.status, 'fulfilled');
});

test('an error answer from /health is not trusted, even if its body says Piper is busy', async () => {
  const f = fake({ health: ['bad-but-busy'] });
  await f.client().synthesize('Hi.', 'v');
  assert.deepEqual(f.sleeps, []); assert.equal(f.posts.length, 1);
});

test('an empty answer for one chunk of a long text fails the whole text, not just that chunk', async () => {
  const f = fake({ audio: (call) => (call === 2 ? Buffer.alloc(0) : pcm(1)) });
  const text = Array.from({ length: 60 }, (_, i) => `Sentence ${i} is here and it keeps going for a while.`).join(' ');
  await assert.rejects(f.client().synthesize(text, 'v'), /empty audio/);
});
