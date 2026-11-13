// The daily batch and the LLM budget: capped = skip (recorded as a completed run with every topic skipped), no failures, no alert storm.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_KEY: 'k',
  GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', ANTHROPIC_API_KEY: 'x',
});

const topics = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `t${i}`, name: `Topic ${i}`, languages: ['en'] }));
let generated: string[] = [];
let sched: any;
let budget: typeof import('../../lib/llmBudget').llmBudget;
let behaviour: (id: string) => Promise<unknown> = async () => ({ isNew: true, episode: { status: 'completed', durationSeconds: 200 } });

async function setup(n: number) {
  const { topicsService } = await import('../supabase/topics.service');
  const { topicPodcastGenerator } = await import('../content/topic.generator');
  const { TopicBatchScheduler } = await import('./topic-batch.scheduler');
  (topicsService as any).getTopics = async () => topics(n);
  (topicPodcastGenerator as any).getOrGenerateEpisode = async (id: string) => { generated.push(id); return behaviour(id); };
  sched = new TopicBatchScheduler();
  sched.supabase = null; // no database in this test
  sched.sleep = async () => {};
  budget = (await import('../../lib/llmBudget')).llmBudget;
}

beforeEach(async () => {
  generated = [];
  behaviour = async () => ({ isNew: true, episode: { status: 'completed', durationSeconds: 200 } });
  for (const k of ['LLM_DAILY_CAP_CALLS', 'LLM_DAILY_CAP_USD']) delete process.env[k];
  if (budget) budget.reset();
});

test('budget already used up: the batch generates nothing and reports every topic as skipped (a completed run, not a failure)', async () => {
  await setup(5);
  process.env.LLM_DAILY_CAP_CALLS = '1';
  budget.record({ ok: true, usd: 0.001 });
  const r = await sched.generateAllTopics('batch-1', 'test');
  assert.deepEqual(generated, []);
  assert.deepEqual([r.status, r.totalTopics, r.successful, r.failed, r.skipped], ['completed', 5, 5, 0, 5]);
});

test('budget with room: the batch runs as before', async () => {
  await setup(4);
  const r = await sched.generateAllTopics('batch-2', 'test');
  assert.equal(generated.length, 4);
  assert.deepEqual([r.successful, r.failed, r.skipped], [4, 0, 0]);
});

test('the cap is reached DURING the run: the remaining topics are skipped, not failed and not retried', async () => {
  await setup(9); // chunks of 3
  process.env.LLM_DAILY_CAP_CALLS = '3';
  behaviour = async () => { budget.record({ ok: true, usd: 0.0007 }); return { isNew: true, episode: { status: 'completed', durationSeconds: 200 } }; };
  const r = await sched.generateAllTopics('batch-3', 'test');
  assert.equal(generated.length, 3, 'only the first chunk ran');
  assert.deepEqual([r.successful, r.failed, r.skipped], [9, 0, 6], 'skipped topics count as successful, as for "already generated"');
});

test('a topic whose generation hits the budget is skipped instead of counted as a failure', async () => {
  await setup(3);
  const { LlmBudgetExceeded } = await import('../../lib/llmBudget');
  behaviour = async (id) => { if (id === 't1') throw new LlmBudgetExceeded(); return { isNew: true, episode: { status: 'completed', durationSeconds: 200 } }; };
  const r = await sched.generateAllTopics('batch-4', 'test');
  assert.deepEqual([r.successful, r.failed, r.skipped], [3, 0, 1]);
});
