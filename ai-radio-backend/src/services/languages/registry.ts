/**
 * The 25 additional podcast languages (on-demand only, behind per-language database flags, default OFF).
 * Waves 1 and 2 are the first 14 (cs ro sv nl pl ru uk hu fi tr id el ja hi); wave 3 is the 11 ReadAloud Studio languages (ar ca hr ms no sk sl sr th vi zh).
 * da (Danish) is deliberately NOT here: the speech API has no Danish voice and Google News has no Danish edition.
 *
 * The five Piper languages (de es fr it pt) are NOT here: they keep their own path (tts/piper-languages.ts).
 * Everything about a new language that is code rather than data lives in this one table: its name for the script prompt, the Google
 * News edition, the host names, whether the speech engine normalises digits, the sentence size for TTS requests.
 * Enabling, the daily cap and the voice are DATA (table language_flags), so flipping a language needs no deploy.
 */

export type NewLanguage =
  | 'cs' | 'ro' | 'sv' | 'nl' | 'pl' | 'ru' | 'uk' | 'hu' | 'fi' | 'tr' | 'id' | 'el' | 'ja' | 'hi'
  | 'ar' | 'ca' | 'hr' | 'ms' | 'no' | 'sk' | 'sl' | 'sr' | 'th' | 'vi' | 'zh';

export interface LanguageSpec {
  code: NewLanguage;
  /** English name, used inside the script prompt. */
  name: string;
  /** Name in the language itself, shown in the picker. */
  nativeName: string;
  /** 1 = first wave, 2 = second wave (thinner evidence), 3 = the ReadAloud Studio languages. Informational: flags decide what is on. */
  wave: 1 | 2 | 3;
  /**
   * Google News edition query (hl, gl, ceid) for the section feeds. Empty string = Google News has NO edition in this language
   * (hr: every hl=hr request answers the US English edition), so only PUBLISHER_FEEDS are used and other topics retell the English sources.
   */
  edition: string;
  /** BCP 47 locale for dates in episode titles. */
  dateLocale: string;
  /**
   * Number-reading policy for the speech request (measured by the engine owner, round trip per language):
   *   'numbers'            send normalize:'numbers' (not used by any language in this table today)
   *   'numbers_devanagari' send normalize:'numbers' only when the text contains Devanagari digits (hi)
   *   null                 never send normalize; the script itself spells every number as words
   * de fr it es are single-language Piper voices outside this table. ja and ru measured WORSE with normalize: never send it.
   * A script for a language WITHOUT 'numbers' policy is rejected once if it contains any digit, and rewritten.
   */
  ttsNormalize: 'numbers' | 'numbers_devanagari' | null;
  /** Native script is not Latin: foreign names must be transliterated in the prompt. */
  transliterate: boolean;
  /** Longest sentence the script prompt allows, and the longest piece sent to the TTS in one request (characters). */
  sentenceCap: number;
  /** Female host (host1) and male host (host2) first names, in the language's own script. */
  hosts: [string, string];
  /** max_tokens for the script: scripts in non-Latin or highly inflected languages need more tokens than English. */
  maxTokens: number;
  /** Use the larger fallback model first (smaller training share). */
  preferLargeModel: boolean;
  /** Flag emoji for the picker, or null when the language has no single-country flag. Public API field `flag`. */
  flag: string | null;
  /** Text direction. Public API field `dir`. */
  dir: 'ltr' | 'rtl';
  /** Tag of the app's matching interface language, when the app has one (Android UiLanguage tags). Public API field `uiTag`. */
  uiTag?: string;
}

