/**
 * Access contract per route: who is refused and who is served.
 *   operator   "Authorization: Bearer <BATCH_SECRET>" only;
 *   owner      the session of the account the request names;
 *   window     served without a session until its switch is on; a session that is sent is always enforced;
 *   install id served without a session for an install id, owner only when the request names an email address.
 * No network: every outbound request is answered here and every service that would call a provider is replaced.
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
  GOOGLE_REDIRECT_URI: 'https://example.invalid/callback',
  ANTHROPIC_API_KEY: 'x',
  BATCH_SECRET: 'operator-secret',
  PODCAST_RATE_LIMIT_MAX: '1000',
});
for (const k of ['USER_AUTH_STRICT', 'USER_AUTH_STRICT_NOTIFICATIONS', 'USER_AUTH_LEGACY_ANON', 'LINK_ACCOUNT_PROOF', 'OAUTH_REDIRECT_ORIGINS']) {
  delete process.env[k];
}

const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(input?.url ?? input);
  if (url.startsWith('http://127.0.0.1:')) return realFetch(input, init);
  return new Response('[]', { status: 200, headers: { 'Content-Type': 'application/json' } });
}) as typeof fetch;

const ME = 'me@example.com';
const OTHER = 'other@example.com';
const INSTALL = '0F8E2C1A-1111-2222-3333-444455556666';
const USERS: Record<string, { id: string; email: string }> = {
  'tok-me': { id: 'u1', email: 'Me@Example.com' },
  'tok-other': { id: 'u2', email: OTHER },
};
const AS_ME = 'Bearer tok-me';
const AS_OTHER = 'Bearer tok-other';
const AS_OPERATOR = 'Bearer operator-secret';

/** Names of the service calls the handlers reached, so a refusal can be shown to have done nothing. */
const reached: string[] = [];
const stub = (target: any, method: string, result: unknown) => {
  target[method] = async () => {
    reached.push(method);
    return result;
  };
};

let app: express.Express;
let mods: { proof: typeof import('../services/auth/account-proof') };

async function load() {
  const runtime = await import('../lib/user-auth-runtime');
  runtime.setTokenVerifierForTests(async (t) => USERS[t] ?? null);

  const { podcastGenerator } = await import('../services/podcast/podcast.generator');
  const episode = { script: { segments: [] }, episode_id: 'e1', audio_url: 'https://example.invalid/a.mp3', duration_seconds: 60 };
  stub(podcastGenerator, 'validatePrerequisites', { valid: true, issues: [] });
  stub(podcastGenerator, 'estimateGenerationCost', { script_cost_usd: 0, tts_cost_usd: 0, total_cost_usd: 0, estimated_duration_seconds: 1 });
  stub(podcastGenerator, 'generateEpisode', episode);
  stub(podcastGenerator, 'generateScheduledPodcast', episode);
  stub(podcastGenerator, 'getGenerationStats', { total_episodes: 0, successful: 0, failed: 0, average_duration_seconds: 0, total_cost_usd: 0 });

  const { dailyBriefScheduler } = await import('../services/scheduler/daily-brief.scheduler');
  stub(dailyBriefScheduler, 'triggerForUser', { success: true, episodeId: 'e1', audioUrl: 'https://example.invalid/a.mp3' });

  const { tokenManager } = await import('../services/auth/token.manager');
  stub(tokenManager, 'getToken', { accessToken: 'a', refreshToken: 'r', expiresAt: new Date(), scopes: [], provider: 'google' });
  stub(tokenManager, 'refreshToken', { expiresAt: new Date() });
  stub(tokenManager, 'revokeToken', undefined);
  stub(tokenManager, 'hasProvider', true);
  stub(tokenManager, 'getUserTokens', []);
  stub(tokenManager, 'storeTokenFromLinkedAccount', undefined);

  const { qaGenerator } = await import('../services/content/qa.generator');
  stub(qaGenerator, 'askQuestion', {});
  stub(qaGenerator, 'getHistory', {});
  stub(qaGenerator, 'getSessionDetail', {});
  stub(qaGenerator, 'deleteSession', true);
  const { deepDiveGenerator } = await import('../services/content/deepdive.generator');
  stub(deepDiveGenerator, 'generateDeepDive', {});
  stub(deepDiveGenerator, 'getHistory', {});
  stub(deepDiveGenerator, 'getEpisode', {});
  stub(deepDiveGenerator, 'deleteEpisode', true);
  const { customSourceService } = await import('../services/content/customsource.service');
  stub(customSourceService, 'addSource', {});
  stub(customSourceService, 'getSources', {});
  stub(customSourceService, 'getSourceDetail', {});
  stub(customSourceService, 'refreshSource', {});
  stub(customSourceService, 'toggleSource', {});
  stub(customSourceService, 'deleteSource', true);
  stub(customSourceService, 'getItemsForBrief', []);
  const { interactionsService } = await import('../services/content/interactions.service');
  stub(interactionsService, 'recordInteraction', { success: true });
  stub(interactionsService, 'generateExpansion', { success: true });
  stub(interactionsService, 'getUserPreferences', { success: true });
  const { elevenLabsTTS } = await import('../services/tts/elevenlabs.tts');
  stub(elevenLabsTTS, 'getSubscriptionInfo', { character_count: 1, character_limit: 2, tier: 't', can_extend_character_limit: false });

  const proof = await import('../services/auth/account-proof');
  const a = express();
  a.use(express.json());
  a.use('/api/podcast', (await import('./podcast')).default);
  a.use('/api/notifications', (await import('./notifications')).default);
  a.use('/api/auth', (await import('./auth')).default);
  a.use('/api/user', (await import('./user')).default);
  a.use('/api/linked-accounts', (await import('./linked-accounts')).default);
  a.use('/api/voice', (await import('./voice')).default);
  a.use('/api/voices', (await import('./voices')).default);
  a.use('/api/qa', (await import('./qa')).default);
  a.use('/api/deepdive', (await import('./deepdive')).default);
  a.use('/api/sources', (await import('./customsource')).default);
  a.use('/api/interactions', (await import('./interactions')).default);
  app = a;
  mods = { proof };
}

