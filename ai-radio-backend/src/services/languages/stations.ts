/**
 * Stations: what the apps may offer under "Radio" for each language, driven by data (language flags), not by an app release.
 *
 *   en                      kind 'live'      the existing Icecast English mount ({RADIO_STREAM_BASE_URL}/stream, status {base}/api/status)
 *   every enabled language  kind 'playlist'  the language's on-demand episodes played back to back (no Icecast mount, no encoder)
 *
 * Rules: a playlist station is listed only while the language is enabled AND at least one playable episode exists (completed, audio
 * present, generated today or yesterday UTC) any
 * error degrades to the English live station only. Nothing here generates anything.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { getLanguageSpec, LAUNCH_TOPICS } from './registry';
import { languageControls, type LanguageControls } from './controls';

export interface Station {
  code: string;
  /** English name of the language. */
  name: string;
  nativeName: string;
  kind: 'live' | 'playlist';
  /** live only: the Icecast mount. */
  streamUrl?: string;
  /** live only: the radio's now-playing JSON. */
  statusUrl?: string;
  /** playlist only: relative API path of the episode list (GET, same host as the config API). */
  playlistUrl?: string;
  enabled: boolean;
  dir: 'ltr' | 'rtl';
}

export interface PlaylistItem {
  episodeId: string;
  topicId: string;
  title: string;
  audioUrl: string;
  durationSeconds: number | null;
  date: string;
}

export interface StationDeps {
  controls?: LanguageControls;
  /** Number of playable episodes (today or yesterday UTC) per language. Throws when the database cannot be read. */
  countPlayable?: (languages: string[]) => Promise<Record<string, number>>;
  /** Playable episodes for one language, newest first, one per topic. */
  listPlayable?: (language: string) => Promise<PlaylistItem[]>;
  radioBase?: string;
  now?: () => Date;
  log?: (m: string) => void;
}

/** Test seam: dependencies merged over the defaults for every call (empty in production). */
export const stationOverrides: Partial<StationDeps> = {};

const dayStr = (d: Date) => d.toISOString().slice(0, 10);
const LAUNCH_IDS = LAUNCH_TOPICS.map((t) => t.id);

let db: SupabaseClient | null | undefined;
function client(): SupabaseClient | null {
  if (db === undefined) db = process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_KEY ? createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY) : null;
  return db;
}

async function queryPlayable(languages: string[], now: Date): Promise<Array<Record<string, unknown>>> {
  const c = client();
  if (!c) throw new Error('database not configured');
  const since = dayStr(new Date(now.getTime() - 86_400_000));
  const { data, error } = await c.from('topic_episodes')
    .select('id, topic_id, language, title, audio_url, duration_seconds, date, generated_at')
    .eq('status', 'completed').not('audio_url', 'is', null).in('language', languages).in('topic_id', LAUNCH_IDS).gte('date', since)
    .order('date', { ascending: false }).order('generated_at', { ascending: false }).limit(500);
  if (error) throw new Error(error.message);
  return (data ?? []) as Array<Record<string, unknown>>;
}

const defaultCount = async (languages: string[], now = new Date()): Promise<Record<string, number>> => {
  const out: Record<string, number> = {};
  for (const r of await queryPlayable(languages, now)) { const l = String(r.language); out[l] = (out[l] ?? 0) + 1; }
  return out;
};

const defaultList = async (language: string, now = new Date()): Promise<PlaylistItem[]> => {
  const seen = new Set<string>();
  const items: PlaylistItem[] = [];
  for (const r of await queryPlayable([language], now)) {
    const topicId = String(r.topic_id);
    if (seen.has(topicId)) continue; // newest per topic
    seen.add(topicId);
    items.push({ episodeId: String(r.id), topicId, title: String(r.title ?? ''), audioUrl: String(r.audio_url), durationSeconds: typeof r.duration_seconds === 'number' ? r.duration_seconds : null, date: String(r.date) });
  }
  return items;
};

export function englishStation(radioBase: string): Station {
  const base = radioBase.replace(/\/+$/, '');
  return { code: 'en', name: 'English', nativeName: 'English', kind: 'live', streamUrl: `${base}/stream`, statusUrl: `${base}/api/status`, enabled: true, dir: 'ltr' };
}

export async function buildStations(given: StationDeps = {}): Promise<Station[]> {
  const deps = { ...stationOverrides, ...given };
  const radioBase = deps.radioBase ?? process.env.RADIO_STREAM_BASE_URL ?? 'https://radio.audexa.app';
  const en = englishStation(radioBase);
  try {
    const controls = deps.controls ?? languageControls;
    const enabled = await controls.publicList();
    if (enabled.length === 0) return [en];
    const counts = await (deps.countPlayable ?? ((l: string[]) => defaultCount(l, deps.now?.())))(enabled.map((l) => l.code));
    const stations: Station[] = [en];
    for (const l of enabled) {
      if ((counts[l.code] ?? 0) <= 0) continue; // never a station without audio
      stations.push({ code: l.code, name: l.name, nativeName: l.nativeName, kind: 'playlist', playlistUrl: `/api/config/stations/${l.code}/playlist`, enabled: true, dir: l.dir });
    }
    return stations;
  } catch (e) {
    (deps.log ?? ((m: string) => console.warn(m)))(`[stations] degraded to English only: ${e instanceof Error ? e.message : 'error'}`);
    return [en];
  }
}

/** The playlist of one language: null when the language is not an enabled, non-hidden station language. Throws when unreadable. */
export async function buildPlaylist(code: string, given: StationDeps = {}): Promise<PlaylistItem[] | null> {
  const deps = { ...stationOverrides, ...given };
  const spec = getLanguageSpec(code);
  if (!spec) return null;
  const controls = deps.controls ?? languageControls;
  if (!(await controls.isEnabled(spec.code))) return null;
  return (deps.listPlayable ?? ((l: string) => defaultList(l, deps.now?.())))(spec.code);
}
