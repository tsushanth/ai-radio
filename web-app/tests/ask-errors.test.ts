import test from 'node:test';
import assert from 'node:assert/strict';
import { apiClient } from '../src/lib/api/client.ts';
import { fetchAsk, fetchAskConfig, submitAsk, validateAskText, waitForAsk, type AskEpisodeView } from '../src/lib/ask.ts';

// fetch is mocked: nothing leaves the machine.
function mockFetch(answers: Array<{ body: unknown; status?: number; headers?: Record<string, string> } | Error>) {
  const original = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (url: string | URL | Request) => {
    calls.push(String(url));
    const a = answers.length > 1 ? answers.shift()! : answers[0];
    if (a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body), { status: a.status ?? 200, headers: { 'Content-Type': 'application/json', ...(a.headers ?? {}) } });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const fail = async (p: Promise<unknown>) => { try { await p; } catch (e) { return e as Error & { status?: number }; } throw new Error('expected a rejection'); };

const ADVICE = 'The hosts talk about news and events. They cannot give medical, legal, financial or personal advice.';

test('apiClient: an Ask-shaped error ({ error: code, message }) shows the message, not the code', async () => {
  const m = mockFetch([{ status: 400, body: { success: false, error: 'advice', message: ADVICE } }]);
  try {
    const e = await fail(apiClient('/ask', { method: 'POST', body: '{}' }));
    assert.equal(e.message, ADVICE);
    assert.equal(e.status, 400);
  } finally { m.restore(); }
});

test('apiClient: other error shapes display exactly as before', async () => {
  const cases: Array<[number, unknown, string]> = [
    [400, { success: false, error: 'Question is required' }, 'Question is required'],
    [400, { success: false, error: 'text exceeds 8000 chars' }, 'text exceeds 8000 chars'],
    [500, { message: 'Plain message only' }, 'Plain message only'],
    [500, {}, 'API error: 500'],
    [429, { error: { status: 'error', message: 'Too many requests from this IP, please try again later.' } }, 'API error: 429'],
    [503, { success: false, error: 'Supabase not configured' }, 'Supabase not configured'],
    // a human sentence in `error` still wins over a message, as it always did
    [400, { error: 'Invalid install_id', message: 'something else' }, 'Invalid install_id'],
  ];
  for (const [status, body, want] of cases) {
    const m = mockFetch([{ status, body }]);
    try { assert.equal((await fail(apiClient('/x'))).message, want, JSON.stringify(body)); } finally { m.restore(); }
  }
});

test('submitAsk: every Ask error shows the server message; a bare code never reaches the user', async () => {
  const withMessage: Array<[number, string, string]> = [
    [400, 'advice', ADVICE],
    [400, 'too_short', 'Please describe the event or question in at least 8 characters.'],
    [429, 'install_limit', 'You have asked enough for today. Please try again tomorrow.'],
    [429, 'ip_limit', 'You have asked enough for today. Please try again tomorrow.'],
    [429, 'busy', 'The studio is busy right now. Please try again in a few minutes.'],
    [503, 'paused', 'Ask the hosts is taking a short break. Please try again in a few minutes.'],
  ];
  for (const [status, code, message] of withMessage) {
    const m = mockFetch([{ status, body: { success: false, error: code, message } }]);
    try { assert.equal((await fail(submitAsk({ text: 'Who won the game tonight?', language: 'en' }))).message, message, code); } finally { m.restore(); }
  }
  // no message => a safe generic sentence, not the code
  for (const code of ['install_limit', 'busy', 'server_error', 'ask_disabled']) {
    const m = mockFetch([{ status: 500, body: { success: false, error: code } }]);
    try {
      const text = (await fail(submitAsk({ text: 'Who won the game tonight?', language: 'en' }))).message;
      assert.notEqual(text, code);
      assert.match(text, /^[A-Z].*\.$/);
    } finally { m.restore(); }
  }
  // the global limiter's different body shape gets a readable sentence too
  const m = mockFetch([{ status: 429, body: { error: { status: 'error', message: 'Too many requests from this IP, please try again later.' } } }]);
  try { assert.doesNotMatch((await fail(submitAsk({ text: 'Who won the game tonight?', language: 'en' }))).message, /API error/); } finally { m.restore(); }
  // a network failure is not shown as "Failed to fetch"
  const n = mockFetch([new TypeError('Failed to fetch')]);
  try { assert.doesNotMatch((await fail(submitAsk({ text: 'Who won the game tonight?', language: 'en' }))).message, /Failed to fetch/); } finally { n.restore(); }
});

test('fetchAsk: an unknown id reads as "not found", not as the code', async () => {
  const m = mockFetch([{ status: 404, body: { success: false, error: 'not_found' } }]);
  try { assert.match((await fail(fetchAsk('11111111-2222-3333-4444-555555555555'))).message, /not found/i); } finally { m.restore(); }
});

test('the minimum length comes from the server config when it sends one, and falls back to 8', async () => {
  const m = mockFetch([{ body: { success: true, data: { enabled: true, languages: ['en'], maxChars: 200, minChars: 12 } } }]);
  try {
    const cfg = await fetchAskConfig();
    assert.equal(cfg?.minChars, 12);
    assert.equal(validateAskText('twelve chars', cfg!.minChars).ok, true);
    const short = validateAskText('eleven char', cfg!.minChars);
    assert.equal(short.ok, false);
    assert.match(short.ok ? '' : short.error, /12 characters/);
  } finally { m.restore(); }
  const old = mockFetch([{ body: { success: true, data: { enabled: true, languages: ['en'], maxChars: 200 } } }]);
  try { assert.equal((await fetchAskConfig())?.minChars, 8); } finally { old.restore(); }
});

// ─── polling ──────────────────────────────────────────────────────────────────

const view = (over: Partial<AskEpisodeView> = {}): AskEpisodeView => ({
  id: 'x', status: 'writing', progress: 50, language: 'en', title: null, description: null, audioUrl: null, durationSeconds: null,
  sources: [], reason: null, message: null, createdAt: '2026-11-07T00:00:00.000Z', ...over,
});
const clock = () => { let t = 0; const waits: number[] = []; return { now: () => t, sleep: async (ms: number) => { waits.push(ms); t += ms; }, waits }; };

test('polling backs off from 3 s up to 8 s and keeps the 8-minute cap', async () => {
  const c = clock();
  let polls = 0;
  const e = await fail(waitForAsk('x', { sleep: c.sleep, now: c.now }, async () => { polls++; return view(); }));
  assert.match(e.message, /taking too long/);
  assert.equal(c.waits[0], 3000);
  assert.ok(c.waits.every((w, i) => i === 0 || w >= c.waits[i - 1]), 'never speeds up');
  assert.equal(Math.max(...c.waits), 8000);
  assert.ok(c.waits.every((w) => w >= 3000 && w <= 8000));
  assert.ok(c.now() >= 8 * 60_000 && c.now() < 8 * 60_000 + 8000, 'stops at the 8-minute cap');
  assert.ok(polls < 80, `far fewer than the ~160 polls of a fixed 3 s interval (made ${polls})`);
});

test('polling honours a 429 by waiting and carrying on, and never counts it as a failure', async () => {
  const c = clock();
  const limited = Object.assign(new Error('Too many requests'), { status: 429, retryAfterMs: 20_000 });
  const seq: Array<AskEpisodeView | Error> = [view({ status: 'queued' }), limited, limited, limited, limited, view({ status: 'writing' }), view({ status: 'completed', audioUrl: 'https://a', progress: 100, title: 'T' })];
  const ep = await waitForAsk('x', { sleep: c.sleep, now: c.now }, async () => { const n = seq.shift()!; if (n instanceof Error) throw n; return n; });
  assert.equal(ep?.title, 'T', 'four 429s in a row (more than the usual three-failure limit) do not end the wait');
  assert.equal(c.waits.filter((w) => w === 20_000).length, 4, 'waited for the time the server asked');
});

test('polling still gives up on a real, repeated failure', async () => {
  const c = clock();
  const boom = Object.assign(new Error('Server error'), { status: 500 });
  const e = await fail(waitForAsk('x', { sleep: c.sleep, now: c.now }, async () => { throw boom; }));
  assert.equal(e.message, 'Server error');
});
