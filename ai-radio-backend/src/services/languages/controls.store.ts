/**
 * Storage behind the language controls: flags, daily usage counters, breaker state.
 * SupabaseControlStore talks to migration 015 (service role). MemoryControlStore has the same semantics for tests and tooling.
 * Every method may throw (table missing, network): LanguageControls treats that as "fail closed".
 */
import type { SupabaseClient } from '@supabase/supabase-js';

export interface FlagRow {
  language: string;
  enabled: boolean;
  beta: boolean;
  dailyCap: number;
  /** ReadAloud voice id for host 1 (female) and host 2 (male). */
  voice: string;
  voiceHost2: string;
  updatedAt?: string;
  updatedBy?: string | null;
}

export type FlagPatch = Partial<Pick<FlagRow, 'enabled' | 'beta' | 'dailyCap' | 'voice' | 'voiceHost2'>>;

export type ReserveResult =
  | { ok: true; language: number; global: number }
  | { ok: false; reason: 'language_cap' | 'global_cap'; language: number; global: number };

export interface UsageDay {
  episodesTotal: number;
  charsTotal: number;
  languages: Record<string, { episodes: number; ttsChars: number; capHits: number }>;
}

export interface BreakerState {
  /** Manual kill switch for every new language. */
  globalPaused: boolean;
  globalReason: string | null;
  /** UTC day (YYYY-MM-DD) the TTS character breaker tripped, or null. Active only while that day is today. */
  ttsTrippedDay: string | null;
  ttsReason: string | null;
}

export interface ControlStore {
  listFlags(): Promise<FlagRow[]>;
  setFlag(language: string, patch: FlagPatch, updatedBy: string): Promise<FlagRow>;
  reserve(day: string, language: string, languageCap: number, globalCap: number): Promise<ReserveResult>;
  release(day: string, language: string): Promise<void>;
  /** Adds characters and returns the day's total across languages. */
  addChars(day: string, language: string, chars: number): Promise<number>;
  getUsage(day: string): Promise<UsageDay>;
  getBreakers(): Promise<BreakerState>;
  setGlobalPause(paused: boolean, reason: string | null): Promise<void>;
  tripTts(day: string, reason: string): Promise<void>;
  clearTts(): Promise<void>;
}

export const DEFAULT_FLAG: Omit<FlagRow, 'language'> = { enabled: false, beta: true, dailyCap: 8, voice: 'aria', voiceHost2: 'kai' };

const VOICE_RE = /^[a-z0-9:_-]{1,40}$/;
export function validatePatch(p: FlagPatch): void {
  if (p.dailyCap !== undefined && !(Number.isInteger(p.dailyCap) && p.dailyCap >= 0 && p.dailyCap <= 10_000)) throw new Error('dailyCap must be an integer from 0 to 10000');
  for (const k of ['voice', 'voiceHost2'] as const) if (p[k] !== undefined && !VOICE_RE.test(p[k]!)) throw new Error(`${k} must match ${VOICE_RE}`);
}

export class MemoryControlStore implements ControlStore {
  flags = new Map<string, FlagRow>();
  usage = new Map<string, { episodes: number; ttsChars: number; capHits: number }>(); // key day|language
  breaker: BreakerState = { globalPaused: false, globalReason: null, ttsTrippedDay: null, ttsReason: null };
  /** Set to make every call throw, to test fail-closed behaviour. */
  failing = false;

