/**
 * First-party product analytics: POST /api/events.
 *
 * Privacy contract (see docs/DATA-COLLECTION.md):
 *  - the only identifier is a random per-install id generated on the device / browser; no email, account id, IP address,
 *    device identifier or advertising id is accepted or stored (the IP is used in memory by the request limiter and never written);
 *  - a small allowlist of event names, each with a typed allowlist of properties; anything else is rejected, not stored;
 *  - batched: clients send a few requests per session, never one per event.
 *
 * This file is pure (no env import, no database import) so it can be unit-tested: the route wires the database in.
 */
import type { Request, Response } from 'express';

// ---------------------------------------------------------------------------------------------------------------------
// Configuration (read per request so the kill switch and limits can change without a code change)
// ---------------------------------------------------------------------------------------------------------------------

export interface AnalyticsConfig {
  enabled: boolean;
  maxEventsPerRequest: number;
  maxBodyBytes: number;
  installEventsPerHour: number;
  installRequestsPerHour: number;
  globalEventsPerMinute: number;
  globalEventsPerDay: number;
}

const intFrom = (v: string | undefined, dflt: number): number => {
  const n = Number(v);
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : dflt;
};

/** Kill switch: OFF unless ANALYTICS_ENABLED is exactly true / 1 / on / yes (case-insensitive). */
export function analyticsEnabled(envObj: NodeJS.ProcessEnv = process.env): boolean {
  return ['true', '1', 'on', 'yes'].includes(String(envObj.ANALYTICS_ENABLED ?? '').trim().toLowerCase());
}

export function readAnalyticsConfig(e: NodeJS.ProcessEnv = process.env): AnalyticsConfig {
  return {
    enabled: analyticsEnabled(e),
    maxEventsPerRequest: intFrom(e.ANALYTICS_MAX_EVENTS_PER_REQUEST, 25) || 25,
    maxBodyBytes: intFrom(e.ANALYTICS_MAX_BODY_BYTES, 8192) || 8192,
    installEventsPerHour: intFrom(e.ANALYTICS_INSTALL_EVENTS_PER_HOUR, 300),
    installRequestsPerHour: intFrom(e.ANALYTICS_INSTALL_REQUESTS_PER_HOUR, 30),
    globalEventsPerMinute: intFrom(e.ANALYTICS_GLOBAL_EVENTS_PER_MINUTE, 1000),
    globalEventsPerDay: intFrom(e.ANALYTICS_GLOBAL_EVENTS_PER_DAY, 250000),
  };
}

// ---------------------------------------------------------------------------------------------------------------------
// Allowlist
// ---------------------------------------------------------------------------------------------------------------------

export const PLATFORMS = ['android', 'web', 'ios'] as const;
export const LISTEN_SOURCES = ['radio', 'topic', 'deepdive', 'brief'] as const;
/** Which kind of audio a player error came from: the live radio stream, or an episode. */
export const ERROR_SOURCES = ['stream', 'episode'] as const;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const VERSION_RE = /^[0-9A-Za-z._-]{1,20}$/;
const TOPIC_ID_RE = /^[A-Za-z0-9_-]{1,64}$/;
const LANG_RE = /^[a-z]{2,3}$/;
const LOCALE_RE = /^[a-z]{2,3}([-_][A-Za-z0-9]{2,8})?$/;
const CODE_RE = /^[A-Za-z0-9_.:-]{1,40}$/;

type Props = Record<string, unknown>;
type PropSpec = { required: boolean; check: (v: unknown) => boolean };

const str = (re: RegExp) => (v: unknown) => typeof v === 'string' && re.test(v);
const oneOf = (vals: readonly string[]) => (v: unknown) => typeof v === 'string' && vals.includes(v);
const req = (check: PropSpec['check']): PropSpec => ({ required: true, check });
const opt = (check: PropSpec['check']): PropSpec => ({ required: false, check });

/** Listening time is reported in 30 second buckets: 30, 60, ... 3600 (never finer, never an exact duration). */
export const LISTEN_BUCKET_SECONDS = 30;
export const LISTEN_MAX_SECONDS = 3600;
const seconds = (v: unknown) =>
  typeof v === 'number' && Number.isInteger(v) && v >= LISTEN_BUCKET_SECONDS && v <= LISTEN_MAX_SECONDS && v % LISTEN_BUCKET_SECONDS === 0;

