import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ReadAloudClient, TtsUnavailableError, splitSpeech, normalizeFor, hasDevanagariDigits, stripId3, synthesizeScript, READALOUD_MAX_CHARS,
} from './tts.ts';
import { requireLanguageSpec } from './registry.ts';
import { readWavInfo } from '../audio/episode-audio.ts';

const pcm = (seconds: number, amp = 8000) => {
  const n = Math.round(seconds * 24000); const b = Buffer.alloc(n * 2);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.round(amp * Math.sin(i / 8)), i * 2);
  return b;
};

interface Call { url: string; headers: Record<string, string>; body: any }
/** A fake ReadAloud API. `answers` scripts the status of each request in order (the last one repeats). */
function fakeApi(answers: Array<number | 'throw'> = [200], audio: (c: Call) => Buffer = () => pcm(0.5)) {
  const calls: Call[] = []; let n = 0; let inflight = 0; let maxInflight = 0;
  const fetchImpl = (async (url: string, init: RequestInit) => {
    const call: Call = { url, headers: init.headers as Record<string, string>, body: JSON.parse(String(init.body)) };
    calls.push(call);
    inflight++; maxInflight = Math.max(maxInflight, inflight);
    await new Promise((r) => setTimeout(r, 3));
    inflight--;
    const a = answers[Math.min(n++, answers.length - 1)];
    if (a === 'throw') throw new Error('network down');
    if (a !== 200) return new Response('error body mentioning KEY-SECRET', { status: a });
    return new Response(audio(call), { status: 200 });
  }) as unknown as typeof fetch;
  return { fetchImpl, calls, maxInflight: () => maxInflight };
}
const client = (api: ReturnType<typeof fakeApi>, extra: Record<string, unknown> = {}) =>
  new ReadAloudClient({ baseUrl: 'https://api.example.test/', apiKey: () => 'KEY-SECRET', fetchImpl: api.fetchImpl, sleep: async () => {}, maxConcurrent: 2, ...extra });

test('request shape on the native route: Bearer key, voice, language_code, pcm_24000, no normalize for languages without a policy', async () => {
  const api = fakeApi();
  const r = await client(api).synthesize({ text: 'Ahoj světe.', voice: 'aria', language: 'cs' });
  assert.equal(r.format, 'pcm');
  const c = api.calls[0];
  assert.equal(c.url, 'https://api.example.test/v1/text-to-speech');
  assert.equal(c.headers.Authorization, 'Bearer KEY-SECRET');
  assert.deepEqual(c.body, { text: 'Ahoj světe.', voice: 'aria', language_code: 'cs', format: 'pcm_24000' });
  assert.ok(!('normalize' in c.body));
});

test('mp3 route: POST /v1/text-to-speech/{voice}?output_format=mp3_44100_128 with language_code in the body', async () => {
  const api = fakeApi([200], () => Buffer.from('ID3xxxxxxxxxxxxxx'));
  const r = await client(api, { format: 'mp3' }).synthesize({ text: 'Hej.', voice: 'kai', language: 'sv' });
  assert.equal(r.format, 'mp3');
  assert.equal(api.calls[0].url, 'https://api.example.test/v1/text-to-speech/kai?output_format=mp3_44100_128');
  assert.deepEqual(api.calls[0].body, { text: 'Hej.', language_code: 'sv' });
});

test('missing key fails closed before any request', async () => {
  const api = fakeApi();
  await assert.rejects(client(api, { apiKey: () => undefined }).synthesize({ text: 'x', voice: 'aria', language: 'cs' }), (e: any) => e instanceof TtsUnavailableError && e.reason === 'no_key');
  await assert.rejects(client(api, { apiKey: () => '   ' }).synthesize({ text: 'x', voice: 'aria', language: 'cs' }), TtsUnavailableError);
  assert.equal(api.calls.length, 0);
  assert.equal(client(api, { apiKey: () => undefined }).isConfigured(), false);
});

