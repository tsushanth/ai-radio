import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ReadAloudClient, TtsUnavailableError, splitSpeech, normalizeFor, hasDevanagariDigits, stripId3, synthesizeScript, READALOUD_MAX_CHARS, retryAfterSeconds, wordBoundaryCut,
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

// ---- wave 3: Thai splitting, Arabic marks, identical hosts, studio cold start ----

// Thai has no spaces between words and no sentence punctuation: the cut must fall on a word boundary.
const THAI = 'ประธานาธิบดีสหรัฐเดินทางถึงกรุงปักกิ่งเมื่อวานนี้เพื่อหารือกับผู้นำจีนเรื่องการค้าและความมั่นคงในภูมิภาคเอเชียตะวันออกเฉียงใต้';

test('Thai (no spaces, no sentence marks): pieces stay under the cap and no word is cut in two', () => {
  const text = THAI.repeat(6);
  const parts = splitSpeech(text, 100, 'th');
  assert.ok(parts.length > 1 && parts.every((p) => p.length <= 100), `lengths ${parts.map((p) => p.length)}`);
  assert.equal(parts.join(''), text, 'nothing lost or added');
  const seg = new Intl.Segmenter('th', { granularity: 'word' });
  const words = new Set([...seg.segment(text)].map((x) => x.segment));
  // every piece boundary is a word boundary of the whole text
  let pos = 0; const boundaries = new Set<number>(); for (const x of seg.segment(text)) { boundaries.add(x.index); }
  for (const p of parts) { assert.ok(boundaries.has(pos), `piece starts mid-word at ${pos}`); pos += p.length; }
  assert.ok(words.size > 10);
  // the old behaviour (no locale) is a hard cut at the limit
  assert.deepEqual(splitSpeech('あ'.repeat(200), 90).map((p) => p.length), [90, 90, 20]);
});

test('Thai with spaces between clauses is cut at the spaces first', () => {
  const clause = 'ประธานาธิบดีสหรัฐเดินทางถึงกรุงปักกิ่งเมื่อวานนี้';
  const text = Array.from({ length: 8 }, () => clause).join(' ');
  const parts = splitSpeech(text, 100, 'th');
  assert.ok(parts.every((p) => p.length <= 100));
  assert.ok(parts.every((p) => p.split(' ').every((c) => c === clause)), 'only whole clauses');
});

test('Japanese and Chinese also cut at word boundaries when a locale is given; Chinese sentence marks still split first', () => {
  const zh = '美国总统昨天抵达北京与中国领导人讨论贸易问题'.repeat(8);
  const parts = splitSpeech(zh, 90, 'zh');
  assert.ok(parts.every((p) => p.length <= 90) && parts.join('') === zh);
  assert.deepEqual(splitSpeech('第一句话。第二句话。第三句话。', 8, 'zh'), ['第一句话。', '第二句话。', '第三句话。']);
  assert.equal(wordBoundaryCut('abc def ghi', 5, 'th') <= 5, true);
});

test('Arabic: the Arabic question mark ends a sentence; Arabic-Indic digits are not touched by the splitter', () => {
  const ar = 'هل وصل الرئيس إلى العاصمة؟ نعم وصل أمس. سيلتقي القادة غدا.';
  assert.deepEqual(splitSpeech(ar, 30), ['هل وصل الرئيس إلى العاصمة؟', 'نعم وصل أمس.', 'سيلتقي القادة غدا.']);
  assert.equal(splitSpeech('السنة ٢٠٢٦ مهمة.', 100)[0], 'السنة ٢٠٢٦ مهمة.');
});

test('wave 3 caps: Thai 100, Chinese 90, Arabic 140, the rest 170 characters per speech request', async () => {
  const caps = Object.fromEntries(['ar', 'ca', 'hr', 'ms', 'no', 'sk', 'sl', 'sr', 'th', 'vi', 'zh'].map((c) => [c, requireLanguageSpec(c).sentenceCap]));
  assert.deepEqual(caps, { ar: 140, ca: 170, hr: 170, ms: 170, no: 170, sk: 170, sl: 170, sr: 170, th: 100, vi: 170, zh: 90 });
  const api = fakeApi();
  await synthesizeScript(script([['host1', THAI.repeat(6)]]), { client: client(api), spec: requireLanguageSpec('th'), flag: { voice: 'mira', voiceHost2: 'remy' }, log: () => {} });
  assert.ok(api.calls.length >= 6 && api.calls.every((c) => c.body.text.length <= 100 && c.body.language_code === 'th'));
});

