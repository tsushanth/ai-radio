// "Share what's playing": helpers for the /live landing page that shared links open (https://audexa.app/live?lang=en&utm_...).
// Pure functions, no React, so they can be tested with plain `node --test`.

export const SITE = 'https://audexa.app';
export const PLAY_PACKAGE = 'com.kreativekoala.audexa'; // applicationId in Audexa/app/build.gradle.kts
const KNOWN_LANGUAGES = ['en', 'es', 'hi', 'pt', 'fr', 'de', 'ja', 'ko', 'zh', 'it', 'tl'] as const;

export type Utm = { utm_source: string; utm_medium: string; utm_campaign: string; utm_content?: string };

const UTM_VALUE = /^[A-Za-z0-9_.-]{1,64}$/;

/** A language we have a station for; anything else (including a missing value) is English. */
export function parseLang(value: unknown): string {
  const v = Array.isArray(value) ? value[0] : value;
  return typeof v === 'string' && (KNOWN_LANGUAGES as readonly string[]).includes(v) ? v : 'en';
}

/** Keeps only well-formed utm_* values from the incoming link (they get echoed into the Play link, so nothing else gets through). */
export function readUtm(params: Record<string, string | string[] | undefined>): Utm {
  const pick = (key: string, fallback: string | undefined) => {
    const raw = params[key];
    const v = Array.isArray(raw) ? raw[0] : raw;
    return typeof v === 'string' && UTM_VALUE.test(v) ? v : fallback;
  };
  const utm: Utm = {
    utm_source: pick('utm_source', 'web_live')!,
    utm_medium: pick('utm_medium', 'landing')!,
    utm_campaign: pick('utm_campaign', 'live_share')!,
  };
  const content = pick('utm_content', undefined);
  if (content) utm.utm_content = content;
  return utm;
}

/**
 * The topic on air, or null when the radio did not say. The radio only reports a topic while the segment is still in its
 * ready queue, so null is the common case: callers must fall back to generic copy rather than guess.
 */
export function topicFromStatus(data: unknown): string | null {
  const np = (data as { now_playing?: { source?: unknown; topic_name?: unknown } } | null)?.now_playing;
  if (!np || np.source === 'music' || typeof np.topic_name !== 'string') return null;
  const topic = np.topic_name.replace(/^\[\w+\]\s*/, '').trim();
  return topic.length > 0 && topic.length <= 120 ? topic : null;
}

/** Link-preview and page copy. No listener counts, says the station is AI-generated. */
export function liveMeta(topic: string | null): { title: string; description: string } {
  const title = 'Audexa Radio: live AI news and talk';
  const description = topic
    ? `Recently on air: ${topic}. AI-generated news and talk, streaming live. Listen in your browser or get the Android app.`
    : 'AI-generated news and talk, streaming live. Listen in your browser or get the Android app.';
  return { title, description };
}

/** Google Play listing; the referrer carries the UTM values into Play Console's acquisition reports. */
export function playStoreUrl(utm: Utm): string {
  const referrer = Object.entries(utm).map(([k, v]) => `${k}=${v}`).join('&');
  return `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE}&referrer=${encodeURIComponent(referrer)}`;
}

/** Chrome-on-Android intent link: opens the installed app on this URL, or goes to Play when it is not installed. */
export function androidIntentUrl(lang: string, utm: Utm): string {
  const query = new URLSearchParams({ lang, ...utm }).toString();
  return `intent://audexa.app/live?${query}#Intent;scheme=https;package=${PLAY_PACKAGE};S.browser_fallback_url=${encodeURIComponent(playStoreUrl(utm))};end`;
}

// --- Sharing from the web (the sender side; same honesty rules as Android's util/LiveShare.kt) ---------------------------------
// The text names a topic only when the radio really reported one, never mentions listener counts, and says the station is
// AI-generated. The link opens the live stream (whatever is on air when it is tapped), so the text says "tune in live".

/** The link that goes into a share from the web. utm_source=audexa_web lets us tell web shares from Android's audexa_android. */
export function buildShareUrl(language: string): string {
  const lang = parseLang(language);
  return `${SITE}/live?lang=${lang}&utm_source=audexa_web&utm_medium=share&utm_campaign=live_share&utm_content=${lang}`;
}

/** Topic as shown to people: radio queue names look like "[en] US Politics". Null when there is nothing real to show. */
export function cleanTopic(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const t = raw.replace(/^\[\w+\]\s*/, '').trim();
  return t.length > 0 && t.length <= 120 ? t : null;
}

/** Share text without the link (the link is passed separately, or appended when copying). */
export function buildShareText(stationName: string, topic: unknown): string {
  const t = cleanTopic(topic);
  return t
    ? `${stationName} is on air right now with: ${t}. It is an AI-generated news and talk station. Tune in live:`
    : `I'm listening to ${stationName}, an AI-generated news and talk station. Tune in live:`;
}

export type ShareOutcome = 'shared' | 'copied' | 'cancelled' | 'failed';

interface ShareNavigator {
  share?: (data: { title?: string; text?: string; url?: string }) => Promise<void>;
  clipboard?: { writeText: (text: string) => Promise<void> };
}

/**
 * Opens the system share sheet (navigator.share) where there is one, otherwise copies "text link" to the clipboard.
 * 'cancelled' = the user closed the sheet (not an error). A share that throws for any other reason also falls back to copying.
 */
export async function shareOrCopy(nav: ShareNavigator | undefined | null, payload: { title: string; text: string; url: string }): Promise<ShareOutcome> {
  if (nav && typeof nav.share === 'function') {
    try {
      await nav.share(payload);
      return 'shared';
    } catch (err) {
      if ((err as { name?: string } | null)?.name === 'AbortError') return 'cancelled';
    }
  }
  if (nav?.clipboard && typeof nav.clipboard.writeText === 'function') {
    try {
      await nav.clipboard.writeText(`${payload.text} ${payload.url}`);
      return 'copied';
    } catch {
      // clipboard blocked (permissions / insecure context)
    }
  }
  return 'failed';
}