/** Event name -> allowed props. A prop not listed here, or of the wrong type/shape, makes the event invalid. */
export const EVENT_SCHEMAS: Record<string, Record<string, PropSpec>> = {
  app_open: { locale: req(str(LOCALE_RE)) },
  first_play_start: { source: opt(oneOf(LISTEN_SOURCES)), language: opt(str(LANG_RE)) },
  listen_progress: {
    source: req(oneOf(LISTEN_SOURCES)),
    language: req(str(LANG_RE)),
    seconds: req(seconds),
    topic_id: opt(str(TOPIC_ID_RE)),
  },
  topic_open: { topic_id: req(str(TOPIC_ID_RE)) },
  topic_generate_requested: { topic_id: req(str(TOPIC_ID_RE)), language: req(str(LANG_RE)) },
  topic_generate_succeeded: { topic_id: req(str(TOPIC_ID_RE)), language: req(str(LANG_RE)) },
  topic_generate_failed: { topic_id: req(str(TOPIC_ID_RE)), language: req(str(LANG_RE)), code: opt(str(CODE_RE)) },
  // Deliberately carries NO text: the suggestion itself is already stored (with its own caps) in topic_requests.
  topic_suggest_submitted: { language: req(str(LANG_RE)) },
  language_change: { language: req(str(LANG_RE)), from: opt(str(LANG_RE)) },
  share_tap: { source: req(oneOf(LISTEN_SOURCES)), topic_id: opt(str(TOPIC_ID_RE)), language: opt(str(LANG_RE)) },
  error_shown: { code: req(str(CODE_RE)), source: opt(oneOf(ERROR_SOURCES)) },
};

export const EVENT_NAMES = Object.keys(EVENT_SCHEMAS);

/** Events may be sent up to 7 days late (offline queue); `ago_s` says how long ago they happened. */
export const MAX_AGO_SECONDS = 7 * 24 * 3600;

// ---------------------------------------------------------------------------------------------------------------------
// Validation
// ---------------------------------------------------------------------------------------------------------------------

export interface AnalyticsRow {
  install_id: string;
  platform: string;
  app_version: string;
  name: string;
  props: Props;
  day: string; // YYYY-MM-DD (UTC) the event happened
}

export type EventCheck = { ok: true; props: Props; agoS: number } | { ok: false; reason: string };

const isPlainObject = (v: unknown): v is Props => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Validates one event object ({name, props?, ago_s?}). Pure. */
export function validateEvent(ev: unknown): EventCheck {
  if (!isPlainObject(ev)) return { ok: false, reason: 'event must be an object' };
  for (const k of Object.keys(ev)) {
    if (k !== 'name' && k !== 'props' && k !== 'ago_s') return { ok: false, reason: `unknown field ${k.slice(0, 30)}` };
  }
  const name = ev.name;
  if (typeof name !== 'string' || !Object.prototype.hasOwnProperty.call(EVENT_SCHEMAS, name)) {
    return { ok: false, reason: 'event name not allowed' };
  }
  let agoS = 0;
  if (ev.ago_s !== undefined) {
    if (typeof ev.ago_s !== 'number' || !Number.isInteger(ev.ago_s) || ev.ago_s < 0 || ev.ago_s > MAX_AGO_SECONDS) {
      return { ok: false, reason: 'ago_s out of range' };
    }
    agoS = ev.ago_s;
  }
  const props = ev.props === undefined ? {} : ev.props;
  if (!isPlainObject(props)) return { ok: false, reason: 'props must be an object' };
  const schema = EVENT_SCHEMAS[name];
  for (const [k, v] of Object.entries(props)) {
    const spec = Object.prototype.hasOwnProperty.call(schema, k) ? schema[k] : undefined;
    if (!spec) return { ok: false, reason: `prop ${k.slice(0, 30)} not allowed for ${name}` };
    if (!spec.check(v)) return { ok: false, reason: `prop ${k} invalid for ${name}` };
  }
  for (const [k, spec] of Object.entries(schema)) {
    if (spec.required && !(k in props)) return { ok: false, reason: `prop ${k} required for ${name}` };
  }
  return { ok: true, props, agoS };
}