  constructor(languages: string[] = []) {
    for (const l of languages) this.flags.set(l, { language: l, ...DEFAULT_FLAG });
  }
  private check() { if (this.failing) throw new Error('store unavailable'); }
  async listFlags() { this.check(); return [...this.flags.values()].map((f) => ({ ...f })); }
  async setFlag(language: string, patch: FlagPatch, updatedBy: string) {
    this.check(); validatePatch(patch);
    const cur = this.flags.get(language);
    if (!cur) throw new Error(`unknown language ${language}`);
    const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)), updatedBy, updatedAt: new Date().toISOString() } as FlagRow;
    this.flags.set(language, next);
    return { ...next };
  }
  private row(day: string, language: string) {
    const k = `${day}|${language}`;
    let r = this.usage.get(k);
    if (!r) { r = { episodes: 0, ttsChars: 0, capHits: 0 }; this.usage.set(k, r); }
    return r;
  }
  private totals(day: string) {
    let episodes = 0; let chars = 0;
    for (const [k, v] of this.usage) if (k.startsWith(`${day}|`)) { episodes += v.episodes; chars += v.ttsChars; }
    return { episodes, chars };
  }
  async reserve(day: string, language: string, languageCap: number, globalCap: number): Promise<ReserveResult> {
    this.check();
    const r = this.row(day, language); const t = this.totals(day);
    if (r.episodes >= languageCap) { r.capHits++; return { ok: false, reason: 'language_cap', language: r.episodes, global: t.episodes }; }
    if (t.episodes >= globalCap) { r.capHits++; return { ok: false, reason: 'global_cap', language: r.episodes, global: t.episodes }; }
    r.episodes++;
    return { ok: true, language: r.episodes, global: t.episodes + 1 };
  }
  async release(day: string, language: string) { this.check(); const r = this.row(day, language); r.episodes = Math.max(0, r.episodes - 1); }
  async addChars(day: string, language: string, chars: number) { this.check(); this.row(day, language).ttsChars += Math.max(0, chars); return this.totals(day).chars; }
  async getUsage(day: string): Promise<UsageDay> {
    this.check();
    const languages: UsageDay['languages'] = {};
    for (const [k, v] of this.usage) if (k.startsWith(`${day}|`)) languages[k.split('|')[1]] = { ...v };
    const t = this.totals(day);
    return { episodesTotal: t.episodes, charsTotal: t.chars, languages };
  }
  async getBreakers() { this.check(); return { ...this.breaker }; }
  async setGlobalPause(paused: boolean, reason: string | null) { this.check(); this.breaker.globalPaused = paused; this.breaker.globalReason = paused ? reason : null; }
  async tripTts(day: string, reason: string) { this.check(); this.breaker.ttsTrippedDay = day; this.breaker.ttsReason = reason; }
  async clearTts() { this.check(); this.breaker.ttsTrippedDay = null; this.breaker.ttsReason = null; }
}

type Row = Record<string, unknown>;
const rowToFlag = (r: Row): FlagRow => ({
  language: String(r.language), enabled: r.enabled === true, beta: r.beta !== false, dailyCap: Number(r.daily_cap),
  voice: String(r.voice), voiceHost2: String(r.voice_host2), updatedAt: r.updated_at as string | undefined, updatedBy: (r.updated_by as string | null) ?? null,
});

export class SupabaseControlStore implements ControlStore {
  constructor(private readonly db: SupabaseClient) {}

