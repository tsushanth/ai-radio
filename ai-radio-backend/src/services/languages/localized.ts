/**
 * Server-generated text in the listener's language: episode-title dates, category names, topic names and descriptions, and the
 * Daily Brief push copy. Everything falls back to English as a whole (never half and half): a category row is either all in the
 * requested language or all English.
 */
import { getLanguageSpec } from './registry';
import { CATEGORY_NAMES_I18N, CATEGORY_ORDER } from '../../config/i18n/category-names';
import { TOPIC_I18N } from '../../config/i18n/topic-names';
import { DAILY_BRIEF_PUSH, type DailyBriefPushCopy } from '../../config/i18n/push-copy';
import type { TopicCategory, TopicDefinition } from '../../types/topics';

/** Legacy and regional tags clients send, mapped to the code the tables use. */
const ALIASES: Record<string, string> = { tl: 'fil', nb: 'no', nn: 'no', in: 'id' };

/**
 * The language of a piece of server-written text, from whatever tag the client sent. Whitelisted output: a lower-case two or three
 * letter primary subtag ("pt-BR" -> "pt", "tl" -> "fil", "" -> "en"), except Chinese, which keeps its script because Simplified and
 * Traditional text are not interchangeable: zh-TW, zh-Hant, zh-MO and zh-Hant-TW -> "zh-TW"; zh-HK and zh-Hant-HK -> "zh-HK";
 * zh, zh-CN, zh-SG, zh-Hans (and anything else Chinese) -> "zh" (Simplified, the only Chinese older clients ever asked for).
 */
export function normalizeLanguage(raw: string | undefined | null): string {
  const parts = String(raw ?? '').trim().toLowerCase().split(/[-_]/);
  const primary = parts[0];
  if (!/^[a-z]{2,3}$/.test(primary)) return 'en';
  if (primary === 'zh') {
    const rest = parts.slice(1);
    if (rest.includes('hans') || rest.includes('cn') || rest.includes('sg')) return 'zh';
    if (rest.includes('hk')) return 'zh-HK';
    if (rest.includes('tw') || rest.includes('mo') || rest.includes('hant')) return 'zh-TW';
    return 'zh';
  }
  return ALIASES[primary] ?? primary;
}

/**
 * The podcast (content) language behind a text language: "zh-TW" and "zh-HK" -> "zh". Topic availability, episodes and audio are
 * keyed by this code; only the wording of names, categories, push and dates follows the script variant.
 */
export function contentLanguage(raw: string | undefined | null): string {
  return normalizeLanguage(raw).split('-')[0];
}

/** Locale for dates in episode titles. The additional languages use the registry's own locale; the built-in ones are listed here. */
const BUILT_IN_DATE_LOCALES: Record<string, string> = {
  en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-BR', ko: 'ko-KR', fil: 'fil-PH', 'zh-TW': 'zh-TW', 'zh-HK': 'zh-HK',
};

export function dateLocaleFor(language: string | undefined | null): string {
  const lang = normalizeLanguage(language);
  return getLanguageSpec(lang)?.dateLocale ?? BUILT_IN_DATE_LOCALES[lang] ?? 'en-US';
}

/** "Sunday, November 15" in English, "domingo, 15 de noviembre" in Spanish. `date` is YYYY-MM-DD; the day is read as a UTC date. */
export function formatEpisodeDate(date: string, language: string | undefined | null, withYear = false): string {
  const opts: Intl.DateTimeFormatOptions = { weekday: 'long', ...(withYear ? { year: 'numeric' as const } : {}), month: 'long', day: 'numeric', timeZone: 'UTC' };
  const d = new Date(`${date}T12:00:00Z`);
  try {
    return d.toLocaleDateString(dateLocaleFor(language), opts);
  } catch {
    try { return d.toLocaleDateString('en-US', opts); } catch { return date; }
  }
}

/** True when every category has a name in this language. */
export function hasCategoryNames(language: string | undefined | null): boolean {
  const lang = normalizeLanguage(language);
  return CATEGORY_ORDER.every((c) => !!CATEGORY_NAMES_I18N[c][lang]);
}

/** Category name in the language; the whole set falls back to English together so a row of chips never mixes languages. */
export function categoryName(category: TopicCategory, language: string | undefined | null): string {
  const lang = hasCategoryNames(language) ? normalizeLanguage(language) : 'en';
  return CATEGORY_NAMES_I18N[category][lang];
}

/** Own property only: the language can come straight from a query string, and "__proto__" or "constructor" must not match. */
function ownValue<T>(obj: Record<string, T> | undefined, key: string): T | undefined {
  return obj && Object.prototype.hasOwnProperty.call(obj, key) ? obj[key] : undefined;
}

function ownText(obj: Record<string, string> | undefined, key: string): string | undefined {
  const v = ownValue(obj, key);
  return typeof v === 'string' && v ? v : undefined;
}

/**
 * Name and description of a topic for a language. Order: the row's own localizedNames / localizedDescriptions (database or catalog),
 * then the built-in translation table, then the topic's base text.
 */
export function localizeTopic(topic: TopicDefinition, language: string | undefined | null): { name: string; description: string } {
  const lang = normalizeLanguage(language);
  const raw = typeof language === 'string' ? language : lang;
  const table = ownValue(TOPIC_I18N, topic.id) ? ownValue(TOPIC_I18N[topic.id], lang) : undefined;
  return {
    name: ownText(topic.localizedNames, raw) || ownText(topic.localizedNames, lang) || table?.[0] || topic.name,
    description: ownText(topic.localizedDescriptions, raw) || ownText(topic.localizedDescriptions, lang) || table?.[1] || topic.description,
  };
}

/** Push copy for the Daily Brief; `minutes` fills {n}. */
export function dailyBriefPush(language: string | undefined | null, minutes = 0): DailyBriefPushCopy {
  const c = DAILY_BRIEF_PUSH[normalizeLanguage(language)] ?? DAILY_BRIEF_PUSH.en;
  return { ...c, readyBody: c.readyBody.replace('{n}', String(minutes)) };
}

/**
 * The language to store with a device or settings row, or undefined when the client did not send one. Stored inside the
 * `preferences` JSON as `language`, the field the Daily Brief scheduler already reads, so the push is written in that language.
 */
export function languageFromBody(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? normalizeLanguage(value) : undefined;
}

/** `preferences` JSON with the language merged in; the other keys are kept. Returns undefined when there is nothing to change. */
export function withLanguage(existing: unknown, language: string | undefined): Record<string, unknown> | undefined {
  if (!language) return undefined;
  const base = existing && typeof existing === 'object' && !Array.isArray(existing) ? (existing as Record<string, unknown>) : {};
  return { ...base, language };
}

/** Languages the Daily Brief push has copy for. */
export const PUSH_LANGUAGES: readonly string[] = Object.keys(DAILY_BRIEF_PUSH);
