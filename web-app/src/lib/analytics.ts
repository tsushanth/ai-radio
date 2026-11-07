// First-party product analytics, web side. Same contract as the Android Analytics object and POST /api/events
// (ai-radio-backend/src/lib/analytics.ts); what is collected is listed in docs/DATA-COLLECTION.md.
//
//  - one random install id kept in localStorage; no email, account id, IP, device id or ad id is ever added;
//  - events are queued and sent in batches (at most a few requests per visit), never one request per event;
//  - listening time is reported in 30 second buckets;
//  - off when the visitor opted out (Settings), when the browser sends Do Not Track / Global Privacy Control, and on localhost;
//  - the server ignores everything until ANALYTICS_ENABLED is switched on there.
//
// The core (createAnalytics) takes its environment as arguments so it runs under plain `node --test`; the browser wiring is at the bottom.

export const LISTEN_BUCKET_S = 30;
export const LISTEN_MAX_S = 3600;
/** While listening, report every 5 minutes instead of waiting for the pause (long radio sessions). */
export const CHECKPOINT_MS = 5 * 60_000;
export const MAX_QUEUE = 100;
export const MAX_BATCH = 25;
export const FLUSH_AT = 20;
export const MIN_GAP_MS = 30_000;
export const MAX_BACKOFF_MS = 30 * 60_000;
export const MAX_AGO_S = 7 * 24 * 3600;
/** One accrual step is capped (a sleeping laptop must not turn into hours of listening). */
const MAX_ACCRUE_MS = 15 * 60_000;

export const OPT_OUT_KEY = 'audexa-analytics-optout';
export const ID_KEY = 'audexa-analytics-id';
export const QUEUE_KEY = 'audexa-analytics-queue';
export const FIRST_PLAY_KEY = 'audexa-analytics-first-play';

export type ListenSource = 'radio' | 'topic' | 'deepdive' | 'brief';
export interface ListenContext {
  source: ListenSource;
  language: string;
  topicId?: string;
}
export type EventName =
  | 'app_open' | 'first_play_start' | 'listen_progress' | 'topic_open'
  | 'topic_generate_requested' | 'topic_generate_succeeded' | 'topic_generate_failed'
  | 'topic_suggest_submitted' | 'language_change' | 'share_tap' | 'error_shown';
export type Props = Record<string, string | number>;

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export interface AnalyticsDeps {
  storage: StorageLike | null;
  now: () => number;
  /** Resolves the HTTP status; rejects on a network failure. */
  send: (url: string, body: string) => Promise<number>;
  newId: () => string;
  endpoint: string;
  appVersion: string;
  /** Browser-level "do not track" signals (DNT, GPC) or a development host. */
  blocked: () => boolean;
}

interface Queued {
  name: EventName;
  props: Props;
  at: number;
}

/** "fr-CA" -> "fr-CA", "en_US" -> "en-US", junk -> "und". */
export function cleanLocale(raw: unknown): string {
  const v = typeof raw === 'string' ? raw.replace('_', '-') : '';
  return /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})?$/.test(v) ? v : 'und';
}
/** A two or three letter lowercase language code; English when missing or malformed. */
export function cleanLang(raw: unknown): string {
  const m = typeof raw === 'string' ? /^[a-z]{2,3}(?![a-z])/.exec(raw.toLowerCase()) : null;
  return m ? m[0] : 'en';
}
/** Topic ids are short slugs. Anything else is dropped (the server would reject the event). */
export function cleanTopicId(raw: unknown): string | undefined {
  return typeof raw === 'string' && /^[A-Za-z0-9_-]{1,64}$/.test(raw) ? raw : undefined;
}

