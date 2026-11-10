import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import type { AddressInfo } from 'node:net';
import { deleteUserData, emailVariants, parseStorageUrl, type DeletionDeps } from './account-deletion.ts';
import { requireSelf, supabaseTokenVerifier } from '../../lib/user-auth.ts';

// ---- fake Supabase: tables of rows, storage buckets of file paths, auth users -------------------------------------------------
type Row = Record<string, any>;
class FakeDb {
  tables: Record<string, Row[]> = {};
  buckets: Record<string, Set<string>> = {};
  authUsers = new Map<string, { id: string; email: string; confirmed: boolean }>();
  absentTables = new Set<string>();
  failTables = new Set<string>();
  /** Columns that are uuid-typed in the live database: matching a non-uuid value there is an error, as in Postgres. */
  uuidCols = new Set(['podcast_episodes.user_id', 'oauth_tokens.user_id']);
  calls: string[] = [];

  from(table: string) {
    const self = this;
    let op: 'select' | 'delete' = 'select';
    let cols = '*';
    const filters: Array<(r: Row) => boolean> = [];
    let invalid = false;
    const b: any = {
      select(c: string) { op = 'select'; cols = c; return b; },
      delete() { op = 'delete'; return b; },
      in(col: string, vals: any[]) {
        if (self.uuidCols.has(`${table}.${col}`) && vals.some((v) => !/^[0-9a-f-]{36}$/i.test(String(v)))) invalid = true;
        filters.push((r) => vals.includes(r[col]));
        return b;
      },
      then(resolve: any, reject: any) { return Promise.resolve(run()).then(resolve, reject); },
    };
    const run = () => {
      self.calls.push(`${op}:${table}`);
      if (self.absentTables.has(table)) return { data: null, error: { code: '42P01', message: `relation "${table}" does not exist` } };
      if (invalid) return { data: null, error: { code: '22P02', message: 'invalid input syntax for type uuid' } };
      if (self.failTables.has(table)) return { data: null, error: { code: 'XX000', message: 'boom' } };
      const rows = self.tables[table] ?? [];
      const hit = rows.filter((r) => filters.every((f) => f(r)));
      if (op === 'delete') {
        self.tables[table] = rows.filter((r) => !hit.includes(r));
        return { error: null, count: hit.length };
      }
      return { data: hit.map((r) => ({ ...r })), error: null };
    };
    return b;
  }

  storage = {
    from: (bucket: string) => ({
      list: async (prefix: string, opts: { limit: number; offset: number }) => {
        const set = this.buckets[bucket];
        if (!set) return { data: null, error: { message: 'Bucket not found' } };
        const names = [...set].filter((p) => p.startsWith(`${prefix}/`)).map((p) => p.slice(prefix.length + 1)).filter((n) => !n.includes('/'));
        return { data: names.slice(opts.offset, opts.offset + opts.limit).map((name) => ({ name })), error: null };
      },
      remove: async (paths: string[]) => {
        const set = this.buckets[bucket];
        if (!set) return { data: null, error: { message: 'Bucket not found' } };
        const removed = paths.filter((p) => set.delete(p));
        return { data: removed.map((name) => ({ name })), error: null };
      },
    }),
  };

  auth = {
    getUser: async (jwt: string) => {
      const u = [...this.authUsers.values()].find((x) => `tok-${x.id}` === jwt);
      if (!u) return { data: { user: null }, error: { message: 'invalid JWT' } };
      return { data: { user: { id: u.id, email: u.email, email_confirmed_at: u.confirmed ? '2026-01-01' : null } }, error: null };
    },
  };
}

const UME = '11111111-1111-1111-1111-111111111111';
const UOTHER = '22222222-2222-2222-2222-222222222222';
const ME = 'me@example.com';
const OTHER = 'other@example.com';

