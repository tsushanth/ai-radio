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

/** Primary subtag, lower case, aliases applied: "pt-BR" -> "pt", "tl" -> "fil", "zh-Hans" -> "zh", "" -> "en". */
export function normalizeLanguage(raw: string | undefined | null): string {
  const primary = String(raw ?? '').trim().toLowerCase().split(/[-_]/)[0];
  if (!/^[a-z]{2,3}$/.test(primary)) return 'en';
  return ALIASES[primary] ?? primary;
}

/** Locale for dates in episode titles. The additional languages use the registry's own locale; the built-in ones are listed here. */
const BUILT_IN_DATE_LOCALES: Record<string, string> = {
  en: 'en-US', es: 'es-ES', fr: 'fr-FR', de: 'de-DE', it: 'it-IT', pt: 'pt-BR', ko: 'ko-KR', fil: 'fil-PH',
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

/**
 * Name and description of a topic for a language. Order: the row's own localizedNames / localizedDescriptions (database or catalog),
 * then the built-in translation table, then the topic's base text.
 */
export function localizeTopic(topic: TopicDefinition, language: string | undefined | null): { name: string; description: string } {
  const lang = normalizeLanguage(language);
  const raw = typeof language === 'string' ? language : lang;
  const table = TOPIC_I18N[topic.id]?.[lang];
  return {
    name: topic.localizedNames?.[raw] || topic.localizedNames?.[lang] || table?.[0] || topic.name,
    description: topic.localizedDescriptions?.[raw] || topic.localizedDescriptions?.[lang] || table?.[1] || topic.description,
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