const SPECS: LanguageSpec[] = [
  { code: 'cs', name: 'Czech', nativeName: 'Čeština', wave: 1, edition: 'hl=cs&gl=CZ&ceid=CZ:cs', dateLocale: 'cs-CZ', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Tereza', 'Jakub'], maxTokens: 4000, preferLargeModel: true, flag: '🇨🇿', dir: 'ltr', uiTag: 'cs' },
  { code: 'ro', name: 'Romanian', nativeName: 'Română', wave: 1, edition: 'hl=ro&gl=RO&ceid=RO:ro', dateLocale: 'ro-RO', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Ioana', 'Andrei'], maxTokens: 4000, preferLargeModel: true, flag: '🇷🇴', dir: 'ltr', uiTag: 'ro' },
  { code: 'sv', name: 'Swedish', nativeName: 'Svenska', wave: 1, edition: 'hl=sv&gl=SE&ceid=SE:sv', dateLocale: 'sv-SE', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Elin', 'Johan'], maxTokens: 3500, preferLargeModel: false, flag: '🇸🇪', dir: 'ltr', uiTag: 'sv' },
  { code: 'nl', name: 'Dutch', nativeName: 'Nederlands', wave: 1, edition: 'hl=nl&gl=NL&ceid=NL:nl', dateLocale: 'nl-NL', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Sanne', 'Daan'], maxTokens: 3500, preferLargeModel: false, flag: '🇳🇱', dir: 'ltr', uiTag: 'nl' },
  { code: 'pl', name: 'Polish', nativeName: 'Polski', wave: 1, edition: 'hl=pl&gl=PL&ceid=PL:pl', dateLocale: 'pl-PL', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Kasia', 'Marek'], maxTokens: 4000, preferLargeModel: false, flag: '🇵🇱', dir: 'ltr', uiTag: 'pl' },
  { code: 'ru', name: 'Russian', nativeName: 'Русский', wave: 1, edition: 'hl=ru&gl=RU&ceid=RU:ru', dateLocale: 'ru-RU', ttsNormalize: null, transliterate: true, sentenceCap: 170, hosts: ['Анна', 'Дмитрий'], maxTokens: 5000, preferLargeModel: false, flag: '🇷🇺', dir: 'ltr', uiTag: 'ru' },
  { code: 'uk', name: 'Ukrainian', nativeName: 'Українська', wave: 1, edition: 'hl=uk&gl=UA&ceid=UA:uk', dateLocale: 'uk-UA', ttsNormalize: null, transliterate: true, sentenceCap: 170, hosts: ['Олена', 'Тарас'], maxTokens: 5000, preferLargeModel: true, flag: '🇺🇦', dir: 'ltr', uiTag: 'uk' },
  { code: 'hu', name: 'Hungarian', nativeName: 'Magyar', wave: 1, edition: 'hl=hu&gl=HU&ceid=HU:hu', dateLocale: 'hu-HU', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Réka', 'Bence'], maxTokens: 4000, preferLargeModel: true, flag: '🇭🇺', dir: 'ltr', uiTag: 'hu' },
  { code: 'fi', name: 'Finnish', nativeName: 'Suomi', wave: 2, edition: 'hl=fi&gl=FI&ceid=FI:fi', dateLocale: 'fi-FI', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Aino', 'Mikko'], maxTokens: 4000, preferLargeModel: true, flag: '🇫🇮', dir: 'ltr', uiTag: 'fi' },
  { code: 'tr', name: 'Turkish', nativeName: 'Türkçe', wave: 2, edition: 'hl=tr&gl=TR&ceid=TR:tr', dateLocale: 'tr-TR', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Elif', 'Emre'], maxTokens: 4000, preferLargeModel: false, flag: '🇹🇷', dir: 'ltr', uiTag: 'tr' },
  { code: 'id', name: 'Indonesian', nativeName: 'Bahasa Indonesia', wave: 2, edition: 'hl=id&gl=ID&ceid=ID:id', dateLocale: 'id-ID', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Sari', 'Budi'], maxTokens: 3500, preferLargeModel: false, flag: '🇮🇩', dir: 'ltr', uiTag: 'id' },
  { code: 'el', name: 'Greek', nativeName: 'Ελληνικά', wave: 2, edition: 'hl=el&gl=GR&ceid=GR:el', dateLocale: 'el-GR', ttsNormalize: null, transliterate: true, sentenceCap: 170, hosts: ['Ελένη', 'Νίκος'], maxTokens: 5000, preferLargeModel: true, flag: '🇬🇷', dir: 'ltr', uiTag: 'el' },
  { code: 'ja', name: 'Japanese', nativeName: '日本語', wave: 2, edition: 'hl=ja&gl=JP&ceid=JP:ja', dateLocale: 'ja-JP', ttsNormalize: null, transliterate: true, sentenceCap: 90, hosts: ['ゆい', 'はると'], maxTokens: 5000, preferLargeModel: false, flag: '🇯🇵', dir: 'ltr', uiTag: 'ja' },
  { code: 'hi', name: 'Hindi', nativeName: 'हिन्दी', wave: 2, edition: 'hl=hi&gl=IN&ceid=IN:hi', dateLocale: 'hi-IN', ttsNormalize: 'numbers_devanagari', transliterate: true, sentenceCap: 170, hosts: ['प्रिया', 'अर्जुन'], maxTokens: 5000, preferLargeModel: false, flag: '🇮🇳', dir: 'ltr', uiTag: 'hi' },
  // Wave 3: ReadAloud Studio voices (mira / remy), reached through the public REST route POST /v1/text-to-speech. Machine-gated only; Beta.
  { code: 'ar', name: 'Arabic', nativeName: 'العربية', wave: 3, edition: 'hl=ar&gl=SA&ceid=SA:ar', dateLocale: 'ar-EG', ttsNormalize: null, transliterate: true, sentenceCap: 140, hosts: ['ليلى', 'عمر'], maxTokens: 5000, preferLargeModel: true, flag: null, dir: 'rtl', uiTag: 'ar' },
  { code: 'ca', name: 'Catalan', nativeName: 'Català', wave: 3, edition: 'hl=ca&gl=ES&ceid=ES:ca', dateLocale: 'ca-ES', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Laia', 'Jordi'], maxTokens: 4000, preferLargeModel: true, flag: null, dir: 'ltr' },
  { code: 'hr', name: 'Croatian', nativeName: 'Hrvatski', wave: 3, edition: '', dateLocale: 'hr-HR', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Ana', 'Ivan'], maxTokens: 4000, preferLargeModel: true, flag: '🇭🇷', dir: 'ltr' },
  { code: 'ms', name: 'Malay', nativeName: 'Bahasa Melayu', wave: 3, edition: 'hl=ms&gl=MY&ceid=MY:ms', dateLocale: 'ms-MY', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Aisyah', 'Hafiz'], maxTokens: 3500, preferLargeModel: false, flag: '🇲🇾', dir: 'ltr', uiTag: 'ms' },
  { code: 'no', name: 'Norwegian (Bokmål)', nativeName: 'Norsk', wave: 3, edition: 'hl=no&gl=NO&ceid=NO:no', dateLocale: 'nb-NO', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Ingrid', 'Henrik'], maxTokens: 3500, preferLargeModel: true, flag: '🇳🇴', dir: 'ltr' },
  { code: 'sk', name: 'Slovak', nativeName: 'Slovenčina', wave: 3, edition: 'hl=sk&gl=SK&ceid=SK:sk', dateLocale: 'sk-SK', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Lucia', 'Martin'], maxTokens: 4000, preferLargeModel: true, flag: '🇸🇰', dir: 'ltr' },
  { code: 'sl', name: 'Slovenian', nativeName: 'Slovenščina', wave: 3, edition: 'hl=sl&gl=SI&ceid=SI:sl', dateLocale: 'sl-SI', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Maja', 'Luka'], maxTokens: 4000, preferLargeModel: true, flag: '🇸🇮', dir: 'ltr' },
  // Serbian is written in the Latin script (what Google News and most outlets return for hl=sr); the voice is checked on that script.
  { code: 'sr', name: 'Serbian (Latin script)', nativeName: 'Srpski', wave: 3, edition: 'hl=sr&gl=RS&ceid=RS:sr', dateLocale: 'sr-Latn-RS', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Jelena', 'Marko'], maxTokens: 4000, preferLargeModel: true, flag: '🇷🇸', dir: 'ltr' },
  // Thai has no spaces between words: splitSpeech cuts at word boundaries (Intl.Segmenter), never mid-word.
  { code: 'th', name: 'Thai', nativeName: 'ไทย', wave: 3, edition: 'hl=th&gl=TH&ceid=TH:th', dateLocale: 'th-TH-u-ca-gregory', ttsNormalize: null, transliterate: true, sentenceCap: 100, hosts: ['ฝน', 'กวิน'], maxTokens: 5000, preferLargeModel: true, flag: '🇹🇭', dir: 'ltr', uiTag: 'th' },
  { code: 'vi', name: 'Vietnamese', nativeName: 'Tiếng Việt', wave: 3, edition: 'hl=vi&gl=VN&ceid=VN:vi', dateLocale: 'vi-VN', ttsNormalize: null, transliterate: false, sentenceCap: 170, hosts: ['Linh', 'Minh'], maxTokens: 4000, preferLargeModel: true, flag: '🇻🇳', dir: 'ltr', uiTag: 'vi' },
  // Simplified Chinese (Mandarin).
  { code: 'zh', name: 'Chinese (Simplified, Mandarin)', nativeName: '中文', wave: 3, edition: 'hl=zh-CN&gl=CN&ceid=CN:zh-Hans', dateLocale: 'zh-CN', ttsNormalize: null, transliterate: true, sentenceCap: 90, hosts: ['小雅', '子轩'], maxTokens: 4000, preferLargeModel: true, flag: '🇨🇳', dir: 'ltr', uiTag: 'zh-CN' },
];

export const NEW_LANGUAGES: readonly LanguageSpec[] = SPECS;
const BY_CODE = new Map<string, LanguageSpec>(SPECS.map((s) => [s.code, s]));

export const isNewLanguage = (code: string): code is NewLanguage => BY_CODE.has((code ?? '').toLowerCase());

export function getLanguageSpec(code: string): LanguageSpec | undefined {
  return BY_CODE.get((code ?? '').toLowerCase());
}

/** Unknown languages fail loudly: the old getLanguageName fell back to "English" and produced an English script read by a foreign voice. */
export function requireLanguageSpec(code: string): LanguageSpec {
  const s = getLanguageSpec(code);
  if (!s) throw new Error(`No language spec for "${code}"`);
  return s;
}

/**
 * The 12 topics offered in every new language (ids in the topics table). Everything else stays hidden for these languages.
 * `native` topics are built from that country's news; `translate` topics are format shows or global subjects retold from the English
 * sources, because Google News has no section for them.
 */
export interface LaunchTopic {
  id: string;
  mode: 'native' | 'translate';
  /** Google News topic sections tried in order (WORLD, NATION, BUSINESS, TECHNOLOGY, SCIENCE, HEALTH, ENTERTAINMENT, SPORTS). */
  sections?: string[];
  /** Publisher feeds (see sources.ts PUBLISHER_FEEDS) are used first for these general-news topics. */
  publisherFirst?: boolean;
  /** Headlines containing one of these (case-insensitive) are ranked first. Ranking only: nothing is dropped. */
  prefer?: string[];
}

export const LAUNCH_TOPICS: readonly LaunchTopic[] = [
  { id: 'world-update', mode: 'native', sections: ['WORLD'], publisherFirst: true },
  { id: 'daily-news', mode: 'native', sections: ['NATION'], publisherFirst: true },
  { id: 'tech-news', mode: 'native', sections: ['TECHNOLOGY'] },
  { id: 'science-discoveries', mode: 'native', sections: ['SCIENCE'] },
  { id: 'space-nasa', mode: 'native', sections: ['SCIENCE'], prefer: ['nasa', 'esa', 'spacex', 'mars', 'moon', 'rocket', 'satellite'] },
  { id: 'health-wellness', mode: 'native', sections: ['HEALTH'] },
  { id: 'markets-finance', mode: 'native', sections: ['BUSINESS'] },
  { id: 'sports-roundup', mode: 'native', sections: ['SPORTS'] },
  { id: 'gaming', mode: 'translate' },
  { id: 'ai-ml', mode: 'native', sections: ['TECHNOLOGY'], prefer: ['ai', 'a.i.', 'gpt', 'openai', 'chatgpt', 'llm', 'nvidia', 'gemini', 'claude', 'anthropic'] },
  { id: 'eli5', mode: 'translate' },
  { id: 'simulate-this', mode: 'translate' },
];

const LAUNCH_BY_ID = new Map(LAUNCH_TOPICS.map((t) => [t.id, t]));
export const launchTopic = (topicId: string): LaunchTopic | undefined => LAUNCH_BY_ID.get(topicId);
export const isLaunchTopic = (topicId: string): boolean => LAUNCH_BY_ID.has(topicId);