function seed(): FakeDb {
  const db = new FakeDb();
  db.authUsers.set('a1', { id: 'a1', email: ME, confirmed: true });
  db.authUsers.set('a2', { id: 'a2', email: OTHER, confirmed: true });
  db.tables = {
    users: [{ id: UME, email: ME }, { id: UOTHER, email: OTHER }],
    podcast_episodes: [
      { id: 'p1', user_id: UME, audio_url: 'https://x.supabase.co/storage/v1/object/sign/podcasts/me@example.com/1.mp3?token=abc' },
      { id: 'p2', user_id: UME, audio_url: null },
      { id: 'p3', user_id: UOTHER, audio_url: 'https://x.supabase.co/storage/v1/object/sign/podcasts/other@example.com/1.mp3?token=abc' },
    ],
    deep_dive_episodes: [{ id: 'd1', user_id: ME, audio_path: 'me@example.com/d1.mp3' }, { id: 'd2', user_id: OTHER, audio_path: 'other@example.com/d2.mp3' }],
    qa_sessions: [{ id: 's1', user_id: ME }, { id: 's2', user_id: OTHER }],
    qa_messages: [{ id: 'm1', session_id: 's1', audio_path: 's1/m1.mp3' }, { id: 'm2', session_id: 's2', audio_path: 's2/m2.mp3' }],
    custom_sources: [{ id: 'c1', user_id: ME }, { id: 'c2', user_id: OTHER }],
    custom_source_items: [{ id: 'i1', source_id: 'c1' }, { id: 'i2', source_id: 'c2' }],
    topic_requests: [{ id: 't1', user_id: ME }, { id: 't2', user_id: OTHER }, { id: 't3', user_id: null }],
    playback_interactions: [{ id: 'x1', user_id: ME }, { id: 'x2', user_id: OTHER }],
    user_preferences: [{ user_id: ME }, { user_id: OTHER }],
    user_settings: [{ user_id: ME, device_tokens: ['tok'] }, { user_id: OTHER }],
    ad_impressions: [{ id: 'a1', user_id: ME }, { id: 'a2', user_id: OTHER }],
    linked_accounts: [{ id: 'l1', user_email: ME, provider: 'google' }, { id: 'l2', user_email: OTHER, provider: 'google' }],
    oauth_tokens: [{ id: 'o1', user_id: UME }, { id: 'o2', user_id: UOTHER }],
    topic_episodes: [{ id: 'te1' }],
    analytics_events: [{ id: 1, install_id: 'abc' }],
  };
  db.buckets = {
    podcasts: new Set(['me@example.com/1.mp3', 'me@example.com/2.mp3', 'other@example.com/1.mp3']),
    'deep-dive-podcasts': new Set(['me@example.com/d1.mp3', 'other@example.com/d2.mp3']),
    'qa-audio': new Set(['s1/m1.mp3', 's2/m2.mp3']),
  };
  return db;
}

function deps(db: FakeDb, over: Partial<DeletionDeps> = {}): DeletionDeps & { revoked: string[]; purged: string[] } {
  const revoked: string[] = [];
  const purged: string[] = [];
  return {
    db,
    revokeProviderTokens: async (e) => { revoked.push(e); },
    purgeMemory: (e) => { purged.push(e); },
    deleteAuthUser: async (id) => { db.authUsers.delete(id); },
    revoked,
    purged,
    ...over,
  };
}

