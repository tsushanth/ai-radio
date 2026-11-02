// Voices for Settings. GET /api/voices lists 24 voices, but the daily-brief TTS path only understands the six bare OpenAI names
// (podcast.generator -> openaiTTS.validateVoice: anything else, including the API's own ids such as "openai:alloy" or any
// "elevenlabs:<id>", is silently replaced by "nova"). So the list shown is the API's OpenAI voices with the "openai:" prefix
// removed, limited to the ids that path accepts, and it falls back to the built-in six if the API is unreachable or odd.

export interface VoiceOption {
  id: string;
  name: string;
  description?: string;
  gender?: string;
}

/** The voice names the backend TTS path accepts for voice_host1/voice_host2. */
export const ACCEPTED_VOICE_IDS = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'] as const;

export const FALLBACK_VOICES: VoiceOption[] = ACCEPTED_VOICE_IDS.map((id) => ({ id, name: id[0].toUpperCase() + id.slice(1) }));

/** Turns the /voices answer into options the backend will honor. Never returns an empty list. */
export function voiceOptionsFromApi(response: unknown): VoiceOption[] {
  const voices = (response as { voices?: unknown } | null)?.voices;
  if (!Array.isArray(voices)) return FALLBACK_VOICES;
  const accepted = new Set<string>(ACCEPTED_VOICE_IDS);
  const out = new Map<string, VoiceOption>();
  for (const v of voices) {
    if (!v || typeof v !== 'object') continue;
    const { id, name, provider, description, gender } = v as Record<string, unknown>;
    if (provider !== 'openai' || typeof id !== 'string') continue;
    const bare = id.startsWith('openai:') ? id.slice('openai:'.length) : id;
    if (!accepted.has(bare) || out.has(bare)) continue;
    out.set(bare, {
      id: bare,
      name: typeof name === 'string' && name ? name : bare[0].toUpperCase() + bare.slice(1),
      description: typeof description === 'string' ? description : undefined,
      gender: typeof gender === 'string' ? gender : undefined,
    });
  }
  // Keep the canonical order; anything the API left out of the six is filled from the fallback so a saved choice always shows
  const list = ACCEPTED_VOICE_IDS.map((id) => out.get(id) ?? FALLBACK_VOICES.find((f) => f.id === id)!);
  return out.size === 0 ? FALLBACK_VOICES : list;
}

/** "Nova - Female voice, upbeat and energetic" */
export function voiceLabel(v: VoiceOption): string {
  return v.description ? `${v.name} - ${v.description}` : v.name;
}
