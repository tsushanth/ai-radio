import test from 'node:test';
import assert from 'node:assert/strict';
import {
  validateSuggestion, recentSuggestions, suggestionBlockedReason, submitSuggestion, MAX_PER_DAY, MIN_GAP_MS, MAX_TOPIC_NAME, MAX_DESCRIPTION,
} from '../src/lib/topic-suggest.ts';
import { hiddenTopicRows } from '../src/lib/hidden-topics.ts';

test('validateSuggestion builds the Android body: topicName, language, optional description', () => {
  assert.deepEqual(validateSuggestion({ topicName: '  Quantum   Computing ', language: 'es' }), {
    ok: true, body: { topicName: 'Quantum Computing', language: 'es' },
  });
  assert.deepEqual(validateSuggestion({ topicName: 'Chess', description: ' openings and news ', language: 'ja' }), {
    ok: true, body: { topicName: 'Chess', language: 'ja', description: 'openings and news' },
  });
  // bad / missing language falls back to English, never forwards junk
  assert.equal((validateSuggestion({ topicName: 'Chess', language: 'x&y=1' }) as { body: { language: string } }).body.language, 'en');
  assert.equal((validateSuggestion({ topicName: 'Chess' }) as { body: { language: string } }).body.language, 'en');
});

test('validateSuggestion rejects empty, too short and too long input', () => {
  for (const bad of ['', '   ', 'ab']) assert.equal(validateSuggestion({ topicName: bad }).ok, false, bad);
  assert.equal(validateSuggestion({ topicName: 'x'.repeat(MAX_TOPIC_NAME + 1) }).ok, false);
  assert.equal(validateSuggestion({ topicName: 'x'.repeat(MAX_TOPIC_NAME) }).ok, true);
  assert.equal(validateSuggestion({ topicName: 'Chess', description: 'y'.repeat(MAX_DESCRIPTION + 1) }).ok, false);
});

test('rate limit: 30 s apart, 5 per rolling day, junk history ignored', () => {
  const now = 1_000_000_000_000;
  assert.equal(suggestionBlockedReason([], now), null);
  assert.equal(suggestionBlockedReason(undefined, now), null);
  assert.equal(suggestionBlockedReason('junk', now), null);
  assert.match(suggestionBlockedReason([now - 5_000], now)!, /wait/);
  assert.equal(suggestionBlockedReason([now - MIN_GAP_MS - 1], now), null);
  const five = Array.from({ length: MAX_PER_DAY }, (_, i) => now - (i + 1) * 60_000);
  assert.match(suggestionBlockedReason(five, now)!, /try again tomorrow/);
  // entries older than 24 h do not count; future timestamps and non-numbers are dropped
  const old = Array.from({ length: MAX_PER_DAY }, (_, i) => now - 25 * 3600_000 - i);
  assert.equal(suggestionBlockedReason(old, now), null);
  assert.deepEqual(recentSuggestions([now - 10, 'x', NaN, now + 5_000, null], now), [now - 10]);
});

test('submitSuggestion POSTs exactly the body to /topics/suggest (mocked fetch, no network)', async () => {
  const calls: { url: string; method?: string; body?: string }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method, body: init?.body as string });
    return new Response(JSON.stringify({ success: true, data: { requestId: 'r1', status: 'pending', createdAt: 'now' } }), { status: 201 });
  }) as typeof fetch;
  try {
    const body = { topicName: 'Chess', language: 'en', description: 'openings' };
    assert.deepEqual(await submitSuggestion(body), { requestId: 'r1', status: 'pending' });
    assert.equal(calls.length, 1);
    assert.ok(calls[0].url.endsWith('/topics/suggest'), calls[0].url);
    assert.equal(calls[0].method, 'POST');
    assert.deepEqual(JSON.parse(calls[0].body!), body); // no userId / email
  } finally { globalThis.fetch = original; }
});

test('submitSuggestion surfaces server errors (400 / 503 / 500)', async () => {
  const original = globalThis.fetch;
  try {
    for (const [status, error] of [[400, 'topicName is required'], [503, 'Supabase not configured'], [500, 'Failed to submit suggestion']] as const) {
      globalThis.fetch = (async () => new Response(JSON.stringify({ success: false, error }), { status })) as typeof fetch;
      await assert.rejects(() => submitSuggestion({ topicName: 'Chess', language: 'en' }), new RegExp(error));
    }
    globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
    await assert.rejects(() => submitSuggestion({ topicName: 'Chess', language: 'en' }), /fetch failed/);
  } finally { globalThis.fetch = original; }
});

test('hiddenTopicRows names known topics, keeps unknown ids unhide-able, de-dupes and sorts', () => {
  const topics = [{ id: 'ai-ml', name: 'AI & ML' }, { id: 'sports', name: 'Sports' }];
  assert.deepEqual(hiddenTopicRows(['sports', 'gone-topic', 'ai-ml', 'sports', ''], topics), [
    { id: 'ai-ml', name: 'AI & ML', known: true },
    { id: 'gone-topic', name: 'gone-topic', known: false },
    { id: 'sports', name: 'Sports', known: true },
  ]);
  assert.deepEqual(hiddenTopicRows([], topics), []);
  assert.deepEqual(hiddenTopicRows(undefined, topics), []);
});