export type BatchCheck =
  | { ok: false; status: number; error: string }
  | { ok: true; rows: AnalyticsRow[]; rejected: number; reasons: string[] };

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

/**
 * Validates a whole request body: { install_id, platform, app_version, events: [...] }.
 * Envelope problems reject the request; individual bad events are dropped and counted (rejected), the good ones are kept.
 */
export function validateBatch(body: unknown, cfg: Pick<AnalyticsConfig, 'maxEventsPerRequest'>, nowMs: number): BatchCheck {
  if (!isPlainObject(body)) return { ok: false, status: 400, error: 'body must be a JSON object' };
  for (const k of Object.keys(body)) {
    if (k !== 'install_id' && k !== 'platform' && k !== 'app_version' && k !== 'events') {
      return { ok: false, status: 400, error: `unknown field ${k.slice(0, 30)}` };
    }
  }
  if (typeof body.install_id !== 'string' || !UUID_RE.test(body.install_id)) return { ok: false, status: 400, error: 'install_id must be a random UUID' };
  if (typeof body.platform !== 'string' || !(PLATFORMS as readonly string[]).includes(body.platform)) return { ok: false, status: 400, error: 'platform not allowed' };
  if (typeof body.app_version !== 'string' || !VERSION_RE.test(body.app_version)) return { ok: false, status: 400, error: 'app_version invalid' };
  if (!Array.isArray(body.events) || body.events.length === 0) return { ok: false, status: 400, error: 'events must be a non-empty array' };
  if (body.events.length > cfg.maxEventsPerRequest) {
    return { ok: false, status: 413, error: `at most ${cfg.maxEventsPerRequest} events per request` };
  }
  const rows: AnalyticsRow[] = [];
  const reasons: string[] = [];
  let rejected = 0;
  for (const ev of body.events) {
    const r = validateEvent(ev);
    if ('reason' in r) {
      rejected++;
      if (reasons.length < 5) reasons.push(r.reason);
      continue;
    }
    rows.push({
      install_id: body.install_id.toLowerCase(),
      platform: body.platform,
      app_version: body.app_version,
      name: (ev as { name: string }).name,
      props: r.props,
      day: utcDay(nowMs - r.agoS * 1000),
    });
  }
  return { ok: true, rows, rejected, reasons };
}

// ---------------------------------------------------------------------------------------------------------------------
// Limits (in memory, per machine; a defence in depth, not exact accounting)
// ---------------------------------------------------------------------------------------------------------------------

/** Fixed-window counter keyed by string, bounded in size so random keys cannot grow memory without limit. */
export class WindowCounter {
  private m = new Map<string, { start: number; n: number }>();
  constructor(private windowMs: number, private maxKeys = 20000) {}

  /** Adds `n` to the key's window count and returns whether it is still within `limit`. A `limit` of 0 blocks everything. */
  hit(key: string, n: number, limit: number, nowMs: number): boolean {
    let e = this.m.get(key);
    if (!e || nowMs - e.start >= this.windowMs) {
      if (!e && this.m.size >= this.maxKeys) this.evict(nowMs);
      e = { start: nowMs, n: 0 };
      this.m.set(key, e);
    }
    if (e.n + n > limit) return false;
    e.n += n;
    return true;
  }

  /** Whether adding `n` would stay within `limit`, without counting it. */
  allows(key: string, n: number, limit: number, nowMs: number): boolean {
    const e = this.m.get(key);
    if (!e || nowMs - e.start >= this.windowMs) return n <= limit;
    return e.n + n <= limit;
  }

  /** Seconds until the key's window ends (for Retry-After). */
  retryAfterS(key: string, nowMs: number): number {
    const e = this.m.get(key);
    return e ? Math.max(1, Math.ceil((e.start + this.windowMs - nowMs) / 1000)) : 1;
  }

  size(): number {
    return this.m.size;
  }

  private evict(nowMs: number): void {
    for (const [k, v] of this.m) if (nowMs - v.start >= this.windowMs) this.m.delete(k);
    // Still full of live keys: drop the oldest inserted (Map keeps insertion order).
    while (this.m.size >= this.maxKeys) {
      const first = this.m.keys().next();
      if (first.done) break;
      this.m.delete(first.value);
    }
  }
}

