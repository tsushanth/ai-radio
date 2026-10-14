/**
 * Non-English Piper voices for on-demand topic episodes. Each language has two hosts (shimmer = host1, onyx = host2 in the
 * generator). The voice ids are catalog voices on the shared Piper worker (checked 2026-10-14). Italian only has female
 * voices and Portuguese only male ones in the catalog, so those pairs are same-gender. Override without a deploy via
 * PIPER_LANG_VOICES='{"de":{"f":"custom:...","m":"custom:..."}}'.
 */
export type HostGender = 'f' | 'm';
export type LanguageVoices = Record<HostGender, string>;

export const DEFAULT_LANGUAGE_VOICES: Record<string, LanguageVoices> = {
  de: { f: 'custom:de-de-mls-f', m: 'custom:de-de-mls-m' },
  es: { f: 'custom:es-pilot-f', m: 'custom:es-pilot-m' },
  fr: { f: 'custom:fr-fr-mls-f', m: 'custom:fr-fr-mls-m' },
  it: { f: 'custom:it-it-serena', m: 'custom:it-it-paola' },
  pt: { f: 'custom:pt-br-faber', m: 'custom:pt-br-cadu' },
};

export function languageVoices(env: NodeJS.ProcessEnv = process.env): Record<string, LanguageVoices> {
  const raw = env.PIPER_LANG_VOICES;
  if (!raw) return DEFAULT_LANGUAGE_VOICES;
  try {
    const o = JSON.parse(raw) as Record<string, Partial<LanguageVoices>>;
    const out: Record<string, LanguageVoices> = { ...DEFAULT_LANGUAGE_VOICES };
    for (const [lang, v] of Object.entries(o)) {
      if (/^[a-z]{2}$/.test(lang) && v && /^custom:[a-z0-9_-]+$/.test(v.f || '') && /^custom:[a-z0-9_-]+$/.test(v.m || '')) {
        out[lang] = { f: v.f!, m: v.m! };
      }
    }
    return out;
  } catch {
    return DEFAULT_LANGUAGE_VOICES;
  }
}

/** Languages that may be generated on demand: those with voices, narrowed by ON_DEMAND_LANGUAGES (comma list; "" disables all). */
export function onDemandLanguages(env: NodeJS.ProcessEnv = process.env): string[] {
  const voices = Object.keys(languageVoices(env));
  const raw = env.ON_DEMAND_LANGUAGES;
  if (raw === undefined) return voices;
  const allow = raw.split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
  return voices.filter((l) => allow.includes(l));
}

/** Pick the voice id for a host: female for the shimmer/nova voices, male for the rest (same split as the English map). */
export function voiceForHost(language: string, openaiVoice: string, env: NodeJS.ProcessEnv = process.env): string | null {
  const v = languageVoices(env)[language];
  if (!v) return null;
  return openaiVoice === 'nova' || openaiVoice === 'shimmer' ? v.f : v.m;
}

/**
 * The stock voices start with up to ~0.5 s of near-silence or a slow ramp-in (measured 2026-10-14: pt-br-cadu 565 ms, pt-br-jeff
 * 506 ms, de-de-mls 100 ms). Trim the lead-in to `keepMs` before the first loud sample and fade in over `fadeMs`.
 * Operates on 16-bit little-endian mono PCM.
 */
export function trimLeadingAndFade(pcm: Buffer, sampleRate = 24000, keepMs = 40, fadeMs = 15): Buffer {
  const n = Math.floor(pcm.length / 2);
  if (n === 0) return pcm;
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(pcm.readInt16LE(i * 2)));
  if (peak === 0) return pcm;
  const thr = 0.03 * peak;
  let first = 0;
  while (first < n && Math.abs(pcm.readInt16LE(first * 2)) <= thr) first++;
  const start = Math.max(0, first - Math.floor((sampleRate * keepMs) / 1000));
  const out = Buffer.from(pcm.subarray(start * 2, n * 2));
  const fade = Math.min(Math.floor((sampleRate * fadeMs) / 1000), out.length / 2);
  for (let i = 0; i < fade; i++) out.writeInt16LE(Math.round(out.readInt16LE(i * 2) * (i / fade)), i * 2);
  return out;
}

/** Per-UTC-day cap on non-English episode generations (each costs an LLM script plus TTS). In memory: a restart resets it. */
export class DailyCap {
  private day = '';
  private count = 0;
  constructor(private readonly limit: number, private readonly now: () => Date = () => new Date()) {}
  tryTake(): boolean {
    const d = this.now().toISOString().slice(0, 10);
    if (d !== this.day) { this.day = d; this.count = 0; }
    if (this.count >= this.limit) return false;
    this.count++;
    return true;
  }
}
