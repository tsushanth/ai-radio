/**
 * Daily allowances for the on-demand features that cost a model call: one count per client, one per feature for everyone, and one
 * combined estimate in US cents so that on-demand use leaves room in the daily model budget (llmBudget.ts) for scheduled content.
 *
 * Sizes: no use of these features in the 30 days before they were set (2026-11-26). Per-client counts are at or above the busiest
 * day any one client ever had (deep dive 13, questions 5, station episodes 6 in an hour).
 * Overrides: ALLOWANCE_<FEATURE>_CLIENT, ALLOWANCE_<FEATURE>_GLOBAL, ALLOWANCE_TOTAL_CENTS.
 *
 * In memory per machine and reset on restart; the persisted dollar and call limits in llmBudget.ts still apply on top.
 */
import type { Request, Response } from 'express';
import { reportFailure } from './failureReporter';
import { ipv6Bytes } from './publicFetch';

export type Feature = 'deepdive' | 'qa' | 'tell_me_more' | 'station' | 'source_summary';
export interface Allowance { perClient: number; global: number; cents: number }

export const ALLOWANCES: Readonly<Record<Feature, Allowance>> = {
  deepdive: { perClient: 15, global: 20, cents: 10 },
  qa: { perClient: 20, global: 60, cents: 2.5 },
  tell_me_more: { perClient: 20, global: 60, cents: 2 },
  station: { perClient: 12, global: 30, cents: 6 },
  source_summary: { perClient: 100, global: 100, cents: 0.2 },
};
export const TOTAL_DAILY_CENTS = 200;

export const LIMIT_MESSAGE = 'The daily limit for this feature has been reached. Please try again tomorrow.';

export class AllowanceReached extends Error {
  constructor() { super(LIMIT_MESSAGE); this.name = 'AllowanceReached'; }
}

const fromEnv = (v: string | undefined, dflt: number) => {
  const n = Number((v ?? '').trim());
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : dflt;
};

export type Decision = { allowed: true } | { allowed: false; reason: 'client_limit' | 'feature_limit' | 'total_limit' };

export class DailyAllowance {
  private day = '';
  private cents = 0;
  private features = new Map<Feature, number>();
  private clients = new Map<string, number>();
  private reported = new Set<string>();

  constructor(
    private readonly env: () => Record<string, string | undefined> = () => process.env,
    private readonly now: () => Date = () => new Date(),
    private readonly report: (flow: string, err: unknown, context?: Record<string, string>) => void = reportFailure,
  ) {}

  /** Takes one unit when every limit has room; a refused request uses nothing. */
  take(feature: Feature, client: string): Decision {
    const today = this.now().toISOString().slice(0, 10);
    if (today !== this.day) { this.day = today; this.reset(); }
    const env = this.env();
    const dflt = ALLOWANCES[feature];
    const key = `${feature}|${client}`;
    const mine = this.clients.get(key) ?? 0;
    const all = this.features.get(feature) ?? 0;
    const name = feature.toUpperCase();
    if (mine >= fromEnv(env[`ALLOWANCE_${name}_CLIENT`], dflt.perClient)) return this.refuse(feature, 'client_limit');
    if (all >= fromEnv(env[`ALLOWANCE_${name}_GLOBAL`], dflt.global)) return this.refuse(feature, 'feature_limit');
    if (this.cents + dflt.cents > fromEnv(env.ALLOWANCE_TOTAL_CENTS, TOTAL_DAILY_CENTS) + 1e-9) return this.refuse(feature, 'total_limit');
    this.clients.set(key, mine + 1);
    this.features.set(feature, all + 1);
    this.cents += dflt.cents;
    return { allowed: true };
  }

  /** Logs every refusal; a limit shared by everyone also raises one report per day. */
  private refuse(feature: Feature, reason: 'client_limit' | 'feature_limit' | 'total_limit'): Decision {
    console.warn(`[Allowance] refused ${feature}: ${reason}`);
    const key = `${feature}|${reason}`;
    if (reason !== 'client_limit' && !this.reported.has(key)) {
      this.reported.add(key);
      this.report('daily_allowance_reached', new Error('A shared daily allowance was reached'), { feature, reason });
    }
    return { allowed: false, reason };
  }

  reset(): void {
    this.cents = 0;
    this.features.clear();
    this.clients.clear();
    this.reported.clear();
  }
}

export const dailyAllowance = new DailyAllowance();

/** An IPv6 client is counted by its /64 network; an IPv4-mapped address by its IPv4 address. */
function network(ip: string): string {
  if (!ip.includes(':')) return ip;
  const mapped = /^::ffff:(\d+\.\d+\.\d+\.\d+)$/i.exec(ip);
  if (mapped) return mapped[1];
  const bytes = ipv6Bytes(ip);
  return bytes ? Buffer.from(bytes.slice(0, 8)).toString('hex') : ip;
}

/**
 * Who an allowance belongs to: a verified session if there is one, otherwise the network address. On Fly the address comes from
 * Fly-Client-IP, which the Fly proxy sets itself. Ids sent in the request are not used. Never logged.
 */
export function clientKey(req: Pick<Request, 'headers' | 'ip'>, verifiedUserId?: string, env: Record<string, string | undefined> = process.env): string {
  if (verifiedUserId) return `u:${verifiedUserId}`;
  const header = env.FLY_APP_NAME ? req.headers['fly-client-ip'] : undefined;
  const ip = (typeof header === 'string' && header.trim()) || req.ip || 'unknown';
  return `ip:${network(ip)}`;
}

export function refuseOverLimit(res: Response, now: Date = new Date()): void {
  const midnight = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  res.status(429)
    .set('Retry-After', String(Math.ceil((midnight - now.getTime()) / 1000)))
    .json({ success: false, error: LIMIT_MESSAGE });
}
