/**
 * Product analytics ingest: POST /api/events (see lib/analytics.ts for the contract and docs/DATA-COLLECTION.md for what is collected).
 * Off unless ANALYTICS_ENABLED is set to true on the server.
 */
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/environment';
import { analyticsEnabled, createEventsHandler, type AnalyticsRow } from '../lib/analytics';

const router = Router();

const supabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY) : null;

/** Per-IP request cap, in memory only (the address is used as a counter key and never stored or logged). */
const ipLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  limit: () => {
    const n = Number(process.env.ANALYTICS_IP_REQUESTS_PER_HOUR);
    return Number.isFinite(n) && n > 0 ? Math.floor(n) : 120;
  },
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ success: false, error: 'rate limited' });
  },
});

router.post(
  '/',
  ipLimiter,
  createEventsHandler({
    insert: supabase ? async (rows: AnalyticsRow[]) => supabase.from('analytics_events').insert(rows) : null,
  }) as any,
);

export default router;

// ─── Retention ─────────────────────────────────────────────────────────────────────────────────────────────────────────

const RETENTION_DAYS = 180;
const DAY_MS = 24 * 60 * 60 * 1000;

/** Deletes analytics rows older than 180 days. Does nothing while ANALYTICS_ENABLED is off. Returns the cutoff day used. */
export async function purgeOldAnalyticsEvents(now: number = Date.now()): Promise<string | null> {
  if (!supabase || !analyticsEnabled()) return null;
  const cutoff = new Date(now - RETENTION_DAYS * DAY_MS).toISOString().slice(0, 10);
  const { error } = await supabase.from('analytics_events').delete().lt('day', cutoff);
  if (error) {
    console.error('analytics retention delete failed');
    return null;
  }
  return cutoff;
}

/** Runs the purge shortly after boot and then daily. Safe on several machines (a repeated delete is harmless). */
export function startAnalyticsRetention(): void {
  const t = setTimeout(() => {
    void purgeOldAnalyticsEvents();
    setInterval(() => void purgeOldAnalyticsEvents(), DAY_MS).unref();
  }, 10 * 60 * 1000);
  t.unref();
}
