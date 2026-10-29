import test from 'node:test';
import assert from 'node:assert/strict';
import { failureReporterEnabled, reportFailure } from './failureReporter.ts';

test('disabled without a key, in test/development, or when explicitly disabled', () => {
  assert.equal(failureReporterEnabled({ NODE_ENV: 'production' }), false);
  assert.equal(failureReporterEnabled({ NODE_ENV: 'production', FAILURE_REPORTER_KEY: '' }), false);
  assert.equal(failureReporterEnabled({ NODE_ENV: 'test', FAILURE_REPORTER_KEY: 'k' }), false);
  assert.equal(failureReporterEnabled({ NODE_ENV: 'development', FAILURE_REPORTER_KEY: 'k' }), false);
  assert.equal(failureReporterEnabled({ NODE_ENV: 'production', FAILURE_REPORTER_KEY: 'k', FAILURE_REPORTER_DISABLED: '1' }), false);
  assert.equal(failureReporterEnabled({ NODE_ENV: 'production', FAILURE_REPORTER_KEY: 'k' }), true);
});

test('sends nothing and never throws when the key is unset; posts the documented body when enabled', async () => {
  const realFetch = globalThis.fetch;
  const saved = { ...process.env };
  const calls: any[] = [];
  globalThis.fetch = (async (url: any, init: any) => { calls.push({ url, init }); return new Response('ok'); }) as typeof fetch;
  try {
    delete process.env.FAILURE_REPORTER_KEY;
    process.env.NODE_ENV = 'production';
    reportFailure('f', new Error('m'), { a: '1' });
    await new Promise(r => setTimeout(r, 20));
    assert.equal(calls.length, 0);

    process.env.FAILURE_REPORTER_KEY = 'test-key';
    reportFailure('flow-x', new Error('stable message'), { count: '3' });
    await new Promise(r => setTimeout(r, 20));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].init.headers['X-Report-Key'], 'test-key');
    const body = JSON.parse(calls[0].init.body);
    assert.equal(body.kind, 'failure');
    assert.equal(body.platform, 'backend');
    assert.equal(body.flow, 'flow-x');
    assert.equal(body.message, 'stable message');
    assert.deepEqual(body.context, { count: '3' });

    globalThis.fetch = (async () => { throw new Error('network down'); }) as typeof fetch;
    assert.doesNotThrow(() => reportFailure('f', new Error('m')));
    await new Promise(r => setTimeout(r, 20));
  } finally {
    globalThis.fetch = realFetch;
    for (const k of Object.keys(process.env)) if (!(k in saved)) delete process.env[k];
    Object.assign(process.env, saved);
  }
});
