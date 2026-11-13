import test from 'node:test';
import assert from 'node:assert/strict';
import { GenerateGuard, callerKey, callerDailyLimit, globalDailyLimit } from './generateGuard.ts';

test('caller key: verified user, then a well-formed install id (either spelling), then the IP', () => {
  assert.equal(callerKey({ body: { installId: 'install-abc12345' }, ip: '1.2.3.4' } as never, 'u1'), 'u:u1');
  assert.equal(callerKey({ body: { installId: 'install-abc12345' }, ip: '1.2.3.4' } as never), 'i:install-abc12345');
  assert.equal(callerKey({ body: { install_id: 'install-abc12345' }, ip: '1.2.3.4' } as never), 'i:install-abc12345');
  assert.equal(callerKey({ body: { installId: 'x y' }, ip: '1.2.3.4' } as never), 'ip:1.2.3.4', 'a malformed id is ignored');
  assert.equal(callerKey({ body: undefined, ip: undefined } as never), 'ip:unknown');
});

test('per-caller and global allowances, reset on the next UTC day', () => {
  let now = new Date('2026-11-13T10:00:00Z');
  const g = new GenerateGuard(() => ({ perCaller: 2, global: 3 }), () => now);
  assert.deepEqual([g.take('a').allowed, g.take('a').allowed], [true, true]);
  assert.deepEqual(g.take('a'), { allowed: false, reason: 'caller_limit' });
  assert.equal(g.take('b').allowed, true); // global 3 of 3
  assert.deepEqual(g.take('c'), { allowed: false, reason: 'global_limit' });
  now = new Date('2026-11-14T00:00:01Z');
  assert.equal(g.take('a').allowed, true);
});

test('limits come from env with safe defaults', () => {
  assert.deepEqual([callerDailyLimit({}), globalDailyLimit({})], [10, 100]);
  assert.deepEqual([callerDailyLimit({ GENERATE_CALLER_DAILY_LIMIT: '3' }), globalDailyLimit({ GENERATE_GLOBAL_DAILY_LIMIT: '0' })], [3, 0]);
  assert.equal(callerDailyLimit({ GENERATE_CALLER_DAILY_LIMIT: 'abc' }), 10);
});