test('deletes every per-user row and file for the owner and nothing of anyone else', async () => {
  const db = seed();
  const d = deps(db);
  const r = await deleteUserData(d, { email: ME, authUserId: 'a1', pathEmail: ME });
  assert.equal(r.ok, true, JSON.stringify(r));
  assert.deepEqual(r.failed, []);
  const mine = (t: string, col = 'user_id') => (db.tables[t] ?? []).filter((x) => x[col] === ME || x[col] === UME);
  for (const t of ['podcast_episodes', 'deep_dive_episodes', 'qa_sessions', 'custom_sources', 'topic_requests', 'playback_interactions', 'user_preferences', 'user_settings', 'ad_impressions', 'oauth_tokens']) {
    assert.equal(mine(t).length, 0, t);
  }
  assert.equal(db.tables.linked_accounts.filter((x) => x.user_email === ME).length, 0);
  assert.equal(db.tables.users.filter((x) => x.email === ME).length, 0);
  assert.deepEqual(db.tables.qa_messages.map((x) => x.id), ['m2']);
  assert.deepEqual(db.tables.custom_source_items.map((x) => x.id), ['i2']);
  assert.deepEqual([...db.buckets.podcasts], ['other@example.com/1.mp3']);
  assert.deepEqual([...db.buckets['deep-dive-podcasts']], ['other@example.com/d2.mp3']);
  assert.deepEqual([...db.buckets['qa-audio']], ['s2/m2.mp3']);
  // other user, global and install-keyed data untouched
  assert.equal(db.tables.users.length, 1);
  assert.equal(db.tables.podcast_episodes.length, 1);
  assert.equal(db.tables.topic_requests.length, 2);
  assert.equal(db.tables.topic_episodes.length, 1);
  assert.equal(db.tables.analytics_events.length, 1);
  // provider revoke happened, memory purged, sign-in identity removed
  assert.deepEqual(d.revoked, [ME]);
  assert.ok(d.purged.includes(ME));
  assert.equal(db.authUsers.has('a1'), false);
  assert.equal(db.authUsers.has('a2'), true);
});

test('revoke runs before the token rows are deleted', async () => {
  const db = seed();
  let rowsAtRevoke = -1;
  const d = deps(db, { revokeProviderTokens: async () => { rowsAtRevoke = db.tables.linked_accounts.filter((x) => x.user_email === ME).length; } });
  await deleteUserData(d, { email: ME, authUserId: 'a1' });
  assert.equal(rowsAtRevoke, 1);
});

test('idempotent: a second run succeeds and deletes nothing more', async () => {
  const db = seed();
  await deleteUserData(deps(db), { email: ME, authUserId: 'a1' });
  const snapshot = JSON.stringify(db.tables) + JSON.stringify([...db.buckets.podcasts]);
  const r = await deleteUserData(deps(db, { deleteAuthUser: async () => { throw new Error('User not found'); } }), { email: ME, authUserId: 'a1' });
  assert.equal(r.ok, true);
  assert.equal(JSON.stringify(db.tables) + JSON.stringify([...db.buckets.podcasts]), snapshot);
});

test('tables that do not exist in this database are skipped, not fatal', async () => {
  const db = seed();
  for (const t of ['playback_interactions', 'qa_sessions', 'qa_messages', 'custom_sources', 'oauth_tokens']) db.absentTables.add(t);
  delete db.buckets['qa-audio'];
  const r = await deleteUserData(deps(db), { email: ME, authUserId: 'a1' });
  assert.equal(r.ok, true, JSON.stringify(r));
});

test('a real failure reports it, keeps the sign-in identity so the caller can retry, and still tries the other steps', async () => {
  const db = seed();
  db.failTables.add('user_settings');
  const r = await deleteUserData(deps(db), { email: ME, authUserId: 'a1' });
  assert.equal(r.ok, false);
  assert.ok(r.failed.includes('user_settings.delete'));
  assert.equal(db.authUsers.has('a1'), true);
  assert.equal(db.tables.topic_requests.filter((x) => x.user_id === ME).length, 0);
  db.failTables.clear();
  const again = await deleteUserData(deps(db), { email: ME, authUserId: 'a1' });
  assert.equal(again.ok, true);
  assert.equal(db.authUsers.has('a1'), false);
});

test('a provider revoke failure is a warning, not a failure', async () => {
  const db = seed();
  const r = await deleteUserData(deps(db, { revokeProviderTokens: async () => { throw new Error('x'); } }), { email: ME, authUserId: 'a1' });
  assert.equal(r.ok, true);
  assert.deepEqual(r.warnings, ['provider_revoke_failed']);
});

