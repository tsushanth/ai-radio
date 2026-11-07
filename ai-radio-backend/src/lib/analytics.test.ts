import test from 'node:test';
import assert from 'node:assert/strict';
import {
  AnalyticsLimiter,
  EVENT_NAMES,
  WindowCounter,
  analyticsEnabled,
  createEventsHandler,
  readAnalyticsConfig,
  validateBatch,
  validateEvent,
  type AnalyticsConfig,
  type AnalyticsRow,
} from './analytics.ts';

const ID = '5b0e2f6a-3c1d-4e7a-9b8c-1a2b3c4d5e6f';
const NOW = Date.UTC(2026, 10, 7, 12, 0, 0);
const cfg = (over: Partial<AnalyticsConfig> = {}): AnalyticsConfig => ({
  enabled: true,
  maxEventsPerRequest: 25,
  maxBodyBytes: 8192,
  installEventsPerHour: 300,
  installRequestsPerHour: 30,
  globalEventsPerMinute: 1000,
  globalEventsPerDay: 250000,
  ...over,
});
const batch = (events: unknown[], over: Record<string, unknown> = {}) => ({ install_id: ID, platform: 'android', app_version: '12.9.2', events, ...over });
const listen = (over: Record<string, unknown> = {}) => ({ name: 'listen_progress', props: { source: 'topic', language: 'en', seconds: 60, topic_id: 'ai-ml', ...over } });

function run(body: unknown, opts: { config?: AnalyticsConfig; insert?: ((r: AnalyticsRow[]) => Promise<{ error: unknown }>) | null; headers?: Record<string, string>; limiter?: AnalyticsLimiter } = {}) {
  const inserted: AnalyticsRow[][] = [];
  const insert = opts.insert === undefined ? async (r: AnalyticsRow[]) => { inserted.push(r); return { error: null }; } : opts.insert;
  const handler = createEventsHandler({ insert, getConfig: () => opts.config ?? cfg(), now: () => NOW, limiter: opts.limiter });
  const req: any = { body, headers: opts.headers ?? {} };
  let status = 0;
  let json: any;
  const headers: Record<string, string> = {};
  const res: any = {
    status(c: number) { status = c; return res; },
    json(b: unknown) { json = b; return res; },
    setHeader(k: string, v: string) { headers[k] = v; },
  };
  return handler(req, res).then(() => ({ status, json, headers, inserted }));
}

// ---- kill switch ----

test('kill switch: off unless explicitly enabled', () => {
  assert.equal(analyticsEnabled({}), false);
  assert.equal(analyticsEnabled({ ANALYTICS_ENABLED: '' }), false);
  assert.equal(analyticsEnabled({ ANALYTICS_ENABLED: 'false' }), false);
  assert.equal(analyticsEnabled({ ANALYTICS_ENABLED: 'maybe' }), false);
  assert.equal(analyticsEnabled({ ANALYTICS_ENABLED: 'true' }), true);
  assert.equal(analyticsEnabled({ ANALYTICS_ENABLED: ' ON ' }), true);
  assert.equal(readAnalyticsConfig({}).enabled, false);
});

test('kill switch off: 202 disabled, nothing validated, nothing stored', async () => {
  const r = await run(batch([{ name: 'not_allowed' }]), { config: cfg({ enabled: false }) });
  assert.equal(r.status, 202);
  assert.deepEqual(r.json, { success: true, accepted: 0, disabled: true });
  assert.equal(r.inserted.length, 0);
});

// ---- allowlist and typed props ----

test('every allowlisted event name is exactly the agreed list', () => {
  assert.deepEqual([...EVENT_NAMES].sort(), [
    'app_open', 'error_shown', 'first_play_start', 'language_change', 'listen_progress', 'share_tap', 'topic_generate_failed',
    'topic_generate_requested', 'topic_generate_succeeded', 'topic_open', 'topic_suggest_submitted',
  ].sort());
});

test('valid examples of each event pass', () => {
  const ok: unknown[] = [
    { name: 'app_open', props: { locale: 'en-US' } },
    { name: 'first_play_start', props: { source: 'radio', language: 'fr' } },
    { name: 'first_play_start' },
    listen(),
    { name: 'listen_progress', props: { source: 'radio', language: 'en', seconds: 3600 } },
    { name: 'topic_open', props: { topic_id: 'world-update' } },
    { name: 'topic_generate_requested', props: { topic_id: 'ai-ml', language: 'es' } },
    { name: 'topic_generate_succeeded', props: { topic_id: 'ai-ml', language: 'es' } },
    { name: 'topic_generate_failed', props: { topic_id: 'ai-ml', language: 'es', code: 'HTTP_429' } },
    { name: 'topic_suggest_submitted', props: { language: 'en' } },
    { name: 'language_change', props: { language: 'hi', from: 'en' } },
    { name: 'share_tap', props: { source: 'radio' } },
    { name: 'error_shown', props: { code: 'ERROR_CODE_IO_BAD_HTTP_STATUS' } },
  ];
  for (const e of ok) assert.equal(validateEvent(e).ok, true, JSON.stringify(e));
});