export function createAnalytics(deps: AnalyticsDeps) {
  const { storage, now, send, newId, endpoint, appVersion } = deps;
  let queue: Queued[] = [];
  let inFlight = false;
  let lastSend = 0;
  let backoffMs = 0;
  let loaded = false;
  // Listening state: `since` is set while playing; `carryMs` holds time not yet reported (kept across pauses of the same item).
  let listening: { ctx: ListenContext; key: string; since: number } | null = null;
  let carry: { key: string; ms: number; ctx: ListenContext } | null = null;
  let sinceCheckpoint = 0;

  const read = (k: string) => { try { return storage?.getItem(k) ?? null; } catch { return null; } };
  const write = (k: string, v: string) => { try { storage?.setItem(k, v); } catch { /* private mode / full */ } };
  const remove = (k: string) => { try { storage?.removeItem(k); } catch { /* ignore */ } };

  function enabled(): boolean {
    return !deps.blocked() && read(OPT_OUT_KEY) !== '1';
  }

  function installId(): string {
    const existing = read(ID_KEY);
    if (existing && /^[0-9a-f-]{36}$/i.test(existing)) return existing;
    const id = newId();
    write(ID_KEY, id);
    return id;
  }

  function load() {
    if (loaded) return;
    loaded = true;
    try {
      const parsed = JSON.parse(read(QUEUE_KEY) ?? '[]');
      if (Array.isArray(parsed)) {
        queue = parsed
          .filter((e): e is Queued => !!e && typeof e.name === 'string' && typeof e.at === 'number' && typeof e.props === 'object' && e.props !== null)
          .slice(-MAX_QUEUE);
      }
    } catch { queue = []; }
  }

  function persist() {
    if (queue.length === 0) remove(QUEUE_KEY);
    else write(QUEUE_KEY, JSON.stringify(queue.slice(-MAX_QUEUE)));
  }

  function track(name: EventName, props: Props = {}) {
    if (!enabled()) return;
    load();
    queue.push({ name, props, at: now() });
    if (queue.length > MAX_QUEUE) queue = queue.slice(-MAX_QUEUE);
    if (queue.length >= FLUSH_AT) void flush();
  }

  /** Sends up to a few batches. `force` ignores the minimum gap (page is being hidden) but not the failure backoff. */
  async function flush(force = false): Promise<void> {
    if (!enabled()) return;
    load();
    if (inFlight || queue.length === 0) return;
    const t = now();
    if (t - lastSend < Math.max(backoffMs, force ? 0 : MIN_GAP_MS)) return;
    inFlight = true;
    try {
      for (let i = 0; i < 4 && queue.length > 0; i++) {
        // Events older than the server accepts are not worth sending.
        queue = queue.filter((e) => (now() - e.at) / 1000 <= MAX_AGO_S);
        const batch = queue.slice(0, MAX_BATCH);
        if (batch.length === 0) break;
        const body = JSON.stringify({
          install_id: installId(),
          platform: 'web',
          app_version: appVersion,
          events: batch.map((e) => ({ name: e.name, props: e.props, ago_s: Math.max(0, Math.min(MAX_AGO_S, Math.round((now() - e.at) / 1000))) })),
        });
        lastSend = now();
        let status = 0;
        try { status = await send(endpoint, body); } catch { status = 0; }
        if (status >= 200 && status < 300) {
          queue = queue.slice(batch.length);
          backoffMs = 0;
        } else if (status >= 400 && status < 500 && status !== 429 && status !== 408) {
          queue = queue.slice(batch.length); // the server will never accept these; do not retry them
          backoffMs = 0;
        } else {
          backoffMs = Math.min(MAX_BACKOFF_MS, Math.max(60_000, backoffMs * 2)); // network / 5xx / 429: keep and slow down
          break;
        }
      }
    } finally {
      inFlight = false;
      persist();
    }
  }

  // ---- listening ----

  const keyOf = (c: ListenContext) => `${c.source}|${c.language}|${c.topicId ?? ''}`;

  function accrue() {
    if (!listening) return;
    const t = now();
    const delta = Math.max(0, Math.min(MAX_ACCRUE_MS, t - listening.since));
    listening.since = t;
    if (!carry || carry.key !== listening.key) carry = { key: listening.key, ms: 0, ctx: listening.ctx };
    carry.ms += delta;
    sinceCheckpoint += delta;
  }

  function emitCarry() {
    if (!carry) return;
    while (carry.ms >= LISTEN_BUCKET_S * 1000) {
      const seconds = Math.min(LISTEN_MAX_S, Math.floor(carry.ms / (LISTEN_BUCKET_S * 1000)) * LISTEN_BUCKET_S);
      const props: Props = { source: carry.ctx.source, language: cleanLang(carry.ctx.language), seconds };
      const topic = cleanTopicId(carry.ctx.topicId);
      if (topic) props.topic_id = topic;
      track('listen_progress', props);
      carry.ms -= seconds * 1000;
    }
  }

  /** Call when audio really starts playing (not on tap). Emits first_play_start once per install. */
  function listenStart(ctx: ListenContext) {
    if (!enabled()) return;
    const key = keyOf(ctx);
    if (listening?.key === key) return;
    listenStop();
    if (carry && carry.key !== key) carry = null;
    listening = { ctx, key, since: now() };
    sinceCheckpoint = 0;
    if (read(FIRST_PLAY_KEY) !== '1') {
      write(FIRST_PLAY_KEY, '1');
      const props: Props = { source: ctx.source, language: cleanLang(ctx.language) };
      track('first_play_start', props);
    }
  }

  /** Call on pause, end, stall, error, item change and page hide. */
  function listenStop() {
    if (!listening) return;
    accrue();
    listening = null;
    emitCarry();
  }

  /** Called every minute or so: reports long uninterrupted listening without waiting for the pause. */
  function checkpoint() {
    if (!listening) return;
    accrue();
    if (sinceCheckpoint >= CHECKPOINT_MS) {
      sinceCheckpoint = 0;
      emitCarry();
    }
  }

  // ---- opt-out ----

  function setEnabled(on: boolean) {
    if (on) {
      remove(OPT_OUT_KEY);
      return;
    }
    write(OPT_OUT_KEY, '1');
    queue = [];
    listening = null;
    carry = null;
    remove(QUEUE_KEY);
    remove(ID_KEY); // a later opt-in starts a new, unrelated id
    remove(FIRST_PLAY_KEY);
  }

  return {
    track, flush, persist, listenStart, listenStop, checkpoint, setEnabled,
    isEnabled: enabled,
    pending: () => { load(); return queue.length; },
    isListening: () => listening !== null,
  };
}

