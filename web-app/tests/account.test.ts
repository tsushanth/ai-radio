import test from 'node:test';
import assert from 'node:assert/strict';
import { GUEST_EMAIL, isSharedIdentity, deleteRemoteAccount, clearAppStorage } from '../src/lib/account.ts';

type Call = { url: string; method?: string };

function mockFetch(respond: () => Response) {
  const calls: Call[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: String(url), method: init?.method });
    return respond();
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

test('isSharedIdentity: guest (any case, padded), empty and missing are shared', () => {
  for (const v of [GUEST_EMAIL, 'Guest@Audexa.app', '  guest@audexa.app ', '', '   ', null, undefined]) {
    assert.equal(isSharedIdentity(v), true, String(v));
  }
  assert.equal(isSharedIdentity('someone@gmail.com'), false);
  assert.equal(isSharedIdentity('guest@audexa.app.evil.com'), false);
});

test('guest never sends a delete request', async () => {
  const m = mockFetch(() => json(200, { success: true }));
  try {
    for (const v of [GUEST_EMAIL, 'GUEST@audexa.app', '', null, undefined]) {
      assert.deepEqual(await deleteRemoteAccount(v), { remoteDeleted: false });
    }
    assert.equal(m.calls.length, 0);
  } finally { m.restore(); }
});

test('a linked user sends DELETE /user/<encoded email> and reports remoteDeleted', async () => {
  const m = mockFetch(() => json(200, { success: true, message: 'User account and all associated data have been deleted' }));
  try {
    const r = await deleteRemoteAccount('jane.doe+x@gmail.com');
    assert.deepEqual(r, { remoteDeleted: true });
    assert.equal(m.calls.length, 1);
    assert.equal(m.calls[0].method, 'DELETE');
    assert.ok(m.calls[0].url.endsWith('/user/jane.doe%2Bx%40gmail.com'), m.calls[0].url);
  } finally { m.restore(); }
});

test('a server error is thrown with the server message so the caller keeps the session', async () => {
  const m = mockFetch(() => json(500, { error: 'Failed to delete user', message: 'db down' }));
  try {
    await assert.rejects(() => deleteRemoteAccount('jane@gmail.com'), /Failed to delete user/);
  } finally { m.restore(); }
});

test('a network failure is thrown too', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = (async () => { throw new TypeError('fetch failed'); }) as typeof fetch;
  try {
    await assert.rejects(() => deleteRemoteAccount('jane@gmail.com'), /fetch failed/);
  } finally { globalThis.fetch = original; }
});

test('clearAppStorage removes only audexa- keys', () => {
  const data = new Map<string, string>([
    ['audexa-user', '{}'], ['audexa-linked-accounts', '[]'], ['audexa-preferences', '{}'], ['audexa-daily-brief', '{}'],
    ['theme', 'dark'], ['other-audexa-thing', '1'],
  ]);
  const storage = {
    get length() { return data.size; },
    key: (i: number) => [...data.keys()][i] ?? null,
    removeItem: (k: string) => { data.delete(k); },
  };
  const removed = clearAppStorage(storage);
  assert.deepEqual(removed.sort(), ['audexa-daily-brief', 'audexa-linked-accounts', 'audexa-preferences', 'audexa-user']);
  assert.deepEqual([...data.keys()].sort(), ['other-audexa-thing', 'theme']);
});
