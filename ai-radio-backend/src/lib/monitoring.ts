/**
 * Failure classification and middleware for the central app-failure-reporter.
 * Messages are STABLE strings per failure class (the reporter dedupes per fingerprint per hour). Context values are provider
 * names, feature labels and status codes only: never topics, user ids, emails or content.
 */
import type { NextFunction, Request, Response } from 'express';
import { reportBackendError, reportFailure } from './failureReporter';

export type LlmFailureClass = 'auth' | 'billing' | 'rate_limited' | 'provider_down';

export function classifyLlmError(err: unknown): LlmFailureClass | null {
  const e = err as { status?: number; message?: string } | null;
  const status = typeof e?.status === 'number' ? e.status : 0;
  const msg = String(e?.message ?? '').toLowerCase();
  if (status === 402 || msg.includes('credit balance') || msg.includes('billing')) return 'billing';
  if (status === 401 || status === 403) return 'auth';
  if (status === 429) return 'rate_limited';
  if (status >= 500 || msg.includes('overloaded')) return 'provider_down';
  return null; // request-level 400/404/network blip: not provider-wide
}

const LLM_MESSAGES: Record<LlmFailureClass, string> = {
  auth: 'LLM provider rejected the API key (401/403)',
  billing: 'LLM provider credit balance or billing problem',
  rate_limited: 'LLM provider rate limit or quota hit (429)',
  provider_down: 'LLM provider unavailable (5xx/overloaded)',
};

/** One alert per class for the whole backend (the flow carries the class, not the caller), so an outage is ONE email. */
export function reportLlmError(err: unknown): void {
  const cls = classifyLlmError(err);
  if (!cls) return;
  const status = (err as { status?: number })?.status;
  reportFailure(`llm_${cls}`, new Error(LLM_MESSAGES[cls]), { status: String(status ?? 0) });
}

/**
 * Express middleware: reports every 5xx response (thrown into the error handler OR written by a route's own catch) once, keyed by
 * the matched route pattern. Mount before the routes.
 */
export function reportServerErrors(req: Request, res: Response, next: NextFunction): void {
  res.on('finish', () => {
    if (res.statusCode < 500) return;
    const pattern = req.route?.path ? `${req.baseUrl ?? ''}${req.route.path}` : 'unmatched';
    reportBackendError({ method: req.method, path: pattern }, new Error(`Handler replied HTTP ${res.statusCode}`), res.statusCode);
  });
  next();
}

// ---------------------------------------------------------------------------------------------------------------------
// End-to-end invariants
// ---------------------------------------------------------------------------------------------------------------------

export interface SweepInput {
  nowMs: number;
  lastBatchStartedAt: string | null; // batch_generation_runs.started_at (max)
  lastCompletedGeneratedAt: string | null; // topic_episodes.generated_at (max, status completed)
  activeTopics: number;
  topicsWithFreshEpisode: number; // distinct topic_id with a completed episode in the last 48 h
}

export interface SweepIssue { flow: string; message: string; context: Record<string, string> }

const HOUR = 3600_000;
export const BATCH_MAX_AGE_H = 27; // trigger fires daily at 05:00 UTC
export const EPISODE_MAX_AGE_H = 30;
export const STALE_TOPIC_SHARE = 0.2;

function hoursSince(iso: string | null, nowMs: number): number | null {
  if (!iso) return null;
  const t = Date.parse(iso);
  return Number.isFinite(t) ? (nowMs - t) / HOUR : null;
}

export function evaluateInvariants(i: SweepInput): SweepIssue[] {
  const out: SweepIssue[] = [];
  const batchAge = hoursSince(i.lastBatchStartedAt, i.nowMs);
  if (batchAge === null || batchAge > BATCH_MAX_AGE_H) {
    out.push({
      flow: 'invariant_batch_not_run',
      message: `No topic batch run started in the last ${BATCH_MAX_AGE_H}h (daily trigger dead, wrong secret or backend asleep)`,
      context: { hours_since: batchAge === null ? 'never' : String(Math.round(batchAge)) },
    });
  }
  const epAge = hoursSince(i.lastCompletedGeneratedAt, i.nowMs);
  if (epAge === null || epAge > EPISODE_MAX_AGE_H) {
    out.push({
      flow: 'invariant_no_completed_episode',
      message: `No topic episode completed in the last ${EPISODE_MAX_AGE_H}h`,
      context: { hours_since: epAge === null ? 'never' : String(Math.round(epAge)) },
    });
  }
  if (i.activeTopics > 0) {
    const stale = i.activeTopics - i.topicsWithFreshEpisode;
    if (stale / i.activeTopics >= STALE_TOPIC_SHARE) {
      out.push({
        flow: 'invariant_topics_without_fresh_episode',
        message: `At least ${Math.round(STALE_TOPIC_SHARE * 100)}% of active topics have no completed episode in the last 48h`,
        context: { stale: String(stale), active: String(i.activeTopics) },
      });
    }
  }
  return out;
}
