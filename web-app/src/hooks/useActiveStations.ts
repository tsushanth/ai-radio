'use client';

import { useEffect, useState } from 'react';
import { LIVE_STATIONS } from '@/lib/api/episodes';
import type { LiveStation } from '@/lib/api/episodes';
import { pickActiveStations } from '@/lib/api/stations';

const STATUS_URL = 'https://radio.audexa.app/api/status';
const REFRESH_MS = 5 * 60_000;

/** The live stations that are really on air. Until the radio answers (or if it does not), only English is shown. */
export function useActiveStations(): LiveStation[] {
  const [supported, setSupported] = useState<unknown>(undefined);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const res = await fetch(STATUS_URL, { cache: 'no-store' });
        if (!res.ok) return;
        const data = await res.json();
        if (!cancelled) setSupported(data?.supported_languages);
      } catch {
        // offline or the radio is restarting: keep what we have
      }
    }
    load();
    const timer = window.setInterval(load, REFRESH_MS);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);

  return pickActiveStations(LIVE_STATIONS, supported);
}
