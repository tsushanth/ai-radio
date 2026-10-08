// Which live radio stations to show. The radio server reports the languages it is really broadcasting (`supported_languages` in
// https://radio.audexa.app/api/status), so the list follows the server: a language that is switched off disappears here and comes
// back by itself when it is switched on again. Same rule as the Android app: never an empty list, English is the fallback.

export const FALLBACK_LANGUAGE = 'en';

export function pickActiveStations<T extends { language: string }>(all: readonly T[], supported: unknown): T[] {
  const live: unknown[] = Array.isArray(supported) ? supported : [];
  const picked = all.filter((s) => live.includes(s.language));
  return picked.length > 0 ? picked : all.filter((s) => s.language === FALLBACK_LANGUAGE);
}

// Streams are played through this site (/api/stream/<language>) instead of straight from radio.audexa.app. Chrome blocks the
// cross-origin stream (ERR_BLOCKED_BY_ORB: a range request answered with 200, as a live stream always does) and the radio's CORS
// headers do not reach the browser through Cloudflare, so neither plain nor crossorigin playback works from another origin.
const STREAM_ORIGIN = 'https://radio.audexa.app';
const KNOWN_LANGUAGES = ['en', 'es', 'hi', 'pt', 'fr', 'de', 'ja', 'ko', 'zh', 'it'] as const;

/** Where the browser plays a station from. */
export function playbackUrl(language: string): string {
  return `/api/stream/${language}`;
}

/** The radio's own address for a language, or null for anything that is not one of our stations (so the proxy cannot be pointed elsewhere). */
export function upstreamStreamUrl(language: string): string | null {
  if (!(KNOWN_LANGUAGES as readonly string[]).includes(language)) return null;
  return language === 'en' ? `${STREAM_ORIGIN}/stream` : `${STREAM_ORIGIN}/stream-${language}`;
}
