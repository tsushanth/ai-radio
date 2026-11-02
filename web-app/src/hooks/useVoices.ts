'use client';

import { useEffect, useState } from 'react';
import { getVoices } from '@/lib/api/episodes';
import { FALLBACK_VOICES, voiceOptionsFromApi, type VoiceOption } from '@/lib/voices';

let cached: Promise<VoiceOption[]> | null = null;

/** Voices the daily brief can use: from GET /voices when reachable, otherwise the built-in six. Fetched once per page load. */
export function useVoices(): VoiceOption[] {
  const [voices, setVoices] = useState<VoiceOption[]>(FALLBACK_VOICES);
  useEffect(() => {
    let alive = true;
    if (!cached) {
      cached = getVoices().then(voiceOptionsFromApi).catch(() => {
        cached = null; // try again next time
        return FALLBACK_VOICES;
      });
    }
    cached.then((v) => { if (alive) setVoices(v); });
    return () => { alive = false; };
  }, []);
  return voices;
}