test('over 5000 characters is refused locally; empty text too', async () => {
  const api = fakeApi();
  await assert.rejects(client(api).synthesize({ text: 'x'.repeat(READALOUD_MAX_CHARS + 1), voice: 'aria', language: 'cs' }), /5000/);
  await assert.rejects(client(api).synthesize({ text: '  ', voice: 'aria', language: 'cs' }), /empty/);
  assert.equal(api.calls.length, 0);
});

test('HTTP 402: no retry, onOutOfCredits once, later requests fail without calling the API', async () => {
  const api = fakeApi([402]); let credits = 0;
  const c = client(api, { onOutOfCredits: () => { credits++; } });
  await assert.rejects(c.synthesize({ text: 'a', voice: 'aria', language: 'cs' }), (e: any) => e instanceof TtsUnavailableError && e.reason === 'out_of_credits');
  await assert.rejects(c.synthesize({ text: 'b', voice: 'aria', language: 'cs' }), TtsUnavailableError);
  assert.equal(api.calls.length, 1); assert.equal(credits, 1);
});

test('HTTP 503 then 200: a retry succeeds; four 503s fail; 502, 429 and a network error are retried too', async () => {
  for (const first of [503, 502, 429, 'throw'] as const) {
    const api = fakeApi([first, 200]);
    assert.equal((await client(api).synthesize({ text: 'a', voice: 'aria', language: 'cs' })).format, 'pcm');
    assert.equal(api.calls.length, 2);
  }
  const slow = fakeApi([503, 503, 503, 200]);
  assert.equal((await client(slow).synthesize({ text: 'a', voice: 'aria', language: 'cs' })).format, 'pcm');
  assert.equal(slow.calls.length, 4);
  const bad = fakeApi([503, 503, 503, 503, 200]);
  await assert.rejects(client(bad).synthesize({ text: 'a', voice: 'aria', language: 'cs' }), /failed: HTTP 503/);
  assert.equal(bad.calls.length, 4);
});

test('other 4xx (413, 400) are not retried; 401 and 403 mean the key is refused; no error text leaks the key', async () => {
  for (const status of [413, 400]) {
    const api = fakeApi([status]);
    await assert.rejects(client(api).synthesize({ text: 'a', voice: 'aria', language: 'cs' }), (e: any) => !/KEY-SECRET/.test(e.message) && /HTTP/.test(e.message));
    assert.equal(api.calls.length, 1);
  }
  const api = fakeApi([401]);
  await assert.rejects(client(api).synthesize({ text: 'a', voice: 'aria', language: 'cs' }), (e: any) => e instanceof TtsUnavailableError && !/KEY-SECRET/.test(e.message));
});

test('characters are counted per HTTP attempt: a retry counts again; a counter that throws stops the attempt', async () => {
  const counted: number[] = [];
  const api = fakeApi([503, 200]);
  await client(api, { onChars: async (n: number) => { counted.push(n); } }).synthesize({ text: 'abcde', voice: 'aria', language: 'cs' });
  assert.deepEqual(counted, [5, 5]);
  const api2 = fakeApi();
  const stop = new Error('breaker');
  await assert.rejects(client(api2, { onChars: async () => { throw stop; } }).synthesize({ text: 'x', voice: 'aria', language: 'cs' }), (e) => e === stop);
  assert.equal(api2.calls.length, 0);
});

test('at most 2 requests are in flight at once', async () => {
  const api = fakeApi();
  const c = client(api);
  await Promise.all(Array.from({ length: 8 }, (_, i) => c.synthesize({ text: `t${i}`, voice: 'aria', language: 'cs' })));
  assert.equal(api.maxInflight(), 2);
});

