import test from 'node:test';
import assert from 'node:assert/strict';
import { bearerTokenFor, setSessionProvider } from '../src/lib/api/session-token.ts';
import { apiClient } from '../src/lib/api/client.ts';
import { getEpisodes, getJobStatus, generateEpisode, getLinkedAccounts, getAuthStatus, disconnectAccount, generateTopicEpisode } from '../src/lib/api/episodes.ts';
import { submitSuggestion } from '../src/lib/topic-suggest.ts';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { deleteRemoteAccount } from '../src/lib/account.ts';

type Seen = { url: string; method?: string; auth: string | null };

function mockFetch(respond: (seen: Seen) => Response) {
  const calls: Seen[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    const headers = new Headers(init?.headers);
    const seen = { url: String(url), method: init?.method, auth: headers.get('authorization') };
    calls.push(seen);
    return respond(seen);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}
const json = (status: number, body: unknown = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
const session = (email: string | null, accessToken: string | null = 'tok-1') => () => Promise.resolve({ email, accessToken });

test('bearerTokenFor: the token only goes out for the account it belongs to', async () => {
  try {
    setSessionProvider(session('Me@Example.com'));
    assert.equal(await bearerTokenFor('me@example.com'), 'tok-1');
    assert.equal(await bearerTokenFor('  ME@example.com '), 'tok-1');
    assert.equal(await bearerTokenFor('other@example.com'), null, 'another account is never sent this token');
    assert.equal(await bearerTokenFor('guest@audexa.app'), null);
    assert.equal(await bearerTokenFor(''), null);
    assert.equal(await bearerTokenFor(null), null);
    setSessionProvider(session('me@example.com', ''));
    assert.equal(await bearerTokenFor('me@example.com'), null, 'empty token');
    setSessionProvider(session(null));
    assert.equal(await bearerTokenFor('me@example.com'), null, 'session without an email');
    setSessionProvider(() => Promise.resolve(null));
    assert.equal(await bearerTokenFor('me@example.com'), null, 'signed out');
    setSessionProvider(() => Promise.reject(new Error('storage blocked')));
    assert.equal(await bearerTokenFor('me@example.com'), null, 'a failing provider means no token, not a failing call');
    setSessionProvider(null);
    assert.equal(await bearerTokenFor('me@example.com'), null, 'no provider registered');
  } finally {
    setSessionProvider(null);
  }
});

test('every per-user call sends the Bearer token when the user has a session', async () => {
  setSessionProvider(session('me@example.com'));
  const m = mockFetch(() => json(200, { episodes: [], linkedAccounts: [], jobId: 'job_1', status: 'queued' }));
  try {
    await getEpisodes('me@example.com');
    await getLinkedAccounts('me@example.com');
    await generateEpisode('me@example.com');
    await getJobStatus('job_1', 'me@example.com');
    await deleteRemoteAccount('me@example.com');
    assert.equal(m.calls.length, 5);
    assert.deepEqual(m.calls.map((c) => c.auth), Array(5).fill('Bearer tok-1'));
    assert.ok(m.calls[0].url.endsWith('/podcast/episodes/me@example.com'));
    assert.ok(m.calls[1].url.endsWith('/linked-accounts/me@example.com'));
    assert.ok(m.calls[2].url.endsWith('/podcast/generate-async'));
    assert.ok(m.calls[3].url.endsWith('/podcast/job/job_1'));
    assert.equal(m.calls[4].method, 'DELETE');
  } finally {
    m.restore();
    setSessionProvider(null);
  }
});

test('guest / signed-out / another account: no Authorization header, same calls as before', async () => {
  const m = mockFetch(() => json(200, { episodes: [] }));
  try {
    setSessionProvider(() => Promise.resolve(null));
    await getEpisodes('guest@audexa.app');
    setSessionProvider(session('admin@example.com'));
    await getEpisodes('guest@audexa.app');
    await getLinkedAccounts('me@example.com');
    await getJobStatus('job_1'); // no user known
    await apiClient('/topics'); // not a per-user call
    assert.deepEqual(m.calls.map((c) => c.auth), [null, null, null, null, null]);
  } finally {
    m.restore();
    setSessionProvider(null);
  }
});

test('a token the server refuses (401) is retried once without it; a 403 is not retried', async () => {
  setSessionProvider(session('me@example.com'));
  const m = mockFetch((s) => (s.auth ? json(401, { error: 'Unauthorized' }) : json(200, { episodes: [{ id: 'e1' }] })));
  try {
    const res = (await getEpisodes('me@example.com')) as { episodes: { id: string }[] };
    assert.equal(res.episodes[0].id, 'e1');
    assert.deepEqual(m.calls.map((c) => c.auth), ['Bearer tok-1', null]);
  } finally {
    m.restore();
  }
  const f = mockFetch(() => json(403, { error: 'Forbidden' }));
  try {
    await assert.rejects(() => getLinkedAccounts('me@example.com'), (e: Error & { status?: number }) => e.status === 403);
    assert.equal(f.calls.length, 1);
  } finally {
    f.restore();
    setSessionProvider(null);
  }
});

test('an Authorization header set by the caller wins', async () => {
  setSessionProvider(session('me@example.com'));
  const m = mockFetch(() => json(200));
  try {
    await apiClient('/linked-accounts/me@example.com', { asUser: 'me@example.com', headers: { Authorization: 'Bearer explicit' } });
    assert.equal(m.calls[0].auth, 'Bearer explicit');
  } finally {
    m.restore();
    setSessionProvider(null);
  }
});

test('disconnect, connection status, topic generation and suggestions send the token too', async () => {
  setSessionProvider(session('me@example.com'));
  const m = mockFetch(() => json(200, { success: true, data: { id: 'e1', status: 'completed', audioUrl: 'https://example.invalid/a.mp3' } }));
  try {
    await getAuthStatus('me@example.com');
    await disconnectAccount('me@example.com', 'google');
    await generateTopicEpisode('ai-ml', 'en', false, 'me@example.com');
    await submitSuggestion({ topicName: 'Chess', language: 'en' }, 'me@example.com');
    assert.deepEqual(m.calls.map((c) => c.auth), Array(4).fill('Bearer tok-1'));
    assert.equal(m.calls[1].method, 'DELETE');
    assert.ok(m.calls[1].url.endsWith('/auth/revoke/google'));
    m.calls.length = 0;
    await disconnectAccount('guest@audexa.app', 'google');
    await generateTopicEpisode('ai-ml', 'en', false, 'guest@audexa.app');
    await submitSuggestion({ topicName: 'Chess', language: 'en' });
    assert.deepEqual(m.calls.map((c) => c.auth), [null, null, null]);
  } finally {
    m.restore();
    setSessionProvider(null);
  }
});

test('every backend request to a route that takes a token sets asUser', () => {
  const takesToken = /apiClient(?:<[^()]*>)?\(\s*[`'](\/(?:podcast\/(?:generate-async|script|job|episodes)|linked-accounts|auth\/(?:status|revoke|refresh)|notifications\/(?:register|unregister|settings)|user\/|topics\/(?:suggest|\$\{topicId\}\/generate)))/g;
  const files = (dir: string): string[] => readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? files(join(dir, e.name)) : /\.tsx?$/.test(e.name) ? [join(dir, e.name)] : []));
  let seen = 0;
  for (const file of files(new URL('../src', import.meta.url).pathname)) {
    const text = readFileSync(file, 'utf8');
    for (const match of text.matchAll(takesToken)) {
      seen++;
      const call = text.slice(match.index, text.indexOf(';', match.index + match[0].length));
      assert.ok(call.includes('asUser'), `${file}: ${match[1]}`);
    }
  }
  assert.ok(seen >= 8, `found ${seen} calls`);
});
