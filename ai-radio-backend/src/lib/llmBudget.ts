/**
 * Persisted daily LLM budget (dollars and call count) for the whole backend.
 *
 * Fed by the usage module (llmUsage.js `onRecord`): every finished model call, Anthropic or OpenRouter, adds its dollars (computed with
 * the same per-model price table the usage dashboards use) and one call. Totals live in Supabase (migration 014, service role only) so
 * they survive restarts and are shared by every Fly machine; each process keeps a local tally and syncs it every few seconds.
 *
 *   LLM_DAILY_CAP_USD    default 3   (0 = no dollar cap)
 *   LLM_DAILY_CAP_CALLS  default 600 (0 = no call cap). The call cap is the one that matters on a cheap model: $3 is ~4,000 luna scripts.
 *   LLM_BUDGET           "off" disables the whole thing (alerts and caps)
 *
 * At 80% of either cap one alert goes out (the failure-reporter email path), and one more when the cap is hit. Both are once per UTC
 * day across restarts and machines (alert flags live in the same row). When capped, assertLlmBudget() throws LlmBudgetExceeded: on-demand
 * generation answers "try again tomorrow", the daily batch skips. If the table is missing (migration not applied) or Supabase is down the
 * budget keeps working from the in-process tally only: it never blocks generation because the store is unavailable.
 */
import { createClient } from '@supabase/supabase-js';
import { reportFailure } from './failureReporter';

export class LlmBudgetExceeded extends Error {
  readonly status = 429;
  readonly code = 'llm_daily_cap';
  constructor(message = 'The daily AI generation budget has been reached. Try again tomorrow.') {
    super(message);
    this.name = 'LlmBudgetExceeded';
  }
}

export const isBudgetExceeded = (e: unknown): e is LlmBudgetExceeded => e instanceof LlmBudgetExceeded || (e as { code?: string } | null)?.code === 'llm_daily_cap';

export interface BudgetConfig { enabled: boolean; capUsd: number; capCalls: number; alertFraction: number }

const num = (v: string | undefined, dflt: number): number => {
  const n = Number((v ?? '').trim());
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? n : dflt;
};

export function readBudgetConfig(env: NodeJS.ProcessEnv = process.env): BudgetConfig {
  return {
    enabled: (env.LLM_BUDGET ?? '').trim().toLowerCase() !== 'off',
    capUsd: num(env.LLM_DAILY_CAP_USD, 3),
    capCalls: Math.floor(num(env.LLM_DAILY_CAP_CALLS, 600)),
    alertFraction: 0.8,
  };
}

export interface Totals { calls: number; usd: number }

export interface BudgetStore {
  /** Atomically adds to the day's totals and returns the new totals (all machines). */
  add(day: string, calls: number, usd: number): Promise<Totals>;
  get(day: string): Promise<Totals>;
  /** True for exactly one caller per (day, kind): that caller sends the alert. */
  markAlert(day: string, kind: 'warn' | 'cap'): Promise<boolean>;
}

export class MemoryBudgetStore implements BudgetStore {
  readonly days = new Map<string, Totals & { warn?: boolean; cap?: boolean }>();
  async add(day: string, calls: number, usd: number): Promise<Totals> {
    const cur = this.days.get(day) ?? { calls: 0, usd: 0 };
    cur.calls += calls; cur.usd += usd;
    this.days.set(day, cur);
    return { calls: cur.calls, usd: cur.usd };
  }
  async get(day: string): Promise<Totals> {
    const cur = this.days.get(day);
    return { calls: cur?.calls ?? 0, usd: cur?.usd ?? 0 };
  }
  async markAlert(day: string, kind: 'warn' | 'cap'): Promise<boolean> {
    const cur = this.days.get(day) ?? { calls: 0, usd: 0 };
    this.days.set(day, cur);
    if (cur[kind]) return false;
    cur[kind] = true;
    return true;
  }
}

interface RpcClient { rpc(fn: string, args: Record<string, unknown>): PromiseLike<{ data: unknown; error: { message: string } | null }> }

