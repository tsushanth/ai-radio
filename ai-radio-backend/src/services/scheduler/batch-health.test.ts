import test from 'node:test';
import assert from 'node:assert/strict';
import { classifyReason, summarizeBatch, runStatusFor, reportBatchHealth } from './batch-health.ts';

const ok = { success: true, skipped: false };
const skip = { success: true, skipped: true };
const bad = (error: string) => ({ success: false, skipped: false, error });

test('classifyReason maps the stored production reasons to stable codes', () => {
  assert.equal(classifyReason('Failed to synthesize any segments: all segments failed'), 'all_segments_failed');
  assert.equal(classifyReason('No content found for this topic. Please try again later.'), 'no_content');
  assert.equal(classifyReason('All 3 content sources are temporarily unavailable. Please try again later.'), 'sources_unavailable');
  assert.equal(classifyReason('Failed to parse script JSON'), 'script_parse');
  assert.equal(classifyReason('Failed to save episode: boom'), 'save_failed');
  assert.equal(classifyReason(undefined), 'other');
  assert.equal(classifyReason('weird'), 'other');
});

test('summarizeBatch excludes skipped topics from the share and finds the top reason', () => {
  const h = summarizeBatch([ok, skip, skip, bad('No content found'), bad('No content found'), bad('Failed to parse script JSON'), ok]);
  assert.equal(h.attempted, 5);
  assert.equal(h.failed, 3);
  assert.equal(h.failedShare, 0.6);
  assert.equal(h.topReason, 'no_content');
  assert.deepEqual(h.classes, { no_content: 2, script_parse: 1 });
});

test('summarizeBatch of nothing attempted is a zero share', () => {
  const h = summarizeBatch([skip, skip]);
  assert.equal(h.failedShare, 0);
  assert.equal(h.topReason, 'none');
  assert.equal(summarizeBatch([]).attempted, 0);
});

test('run status is failed only above 50%, otherwise completed (DB check allows no other value)', () => {
  assert.equal(runStatusFor(summarizeBatch([ok, bad('x')])), 'completed'); // exactly 50%
  assert.equal(runStatusFor(summarizeBatch([ok, bad('x'), bad('x')])), 'failed');
  assert.equal(runStatusFor(summarizeBatch([ok, ok, ok])), 'completed');
  assert.equal(runStatusFor(summarizeBatch([skip])), 'completed');
});

function collect() {
  const calls: Array<{ flow: string; message: string; ctx: Record<string, string> }> = [];
  return { calls, report: (flow: string, err: unknown, ctx: Record<string, string> = {}) => { calls.push({ flow, message: (err as Error).message, ctx }); } };
}

test('no alert at or below 20% failed', () => {
  const c = collect();
  reportBatchHealth(summarizeBatch([ok, ok, ok, ok, bad('x')]), 'scheduler', c.report); // exactly 20%
  assert.equal(c.calls.length, 0);
});

test('above 20%: one aggregate alert plus one per failure class, not per episode, with no raw error text', () => {
  const c = collect();
  const rows = [ok, ok, ...Array(5).fill(bad('No content found for secret topic name')), ...Array(2).fill(bad('Failed to parse script JSON'))];
  reportBatchHealth(summarizeBatch(rows), 'scheduler', c.report);
  assert.equal(c.calls.length, 3);
  assert.equal(c.calls[0].flow, 'topic_batch_failed_share');
  assert.deepEqual(c.calls[0].ctx, { failed: '7', attempted: '9', share_pct: '78', top_reason: 'no_content', source: 'scheduler' });
  assert.deepEqual(c.calls.slice(1).map(x => x.message).sort(), ['Topic batch failure class: no_content', 'Topic batch failure class: script_parse']);
  assert.ok(!JSON.stringify(c.calls).includes('secret topic name'));
});

test('a very long trigger source is truncated in the context', () => {
  const c = collect();
  reportBatchHealth(summarizeBatch([bad('x'), bad('x')]), 'y'.repeat(500), c.report);
  assert.equal(c.calls[0].ctx.source.length, 40);
});