export type Analytics = ReturnType<typeof createAnalytics>;

// ---------------------------------------------------------------------------------------------------------------------
// Browser wiring (client components only; every export is a no-op during server rendering)
// ---------------------------------------------------------------------------------------------------------------------

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'https://ai-radio-backend.fly.dev/api';
const APP_VERSION = /^[0-9A-Za-z._-]{1,20}$/.test(process.env.NEXT_PUBLIC_APP_VERSION ?? '') ? (process.env.NEXT_PUBLIC_APP_VERSION as string) : 'web';

let instance: Analytics | null = null;

function browserBlocked(): boolean {
  if (typeof window === 'undefined') return true;
  if (/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname)) return true;
  const nav = navigator as Navigator & { globalPrivacyControl?: boolean };
  return nav.doNotTrack === '1' || nav.globalPrivacyControl === true;
}

function get(): Analytics | null {
  if (typeof window === 'undefined') return null;
  if (instance) return instance;
  let storage: StorageLike | null = null;
  try { storage = window.localStorage; } catch { storage = null; }
  instance = createAnalytics({
    storage,
    now: () => Date.now(),
    send: async (url, body) => {
      const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true, credentials: 'omit' });
      return res.status;
    },
    newId: () => (typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : fallbackUuid()),
    endpoint: `${API_URL}/events`,
    appVersion: APP_VERSION,
    blocked: browserBlocked,
  });
  const a = instance;
  // Housekeeping: report long listening, send what is queued, and flush when the page is hidden or closed.
  window.setInterval(() => { a.checkpoint(); void a.flush(); }, 60_000);
  const onHide = () => { a.listenStop(); void a.flush(true); a.persist(); };
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') onHide(); });
  window.addEventListener('pagehide', onHide);
  return a;
}

function fallbackUuid(): string {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

export function track(name: EventName, props: Props = {}): void { try { get()?.track(name, props); } catch { /* analytics must never break the app */ } }
export function listenStart(ctx: ListenContext): void { try { get()?.listenStart(ctx); } catch { /* ignore */ } }
export function listenStop(): void { try { get()?.listenStop(); } catch { /* ignore */ } }
export function isAnalyticsEnabled(): boolean { try { return get()?.isEnabled() ?? false; } catch { return false; } }
export function setAnalyticsEnabled(on: boolean): void { try { get()?.setEnabled(on); } catch { /* ignore */ } }

/** True when the browser itself says "do not track" (the Settings switch then shows as off and locked). */
export function analyticsBlockedByBrowser(): boolean {
  return typeof window !== 'undefined' && browserBlocked() && !/^(localhost|127\.0\.0\.1)$/.test(window.location.hostname);
}
