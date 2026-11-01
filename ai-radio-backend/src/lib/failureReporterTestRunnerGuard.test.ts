import test from 'node:test';
import assert from 'node:assert/strict';
import { failureReporterEnabled, reportFailure, reportCrash } from './failureReporter.ts';

// Regression: plain `node --test` sets neither NODE_ENV=test nor FAILURE_REPORTER_DISABLED, so with a reporter key in the
// environment a stray report call in any test used to post a fake error to the live reporter and email the owner.
test('disabled under the node test runner unless explicitly forced', () => {
  const base = { NODE_ENV: 'production', FAILURE_REPORTER_KEY: 'k' };
  assert.equal(failureReporterEnabled(base), true, 'control: enabled outside a test runner');
  assert.equal(failureReporterEnabled({ ...base, NODE_TEST_CONTEXT: 'child-v8' }), false);
  assert.equal(failureReporterEnabled({ ...base, NODE_TEST_CONTEXT: 'child-v8', FAILURE_REPORTER_FORCE: '1' }), true);
});

test('with a key set and NODE_ENV unset, reports made in this test process never reach the network', async () => {
  assert.ok(process.env.NODE_TEST_CONTEXT, 'sanity: running under the node test runner');
  const saved = { ...process.env };
  const real = globalThis.fetch;
  const calls: unknown[] = [];
  globalThis.fetch = (async (...a: unknown[]) => { calls.push(a); return new Response('ok'); }) as typeof fetch;
  try {
    delete process.env.NODE_ENV; delete process.env.FAILURE_REPORTER_DISABLED; delete process.env.FAILURE_REPORTER_FORCE;
    process.env.FAILURE_REPORTER_KEY = 'test-key';
    reportFailure('x', new Error('must not leave the process'));
    await reportCrash('x', new Error('nor this'));
    await new Promise((r) => setTimeout(r, 20));
    assert.equal(calls.length, 0);
  } finally {
    globalThis.fetch = real;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
