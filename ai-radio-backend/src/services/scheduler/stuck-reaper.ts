/**
 * Marks rows that a crash/deploy/machine stop left in 'running' / 'generating' as 'failed', so they stop looking alive.
 * Batch runs have no error column, so the note goes in `results` (jsonb, always null while a run is 'running').
 * Updates re-check status and age, so a row that finished or was touched meanwhile is not overwritten.
 */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { FailureReporter } from '../../lib/failureReporter';

export const RUN_STUCK_HOURS = 6;
export const EPISODE_STUCK_HOURS = 2;
export const REAP_MAX_ROWS = 200;
export const REAP_NOTE = 'Interrupted: marked failed by cleanup';

export interface ReapResult { runs: number; episodes: number }

const hoursAgo = (now: Date, h: number) => new Date(now.getTime() - h * 3600_000).toISOString();

export async function reapStuckRows(supabase: SupabaseClient | null, report: FailureReporter, now: Date = new Date()): Promise<ReapResult> {
  const out: ReapResult = { runs: 0, episodes: 0 };
  if (!supabase) return out;

  try {
    const runCutoff = hoursAgo(now, RUN_STUCK_HOURS);
    const { data: runs, error } = await supabase.from('batch_generation_runs').select('id')
      .eq('status', 'running').lt('started_at', runCutoff).limit(REAP_MAX_ROWS);
    if (error) throw new Error(error.message);
    const ids = (runs ?? []).map((r: { id: string }) => r.id);
    if (ids.length > 0) {
      const { data: done, error: upErr } = await supabase.from('batch_generation_runs')
        .update({ status: 'failed', results: { error: REAP_NOTE } })
        .in('id', ids).eq('status', 'running').lt('started_at', runCutoff).select('id');
      if (upErr) throw new Error(upErr.message);
      out.runs = done?.length ?? 0;
    }
  } catch (e) {
    console.error('[Reaper] batch_generation_runs pass failed:', e instanceof Error ? e.message : e);
  }

  try {
    const epCutoff = hoursAgo(now, EPISODE_STUCK_HOURS);
    const { data: eps, error } = await supabase.from('topic_episodes').select('id')
      .eq('status', 'generating').lt('updated_at', epCutoff).limit(REAP_MAX_ROWS);
    if (error) throw new Error(error.message);
    const ids = (eps ?? []).map((r: { id: string }) => r.id);
    if (ids.length > 0) {
      const { data: done, error: upErr } = await supabase.from('topic_episodes')
        .update({ status: 'failed', error: REAP_NOTE, updated_at: now.toISOString() })
        .in('id', ids).eq('status', 'generating').lt('updated_at', epCutoff).select('id');
      if (upErr) throw new Error(upErr.message);
      out.episodes = done?.length ?? 0;
    }
  } catch (e) {
    console.error('[Reaper] topic_episodes pass failed:', e instanceof Error ? e.message : e);
  }

  if (out.runs + out.episodes > 0) {
    console.log(`[Reaper] marked failed: ${out.runs} batch runs, ${out.episodes} episodes`);
    report('stuck_rows_reaped', new Error('Stuck batch rows marked failed by cleanup'), {
      runs: String(out.runs),
      episodes: String(out.episodes),
    });
  }
  return out;
}