test('matches stored mixed-case emails without wildcard matching other addresses', async () => {
  const db = seed();
  db.tables.user_settings.push({ user_id: 'Me@Example.com' }, { user_id: 'meXexample.com' });
  await deleteUserData(deps(db), { email: 'Me@Example.com', authUserId: 'a1', pathEmail: ME });
  assert.deepEqual(db.tables.user_settings.map((x) => x.user_id).sort(), ['meXexample.com', OTHER]);
});

test('emailVariants and parseStorageUrl', () => {
  assert.deepEqual(emailVariants('A@B.com', 'a@b.com', ''), ['A@B.com', 'a@b.com']);
  assert.deepEqual(parseStorageUrl('https://h/storage/v1/object/sign/podcasts/a%40b.com/1.mp3?token=z'), { bucket: 'podcasts', path: 'a@b.com/1.mp3' });
  assert.equal(parseStorageUrl('https://h/other'), null);
  assert.equal(parseStorageUrl(null), null);
});

// ---- the HTTP contract: 401 anonymous, 403 other user, 200 owner --------------------------------------------------------------
async function withServer(db: FakeDb, fn: (base: string) => Promise<void>) {
  const app = express();
  const verify = supabaseTokenVerifier(db as any);
  app.delete('/api/user/:userId', requireSelf(() => verify), async (req, res) => {
    const u = res.locals.authUser;
    const r = await deleteUserData(deps(db), { email: u.email, authUserId: u.id, pathEmail: req.params.userId });
    res.status(r.ok ? 200 : 500).json({ success: r.ok });
  });
  const server = app.listen(0, '127.0.0.1');
  await new Promise((r) => server.once('listening', r));
  try { await fn(`http://127.0.0.1:${(server.address() as AddressInfo).port}`); } finally { server.close(); }
}
const del = (base: string, email: string, token?: string) =>
  fetch(`${base}/api/user/${encodeURIComponent(email)}`, { method: 'DELETE', headers: token === undefined ? {} : { Authorization: token } });

test('HTTP: anonymous and invalid tokens get 401 and nothing is deleted', async () => {
  const db = seed();
  const before = JSON.stringify(db.tables) + JSON.stringify([...db.buckets.podcasts]);
  await withServer(db, async (base) => {
    for (const h of [undefined, '', 'Bearer', 'Bearer nonsense', 'Basic abc', 'Bearer tok-a1x']) {
      assert.equal((await del(base, ME, h)).status, 401, String(h));
    }
    assert.equal((await del(base, 'nobody@example.invalid')).status, 401);
  });
  assert.equal(JSON.stringify(db.tables) + JSON.stringify([...db.buckets.podcasts]), before);
  assert.equal(db.authUsers.size, 2);
});

test('HTTP: an unconfirmed account cannot delete the address it claims', async () => {
  const db = seed();
  db.authUsers.set('a3', { id: 'a3', email: 'victim@example.com', confirmed: false });
  await withServer(db, async (base) => {
    assert.equal((await del(base, 'victim@example.com', 'Bearer tok-a3')).status, 401);
  });
});

test('HTTP: another signed-in user gets 403 and nothing is deleted', async () => {
  const db = seed();
  const before = JSON.stringify(db.tables) + JSON.stringify([...db.buckets.podcasts]);
  await withServer(db, async (base) => {
    assert.equal((await del(base, ME, 'Bearer tok-a2')).status, 403);
  });
  assert.equal(JSON.stringify(db.tables) + JSON.stringify([...db.buckets.podcasts]), before);
  assert.equal(db.authUsers.size, 2);
});

test('HTTP: the owner gets 200 (path email matched case-insensitively) and the data is gone', async () => {
  const db = seed();
  await withServer(db, async (base) => {
    assert.equal((await del(base, 'ME@example.com', 'Bearer tok-a1')).status, 200);
  });
  assert.equal(db.tables.users.filter((x) => x.email === ME).length, 0);
  assert.equal(db.authUsers.has('a1'), false);
});