export class AnalyticsLimiter {
  private installEvents = new WindowCounter(3600_000);
  private installRequests = new WindowCounter(3600_000);
  private globalMinute = new WindowCounter(60_000, 4);
  private globalDay = new WindowCounter(86400_000, 4);

  /** Returns null when allowed (and counts the request), or the Retry-After seconds when blocked (counts nothing). */
  check(installId: string, events: number, cfg: AnalyticsConfig, nowMs: number): number | null {
    // Global limits first so a flood from many ids is stopped before it fills the per-install maps.
    if (!this.globalDay.allows('day', events, cfg.globalEventsPerDay, nowMs)) return this.globalDay.retryAfterS('day', nowMs);
    if (!this.globalMinute.allows('min', events, cfg.globalEventsPerMinute, nowMs)) return this.globalMinute.retryAfterS('min', nowMs);
    if (!this.installRequests.allows(installId, 1, cfg.installRequestsPerHour, nowMs)) return this.installRequests.retryAfterS(installId, nowMs);
    if (!this.installEvents.allows(installId, events, cfg.installEventsPerHour, nowMs)) return this.installEvents.retryAfterS(installId, nowMs);
    this.globalDay.hit('day', events, cfg.globalEventsPerDay, nowMs);
    this.globalMinute.hit('min', events, cfg.globalEventsPerMinute, nowMs);
    this.installRequests.hit(installId, 1, cfg.installRequestsPerHour, nowMs);
    this.installEvents.hit(installId, events, cfg.installEventsPerHour, nowMs);
    return null;
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------------------------------------------------

export type InsertRows = (rows: AnalyticsRow[]) => Promise<{ error: unknown | null }>;

export interface HandlerDeps {
  insert: InsertRows | null; // null = database not configured
  getConfig?: () => AnalyticsConfig;
  now?: () => number;
  limiter?: AnalyticsLimiter;
}

/**
 * Express handler for POST /api/events.
 * 202 { accepted: 0, disabled: true }  kill switch off (clients drop their queue; nothing is read or stored)
 * 202 { accepted, rejected }           stored
 * 400 / 413 / 429 / 503                bad request / too big / limited / database unavailable
 */
export function createEventsHandler(deps: HandlerDeps) {
  const limiter = deps.limiter ?? new AnalyticsLimiter();
  const getConfig = deps.getConfig ?? readAnalyticsConfig;
  const now = deps.now ?? Date.now;

  return async (req: Request, res: Response): Promise<void> => {
    try {
      const cfg = getConfig();
      if (!cfg.enabled) {
        res.status(202).json({ success: true, accepted: 0, disabled: true });
        return;
      }
      const declared = Number(req.headers['content-length']);
      if (Number.isFinite(declared) && declared > cfg.maxBodyBytes) {
        res.status(413).json({ success: false, error: 'payload too large' });
        return;
      }
      let size = 0;
      try {
        size = Buffer.byteLength(JSON.stringify(req.body ?? null));
      } catch {
        size = Infinity;
      }
      if (size > cfg.maxBodyBytes) {
        res.status(413).json({ success: false, error: 'payload too large' });
        return;
      }
      const nowMs = now();
      const checked = validateBatch(req.body, cfg, nowMs);
      if ('error' in checked) {
        res.status(checked.status).json({ success: false, error: checked.error });
        return;
      }
      if (checked.rows.length === 0) {
        res.status(400).json({ success: false, error: 'no valid events', rejected: checked.rejected, reasons: checked.reasons });
        return;
      }
      const retry = limiter.check(checked.rows[0].install_id, checked.rows.length, cfg, nowMs);
      if (retry !== null) {
        res.setHeader('Retry-After', String(retry));
        res.status(429).json({ success: false, error: 'rate limited' });
        return;
      }
      if (!deps.insert) {
        res.status(503).json({ success: false, error: 'storage not configured' });
        return;
      }
      const { error } = await deps.insert(checked.rows);
      if (error) {
        // Never log the payload (it is small and anonymous, but the log is not the place for it).
        console.error('analytics insert failed');
        res.status(503).json({ success: false, error: 'storage unavailable' });
        return;
      }
      res.status(202).json({ success: true, accepted: checked.rows.length, rejected: checked.rejected });
    } catch {
      res.status(500).json({ success: false, error: 'internal error' });
    }
  };
}
