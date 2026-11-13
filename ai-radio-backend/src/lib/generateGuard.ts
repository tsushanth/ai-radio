/**
 * Abuse guard for POST /api/topics/:id/generate (each new episode costs an LLM script plus Piper time).
 *
 * - forceRegenerate is admin-only: the operator secret (BATCH_SECRET bearer, the same one /batch/* and regenerate-audio use).
 *   Anyone else asking for it is served as a normal request (existing episode returned, nothing regenerated).
 * - A request that WILL start a new generation takes one unit from a per-caller daily allowance and one from a global daily allowance.
 *   Caller = a verified user token if one is sent, else the install id in the body if it is well formed, else the client IP
 *   (the shipped Android app sends neither a token nor an install id on this route, so it is keyed by IP).
 *   Serving an episode that already exists never counts.
 * In memory per machine and reset on restart: the persisted dollars/calls ceiling in llmBudget.ts is the real backstop.
 */
import type { Request } from 'express';

const INSTALL_RE = /^[A-Za-z0-9_-]{8,64}$/;

const limitFromEnv = (v: string | undefined, dflt: number) => {
  const n = Number((v ?? '').trim());
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : dflt;
};

export const callerDailyLimit = (env: NodeJS.ProcessEnv = process.env) => limitFromEnv(env.GENERATE_CALLER_DAILY_LIMIT, 10);
export const globalDailyLimit = (env: NodeJS.ProcessEnv = process.env) => limitFromEnv(env.GENERATE_GLOBAL_DAILY_LIMIT, 100);

/** Who the allowance belongs to. Never logged in full. */
export function callerKey(req: Pick<Request, 'body' | 'ip'>, verifiedUserId?: string): string {
  if (verifiedUserId) return `u:${verifiedUserId}`;
  const body = (req.body ?? {}) as Record<string, unknown>;
  const install = [body.installId, body.install_id].find((v) => typeof v === 'string' && INSTALL_RE.test(v));
  if (typeof install === 'string') return `i:${install}`;
  return `ip:${req.ip ?? 'unknown'}`;
}

export type GuardDecision = { allowed: true } | { allowed: false; reason: 'caller_limit' | 'global_limit' };

export class GenerateGuard {
  private day = '';
  private global = 0;
  private callers = new Map<string, number>();
  constructor(
    private readonly limits: () => { perCaller: number; global: number } = () => ({ perCaller: callerDailyLimit(), global: globalDailyLimit() }),
    private readonly now: () => Date = () => new Date(),
  ) {}

  take(key: string): GuardDecision {
    const d = this.now().toISOString().slice(0, 10);
    if (d !== this.day) { this.day = d; this.global = 0; this.callers = new Map(); }
    const { perCaller, global } = this.limits();
    const used = this.callers.get(key) ?? 0;
    if (used >= perCaller) return { allowed: false, reason: 'caller_limit' };
    if (this.global >= global) return { allowed: false, reason: 'global_limit' };
    this.callers.set(key, used + 1);
    this.global++;
    return { allowed: true };
  }
}