test('number policy: normalize is never sent for the languages measured worse or unmeasured; hi only with Devanagari digits', () => {
  for (const code of ['cs', 'el', 'fi', 'hu', 'ro', 'sv', 'uk', 'nl', 'pl', 'ru', 'tr', 'id', 'ja']) {
    assert.equal(normalizeFor(requireLanguageSpec(code), 'Tohle je 12 a १२'), undefined, code);
  }
  const hi = requireLanguageSpec('hi');
  assert.equal(normalizeFor(hi, 'दो हज़ार'), undefined);
  assert.equal(normalizeFor(hi, 'साल २०२६'), 'numbers');
  assert.equal(hasDevanagariDigits('abc'), false);
});

test('splitSpeech: pieces stay under the limit, keep every word, break at sentence ends, and handle Japanese and Hindi marks', () => {
  const text = Array.from({ length: 30 }, (_, i) => `Toto je věta číslo ${i}.`).join(' ');
  const parts = splitSpeech(text, 170);
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= 170));
  assert.equal(parts.join(' '), text);
  const ja = '今日は晴れです。' .repeat(40);
  const jp = splitSpeech(ja, 90);
  assert.ok(jp.every((p) => p.length <= 90) && jp.join('').replace(/ /g, '') === ja, 'Japanese: no spaces, sentence marks');
  const hi = 'यह पहला वाक्य है। यह दूसरा वाक्य है। यह तीसरा वाक्य है।';
  assert.deepEqual(splitSpeech(hi, 30), ['यह पहला वाक्य है।', 'यह दूसरा वाक्य है।', 'यह तीसरा वाक्य है।']);
  const noSpace = 'あ'.repeat(200);
  assert.deepEqual(splitSpeech(noSpace, 90).map((p) => p.length), [90, 90, 20]);
  assert.deepEqual(splitSpeech('   ', 100), []);
});

test('stripId3 removes a leading ID3v2 tag and leaves other bytes alone', () => {
  const tag = Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x05'), Buffer.from('12345'), Buffer.from([0xff, 0xfb, 1, 2])]);
  assert.deepEqual(stripId3(tag), Buffer.from([0xff, 0xfb, 1, 2]));
  const frame = Buffer.from([0xff, 0xfb, 9]);
  assert.equal(stripId3(frame), frame);
});

const script = (lines: Array<[string, string]>) => ({ total_segments: lines.length, estimated_duration_seconds: 60, generated_at: '', segments: lines.map(([speaker, text], i) => ({ sequence: i + 1, speaker, text, type: 'news' })) }) as any;

test('script synthesis: host1 gets the first voice, host2 the second; always language_code; one AudioSegment per spoken line, in order', async () => {
  const api = fakeApi([200], () => pcm(1));
  const out = await synthesizeScript(
    script([['host1', 'První věta. Druhá věta.'], ['host2', 'Odpověď.'], ['host1', 'Konec.']]),
    { client: client(api), spec: requireLanguageSpec('cs'), flag: { voice: 'aria', voiceHost2: 'kai' }, gapMs: 100, log: () => {} },
  );
  assert.equal(out.length, 3);
  assert.deepEqual(out.map((s) => s.speaker), ['host1', 'host2', 'host1']);
  const byText = new Map(api.calls.map((c) => [c.body.text, c.body]));
  assert.equal(byText.get('První věta. Druhá věta.').voice, 'aria');
  assert.equal(byText.get('Odpověď.').voice, 'kai');
  assert.ok(api.calls.every((c) => c.body.language_code === 'cs'));
  const w = readWavInfo(out[1].buffer)!;
  assert.equal(w.sampleRate, 24000);
  assert.ok(Math.abs(out[1].duration_seconds - 1.1) < 0.02, `duration ${out[1].duration_seconds}`); // 1 s piece + 100 ms gap
});

