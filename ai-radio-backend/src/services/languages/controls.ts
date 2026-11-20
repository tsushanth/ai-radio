/**
 * Runtime controls for the additional podcast languages: per-language flags (default OFF), daily episode caps, the global cap, the
 * TTS character breaker and the kill switch. All of it is data in Supabase (migration 015), so nothing needs a deploy to change.
 *
 *   kill switch   NEW_LANGUAGES=off (env, hard off) or language_breaker.global_pause (database, flipped by the CLI)
 *   per language  language_flags.enabled / beta / daily_cap          default OFF, beta, 8 episodes a day (2 for the wave 3 rows, migration 016)
 *   global cap    LANG_GLOBAL_DAILY_CAP                              default 35 new-language episodes a day (all languages together)
 *   TTS breaker   LANG_TTS_DAILY_CHARS                               default 150000 characters a day; trips for the rest of the UTC day
 *
 * Fail closed: if the tables are missing or Supabase is down, no new language is enabled and nothing is generated. Existing cached
 * episodes keep being served only for languages whose flag could be read as enabled.
 *
 * Answers for callers (all carry `status`):
 *   unavailable        400 language_unavailable   language off, unknown, topic not offered in it, or the controls cannot be read
 *   paused             503 language_paused        kill switch or TTS breaker: new generation stopped, cached episodes still served
 *   daily_cap_reached  429 daily_limit            this language, or all new languages together, are at today's cap
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getLanguageSpec, isLaunchTopic, NEW_LANGUAGES, type LanguageSpec } from './registry';
import { SupabaseControlStore, type ControlStore, type FlagRow, type FlagPatch, type UsageDay, type BreakerState } from './controls.store';

export type DenyStatus = 'unavailable' | 'paused' | 'daily_cap_reached';

export interface Denied {
  ok: false;
  http: 400 | 429 | 503;
  status: DenyStatus;
  /** Machine code the app already understands (language_unavailable, daily_limit) or the new language_paused. */
  error: 'language_unavailable' | 'language_paused' | 'daily_limit';
  message: string;
  scope?: 'language' | 'global';
  reason?: string;
}

export interface Admitted { ok: true; beta: boolean; flag: FlagRow; spec: LanguageSpec }

export class TtsBreakerTripped extends Error {
  readonly code = 'language_paused';
  constructor(message = 'New-language speech is paused for today (daily character limit reached).') {
    super(message);
    this.name = 'TtsBreakerTripped';
  }
}
export const isBreakerTripped = (e: unknown): e is TtsBreakerTripped => e instanceof TtsBreakerTripped || (e as { code?: string } | null)?.code === 'language_paused';

/**
 * One entry of GET /api/config/languages. code, name, nativeName, status, beta and wave are the original contract (unchanged); flag, dir,
 * podcast and uiTag are additive (old clients ignore unknown keys).
 */
export interface PublicLanguage {
  code: string; name: string; nativeName: string; status: 'on' | 'beta' | 'paused'; beta: boolean; wave: 1 | 2 | 3;
  /** Flag emoji, or null when the language has no single-country flag. */
  flag: string | null;
  dir: 'ltr' | 'rtl';
  /** Always true: the language has on-demand podcast episodes. */
  podcast: true;
  /** Tag of the app's matching interface language, only when the app has one. */
  uiTag?: string;
}

export interface ControlsConfig { globalDailyCap: number; ttsDailyChars: number; flagsCacheMs: number; killSwitch: boolean }

const num = (v: string | undefined, dflt: number): number => {
  const n = Number((v ?? '').trim());
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : dflt;
};

export function readControlsConfig(env: NodeJS.ProcessEnv = process.env): ControlsConfig {
  return {
    globalDailyCap: num(env.LANG_GLOBAL_DAILY_CAP, 35),
    ttsDailyChars: num(env.LANG_TTS_DAILY_CHARS, 150_000),
    flagsCacheMs: num(env.LANG_FLAGS_CACHE_SEC, 30) * 1000,
    killSwitch: (env.NEW_LANGUAGES ?? '').trim().toLowerCase() === 'off',
  };
}

const MESSAGES = {
  unavailable: 'This language is not available yet.',
  paused: 'New episodes in this language are paused. Episodes that already exist still play. Please try again later.',
  languageCap: 'Try again tomorrow.',
  globalCap: 'Try again tomorrow.',
};

const utcDay = (d: Date) => d.toISOString().slice(0, 10);

export interface ControlsDeps {
  store?: ControlStore | (() => ControlStore);
  env?: NodeJS.ProcessEnv;
  now?: () => Date;
  log?: (msg: string) => void;
}

export class LanguageControls {
  private cache: { at: number; flags: Map<string, FlagRow> } | null = null;
  private breakerCache: { at: number; state: BreakerState } | null = null;
  private storeInstance: ControlStore | null = null;
  constructor(private readonly deps: ControlsDeps = {}) {}

