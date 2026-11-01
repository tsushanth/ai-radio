import test from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { classifyLlmError, evaluateInvariants, reportServerErrors, type SweepInput } from './monitoring.ts';
import { loadSweepInput } from './sweep-input.ts';

const NOW = Date.parse('2026-10-30T12:00:00Z');
const ok: SweepInput = {
  nowMs: NOW,
  lastBatchStartedAt: '2026-10-30T05:00:10Z',
  lastCompletedGeneratedAt: '2026-10-30T06:10:00Z',
  activeTopics: 50,
  topicsWithFreshEpisode: 49,
};

test('classifies key, billing, quota and outage; ignores request-level errors', () => {
  assert.equal(classifyLlmError({ status: 401 }), 'auth');
  assert.equal(classifyLlmError({ status: 400, message: 'Your credit balance is too low' }), 'billing');
  assert.equal(classifyLlmError({ status: 429 }), 'rate_limited');
  assert.equal(classifyLlmError({ status: 529, message: 'Overloaded' }), 'provider_down');
  assert.equal(classifyLlmError({ status: 400, message: 'bad request' }), null);
  assert.equal(classifyLlmError(new Error('socket hang up')), null);
});

test('invariants are quiet on a healthy day', () => {
  assert.deepEqual(evaluateInvariants(ok), []);
});

test('flags a batch trigger that did not fire, no completed episode, and stale topics', () => {
  const dead = evaluateInvariants({ ...ok, lastBatchStartedAt: '2026-10-28T05:00:00Z', lastCompletedGeneratedAt: null, topicsWithFreshEpisode: 30 });
  assert.deepEqual(dead.map(i => i.flow), ['invariant_batch_not_run', 'invariant_no_completed_episode', 'invariant_topics_without_fresh_episode']);
  assert.deepEqual(dead[2].context, { stale: '20', active: '50' });
  assert.deepEqual(evaluateInvariants({ ...ok, lastBatchStartedAt: null }).map(i => i.flow), ['invariant_batch_not_run']);
  assert.deepEqual(evaluateInvariants({ ...ok, topicsWithFreshEpisode: 41 }).map(i => i.flow), []); // 18% stale < 20%
});

test('loadSweepInput reads latest batch/episode and only counts active topics as fresh', async () => {
  const rows: Record<string, unknown[]> = {
    batch_generation_runs: [{ started_at: '2026-10-30T05:00:10Z' }],
    topic_episodes: [{ generated_at: '2026-10-30T06:10:00Z', topic_id: 'a' }, { topic_id: 'a' }, { topic_id: 'retired' }],
  };
  const db: any = { from: (t: string) => { const q: any = { select: () => q, eq: () => q, gte: () => q, order: () => q, limit: () => Promise.resolve({ data: rows[t], error: null }) }; return q; } };
  const input = await loadSweepInput(db, ['a', 'b'], NOW);
  assert.equal(input.activeTopics, 2);
  assert.equal(input.topicsWithFreshEpisode, 1);
  assert.equal(input.lastBatchStartedAt, '2026-10-30T05:00:10Z');
  await assert.rejects(loadSweepInput({ from: () => { const q: any = { select: () => q, eq: () => q, gte: () => q, order: () => q, limit: () => Promise.resolve({ data: null, error: { message: 'x' } }) }; return q; } } as any, ['a']));
});

test('5xx middleware reports once per response by route pattern, not by url; 4xx is ignored', async () => {
  const realFetch = globalThis.fetch;
  const saved = { ...process.env };
  const calls: any[] = [];
  globalThis.fetch = (async (_u: any, init: any) => { calls.push(JSON.parse(init.body)); return new Response('ok'); }) as typeof fetch;
  try {
    process.env.NODE_ENV = 'production';
    process.env.FAILURE_REPORTER_KEY = 'k';
    const run = (status: number) => {
      const res: any = new EventEmitter();
      res.statusCode = status;
      const req: any = { method: 'GET', baseUrl: '/api/topics', route: { path: '/:id/episode' }, originalUrl: '/api/topics/secret-topic/episode?token=abc' };
      reportServerErrors(req, res, () => {});
      res.emit('finish');
    };
    run(500); run(404);
    await new Promise(r => setTimeout(r, 20));
    assert.equal(calls.length, 1);
    assert.equal(calls[0].kind, 'backend_error');
    assert.equal(calls[0].flow, 'GET /api/topics/:id/episode');
    assert.ok(!JSON.stringify(calls[0]).includes('secret-topic'));
  } finally {
    globalThis.fetch = realFetch;
    process.env = saved;
  }
});