test('script synthesis: a long line is split into sentence-sized requests (170 characters, 90 for Japanese)', async () => {
  const long = Array.from({ length: 12 }, (_, i) => `Tohle je delší věta číslo ${i} o ničem zvláštním.`).join(' ');
  const api = fakeApi();
  await synthesizeScript(script([['host1', long]]), { client: client(api), spec: requireLanguageSpec('cs'), flag: { voice: 'aria', voiceHost2: 'kai' }, log: () => {} });
  assert.ok(api.calls.length >= 3 && api.calls.every((c) => c.body.text.length <= 170));
  const api2 = fakeApi();
  await synthesizeScript(script([['host1', '今日は晴れです。'.repeat(30)]]), { client: client(api2), spec: requireLanguageSpec('ja'), flag: { voice: 'aria', voiceHost2: 'kai' }, log: () => {} });
  assert.ok(api2.calls.every((c) => c.body.text.length <= 90));
});

test('script synthesis: pieces are brought to a common level before they are joined', async () => {
  let n = 0;
  const api = fakeApi([200], () => pcm(0.5, n++ % 2 ? 2000 : 20000));
  const out = await synthesizeScript(script([['host1', 'Jedna věta tady.'], ['host2', 'Druhá věta tam.']]), { client: client(api), spec: requireLanguageSpec('cs'), flag: { voice: 'aria', voiceHost2: 'kai' }, gapMs: 0, log: () => {} });
  const rms = (b: Buffer) => { const w = readWavInfo(b)!; let s = 0; const m = w.dataBytes / 2; for (let i = 0; i < m; i++) { const v = b.readInt16LE(w.dataOffset + i * 2); s += v * v; } return 20 * Math.log10(Math.sqrt(s / m) / 32768); };
  assert.ok(Math.abs(rms(out[0].buffer) - rms(out[1].buffer)) < 1.5);
});

test('script synthesis: one failed piece out of many is skipped; too many failures, 402 or a stopped breaker fail the episode', async () => {
  const lines = Array.from({ length: 12 }, (_, i) => ['host1', `Věta číslo ${i}.`] as [string, string]);
  const flaky = fakeApi([200, 200, 400, 200]);
  assert.equal((await synthesizeScript(script(lines), { client: client(flaky, { maxConcurrent: 1 }), spec: requireLanguageSpec('cs'), flag: { voice: 'aria', voiceHost2: 'kai' }, maxSkippedShare: 0.2, log: () => {} })).length, 11);
  await assert.rejects(synthesizeScript(script(lines), { client: client(fakeApi([400])), spec: requireLanguageSpec('cs'), flag: { voice: 'aria', voiceHost2: 'kai' }, log: () => {} }), /Too many speech pieces failed/);
  await assert.rejects(synthesizeScript(script(lines), { client: client(fakeApi([402])), spec: requireLanguageSpec('cs'), flag: { voice: 'aria', voiceHost2: 'kai' }, log: () => {} }), TtsUnavailableError);
  const stop = Object.assign(new Error('paused'), { code: 'language_paused' });
  await assert.rejects(synthesizeScript(script(lines), { client: client(fakeApi(), { onChars: async () => { throw stop; } }), spec: requireLanguageSpec('cs'), flag: { voice: 'aria', voiceHost2: 'kai' }, log: () => {} }), (e) => e === stop);
});

test('script synthesis in mp3 mode joins the pieces without ID3 headers and estimates duration from the 128 kbps size', async () => {
  const frame = Buffer.alloc(16000, 0x55); // 1 second at 128 kbps
  const api = fakeApi([200], () => Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x02'), Buffer.from('zz'), frame]));
  const out = await synthesizeScript(script([['host1', 'Hej där.'], ['host2', 'Hej.']]), { client: client(api, { format: 'mp3' }), spec: requireLanguageSpec('sv'), flag: { voice: 'aria', voiceHost2: 'kai' }, log: () => {} });
  assert.equal(out[0].buffer.length, 16000);
  assert.equal(out[0].buffer.subarray(0, 3).toString(), 'UUU');
  assert.ok(Math.abs(out[0].duration_seconds - 1) < 0.01);
});
