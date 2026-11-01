import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { getActiveTopics } from '../config/topics.ts';
import { evaluateInvariants } from './monitoring.ts';
import { loadSweepInput } from './sweep-input.ts';
import { isGeneratableTopic, languagesForTopic, partitionGeneratable } from '../services/scheduler/batch-languages.ts';

const NOW = Date.parse('2026-11-01T12:00:00Z');
const TOPICS = getActiveTopics(); // the real hardcoded list: 24 topics, 10 of them locale-only

/** A db whose latest batch/episode are recent and whose "fresh in 48 h" rows are the given topic ids. */
function dbWithFresh(freshIds: string[]): any {
  const rows: Record<string, unknown[]> = {
    batch_generation_runs: [{ started_at: '2026-11-01T05:00:10Z' }],
    topic_episodes: freshIds.map(topic_id => ({ topic_id, generated_at: '2026-11-01T06:00:00Z' })),
  };
  return { from: (t: string) => { const q: any = { select: () => q, eq: () => q, gte: () => q, order: () => q, limit: () => Promise.resolve({ data: rows[t], error: null }) }; return q; } };
}

const STALE_FLOW = 'invariant_topics_without_fresh_episode';

test('(a) topics the batch skips by design (non-English under Piper) do not trip the 20% threshold', async () => {
  const { generatable, skippedByDesign } = partitionGeneratable(TOPICS, 'piper');
  assert.equal(TOPICS.length, 24);
  assert.equal(skippedByDesign.length, 10, 'ten locale-only shows are skipped');
  assert.equal(generatable.length, 14);
  // Every generatable topic is fresh; the skipped ones never get an episode.
  const input = await loadSweepInput(dbWithFresh(generatable.map(t => t.id)), TOPICS, 'piper', NOW);
  assert.equal(input.activeTopics, 14);
  assert.equal(input.topicsWithFreshEpisode, 14);
  assert.equal(input.skippedByDesign, 10);
  assert.deepEqual(evaluateInvariants(input).map(i => i.flow), []);
  // The old rule (count every active topic) would have alerted: 10 of 24 = 41.7%.
  assert.ok(evaluateInvariants({ ...input, activeTopics: 24 }).some(i => i.flow === STALE_FLOW), 'regression guard: counting skipped topics trips the alert');
});

test('(b) a real outage of generatable topics still trips the alert, and reports the skipped count as context', async () => {
  const { generatable } = partitionGeneratable(TOPICS, 'piper');
  const fresh = generatable.slice(0, 10).map(t => t.id); // 4 of 14 generatable topics stale = 28.6%
  const input = await loadSweepInput(dbWithFresh(fresh), TOPICS, 'piper', NOW);
  const issues = evaluateInvariants(input);
  assert.deepEqual(issues.map(i => i.flow), [STALE_FLOW]);
  assert.deepEqual(issues[0].context, { stale: '4', active: '14', skipped_by_design: '10' });
  // Nothing fresh at all is also caught.
  const none = evaluateInvariants(await loadSweepInput(dbWithFresh([]), TOPICS, 'piper', NOW));
  assert.ok(none.some(i => i.flow === STALE_FLOW));
});

test('a fresh episode for a skipped topic does not count toward the generatable total', async () => {
  const { generatable, skippedByDesign } = partitionGeneratable(TOPICS, 'piper');
  const input = await loadSweepInput(dbWithFresh([skippedByDesign[0].id, generatable[0].id]), TOPICS, 'piper', NOW);
  assert.equal(input.topicsWithFreshEpisode, 1);
});

test('with a voice that speaks every language nothing is skipped', async () => {
  const input = await loadSweepInput(dbWithFresh(TOPICS.map(t => t.id)), TOPICS, 'kokoro', NOW);
  assert.equal(input.activeTopics, 24);
  assert.equal(input.skippedByDesign, 0);
});

test('(c) the batch and the sweep share one predicate', () => {
  // Behaviour: the shared predicate is exactly "the batch has at least one language to generate".
  const langSets: Array<readonly string[] | undefined> = [undefined, [], ['all'], ['en'], ['es'], ['es', 'pt'], ['en', 'es'], ['hi', 'en']];
  for (const backend of [undefined, 'piper', 'kokoro']) {
    for (const langs of langSets) {
      assert.equal(isGeneratableTopic(langs, backend), languagesForTopic(langs, backend).length > 0);
      const { generatable, skippedByDesign } = partitionGeneratable([{ languages: langs }], backend);
      assert.equal(generatable.length === 1, isGeneratableTopic(langs, backend));
      assert.equal(skippedByDesign.length === 1, !isGeneratableTopic(langs, backend));
    }
  }
  // Wiring: both callers use the shared helper and neither re-implements the TTS rule.
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), 'utf8');
  const batch = read('src/services/scheduler/topic-batch.scheduler.ts');
  const sweep = read('src/lib/sweep-input.ts');
  assert.match(batch, /isGeneratableTopic\(topic\.languages, process\.env\.TTS_BACKEND\)/);
  assert.match(sweep, /partitionGeneratable\(/);
  assert.match(sweep, /from '\.\.\/services\/scheduler\/batch-languages'/);
  for (const src of [batch, sweep, read('src/services/monitoring/invariant-sweep.ts')]) assert.doesNotMatch(src, /['"]piper['"]/);
});
