import test from 'node:test';
import assert from 'node:assert/strict';
import { buildExaRequestBody, exaSearch, ExaError, parseRetryAfter, EXA_SEARCH_URL, EXA_TIMEOUT_MS } from './exa.client.ts';

const KEY = 'exa-test-key-DO-NOT-LEAK-123';
const env = { EXA_API_KEY: KEY } as NodeJS.ProcessEnv;
const params = { query: 'q', category: 'news' as const, numResults: 8, startPublishedDate: new Date('2026-11-11T05:00:00.000Z'), maxCharacters: 1500 };
const ok = (results: unknown[] = []) => new Response(JSON.stringify({ results, costDollars: { total: 0.004 } }), { status: 200 });

test('request body follows the quickstart lite shape exactly', () => {
  assert.deepEqual(buildExaRequestBody(params), {
    query: 'q',
    type: 'lite',
    numResults: 8,
    startPublishedDate: '2026-11-11T05:00:00.000Z',
    category: 'news',
    contents: { highlights: true, text: { maxCharacters: 1500 } },
  });
});

test('no category key when the topic has none; no summary, maxAgeHours or livecrawl is ever sent', () => {
  const body = buildExaRequestBody({ ...params, category: undefined });
  assert.ok(!('category' in body));
  const json = JSON.stringify(body);
  for (const banned of ['summary', 'maxAgeHours', 'livecrawl', 'outputSchema', 'subpages', 'extras']) assert.ok(!json.includes(banned), banned);
});

test('POST to api.exa.ai/search with a Bearer header and a 15 s timeout signal', async () => {
  let seen: { url: string; init: RequestInit } | undefined;
  await exaSearch(params, { env, fetchFn: (async (url: any, init: any) => { seen = { url: String(url), init }; return ok(); }) as any });
  assert.equal(seen!.url, 'https://api.exa.ai/search');
  assert.equal(EXA_SEARCH_URL, 'https://api.exa.ai/search');
  assert.equal(seen!.init.method, 'POST');
  const h = seen!.init.headers as Record<string, string>;
  assert.equal(h.Authorization, `Bearer ${KEY}`);
  assert.equal(h['Content-Type'], 'application/json');
  assert.ok(seen!.init.signal instanceof AbortSignal);
  assert.equal(EXA_TIMEOUT_MS, 15000);
  assert.ok(!String(seen!.url).includes(KEY), 'key is never in the URL');
});

test('missing key is a failure before any request', async () => {
  let calls = 0;
  await assert.rejects(exaSearch(params, { env: {} as any, fetchFn: (async () => { calls++; return ok(); }) as any }), (e: any) => e instanceof ExaError && e.kind === 'no_key');
  assert.equal(calls, 0);
});

test('429 honours Retry-After once, then succeeds', async () => {
  let n = 0; const sleeps: number[] = [];
  const res = await exaSearch(params, {
    env, sleep: async ms => { sleeps.push(ms); },
    fetchFn: (async () => (++n === 1 ? new Response('slow', { status: 429, headers: { 'retry-after': '3' } }) : ok([{ title: 't' }]))) as any,
  });
  assert.equal(n, 2);
  assert.deepEqual(sleeps, [3000]);
  assert.equal(res.results.length, 1);
});

test('Retry-After is capped at 10 s; a second 429 fails with rate_limited', async () => {
  let n = 0; const sleeps: number[] = [];
  await assert.rejects(
    exaSearch(params, { env, sleep: async ms => { sleeps.push(ms); }, fetchFn: (async () => { n++; return new Response('x', { status: 429, headers: { 'retry-after': '120' } }); }) as any }),
    (e: any) => e instanceof ExaError && e.kind === 'rate_limited',
  );
  assert.equal(n, 2);
  assert.deepEqual(sleeps, [10_000]);
});

test('parseRetryAfter reads seconds and HTTP dates', () => {
  assert.equal(parseRetryAfter('2', 0), 2000);
  assert.equal(parseRetryAfter(null, 0), undefined);
  assert.equal(parseRetryAfter('Thu, 01 Jan 1970 00:00:05 GMT', 0), 5000);
  assert.equal(parseRetryAfter('garbage', 0), undefined);
});

test('401/403 = auth, 402 = credit, 5xx = http, bad JSON and missing results = invalid, network error = network; none leak the key', async () => {
  const cases: Array<[Response | Error, string]> = [
    [new Response('', { status: 401 }), 'auth'], [new Response('', { status: 403 }), 'auth'], [new Response('', { status: 402 }), 'credit'],
    [new Response('', { status: 503 }), 'http'], [new Response('not json', { status: 200 }), 'invalid'], [new Response('{"x":1}', { status: 200 }), 'invalid'],
    [Object.assign(new Error(`connect failed for Bearer ${KEY}`), { name: 'TimeoutError' }), 'network'],
  ];
  for (const [outcome, kind] of cases) {
    await assert.rejects(
      exaSearch(params, { env, fetchFn: (async () => { if (outcome instanceof Error) throw outcome; return outcome; }) as any }),
      (e: any) => { assert.ok(e instanceof ExaError); assert.equal(e.kind, kind); assert.ok(!e.message.includes(KEY), 'message must not contain the key'); return true; },
    );
  }
});
