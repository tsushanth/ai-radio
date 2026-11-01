/** Reads the counts the invariant sweep needs (kept free of env/config imports so it is unit-testable). */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { SweepInput } from './monitoring';

export async function loadSweepInput(db: SupabaseClient, activeTopicIds: string[], nowMs = Date.now()): Promise<SweepInput> {
  const since48h = new Date(nowMs - 48 * 3600_000).toISOString();
  const [batch, ep, fresh] = await Promise.all([
    db.from('batch_generation_runs').select('started_at').order('started_at', { ascending: false }).limit(1),
    db.from('topic_episodes').select('generated_at').eq('status', 'completed').order('generated_at', { ascending: false }).limit(1),
    db.from('topic_episodes').select('topic_id').eq('status', 'completed').gte('generated_at', since48h).limit(5000),
  ]);
  if (batch.error || ep.error || fresh.error) throw new Error('Invariant sweep query failed');
  const active = new Set(activeTopicIds);
  const freshTopics = new Set((fresh.data ?? []).map((r: { topic_id: string }) => r.topic_id).filter((t: string) => active.has(t)));
  return {
    nowMs,
    lastBatchStartedAt: (batch.data?.[0] as { started_at?: string } | undefined)?.started_at ?? null,
    lastCompletedGeneratedAt: (ep.data?.[0] as { generated_at?: string } | undefined)?.generated_at ?? null,
    activeTopics: active.size,
    topicsWithFreshEpisode: freshTopics.size,
  };
}