  private get env() { return this.deps.env ?? process.env; }
  private now() { return this.deps.now ? this.deps.now() : new Date(); }
  private log(m: string) { (this.deps.log ?? ((x: string) => console.warn(x)))(m); }
  private get store(): ControlStore {
    const s = this.deps.store;
    if (typeof s === 'function') return s();
    if (s) return s;
    if (!this.storeInstance) throw new Error('language controls: no store configured');
    return this.storeInstance;
  }
  /** Replaces the store (tests, tooling). */
  useStore(store: ControlStore): this { this.storeInstance = store; this.invalidate(); return this; }

  /** Production wiring: the service-role Supabase client. */
  useSupabase(db: SupabaseClient): this { this.storeInstance = new SupabaseControlStore(db); return this; }

  invalidate() { this.cache = null; this.breakerCache = null; }

  private async flags(): Promise<Map<string, FlagRow>> {
    const cfg = readControlsConfig(this.env);
    const t = this.now().getTime();
    if (this.cache && t - this.cache.at < cfg.flagsCacheMs) return this.cache.flags;
    try {
      const rows = await this.store.listFlags();
      const flags = new Map(rows.filter((r) => getLanguageSpec(r.language)).map((r) => [r.language, r]));
      this.cache = { at: t, flags };
      return flags;
    } catch (e) {
      // Fail closed. Keep a short-lived empty answer so a broken database is not hammered once per request.
      this.log(`[languages] flags unreadable, new languages are off: ${e instanceof Error ? e.message : 'error'}`);
      const flags = new Map<string, FlagRow>();
      this.cache = { at: t - Math.max(0, cfg.flagsCacheMs - 5000), flags };
      return flags;
    }
  }

  private async breakers(): Promise<BreakerState | null> {
    const t = this.now().getTime();
    if (this.breakerCache && t - this.breakerCache.at < 10_000) return this.breakerCache.state;
    try {
      const state = await this.store.getBreakers();
      this.breakerCache = { at: t, state };
      return state;
    } catch (e) {
      this.log(`[languages] breaker state unreadable, generation is paused: ${e instanceof Error ? e.message : 'error'}`);
      return null;
    }
  }

  /** The flag row when the language is enabled, else undefined. */
  async enabledFlag(language: string): Promise<FlagRow | undefined> {
    if (!getLanguageSpec(language)) return undefined;
    const f = (await this.flags()).get(language);
    return f?.enabled ? f : undefined;
  }

  /** Listing and reading episodes: only the language flag matters (a pause never hides episodes that already exist). */
  async isEnabled(language: string): Promise<boolean> {
    return !!(await this.enabledFlag(language));
  }

  /** Is generation stopped right now for every new language? Returns the reason, or null when running. */
  async pausedReason(): Promise<string | null> {
    if (readControlsConfig(this.env).killSwitch) return 'kill_switch_env';
    const b = await this.breakers();
    if (!b) return 'controls_unreadable';
    if (b.globalPaused) return 'kill_switch';
    if (b.ttsTrippedDay === utcDay(this.now())) return 'tts_breaker';
    return null;
  }

  /** Before any generation work: is this (language, topic) allowed to start? Takes no cap slot. */
  async admitGeneration(language: string, topicId: string): Promise<Admitted | Denied> {
    const spec = getLanguageSpec(language);
    const flag = await this.enabledFlag(language);
    if (!spec || !flag) return { ok: false, http: 400, status: 'unavailable', error: 'language_unavailable', message: MESSAGES.unavailable, reason: 'language_off' };
    if (!isLaunchTopic(topicId)) return { ok: false, http: 400, status: 'unavailable', error: 'language_unavailable', message: MESSAGES.unavailable, reason: 'topic_not_offered' };
    const paused = await this.pausedReason();
    if (paused) return { ok: false, http: 503, status: 'paused', error: 'language_paused', message: MESSAGES.paused, reason: paused };
    return { ok: true, beta: flag.beta, flag, spec };
  }

  /** Takes one episode slot (language cap and global cap, persisted and shared by all machines). Call only for a NEW generation. */
  async reserveEpisode(language: string): Promise<{ ok: true } | Denied> {
    const flag = await this.enabledFlag(language);
    if (!flag) return { ok: false, http: 400, status: 'unavailable', error: 'language_unavailable', message: MESSAGES.unavailable, reason: 'language_off' };
    const cfg = readControlsConfig(this.env);
    try {
      const r = await this.store.reserve(utcDay(this.now()), language, flag.dailyCap, cfg.globalDailyCap);
      if (r.ok === true) return { ok: true };
      const reason = (r as { reason: string }).reason;
      return {
        ok: false, http: 429, status: 'daily_cap_reached', error: 'daily_limit',
        scope: reason === 'language_cap' ? 'language' : 'global',
        message: reason === 'language_cap' ? MESSAGES.languageCap : MESSAGES.globalCap, reason,
      };
    } catch (e) {
      this.log(`[languages] could not reserve an episode slot, refusing: ${e instanceof Error ? e.message : 'error'}`);
      return { ok: false, http: 400, status: 'unavailable', error: 'language_unavailable', message: MESSAGES.unavailable, reason: 'controls_unreadable' };
    }
  }

