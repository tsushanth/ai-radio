/** Reads the counts the invariant sweep needs (kept free of env/config imports so it is unit-testable). */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SweepInput } from './monitoring';
import { partitionGeneratable } from '../services/scheduler/batch-languages';

/**
 * `topics` must be the list the batch itself iterates (topicsService.getTopics()). Only topics the batch actually generates (same rule
 * as the batch scheduler: isGeneratableTopic) are expected to have a fresh episode; the rest are counted separately as skipped by design.
 */
export async function loadSweepInput(
  db: SupabaseClient,
  topics: ReadonlyArray<{ id: string; languages?: readonly string[] }>,
  ttsBackend: string | undefined,
  nowMs = Date.now(),
): Promise<SweepInput> {
  const { generatable, skippedByDesign } = partitionGeneratable(topics, ttsBackend);
  const since48h = new Date(nowMs - 48 * 3600_000).toISOString();
  const [batch, ep, fresh] = await Promise.all([
    db.from('batch_generation_runs').select('started_at').order('started_at', { ascending: false }).limit(1),
    db.from('topic_episodes').select('generated_at').eq('status', 'completed').order('generated_at', { ascending: false }).limit(1),
    db.from('topic_episodes').select('topic_id').eq('status', 'completed').gte('generated_at', since48h).limit(5000),
  ]);
  if (batch.error || ep.error || fresh.error) throw new Error('Invariant sweep query failed');
  const active = new Set(generatable.map(t => t.id));
  const freshTopics = new Set((fresh.data ?? []).map((r: { topic_id: string }) => r.topic_id).filter((t: string) => active.has(t)));
  return {
    nowMs,
    lastBatchStartedAt: (batch.data?.[0] as { started_at?: string } | undefined)?.started_at ?? null,
    lastCompletedGeneratedAt: (ep.data?.[0] as { generated_at?: string } | undefined)?.generated_at ?? null,
    activeTopics: active.size,
    skippedByDesign: new Set(skippedByDesign.map(t => t.id)).size,
    topicsWithFreshEpisode: freshTopics.size,
  };
}
