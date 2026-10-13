import test from 'node:test';
import assert from 'node:assert/strict';
import { authorizeAdmin, parseAllowlist, bearerToken } from '../src/lib/admin-auth.ts';
import { diskLevel, generationLevel, segmentLevel, worst, streamLevel } from '../src/lib/admin-status.ts';

const confirmed = { email: 'Boss@Example.com', email_confirmed_at: '2026-01-01T00:00:00Z' };
const ok = async () => confirmed;

test('parseAllowlist: lowercases, trims, drops junk', () => {
  assert.deepEqual(parseAllowlist(' A@x.com, b@Y.com ,, nope'), ['a@x.com', 'b@y.com']);
  assert.deepEqual(parseAllowlist(undefined), []);
  assert.deepEqual(parseAllowlist('   '), []);
});

test('no ADMIN_EMAILS configured -> deny even a valid user (403)', async () => {
  for (const env of [undefined, '', '  ', ',']) {
    assert.deepEqual(await authorizeAdmin('Bearer t', env, ok), { ok: false, status: 403 });
  }
});

test('unlisted email -> 403', async () => {
  assert.deepEqual(await authorizeAdmin('Bearer t', 'other@example.com', ok), { ok: false, status: 403 });
});

test('unconfirmed email -> 403 even if listed', async () => {
  const u = async () => ({ email: 'boss@example.com', email_confirmed_at: null });
  assert.deepEqual(await authorizeAdmin('Bearer t', 'boss@example.com', u), { ok: false, status: 403 });
});

test('user without email -> 403', async () => {
  const u = async () => ({ email: null, email_confirmed_at: 'x' });
  assert.deepEqual(await authorizeAdmin('Bearer t', 'boss@example.com', u), { ok: false, status: 403 });
});

test('bad token / getUser null / getUser throws -> 401', async () => {
  assert.deepEqual(await authorizeAdmin('Bearer bad', 'boss@example.com', async () => null), { ok: false, status: 401 });
  assert.deepEqual(await authorizeAdmin('Bearer bad', 'boss@example.com', async () => { throw new Error('net'); }), { ok: false, status: 401 });
});

test('missing / malformed Authorization header -> 401 and getUser never called', async () => {
  let called = false;
  const spy = async () => { called = true; return confirmed; };
  for (const h of [null, undefined, '', 'Basic abc', 'Bearer', 'token']) {
    assert.deepEqual(await authorizeAdmin(h, 'boss@example.com', spy), { ok: false, status: 401 });
  }
  assert.equal(called, false);
  assert.equal(bearerToken('bearer abc'), 'abc');
});

test('listed + confirmed, case-insensitive -> allowed', async () => {
  assert.deepEqual(await authorizeAdmin('Bearer t', 'x@y.com, BOSS@example.COM', ok), { ok: true, email: 'boss@example.com' });
});

test('status thresholds match scheduler-health', () => {
  assert.equal(generationLevel(900), 'amber'); // stale only when > 900
  assert.equal(generationLevel(901), 'red');
  assert.equal(generationLevel(10), 'green');
  assert.equal(generationLevel(null), 'unknown');
  assert.equal(segmentLevel(4 * 3600), 'amber');
  assert.equal(segmentLevel(4 * 3600 + 1), 'red');
  assert.equal(diskLevel(91), 'amber');
  assert.equal(diskLevel(92), 'red'); // >= 92
  assert.equal(diskLevel(50), 'green');
  assert.equal(streamLevel(false), 'red');
  assert.equal(worst(['green', 'amber', 'unknown']), 'amber');
  assert.equal(worst(['green', 'red', 'amber']), 'red');
});
