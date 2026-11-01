/**
 * Dead-man / invariant sweep for the topic pipeline, run from the backend every 30 min (Fly may run several machines; the reporter
 * dedupes per fingerprint per hour). Catches what per-event reporting cannot: a trigger that never fired, a pipeline that
 * "succeeds" while producing nothing, topics silently going stale. Counts only: no topic names, no ids.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';
import { topicsService } from '../supabase/topics.service';
import { failureReporterEnabled, reportFailure, reportUsage } from '../../lib/failureReporter';
import { evaluateInvariants } from '../../lib/monitoring';
import { loadSweepInput } from '../../lib/sweep-input';

const THIRTY_MIN = 30 * 60 * 1000;

export async function runInvariantSweep(db: SupabaseClient): Promise<void> {
  try {
    // The same topic list and skip rule as the daily batch (see loadSweepInput), so a topic the batch skips on purpose is never "stale".
    const topics = await topicsService.getTopics();
    const input = await loadSweepInput(db, topics, process.env.TTS_BACKEND);
    console.log(`[InvariantSweep] generated topics: ${input.activeTopics}, with fresh episode: ${input.topicsWithFreshEpisode}, skipped by design: ${input.skippedByDesign ?? 0}`);
    reportUsage({
      'api.topics_active': input.activeTopics,
      'api.topics_fresh_48h': input.topicsWithFreshEpisode,
    });
    for (const issue of evaluateInvariants(input)) reportFailure(issue.flow, new Error(issue.message), issue.context);
  } catch {
    reportFailure('invariant_sweep_failed', new Error('Invariant sweep could not read the database'));
  }
}

export function startInvariantSweep(): void {
  if (!failureReporterEnabled() || !env.SUPABASE_URL || !env.SUPABASE_SERVICE_KEY) return;
  const db = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
  const run = () => void runInvariantSweep(db);
  setTimeout(run, 3 * 60 * 1000).unref();
  setInterval(run, THIRTY_MIN).unref();
}
