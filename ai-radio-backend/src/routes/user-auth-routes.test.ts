/**
 * HTTP contract of the per-user routes: no token 401, another user's token 403, the owner's token 200.
 * Routes with a legacy window (shipped clients still send no token) are checked in both modes:
 *   USER_AUTH_STRICT=on      -> no token is 401 like everywhere else;
 *   default (compat window)  -> no token is served and counted, a token is still enforced.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';

Object.assign(process.env, {
  NODE_ENV: 'test',
  JWT_SECRET: 'x'.repeat(40),
  SUPABASE_URL: 'https://example.invalid',
  SUPABASE_SERVICE_KEY: 'test-service-key',
  GOOGLE_CLIENT_ID: 'x',
  GOOGLE_CLIENT_SECRET: 'x',
  ANTHROPIC_API_KEY: 'x',
});

const ME = 'me@example.com';
const OTHER = 'other@example.com';
const USERS: Record<string, { id: string; email: string }> = {
  'tok-me': { id: 'u1', email: 'Me@Example.com' },
  'tok-other': { id: 'u2', email: OTHER },
};

type Mods = {
  podcastRouter: express.Router;
  linkedRouter: express.Router;
  user: typeof import('../lib/user-auth');
  runtime: typeof import('../lib/user-auth-runtime');
  generator: any;
  tokenManager: any;
};
let mods: Mods;
const stored: Array<{ userId: string; provider: string }> = [];

async function load(): Promise<Mods> {
  const runtime = await import('../lib/user-auth-runtime');
  runtime.setTokenVerifierForTests(async (t) => USERS[t] ?? null);
  const { podcastGenerator } = await import('../services/podcast/podcast.generator');
  const { tokenManager } = await import('../services/auth/token.manager');
  podcastGenerator.validatePrerequisites = async () => ({ valid: true, issues: [] }) as any;
  podcastGenerator.generateScriptOnly = (async () => ({ segments: [{ speaker: 'host1', text: 'hi', type: 'news' }] })) as any;
  podcastGenerator.generateEpisode = (async () => ({
    script: { segments: [{ speaker: 'host1', text: 'secret briefing', type: 'news' }] },
    episode_id: 'e1',
    audio_url: 'https://example.invalid/a.mp3',
    duration_seconds: 60,
  })) as any;
  tokenManager.getUserTokens = async (userId: string) => [{ provider: 'google', email: userId }];
  tokenManager.storeTokenFromLinkedAccount = async (userId: string, provider: string) => {
    stored.push({ userId, provider });
  };
  return {
    podcastRouter: (await import('./podcast')).default,
    linkedRouter: (await import('./linked-accounts')).default,
    user: await import('../lib/user-auth'),
    runtime,
    generator: podcastGenerator,
    tokenManager,
  };
}

async function withServer(fn: (base: string) => Promise<void>) {
  mods ??= await load();
  const app = express();
  app.use(express.json());
  app.use('/api/podcast', mods.podcastRouter);
  app.use('/api/linked-accounts', mods.linkedRouter);
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api`);
  } finally {
    server.close();
  }
}

const strict = () => {
  process.env.USER_AUTH_STRICT = 'on';
  delete process.env.USER_AUTH_LEGACY_ANON;
};
const compat = () => {
  delete process.env.USER_AUTH_STRICT;
  delete process.env.USER_AUTH_LEGACY_ANON;
};

const call = (base: string, method: string, path: string, token?: string, body?: unknown) =>
  fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...(token === undefined ? {} : { Authorization: token }) },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const genBody = (email: string) => ({ user_id: email, preferences: { briefing_time: '07:00' } });

interface Case {
  name: string;
  key: string;
  legacy: boolean; // shipped clients still call it without a token
  okStatus: number;
  run: (base: string, token?: string, asUser?: string) => Promise<Response>;
}
const CASES: Case[] = [
  { name: 'POST /podcast/generate-async', key: 'podcast.generate-async', legacy: true, okStatus: 202, run: (b, t, u = ME) => call(b, 'POST', '/podcast/generate-async', t, genBody(u)) },
  { name: 'POST /podcast/script', key: 'podcast.script', legacy: true, okStatus: 200, run: (b, t, u = ME) => call(b, 'POST', '/podcast/script', t, genBody(u)) },
  { name: 'GET /podcast/episodes/:userId', key: 'podcast.episodes', legacy: true, okStatus: 200, run: (b, t, u = ME) => call(b, 'GET', `/podcast/episodes/${encodeURIComponent(u)}`, t) },
  { name: 'POST /linked-accounts/:userId', key: 'linked-accounts.create', legacy: true, okStatus: 201, run: (b, t, u = ME) =>
      call(b, 'POST', `/linked-accounts/${encodeURIComponent(u)}`, t, { provider: 'google', email: u, access_token: 'g-token' }) },
  { name: 'GET /linked-accounts/:userId', key: 'linked-accounts.list', legacy: false, okStatus: 200, run: (b, t, u = ME) => call(b, 'GET', `/linked-accounts/${encodeURIComponent(u)}`, t) },
  { name: 'DELETE /linked-accounts/:userId/:accountId', key: 'linked-accounts.delete', legacy: false, okStatus: 200, run: (b, t, u = ME) => call(b, 'DELETE', `/linked-accounts/${encodeURIComponent(u)}/acc_1`, t) },
];

for (const c of CASES) {
  test(`${c.name}: strict mode is 401 without a token, 401 for a bad token, 403 for another user, 200 for the owner`, async () => {
    strict();
    await withServer(async (base) => {
      for (const h of [undefined, '', 'Bearer', 'Bearer nonsense', 'Basic abc']) {
        assert.equal((await c.run(base, h)).status, 401, String(h));
      }
      assert.equal((await c.run(base, 'Bearer tok-other')).status, 403, 'other user acting on ME');
      assert.equal((await c.run(base, 'Bearer tok-me', OTHER)).status, 403, 'ME acting on OTHER');
      assert.equal((await c.run(base, 'Bearer tok-me')).status, c.okStatus, 'owner (case-insensitive email)');
    });
  });

  test(`${c.name}: default mode ${c.legacy ? 'serves token-less requests (counted) but' : 'is strict and'} still enforces a token`, async () => {
    compat();
    mods?.user.resetLegacyAnonCounts();
    await withServer(async (base) => {
      const anon = await c.run(base);
      if (c.legacy) {
        assert.equal(anon.status, c.okStatus, 'legacy token-less request is served');
        assert.equal(mods.user.legacyAnonCounts()[c.key], 1, 'and counted');
      } else {
        assert.equal(anon.status, 401);
        assert.equal(mods.user.legacyAnonCounts()[c.key], undefined);
      }
      // A malformed header is never treated as "no token".
      assert.equal((await c.run(base, 'Bearer')).status, 401);
      assert.equal((await c.run(base, 'Bearer nonsense')).status, 401);
      assert.equal((await c.run(base, 'Bearer tok-other')).status, 403);
      assert.equal((await c.run(base, 'Bearer tok-me')).status, c.okStatus);
    });
  });
}

test('GET /podcast/job/:jobId: owner 200, another user 403, no token 401 (strict) / served and counted (legacy), unknown id 404', async () => {
  strict();
  await withServer(async (base) => {
    const started = await call(base, 'POST', '/podcast/generate-async', 'Bearer tok-me', genBody(ME));
    assert.equal(started.status, 202);
    const { jobId } = (await started.json()) as { jobId: string };
    assert.match(jobId, /^job_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/, 'unguessable id');
    await new Promise((r) => setTimeout(r, 50)); // let the stubbed generation finish

    const path = `/podcast/job/${jobId}`;
    assert.equal((await call(base, 'GET', path)).status, 401);
    assert.equal((await call(base, 'GET', path, 'Bearer nonsense')).status, 401);
    const other = await call(base, 'GET', path, 'Bearer tok-other');
    assert.equal(other.status, 403);
    assert.ok(!JSON.stringify(await other.json()).includes('secret briefing'), 'no script leaks to another user');
    const own = await call(base, 'GET', path, 'Bearer tok-me');
    assert.equal(own.status, 200);
    const body = (await own.json()) as any;
    assert.equal(body.status, 'completed');
    assert.equal(body.episode.script.segments[0].text, 'secret briefing');
    assert.equal((await call(base, 'GET', '/podcast/job/job_nope', 'Bearer tok-me')).status, 404);

    compat();
    mods.user.resetLegacyAnonCounts();
    assert.equal((await call(base, 'GET', path)).status, 200, 'legacy token-less client polling its own job');
    assert.equal(mods.user.legacyAnonCounts()['podcast.job'], 1);
    assert.equal((await call(base, 'GET', path, 'Bearer tok-other')).status, 403, 'a token is enforced even in the legacy window');
  });
});

test('linked accounts: the owner reads only their own list, and a rejected POST stores nothing', async () => {
  strict();
  stored.length = 0;
  await withServer(async (base) => {
    const mine = (await (await call(base, 'GET', `/linked-accounts/${ME}`, 'Bearer tok-me')).json()) as any;
    assert.deepEqual(mine.linkedAccounts.map((a: any) => a.email), [ME]);
    const post = (u: string, t?: string) => call(base, 'POST', `/linked-accounts/${u}`, t, { provider: 'google', email: u, access_token: 'g' });
    assert.equal((await post(ME)).status, 401);
    assert.equal((await post(ME, 'Bearer tok-other')).status, 403);
    assert.equal(stored.length, 0);
    assert.equal((await post(ME, 'Bearer tok-me')).status, 201);
    assert.equal(stored.length, 1);
  });
});

test('USER_AUTH_LEGACY_ANON narrows the window per route; unknown keys do nothing', async () => {
  const { legacyAnonKeys, DEFAULT_LEGACY_ANON_KEYS } = await import('../lib/user-auth');
  assert.deepEqual([...legacyAnonKeys({})].sort(), [...DEFAULT_LEGACY_ANON_KEYS].sort());
  assert.deepEqual([...legacyAnonKeys({ USER_AUTH_STRICT: 'on' })], []);
  assert.deepEqual([...legacyAnonKeys({ USER_AUTH_LEGACY_ANON: ' podcast.script , ' })], ['podcast.script']);
  assert.deepEqual([...legacyAnonKeys({ USER_AUTH_LEGACY_ANON: '' })], []);
  // the two read/delete linked-accounts routes are never in the default window
  assert.ok(!DEFAULT_LEGACY_ANON_KEYS.includes('linked-accounts.list'));
  assert.ok(!DEFAULT_LEGACY_ANON_KEYS.includes('linked-accounts.delete'));

  process.env.USER_AUTH_LEGACY_ANON = 'podcast.script';
  delete process.env.USER_AUTH_STRICT;
  await withServer(async (base) => {
    assert.equal((await call(base, 'POST', '/podcast/script', undefined, genBody(ME))).status, 200);
    assert.equal((await call(base, 'POST', '/podcast/generate-async', undefined, genBody(ME))).status, 401);
  });
  compat();
});

test('POST /topics/suggest owner: the verified token decides; a body userId for someone else is a conflict', async () => {
  const { optionalUser, ownerForNewRow } = await import('../lib/user-auth');
  const verify = async (t: string) => USERS[t] ?? null;
  assert.deepEqual(await optionalUser(() => verify, undefined), { kind: 'none' });
  assert.deepEqual(await optionalUser(() => verify, 'Bearer'), { kind: 'invalid' });
  assert.deepEqual(await optionalUser(() => verify, 'Bearer nonsense'), { kind: 'invalid' });
  const ok = await optionalUser(() => verify, 'Bearer tok-me');
  assert.equal(ok.kind, 'ok');
  const user = ok.kind === 'ok' ? ok.user : null;
  assert.deepEqual(ownerForNewRow(user, null), { userId: 'Me@Example.com', conflict: false });
  assert.deepEqual(ownerForNewRow(user, ME), { userId: 'Me@Example.com', conflict: false });
  assert.deepEqual(ownerForNewRow(user, OTHER), { userId: null, conflict: true });
  assert.deepEqual(ownerForNewRow(null, null), { userId: null, conflict: false }); // Android 12.10.1: no owner, as before
  assert.deepEqual(ownerForNewRow(null, OTHER), { userId: OTHER, conflict: false }); // legacy body userId, unverified, as before
});