type Call = { method: string; path: string; body?: unknown; headers?: Record<string, string> };

async function send(c: Call, authorization?: string) {
  if (!app) await load();
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try {
    const res = await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/api${c.path}`, {
      method: c.method,
      redirect: 'manual',
      headers: { 'Content-Type': 'application/json', ...c.headers, ...(authorization ? { Authorization: authorization } : {}) },
      body: c.body === undefined ? undefined : JSON.stringify(c.body),
    });
    await res.arrayBuffer();
    return res;
  } finally {
    server.close();
  }
}

/** Refused with the given status, and nothing behind the route ran. */
async function refused(c: Call, authorization: string | undefined, status: number) {
  reached.length = 0;
  const res = await send(c, authorization);
  assert.equal(res.status, status, `${c.method} ${c.path} (${authorization ?? 'no session'})`);
  assert.deepEqual(reached, [], `${c.method} ${c.path} must not reach a service`);
}

async function served(c: Call, authorization?: string) {
  const res = await send(c, authorization);
  assert.ok(![401, 403, 429].includes(res.status), `${c.method} ${c.path} (${authorization ?? 'no session'}) got ${res.status}`);
  return res;
}

const prefs = { briefing_time: '07:00', include_email: true, include_calendar: true };
const OPERATOR: Call[] = [
  { method: 'POST', path: '/podcast/generate', body: { user_id: ME, preferences: prefs } },
  { method: 'POST', path: '/podcast/estimate', body: { user_id: ME, preferences: prefs } },
  { method: 'POST', path: '/podcast/validate', body: { user_id: ME } },
  { method: 'POST', path: `/podcast/scheduled/${ME}` },
  { method: 'GET', path: '/podcast/stats' },
  { method: 'POST', path: `/notifications/trigger/${ME}` },
  { method: 'GET', path: '/voice/u1' },
  { method: 'POST', path: '/voice/u1/clone' },
  { method: 'POST', path: '/voice/u1/synthesize', body: {} },
  { method: 'GET', path: '/voices/usage/elevenlabs' },
];

for (const c of OPERATOR) {
  test(`operator: ${c.method} ${c.path}`, async () => {
    await refused(c, undefined, 401);
    await refused(c, AS_ME, 401);
    await refused(c, 'Bearer operator-secre', 401);
    await served(c, AS_OPERATOR);
  });
}

const OWNER: Call[] = [
  { method: 'GET', path: `/notifications/settings/${ME}` },
  { method: 'POST', path: '/auth/refresh', body: { provider: 'google', userId: ME } },
  { method: 'GET', path: `/auth/status?userId=${encodeURIComponent(ME)}` },
  { method: 'GET', path: `/user/${ME}` },
  { method: 'PUT', path: `/user/${ME}`, body: {} },
  { method: 'GET', path: `/user/${ME}/preferences` },
  { method: 'PUT', path: `/user/${ME}/preferences`, body: {} },
  { method: 'GET', path: `/user/${ME}/stats` },
  { method: 'PATCH', path: `/linked-accounts/${ME}/acc_1`, body: {} },
  { method: 'POST', path: `/linked-accounts/${ME}/acc_1/refresh` },
];

for (const c of OWNER) {
  test(`owner: ${c.method} ${c.path}`, async () => {
    await refused(c, undefined, 401);
    await refused(c, 'Bearer nonsense', 401);
    await refused(c, AS_OPERATOR, 401);
    await refused(c, AS_OTHER, 403);
    await served(c, AS_ME);
  });
}

const WINDOW: Array<Call & { flag: string }> = [
  { method: 'DELETE', path: '/auth/revoke/google', body: { userId: ME }, flag: 'USER_AUTH_STRICT' },
  { method: 'POST', path: '/notifications/register', body: { user_id: ME, device_token: 'd', platform: 'android' }, flag: 'USER_AUTH_STRICT_NOTIFICATIONS' },
  { method: 'DELETE', path: '/notifications/unregister', body: { user_id: ME, device_token: 'd' }, flag: 'USER_AUTH_STRICT_NOTIFICATIONS' },
  { method: 'POST', path: '/notifications/settings', body: { user_id: ME }, flag: 'USER_AUTH_STRICT_NOTIFICATIONS' },
];

for (const c of WINDOW) {
  test(`window (${c.flag}): ${c.method} ${c.path}`, async () => {
    await served(c); // setting off
    await refused(c, AS_OTHER, 403);
    await refused(c, 'Bearer nonsense', 401);
    await served(c, AS_ME);
    process.env[c.flag] = 'on';
    try {
      await refused(c, undefined, 401);
      await served(c, AS_ME);
    } finally {
      delete process.env[c.flag];
    }
  });
}

test('window: USER_AUTH_STRICT leaves the notification writes as they are (they have their own switch)', async () => {
  process.env.USER_AUTH_STRICT = 'on';
  try {
    await served(WINDOW[3]);
  } finally {
    delete process.env.USER_AUTH_STRICT;
  }
});

const byId = (id: string): Call[] => {
  const q = encodeURIComponent(id);
  return [
    { method: 'POST', path: '/qa/ask', body: { question: 'q', contextType: 'topic', contextId: 'c', userId: id } },
    { method: 'GET', path: `/qa/history?userId=${q}` },
    { method: 'GET', path: `/qa/session/s1?userId=${q}` },
    { method: 'DELETE', path: `/qa/session/s1?userId=${q}` },
    { method: 'POST', path: '/deepdive/generate', body: { query: 'q', userId: id } },
    { method: 'GET', path: `/deepdive/history?userId=${q}` },
    { method: 'GET', path: `/deepdive/d1?userId=${q}` },
    { method: 'DELETE', path: `/deepdive/d1?userId=${q}` },
    { method: 'POST', path: '/sources', body: { url: 'https://example.invalid', sourceType: 'rss', userId: id } },
    { method: 'GET', path: `/sources?userId=${q}` },
    { method: 'GET', path: `/sources/s1?userId=${q}` },
    { method: 'GET', path: `/sources/brief/items?userId=${q}` },
    { method: 'POST', path: '/sources/s1/refresh', body: { userId: id } },
    { method: 'PATCH', path: '/sources/s1/toggle', body: { userId: id, isActive: true } },
    { method: 'DELETE', path: `/sources/s1?userId=${q}` },
    { method: 'POST', path: '/interactions/record', body: { context_type: 't', context_id: 'c', interaction_type: 'skip' }, headers: { 'x-user-id': id } },
    { method: 'POST', path: '/interactions/tell-me-more', body: { context_type: 't', context_id: 'c' }, headers: { 'x-user-id': id } },
    { method: 'GET', path: '/interactions/preferences', headers: { 'x-user-id': id } },
  ];
};

byId(ME).forEach((asAddress, i) => {
  const asInstall = byId(INSTALL)[i];
  test(`install id: ${asAddress.method} ${asAddress.path}`, async () => {
    await served(asInstall);
    await refused(asAddress, undefined, 401);
    await refused(asAddress, 'Bearer nonsense', 401);
    await refused(asAddress, AS_OTHER, 403);
    await served(asAddress, AS_ME);
  });
});

test('install id: an address inside a list or object, or beside an install id, still needs its own session', async () => {
  await refused({ method: 'GET', path: `/qa/history?userId=${INSTALL}&userId=${encodeURIComponent(ME)}` }, undefined, 401);
  await refused({ method: 'POST', path: '/deepdive/generate', body: { query: 'q', userId: [ME] } }, AS_ME, 403);
  await refused({ method: 'POST', path: '/sources/s1/refresh', body: { userId: { toString: ME } } }, undefined, 401);
  await refused({ method: 'POST', path: `/qa/ask?userId=${INSTALL}`, body: { question: 'q', contextType: 't', contextId: 'c', userId: ME } }, undefined, 401);
});

test('browser sign-in: only our web app can be named as the return address', async () => {
  for (const provider of ['google', 'microsoft']) {
    for (const bad of [
      'https://elsewhere.example/x', 'http://audexa.app/settings', '//elsewhere.example', '/settings', 'javascript:alert(1)',
      'https://audexa.app.elsewhere.example/', 'https://u@audexa.app/settings',
    ]) {
      const res = await send({ method: 'GET', path: `/auth/oauth/${provider}?redirect_url=${encodeURIComponent(bad)}` });
      assert.equal(res.status, 400, `${provider} ${bad}`);
    }
  }
  for (const good of ['', `?redirect_url=${encodeURIComponent('https://audexa.app/settings')}&scope=gmail.modify`]) {
    assert.equal((await send({ method: 'GET', path: `/auth/oauth/google${good}` })).status, 302, good);
  }
});

test('return address check: normalized, and extendable by setting', async () => {
  const { checkedRedirectUrl } = await import('../lib/redirect-allow');
  const prod = { NODE_ENV: 'production' };
  assert.equal(checkedRedirectUrl(undefined, prod), undefined);
  assert.equal(checkedRedirectUrl('https://www.audexa.app/settings?x=1#y', prod), 'https://www.audexa.app/settings');
  assert.equal(checkedRedirectUrl('https://audexa.app\\@elsewhere.example', prod), 'https://audexa.app/@elsewhere.example');
  assert.equal(checkedRedirectUrl(['https://audexa.app'], prod), null);
  assert.equal(checkedRedirectUrl('http://localhost:3000/settings', prod), null);
  assert.equal(checkedRedirectUrl('http://localhost:3000/settings', {}), 'http://localhost:3000/settings');
  assert.equal(checkedRedirectUrl('https://preview.example/settings', { ...prod, OAUTH_REDIRECT_ORIGINS: 'https://preview.example' }), 'https://preview.example/settings');
});

const link = (userId: string, token = 'provider-token'): Call => ({
  method: 'POST', path: `/linked-accounts/${userId}`, body: { provider: 'google', email: userId, access_token: token },
});

test('linking without a session: the provider token must belong to the account in the URL', async () => {
  if (!app) await load();
  const asked: string[] = [];
  const answer = (owner: Awaited<ReturnType<typeof mods.proof.lookupTokenOwner>>) =>
    mods.proof.setTokenOwnerLookupForTests(async (_p, t) => {
      asked.push(t);
      return owner;
    });
  try {
    answer({ kind: 'ok', addresses: ['Me@Example.com'] });
    assert.equal((await send(link(ME))).status, 201);
    await refused(link(OTHER), undefined, 403);
    answer({ kind: 'ok', addresses: ['someone@googlemail.com'] });
    assert.equal((await send(link('someone@gmail.com'))).status, 201, 'two names of one mailbox');
    answer({ kind: 'rejected' });
    await refused(link(ME), undefined, 403);
    answer({ kind: 'unavailable' });
    await refused(link(ME), undefined, 503);
    asked.length = 0;
    assert.equal((await send(link(ME), AS_ME)).status, 201, 'a session is enough');
    await refused(link(ME), AS_OTHER, 403);
    assert.deepEqual(asked, [], 'the provider is not asked when there is a session');
    process.env.LINK_ACCOUNT_PROOF = 'off';
    assert.equal((await send(link(ME))).status, 201);
  } finally {
    delete process.env.LINK_ACCOUNT_PROOF;
    mods.proof.setTokenOwnerLookupForTests(null);
  }
});

test('token owner lookup: first source that names an account wins; outages are not refusals', async () => {
  const { lookupTokenOwner } = await import('../services/auth/account-proof');
  const answers = (...list: Array<[number, unknown] | 'down'>) => {
    let i = 0;
    return (async () => {
      const a = list[Math.min(i++, list.length - 1)];
      if (a === 'down') throw new Error('network');
      return new Response(JSON.stringify(a[1]), { status: a[0] });
    }) as unknown as typeof fetch;
  };
  assert.deepEqual(await lookupTokenOwner('google', 't', answers([200, { emailAddress: ME }])), { kind: 'ok', addresses: [ME] });
  assert.deepEqual(await lookupTokenOwner('google', 't', answers([403, {}], [200, { email: ME }])), { kind: 'ok', addresses: [ME] });
  assert.deepEqual(await lookupTokenOwner('google', 't', answers([403, {}], [401, {}], [200, { id: ME }])), { kind: 'ok', addresses: [ME] });
  assert.deepEqual(await lookupTokenOwner('google', 't', answers([403, {}], [200, { email: ME, email_verified: false }], [403, {}])), { kind: 'rejected' });
  assert.deepEqual(await lookupTokenOwner('google', 't', answers([401, {}])), { kind: 'rejected' });
  assert.deepEqual(await lookupTokenOwner('google', 't', answers([503, {}], [403, {}])), { kind: 'unavailable' });
  assert.deepEqual(await lookupTokenOwner('google', 't', answers('down')), { kind: 'unavailable' });
  assert.deepEqual(await lookupTokenOwner('microsoft', 't', answers([200, { mail: ME, userPrincipalName: OTHER }])), { kind: 'ok', addresses: [OTHER] });
});
