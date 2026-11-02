// Topic language support, the web side of the Android rules (HomeViewModel.loadData, TopicDetailScreen LanguageSelector).
//
// The backend does the heavy lifting when it is given ?lang=: it drops topics curated for other locales, returns the localized
// name/description in `name`/`description`, and puts locale topics first. These helpers apply the same rules again on the client
// (so a topic list that arrives unlocalized, or from a cache, still renders correctly) and hold the list of languages a podcast
// episode can be generated in.

export interface LocalizableTopic {
  name: string;
  description: string;
  languages?: string[];
  localizedNames?: Record<string, string>;
  localizedDescriptions?: Record<string, string>;
}

/** Same set as Android's SupportedLanguage.PODCAST_LANGUAGES: the languages an episode can be generated in. */
export const PODCAST_LANGUAGES = [
  { code: 'en', name: 'English', flag: '\u{1F1FA}\u{1F1F8}' },
  { code: 'es', name: 'Spanish', flag: '\u{1F1EA}\u{1F1F8}' },
  { code: 'fr', name: 'French', flag: '\u{1F1EB}\u{1F1F7}' },
  { code: 'de', name: 'German', flag: '\u{1F1E9}\u{1F1EA}' },
  { code: 'pt', name: 'Portuguese', flag: '\u{1F1E7}\u{1F1F7}' },
  { code: 'it', name: 'Italian', flag: '\u{1F1EE}\u{1F1F9}' },
] as const;

export type PodcastLanguageCode = (typeof PODCAST_LANGUAGES)[number]['code'];

export function isPodcastLanguage(code: unknown): code is PodcastLanguageCode {
  return PODCAST_LANGUAGES.some((l) => l.code === code);
}

/** The episode language to start from: the user's language when episodes exist in it, otherwise English (Android does the same). */
export function podcastLanguageFor(preferred: unknown): PodcastLanguageCode {
  return isPodcastLanguage(preferred) ? preferred : 'en';
}

/** The `lang` query value for API calls: a two-letter code, English when missing or malformed. */
export function apiLang(language: unknown): string {
  return typeof language === 'string' && /^[a-z]{2}$/.test(language) ? language : 'en';
}

/** True when the topic is for everyone (`all`, or no `languages` at all) or lists this language. */
export function topicMatchesLanguage(topic: Pick<LocalizableTopic, 'languages'>, language: string): boolean {
  const langs = topic.languages;
  if (!Array.isArray(langs) || langs.length === 0) return true;
  return langs.includes('all') || langs.includes(language);
}

/** The topic with its name/description in `language` when it has them. */
export function localizeTopic<T extends LocalizableTopic>(topic: T, language: string): T {
  const name = topic.localizedNames?.[language];
  const description = topic.localizedDescriptions?.[language];
  if (!name && !description) return topic;
  return { ...topic, name: name || topic.name, description: description || topic.description };
}

/** Topics for a language: drops locale-only topics for other locales, localizes the rest. Keeps the server's order. */
export function topicsForLanguage<T extends LocalizableTopic>(topics: readonly T[], language: string): T[] {
  return topics.filter((t) => topicMatchesLanguage(t, language)).map((t) => localizeTopic(t, language));
}