test('rejects unknown names, unknown props, wrong types and bad shapes', () => {
  const bad: unknown[] = [
    null, 'app_open', [], {},
    { name: 'purchase' },
    { name: '__proto__' },
    { name: 'constructor' },
    { name: 'app_open' }, // locale required
    { name: 'app_open', props: { locale: 'en', email: 'a@b.co' } }, // extra prop
    { name: 'app_open', props: { locale: 'not a locale!' } },
    { name: 'app_open', props: { locale: 5 } },
    { name: 'app_open', extra: 1 },
    { name: 'app_open', props: [] },
    listen({ seconds: 45 }), // not a 30 s bucket
    listen({ seconds: 0 }),
    listen({ seconds: 3630 }),
    listen({ seconds: 60.5 }),
    listen({ seconds: '60' }),
    listen({ source: 'podcast' }),
    listen({ language: 'EN' }),
    listen({ topic_id: 'has space' }),
    listen({ topic_id: 'x'.repeat(65) }),
    listen({ unknown: 1 }),
    { name: 'topic_suggest_submitted', props: { language: 'en', topic_name: 'free text' } }, // text never allowed
    { name: 'error_shown', props: { code: 'a message with spaces and detail' } },
    { name: 'error_shown', props: { code: 'x'.repeat(41) } },
    { name: 'topic_open', props: { topic_id: 'ai-ml' }, ago_s: -1 },
    { name: 'topic_open', props: { topic_id: 'ai-ml' }, ago_s: 7 * 24 * 3600 + 1 },
    { name: 'topic_open', props: { topic_id: 'ai-ml' }, ago_s: 1.5 },
    { name: 'topic_open', props: { topic_id: { $ne: 1 } } },
  ];
  for (const e of bad) assert.equal(validateEvent(e).ok, false, JSON.stringify(e));
});

test('props values of prototype names cannot bypass the schema', () => {
  assert.equal(validateEvent({ name: 'topic_open', props: { topic_id: 'ai-ml', constructor: 'x' } }).ok, false);
  assert.equal(validateEvent({ name: 'topic_open', props: JSON.parse('{"topic_id":"ai-ml","__proto__":{"x":1}}') }).ok, false);
});

// ---- envelope ----

test('envelope: install id must be a UUID, platform and version restricted, no extra fields', () => {
  const e = [{ name: 'topic_open', props: { topic_id: 'ai-ml' } }];
  assert.equal(validateBatch(batch(e), cfg(), NOW).ok, true);
  for (const over of [
    { install_id: 'user@example.com' }, { install_id: '12345' }, { install_id: undefined },
    { platform: 'windows' }, { platform: undefined },
    { app_version: '1.0 (beta) <script>' }, { app_version: undefined },
    { email: 'a@b.co' }, { ip: '1.2.3.4' }, { device_id: 'abc' },
  ]) {
    const r = validateBatch(batch(e, over), cfg(), NOW);
    assert.equal(r.ok, false, JSON.stringify(over));
  }
  assert.equal(validateBatch(null, cfg(), NOW).ok, false);
  assert.equal(validateBatch([], cfg(), NOW).ok, false);
  assert.equal(validateBatch(batch([]), cfg(), NOW).ok, false);
  assert.equal(validateBatch(batch('nope' as any), cfg(), NOW).ok, false);
});

test('batching limit: more than N events per request is refused (413), exactly N is fine', () => {
  const ev = { name: 'topic_open', props: { topic_id: 'ai-ml' } };
  const c = cfg({ maxEventsPerRequest: 3 });
  assert.equal(validateBatch(batch([ev, ev, ev]), c, NOW).ok, true);
  const tooMany: any = validateBatch(batch([ev, ev, ev, ev]), c, NOW);
  assert.equal(tooMany.ok, false);
  assert.equal(tooMany.status, 413);
});

test('partial batch: valid events kept, invalid dropped and counted', () => {
  const r: any = validateBatch(batch([{ name: 'topic_open', props: { topic_id: 'ai-ml' } }, { name: 'evil' }, { name: 'error_shown', props: { code: 'X' } }]), cfg(), NOW);
  assert.equal(r.ok, true);
  assert.equal(r.rows.length, 2);
  assert.equal(r.rejected, 1);
});