/** Supabase store (service role). Methods throw when the migration is not applied or the network fails; LlmBudget handles that. */
export class SupabaseBudgetStore implements BudgetStore {
  constructor(private readonly db: RpcClient) {}
  private static totals(data: unknown): Totals {
    const o = (data ?? {}) as { calls?: unknown; usd?: unknown };
    const calls = Number(o.calls); const usd = Number(o.usd);
    if (!Number.isFinite(calls) || !Number.isFinite(usd)) throw new Error('llm budget: malformed totals');
    return { calls, usd };
  }
  async add(day: string, calls: number, usd: number): Promise<Totals> {
    const { data, error } = await this.db.rpc('llm_budget_add', { p_day: day, p_calls: calls, p_usd: usd });
    if (error) throw new Error(`llm_budget_add failed: ${error.message}`);
    return SupabaseBudgetStore.totals(data);
  }
  async get(day: string): Promise<Totals> {
    const { data, error } = await this.db.rpc('llm_budget_get', { p_day: day });
    if (error) throw new Error(`llm_budget_get failed: ${error.message}`);
    return SupabaseBudgetStore.totals(data);
  }
  async markAlert(day: string, kind: 'warn' | 'cap'): Promise<boolean> {
    const { data, error } = await this.db.rpc('llm_budget_mark_alert', { p_day: day, p_kind: kind });
    if (error) throw new Error(`llm_budget_mark_alert failed: ${error.message}`);
    return data === true;
  }
}

export interface BudgetStatus extends Totals {
  capped: boolean;
  /** Highest of usd/capUsd and calls/capCalls (0 when no cap is set). */
  fraction: number;
  capUsd: number;
  capCalls: number;
}

export interface LlmBudgetDeps {
  store?: BudgetStore | (() => BudgetStore);
  env?: NodeJS.ProcessEnv;
  now?: () => number;
  report?: (flow: string, err: unknown, context?: Record<string, string>) => void;
  log?: (msg: string) => void;
  /** How long a database read stays fresh, and how soon after a call the local tally is pushed. */
  refreshMs?: number;
  flushMs?: number;
}

const utcDay = (ms: number) => new Date(ms).toISOString().slice(0, 10);

export class LlmBudget {
  private readonly deps: LlmBudgetDeps;
  private day = '';
  private base: Totals = { calls: 0, usd: 0 };      // last totals read from / returned by the store (other machines included)
  private pending: Totals = { calls: 0, usd: 0 };   // this process, not yet pushed
  private outbox: Array<{ day: string } & Totals> = []; // pending from a previous UTC day
  private syncedAt = 0;
  private timer: NodeJS.Timeout | null = null;
  private flushing: Promise<void> | null = null;
  private storeWarned = false;
  private readonly alerted = new Set<string>();
  private resolved: BudgetStore | null = null;

  constructor(deps: LlmBudgetDeps = {}) { this.deps = deps; }

  private env() { return this.deps.env ?? process.env; }
  private now() { return (this.deps.now ?? Date.now)(); }
  private log(m: string) { (this.deps.log ?? ((x: string) => console.warn(`[llm-budget] ${x}`)))(m); }
  private config(): BudgetConfig { return readBudgetConfig(this.env()); }

  private store(): BudgetStore {
    if (this.resolved) return this.resolved;
    const s = this.deps.store;
    this.resolved = typeof s === 'function' ? s() : s ?? defaultStore(this.env());
    return this.resolved;
  }

  private roll(): void {
    const today = utcDay(this.now());
    if (today === this.day) return;
    if (this.day && (this.pending.calls > 0 || this.pending.usd > 0)) this.outbox.push({ day: this.day, ...this.pending });
    this.day = today;
    this.base = { calls: 0, usd: 0 };
    this.pending = { calls: 0, usd: 0 };
    this.syncedAt = 0; // unknown until read
  }