test('identical host voices (ms and sl: mira for both) are handled: both hosts are spoken, with the same voice and the right language_code', async () => {
  const api = fakeApi();
  const out = await synthesizeScript(script([['host1', 'Selamat pagi.'], ['host2', 'Selamat pagi juga.']]), { client: client(api), spec: requireLanguageSpec('ms'), flag: { voice: 'mira', voiceHost2: 'mira' }, log: () => {} });
  assert.deepEqual(out.map((o) => o.speaker), ['host1', 'host2']);
  assert.ok(api.calls.every((c) => c.body.voice === 'mira' && c.body.language_code === 'ms'));
  const api2 = fakeApi();
  await synthesizeScript(script([['host1', 'Dober dan.'], ['host2', 'Dober dan tudi vam.']]), { client: client(api2), spec: requireLanguageSpec('sl'), flag: { voice: 'mira', voiceHost2: 'mira' }, log: () => {} });
  assert.ok(api2.calls.every((c) => c.body.voice === 'mira' && c.body.language_code === 'sl'));
});

test('studio cold start: one slow answer (about 44 s, simulated) is one attempt: characters are counted once, no retry, breaker untouched', async () => {
  let counted = 0; let calls = 0;
  const slow = (async () => { calls++; await new Promise((r) => setTimeout(r, 30)); return new Response(pcm(0.5), { status: 200 }); }) as unknown as typeof fetch;
  const c = new ReadAloudClient({ baseUrl: 'https://api.example.test', apiKey: () => 'k', fetchImpl: slow, sleep: async () => {}, onChars: async (n) => { counted += n; } });
  await c.synthesize({ text: 'Dobrý den.', voice: 'mira', language: 'sk' });
  assert.equal(calls, 1); assert.equal(counted, 'Dobrý den.'.length);
});

test('studio cold start: the per-request timeout is long enough for a 44 s start (default 150 s) and a 503 with Retry-After waits that long (at most 45 s)', async () => {
  assert.equal(retryAfterSeconds({ headers: new Headers({ 'retry-after': '40' }) }), 40);
  assert.equal(retryAfterSeconds({ headers: new Headers({ 'retry-after': '600' }) }), 45);
  assert.equal(retryAfterSeconds({ headers: new Headers({ 'retry-after': 'Wed, 21 Oct 2026 07:28:00 GMT' }) }), undefined);
  assert.equal(retryAfterSeconds({ headers: new Headers() }), undefined);
  const waits: number[] = []; let n = 0;
  const fetchImpl = (async () => (n++ === 0 ? new Response('starting', { status: 503, headers: { 'Retry-After': '40' } }) : new Response(pcm(0.5), { status: 200 }))) as unknown as typeof fetch;
  const c = new ReadAloudClient({ baseUrl: 'https://api.example.test', apiKey: () => 'k', fetchImpl, sleep: async (ms) => { waits.push(ms); } });
  const r = await c.synthesize({ text: 'Dobrý den.', voice: 'mira', language: 'vi' });
  assert.ok(r.audio.length > 0); assert.deepEqual(waits, [40_000]); // the header (40 s) beats the 3 s default
});

test('a 401 / 403 from the speech API (a key not allowed to use studio voices) stops at once with no retry', async () => {
  for (const status of [401, 403]) {
    const api = fakeApi([status]);
    await assert.rejects(client(api).synthesize({ text: 'Dobrý den.', voice: 'mira', language: 'ca' }), (e: any) => e instanceof TtsUnavailableError && e.reason === 'failed');
    assert.equal(api.calls.length, 1);
  }
});

test('non-ASCII text reaches the API byte for byte (UTF-8 JSON, no escaping or mangling) for every wave 3 script', async () => {
  const samples: Record<string, string> = { ar: 'مرحبا بالعالم', ca: 'Bon dia, què tal? L\'accés', hr: 'Čačak đak šuma žaba ćevap', ms: 'Selamat pagi', no: 'Blåbærsyltetøy på Ørland', sk: 'Ďakujeme, ľudia čakajú', sl: 'Čas je zlato, šola', sr: 'Đorđe žuri u školu', th: 'สวัสดีครับ', vi: 'Tiếng Việt: Nguyễn Thị Ánh', zh: '你好，世界。' };
  for (const [lang, text] of Object.entries(samples)) {
    let raw = '';
    const fetchImpl = (async (_u: string, init: RequestInit) => { raw = Buffer.from(String(init.body), 'utf8').toString('utf8'); return new Response(pcm(0.2), { status: 200 }); }) as unknown as typeof fetch;
    await new ReadAloudClient({ baseUrl: 'https://api.example.test', apiKey: () => 'k', fetchImpl, sleep: async () => {} }).synthesize({ text, voice: 'mira', language: lang });
    assert.equal(JSON.parse(raw).text, text, lang);
    assert.ok(raw.includes(text.replace(/\\/g, '')) || raw.includes(JSON.stringify(text).slice(1, -1)), `${lang}: text appears unescaped in the body`);
  }
});