  async listFlags(): Promise<FlagRow[]> {
    const { data, error } = await this.db.from('language_flags').select('*').order('language');
    if (error) throw new Error(`language_flags read failed: ${error.message}`);
    return (data ?? []).map(rowToFlag);
  }
  async setFlag(language: string, patch: FlagPatch, updatedBy: string): Promise<FlagRow> {
    validatePatch(patch);
    const body: Row = { updated_at: new Date().toISOString(), updated_by: updatedBy };
    if (patch.enabled !== undefined) body.enabled = patch.enabled;
    if (patch.beta !== undefined) body.beta = patch.beta;
    if (patch.dailyCap !== undefined) body.daily_cap = patch.dailyCap;
    if (patch.voice !== undefined) body.voice = patch.voice;
    if (patch.voiceHost2 !== undefined) body.voice_host2 = patch.voiceHost2;
    const { data, error } = await this.db.from('language_flags').update(body).eq('language', language).select('*');
    if (error) throw new Error(`language_flags update failed: ${error.message}`);
    if (!data || data.length === 0) throw new Error(`unknown language ${language}`);
    return rowToFlag(data[0]);
  }
  async reserve(day: string, language: string, languageCap: number, globalCap: number): Promise<ReserveResult> {
    const { data, error } = await this.db.rpc('language_usage_reserve', { p_day: day, p_language: language, p_lang_cap: languageCap, p_global_cap: globalCap });
    if (error) throw new Error(`language_usage_reserve failed: ${error.message}`);
    const o = (data ?? {}) as { ok?: boolean; reason?: string; language?: number; global?: number };
    const base = { language: Number(o.language) || 0, global: Number(o.global) || 0 };
    if (o.ok === true) return { ok: true, ...base };
    if (o.reason === 'language_cap' || o.reason === 'global_cap') return { ok: false, reason: o.reason, ...base };
    throw new Error('language_usage_reserve: malformed answer');
  }
  async release(day: string, language: string): Promise<void> {
    const { error } = await this.db.rpc('language_usage_release', { p_day: day, p_language: language });
    if (error) throw new Error(`language_usage_release failed: ${error.message}`);
  }
  async addChars(day: string, language: string, chars: number): Promise<number> {
    const { data, error } = await this.db.rpc('language_usage_add_chars', { p_day: day, p_language: language, p_chars: Math.max(0, Math.round(chars)) });
    if (error) throw new Error(`language_usage_add_chars failed: ${error.message}`);
    const total = Number((data as { chars_total?: unknown } | null)?.chars_total);
    if (!Number.isFinite(total)) throw new Error('language_usage_add_chars: malformed answer');
    return total;
  }
  async getUsage(day: string): Promise<UsageDay> {
    const { data, error } = await this.db.rpc('language_usage_get', { p_day: day });
    if (error) throw new Error(`language_usage_get failed: ${error.message}`);
    const o = (data ?? {}) as { episodes_total?: number; chars_total?: number; languages?: Record<string, { episodes?: number; tts_chars?: number; cap_hits?: number }> };
    const languages: UsageDay['languages'] = {};
    for (const [k, v] of Object.entries(o.languages ?? {})) languages[k] = { episodes: Number(v.episodes) || 0, ttsChars: Number(v.tts_chars) || 0, capHits: Number(v.cap_hits) || 0 };
    return { episodesTotal: Number(o.episodes_total) || 0, charsTotal: Number(o.chars_total) || 0, languages };
  }
  async getBreakers(): Promise<BreakerState> {
    const { data, error } = await this.db.from('language_breaker').select('*');
    if (error) throw new Error(`language_breaker read failed: ${error.message}`);
    const rows = new Map((data ?? []).map((r: Row) => [String(r.name), r]));
    const g = rows.get('global_pause'); const t = rows.get('tts_chars');
    return {
      globalPaused: g?.paused === true, globalReason: (g?.reason as string | null) ?? null,
      ttsTrippedDay: t?.tripped_day ? String(t.tripped_day) : null, ttsReason: (t?.reason as string | null) ?? null,
    };
  }
  async setGlobalPause(paused: boolean, reason: string | null): Promise<void> {
    const { error } = await this.db.from('language_breaker').update({ paused, reason: paused ? reason : null, tripped_at: paused ? new Date().toISOString() : null, updated_at: new Date().toISOString() }).eq('name', 'global_pause');
    if (error) throw new Error(`language_breaker update failed: ${error.message}`);
  }
  async tripTts(day: string, reason: string): Promise<void> {
    const { error } = await this.db.from('language_breaker').update({ tripped_day: day, tripped_at: new Date().toISOString(), reason, updated_at: new Date().toISOString() }).eq('name', 'tts_chars');
    if (error) throw new Error(`language_breaker update failed: ${error.message}`);
  }
  async clearTts(): Promise<void> {
    const { error } = await this.db.from('language_breaker').update({ tripped_day: null, tripped_at: null, reason: null, updated_at: new Date().toISOString() }).eq('name', 'tts_chars');
    if (error) throw new Error(`language_breaker update failed: ${error.message}`);
  }
}