  /** Gives a slot back when a generation failed before anything was spent. Never throws. */
  async releaseEpisode(language: string): Promise<void> {
    try { await this.store.release(utcDay(this.now()), language); } catch (e) { this.log(`[languages] release failed: ${e instanceof Error ? e.message : 'error'}`); }
  }

  /**
   * Counts the characters about to be sent to the speech API and trips the breaker when the day's total passes the limit. The speech
   * client calls it before every HTTP attempt (a retry counts again), so the total is the characters actually sent. Throws
   * TtsBreakerTripped: the attempt is not made, the episode fails, the request path answers "paused".
   */
  async reserveTtsChars(language: string, chars: number): Promise<void> {
    const paused = await this.pausedReason();
    if (paused) throw new TtsBreakerTripped();
    const cfg = readControlsConfig(this.env);
    const day = utcDay(this.now());
    let total: number;
    try { total = await this.store.addChars(day, language, chars); } catch (e) {
      this.log(`[languages] could not count TTS characters, stopping this episode: ${e instanceof Error ? e.message : 'error'}`);
      throw new TtsBreakerTripped('New-language speech is unavailable right now.');
    }
    if (total > cfg.ttsDailyChars) {
      try { await this.store.tripTts(day, `daily characters ${total} > ${cfg.ttsDailyChars}`); } catch (e) { this.log(`[languages] could not record the tripped breaker: ${e instanceof Error ? e.message : 'error'}`); }
      this.breakerCache = null;
      this.log(`[languages] TTS breaker tripped: ${total} characters today (limit ${cfg.ttsDailyChars}); new-language generation is paused until the next UTC day`);
      throw new TtsBreakerTripped();
    }
  }

  /** Characters still available today before the breaker trips. 0 when unreadable (fail closed). */
  async ttsCharsRemaining(): Promise<number> {
    try {
      const u = await this.store.getUsage(utcDay(this.now()));
      return Math.max(0, readControlsConfig(this.env).ttsDailyChars - u.charsTotal);
    } catch { return 0; }
  }

  /** The speech account is out of credits (HTTP 402): stop all new-language generation until an operator resumes it. */
  async pauseForOutOfCredits(): Promise<void> {
    try { await this.store.setGlobalPause(true, 'readaloud_out_of_credits'); this.invalidate(); } catch (e) { this.log(`[languages] could not record the pause: ${e instanceof Error ? e.message : 'error'}`); }
  }

  /** What the app may show: enabled languages only, with a Beta label. */
  async publicList(): Promise<PublicLanguage[]> {
    const flags = await this.flags();
    const paused = await this.pausedReason();
    const out: PublicLanguage[] = [];
    for (const spec of NEW_LANGUAGES) {
      const f = flags.get(spec.code);
      if (!f?.enabled) continue;
      out.push({
        code: spec.code, name: spec.name, nativeName: spec.nativeName, status: paused ? 'paused' : f.beta ? 'beta' : 'on', beta: f.beta, wave: spec.wave,
        flag: spec.flag, dir: spec.dir, podcast: true, ...(spec.uiTag ? { uiTag: spec.uiTag } : {}),
      });
    }
    return out;
  }

  // ----- operator side (CLI) -----

  async setFlag(language: string, patch: FlagPatch, by: string): Promise<FlagRow> {
    if (!getLanguageSpec(language)) throw new Error(`unknown new language "${language}"`);
    const row = await this.store.setFlag(language, patch, by);
    this.invalidate();
    return row;
  }
  async setGlobalPause(paused: boolean, reason: string | null) { await this.store.setGlobalPause(paused, reason); this.invalidate(); }
  async clearTtsBreaker() { await this.store.clearTts(); this.invalidate(); }

  async report(): Promise<{ flags: FlagRow[]; usage: UsageDay; breakers: BreakerState; config: ControlsConfig; day: string }> {
    const day = utcDay(this.now());
    const [flags, usage, breakers] = await Promise.all([this.store.listFlags(), this.store.getUsage(day), this.store.getBreakers()]);
    return { flags, usage, breakers, config: readControlsConfig(this.env), day };
  }
}

/** Process-wide instance. server wiring calls useSupabase(); tests build their own or replace the store. */
export const languageControls = new LanguageControls();
if (process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY) languageControls.useSupabase(createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY));
