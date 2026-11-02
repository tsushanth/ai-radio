import test from 'node:test';
import assert from 'node:assert/strict';
import { SleepTimer, SLEEP_OPTIONS_MIN, formatRemaining, type TimerDeps } from '../src/lib/sleep-timer.ts';

function fake() {
  let t = 1_000_000;
  let fn: (() => void) | null = null;
  let cleared = 0;
  const deps: TimerDeps = {
    now: () => t,
    setInterval: (f) => { fn = f; return 'h'; },
    clearInterval: () => { fn = null; cleared++; },
  };
  return {
    deps,
    advance(ms: number) { t += ms; fn?.(); },
    get running() { return fn !== null; },
    get cleared() { return cleared; },
  };
}

test('offers the Android choices', () => {
  assert.deepEqual([...SLEEP_OPTIONS_MIN], [5, 10, 15, 30, 60]);
});

test('counts down and fires onExpire once at the deadline', () => {
  const f = fake();
  const timer = new SleepTimer(f.deps);
  const ticks: number[] = [];
  let expired = 0;
  assert.equal(timer.start(5, () => expired++, (ms) => ticks.push(ms)), true);
  assert.equal(timer.active, true);
  assert.equal(timer.remainingMs(), 300_000);
  f.advance(60_000);
  assert.equal(timer.remainingMs(), 240_000);
  assert.equal(expired, 0);
  f.advance(239_000);
  assert.equal(expired, 0);
  f.advance(1_000);
  assert.equal(expired, 1);
  assert.equal(timer.active, false);
  assert.equal(f.running, false);
  assert.equal(ticks[0], 300_000);
  assert.equal(ticks[ticks.length - 1], 0);
  f.advance(10_000); // nothing left to fire
  assert.equal(expired, 1);
});

test('a throttled tab that wakes late still expires on the first tick past the deadline', () => {
  const f = fake();
  const timer = new SleepTimer(f.deps);
  let expired = 0;
  timer.start(5, () => expired++);
  f.advance(20 * 60_000);
  assert.equal(expired, 1);
});

test('cancel stops it without firing', () => {
  const f = fake();
  const timer = new SleepTimer(f.deps);
  let expired = 0;
  timer.start(10, () => expired++);
  timer.cancel();
  assert.equal(timer.active, false);
  assert.equal(timer.remainingMs(), 0);
  f.advance(11 * 60_000);
  assert.equal(expired, 0);
});

test('starting again replaces the running timer', () => {
  const f = fake();
  const timer = new SleepTimer(f.deps);
  let first = 0, second = 0;
  timer.start(5, () => first++);
  f.advance(60_000);
  timer.start(15, () => second++);
  assert.equal(f.cleared >= 1, true);
  assert.equal(timer.remainingMs(), 15 * 60_000);
  f.advance(15 * 60_000);
  assert.equal(first, 0);
  assert.equal(second, 1);
});

test('rejects minutes that are not offered, leaving a running timer alone', () => {
  const f = fake();
  const timer = new SleepTimer(f.deps);
  timer.start(5, () => {});
  for (const bad of [0, -5, 7, 61, NaN, 1.5]) assert.equal(timer.start(bad, () => {}), false, String(bad));
  assert.equal(timer.remainingMs(), 300_000);
});

test('formatRemaining', () => {
  assert.equal(formatRemaining(0), '0:00');
  assert.equal(formatRemaining(245_000), '4:05');
  assert.equal(formatRemaining(244_001), '4:05'); // rounds up so it never shows 0:00 while running
  assert.equal(formatRemaining(3_599_000), '59:59');
  assert.equal(formatRemaining(3_600_000), '1:00:00');
  assert.equal(formatRemaining(-5), '0:00');
});