  /** Called by the usage module for every finished call. Synchronous, never throws. */
  record(r: { ok: boolean; usd: number }): void {
    try {
      const cfg = this.config();
      if (!cfg.enabled || !r.ok) return; // a failed call did no work and cost nothing
      this.roll();
      this.pending.calls += 1;
      this.pending.usd += Number.isFinite(r.usd) && r.usd > 0 ? r.usd : 0;
      this.evaluate(cfg);
      this.schedule();
    } catch (e) {
      this.log(`record failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }

  private current(): Totals {
    return { calls: this.base.calls + this.pending.calls, usd: this.base.usd + this.pending.usd };
  }

  private statusOf(cfg: BudgetConfig): BudgetStatus {
    const t = this.current();
    const fu = cfg.capUsd > 0 ? t.usd / cfg.capUsd : 0;
    const fc = cfg.capCalls > 0 ? t.calls / cfg.capCalls : 0;
    const fraction = Math.max(fu, fc);
    return { ...t, fraction, capped: cfg.enabled && fraction >= 1, capUsd: cfg.capUsd, capCalls: cfg.capCalls };
  }

  /** Sends the 80% and cap alerts, once per UTC day (the store decides who is first, so machines and restarts do not repeat it). */
  private evaluate(cfg: BudgetConfig): void {
    const st = this.statusOf(cfg);
    if (st.fraction >= cfg.alertFraction) this.alert('warn', st, cfg);
    if (st.capped) this.alert('cap', st, cfg);
  }

  private alert(kind: 'warn' | 'cap', st: BudgetStatus, cfg: BudgetConfig): void {
    const key = `${this.day}|${kind}`;
    if (this.alerted.has(key)) return;
    this.alerted.add(key);
    const day = this.day;
    void (async () => {
      let first = true;
      try { first = await this.store().markAlert(day, kind); } catch { /* store unavailable: this process alerts once itself */ }
      if (!first) return;
      const flow = kind === 'cap' ? 'llm_daily_cap_reached' : 'llm_daily_cap_80pct';
      const msg = kind === 'cap' ? 'LLM daily budget cap reached: on-demand generation is refused and the batch skips until tomorrow (UTC)' : 'LLM daily spend reached 80% of the cap';
      const context = { used_usd: st.usd.toFixed(4), cap_usd: String(cfg.capUsd), used_calls: String(st.calls), cap_calls: String(cfg.capCalls) };
      this.log(`${msg} (${JSON.stringify(context)})`);
      (this.deps.report ?? reportFailure)(flow, new Error(msg), context);
    })();
  }

  private schedule(retry = false): void {
    if (this.timer) return;
    const ms = retry ? Math.max(60_000, this.deps.flushMs ?? 0) : this.deps.flushMs ?? 10_000; // back off while the store is failing
    this.timer = setTimeout(() => { this.timer = null; void this.flush(); }, ms);
    this.timer.unref?.();
  }

  /** Pushes the local tally to the store. Never throws; a failure keeps the tally for the next flush. */
  flush(): Promise<void> {
    if (this.flushing) return this.flushing;
    this.flushing = (async () => {
      try {
        this.roll();
        const sendOut = this.outbox.splice(0);
        for (const o of sendOut) {
          try { await this.store().add(o.day, o.calls, o.usd); } catch (e) { this.outbox.push(o); this.warnStore(e); }
        }
        if (this.pending.calls === 0 && this.pending.usd === 0) return;
        const sent = { ...this.pending };
        try {
          const totals = await this.store().add(this.day, sent.calls, sent.usd);
          this.pending = { calls: this.pending.calls - sent.calls, usd: this.pending.usd - sent.usd };
          this.base = totals; // includes what we just pushed, plus other machines
          this.syncedAt = this.now();
          this.storeWarned = false;
          this.evaluate(this.config());
        } catch (e) { this.warnStore(e); this.schedule(true); }
      } catch (e) { this.warnStore(e); } finally { this.flushing = null; }
    })();
    return this.flushing;
  }

  private warnStore(e: unknown): void {
    if (this.storeWarned) return;
    this.storeWarned = true;
    this.log(`budget store unavailable, enforcing from this process's tally only: ${e instanceof Error ? e.message : String(e)}`);
  }

  /** Current totals and whether the cap is hit. Refreshes from the store at most every refreshMs; falls back to the local tally. */
  async status(): Promise<BudgetStatus> {
    const cfg = this.config();
    if (!cfg.enabled) return { calls: 0, usd: 0, fraction: 0, capped: false, capUsd: cfg.capUsd, capCalls: cfg.capCalls };
    this.roll();
    const stale = this.now() - this.syncedAt > (this.deps.refreshMs ?? 30_000);
    if (stale) {
      try {
        // the store total does not include our unflushed pending, which current() adds on top
        this.base = await this.store().get(this.day);
        this.syncedAt = this.now();
        this.storeWarned = false;
      } catch (e) {
        this.syncedAt = this.now(); // do not hammer a broken store on every call
        this.warnStore(e);
      }
    }
    this.evaluate(cfg);
    return this.statusOf(cfg);
  }

  async isCapped(): Promise<boolean> { return (await this.status()).capped; }

  /** Throws LlmBudgetExceeded when today's budget is used up. */
  async assert(): Promise<void> {
    if (await this.isCapped()) throw new LlmBudgetExceeded();
  }

  /** Test hook. */
  reset(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null; this.day = ''; this.base = { calls: 0, usd: 0 }; this.pending = { calls: 0, usd: 0 }; this.outbox = [];
    this.syncedAt = 0; this.alerted.clear(); this.storeWarned = false; this.resolved = null;
  }
}

/** Supabase when configured (never under the test runner), else in-process only. */
function defaultStore(env: NodeJS.ProcessEnv): BudgetStore {
  if (env.NODE_ENV !== 'test' && env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
    return new SupabaseBudgetStore(createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY) as unknown as RpcClient);
  }
  return new MemoryBudgetStore();
}

export const llmBudget = new LlmBudget();

export const assertLlmBudget = (): Promise<void> => llmBudget.assert();
