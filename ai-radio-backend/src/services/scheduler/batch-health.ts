/**
 * Failure signal for the daily topic batch: classify why topics failed (stable codes, never raw error text) and decide
 * whether the run was bad enough to alert on or to record as 'failed'.
 */
import type { FailureReporter } from '../../lib/failureReporter';

export const FAILED_SHARE_ALERT = 0.2; // alert above 20% of attempted topics
export const FAILED_SHARE_RUN_FAILED = 0.5; // record the run as 'failed' above 50% (DB check allows only running/completed/failed)

export interface HealthInput {
  success: boolean;
  skipped: boolean;
  error?: string;
}

export type ReasonCode =
  | 'all_segments_failed'
  | 'no_content'
  | 'sources_unavailable'
  | 'script_parse'
  | 'save_failed'
  | 'tts_error'
  | 'other';

export function classifyReason(error: string | undefined): ReasonCode {
  const e = error ?? '';
  if (/all segments failed|failed to synthesize any segments/i.test(e)) return 'all_segments_failed';
  if (/no content found/i.test(e)) return 'no_content';
  if (/content sources are temporarily unavailable/i.test(e)) return 'sources_unavailable';
  if (/failed to parse script/i.test(e)) return 'script_parse';
  if (/failed to save episode/i.test(e)) return 'save_failed';
  if (/synthes|tts|piper|audio/i.test(e)) return 'tts_error';
  return 'other';
}

export interface BatchHealth {
  attempted: number; // topics that were tried (skipped ones excluded)
  failed: number;
  failedShare: number; // 0..1
  classes: Record<string, number>; // reason code -> count
  topReason: ReasonCode | 'none';
}

export function summarizeBatch(results: readonly HealthInput[]): BatchHealth {
  const attempted = results.filter(r => !r.skipped);
  const failedRows = attempted.filter(r => !r.success);
  const classes: Record<string, number> = {};
  for (const r of failedRows) {
    const code = classifyReason(r.error);
    classes[code] = (classes[code] ?? 0) + 1;
  }
  const top = Object.entries(classes).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0];
  return {
    attempted: attempted.length,
    failed: failedRows.length,
    failedShare: attempted.length === 0 ? 0 : failedRows.length / attempted.length,
    classes,
    topReason: (top?.[0] as ReasonCode | undefined) ?? 'none',
  };
}

/** Status to store for the run. Only values the DB check constraint allows. */
export function runStatusFor(health: BatchHealth): 'completed' | 'failed' {
  return health.attempted > 0 && health.failedShare > FAILED_SHARE_RUN_FAILED ? 'failed' : 'completed';
}

/**
 * One aggregate alert when the failed share is above the threshold, plus one alert per failure class (not per episode).
 * Messages are constant strings; only counts, codes and the trigger source go in the context.
 */
export function reportBatchHealth(health: BatchHealth, rawSource: string, report: FailureReporter): void {
  const source = String(rawSource).slice(0, 40);
  if (health.attempted === 0 || health.failedShare <= FAILED_SHARE_ALERT) return;
  report('topic_batch_failed_share', new Error('Topic batch failed share above 20%'), {
    failed: String(health.failed),
    attempted: String(health.attempted),
    share_pct: String(Math.round(health.failedShare * 100)),
    top_reason: health.topReason,
    source,
  });
  for (const [code, count] of Object.entries(health.classes)) {
    report('topic_batch_failure_class', new Error(`Topic batch failure class: ${code}`), {
      reason: code,
      count: String(count),
      attempted: String(health.attempted),
      source,
    });
  }
}
