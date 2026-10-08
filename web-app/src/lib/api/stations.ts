// Which live radio stations to show. The radio server reports the languages it is really broadcasting (`supported_languages` in
// https://radio.audexa.app/api/status), so the list follows the server: a language that is switched off disappears here and comes
// back by itself when it is switched on again. Same rule as the Android app: never an empty list, English is the fallback.

export const FALLBACK_LANGUAGE = 'en';

export function pickActiveStations<T extends { language: string }>(all: readonly T[], supported: unknown): T[] {
  const live: unknown[] = Array.isArray(supported) ? supported : [];
  const picked = all.filter((s) => live.includes(s.language));
  return picked.length > 0 ? picked : all.filter((s) => s.language === FALLBACK_LANGUAGE);
}