test('rows hold only the agreed columns and the day comes from ago_s (UTC)', () => {
  const r: any = validateBatch(batch([{ name: 'topic_open', props: { topic_id: 'ai-ml' } }, { name: 'topic_open', props: { topic_id: 'ai-ml' }, ago_s: 13 * 3600 }]), cfg(), NOW);
  assert.deepEqual(Object.keys(r.rows[0]).sort(), ['app_version', 'day', 'install_id', 'name', 'platform', 'props']);
  assert.equal(r.rows[0].day, '2026-11-07');
  assert.equal(r.rows[1].day, '2026-11-06'); // 12:00 minus 13 h
});

// ---- handler ----

test('handler: stores a valid batch and answers 202 with counts', async () => {
  const r = await run(batch([{ name: 'app_open', props: { locale: 'en-US' } }, listen()]));
  assert.equal(r.status, 202);
  assert.deepEqual(r.json, { success: true, accepted: 2, rejected: 0 });
  assert.equal(r.inserted.length, 1);
  assert.equal(r.inserted[0].length, 2);
});

test('handler: all-invalid batch is 400 and stores nothing', async () => {
  const r = await run(batch([{ name: 'evil' }]));
  assert.equal(r.status, 400);
  assert.equal(r.inserted.length, 0);
});

test('handler: body size cap by header and by content', async () => {
  const big = batch([{ name: 'topic_open', props: { topic_id: 'ai-ml' } }]);
  assert.equal((await run(big, { headers: { 'content-length': '999999' } })).status, 413);
  const padded = { ...big, events: Array.from({ length: 25 }, () => ({ name: 'topic_open', props: { topic_id: 'a'.repeat(64) } })) };
  assert.equal((await run(padded, { config: cfg({ maxBodyBytes: 500 }) })).status, 413);
});

test('handler: database failure -> 503, no payload in the response', async () => {
  const r = await run(batch([listen()]), { insert: async () => ({ error: { message: 'boom' } }) });
  assert.equal(r.status, 503);
  assert.ok(!JSON.stringify(r.json).includes('boom'));
});

test('handler: storage not configured -> 503', async () => {
  assert.equal((await run(batch([listen()]), { insert: null })).status, 503);
});

test('handler: insert throwing -> 500 without leaking', async () => {
  const r = await run(batch([listen()]), { insert: async () => { throw new Error('secret'); } });
  assert.equal(r.status, 500);
  assert.ok(!JSON.stringify(r.json).includes('secret'));
});

// ---- rate limits ----

test('per-install request limit: 429 with Retry-After, other installs unaffected', async () => {
  const limiter = new AnalyticsLimiter();
  const c = cfg({ installRequestsPerHour: 2 });
  assert.equal((await run(batch([listen()]), { config: c, limiter })).status, 202);
  assert.equal((await run(batch([listen()]), { config: c, limiter })).status, 202);
  const third = await run(batch([listen()]), { config: c, limiter });
  assert.equal(third.status, 429);
  assert.ok(Number(third.headers['Retry-After']) >= 1);
  assert.equal(third.inserted.length, 0);
  const other = await run(batch([listen()], { install_id: '11111111-2222-4333-8444-555555555555' }), { config: c, limiter });
  assert.equal(other.status, 202);
});

test('per-install event limit counts events, not requests', async () => {
  const limiter = new AnalyticsLimiter();
  const c = cfg({ installEventsPerHour: 5 });
  const ev = Array.from({ length: 3 }, () => listen());
  assert.equal((await run(batch(ev), { config: c, limiter })).status, 202);
  assert.equal((await run(batch(ev), { config: c, limiter })).status, 429); // 3 + 3 > 5
});

test('global per-minute and per-day limits stop all installs; a blocked request counts nothing', () => {
  const l = new AnalyticsLimiter();
  const c = cfg({ globalEventsPerMinute: 4 });
  assert.equal(l.check('a', 3, c, NOW), null);
  assert.notEqual(l.check('b', 2, c, NOW), null); // 3 + 2 > 4
  assert.equal(l.check('b', 1, c, NOW), null); // the blocked 2 were not counted
  assert.equal(l.check('c', 1, c, NOW + 61_000), null); // next minute
  const d = cfg({ globalEventsPerDay: 2 });
  const l2 = new AnalyticsLimiter();
  assert.equal(l2.check('a', 2, d, NOW), null);
  assert.notEqual(l2.check('b', 1, d, NOW + 3600_000), null);
  assert.equal(l2.check('b', 1, d, NOW + 25 * 3600_000), null);
});

test('limit of 0 blocks everything', () => {
  assert.notEqual(new AnalyticsLimiter().check('a', 1, cfg({ installEventsPerHour: 0 }), NOW), null);
});

test('WindowCounter is bounded: random keys cannot grow it past maxKeys', () => {
  const w = new WindowCounter(3600_000, 100);
  for (let i = 0; i < 1000; i++) w.hit(`k${i}`, 1, 10, NOW);
  assert.ok(w.size() <= 100);
});
