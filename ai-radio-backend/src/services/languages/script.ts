/**
 * Script generation for the additional languages: the prompt (native phrasing, numbers as words, names, sentence length), the digit
 * guard (a script with digits is sent back for ONE rewrite, then rejected) and the retry/parse loop.
 *
 * Why the digit rule: for these languages the speech engine does not read digits reliably (measured per language), so the script
 * itself must carry every number, year, percentage, time, ordinal and phone number as words, with the right grammatical case. The
 * guard is the safety net for a model that forgets.
 */
import { generateText as realGenerateText, type TextRequest, type TextResult } from '../../lib/llmText';
import { parseTopicScript, ScriptParseError, type ParsedSegment } from '../content/topic-script';
import { SOURCE_HANDLING_RULES, formatStoryLine } from '../content/source-guardrails';
import type { AggregatedStory, TopicDefinition } from '../../types/topics';
import type { ScriptSegment } from '../../types/database';
import type { LanguageSpec } from './registry';

export class ScriptRuleError extends Error {
  readonly code = 'script_rule';
  constructor(readonly rule: 'digits', message: string) { super(message); this.name = 'ScriptRuleError'; }
}

export interface DigitViolation { line: number; snippet: string }

const DIGIT_OR_SYMBOL = /[\p{Nd}%$€£¥#+=°№]/u;

/** Lines that contain a digit (any script) or a symbol the engine would read badly. Empty for languages whose engine normalises numbers. */
export function findDigitViolations(segments: ReadonlyArray<{ text: string }>, spec: LanguageSpec): DigitViolation[] {
  if (spec.ttsNormalize === 'numbers') return [];
  const out: DigitViolation[] = [];
  segments.forEach((s, i) => {
    const m = DIGIT_OR_SYMBOL.exec(s.text);
    if (m) out.push({ line: i + 1, snippet: s.text.slice(Math.max(0, m.index - 20), m.index + 25).replace(/\s+/g, ' ') });
  });
  return out;
}

export function numberRule(spec: LanguageSpec): string {
  return `NUMBERS (the voice cannot read digits in ${spec.name}): write EVERY number as words in ${spec.name}, in the correct grammatical case: counts, years, dates, times, ordinals, percentages (including decimals such as "twelve point five percent"), money, units, scores and phone numbers. The dialogue must contain NO digit characters at all and none of the symbols % $ € £ ¥ # + = °. Spell acronyms and product names the way they are spoken. Never produce numeric codes or long identifiers.`;
}

function nameRule(spec: LanguageSpec): string {
  return spec.transliterate
    ? `NAMES: write foreign names, brands and acronyms in ${spec.name}'s own writing system, the way a ${spec.name} newsreader says them. Do not leave Latin letters in the dialogue.`
    : `NAMES: keep foreign names and brands as they are normally written in ${spec.name}, with the local grammatical endings where ${spec.name} uses them.`;
}

export function buildSystemPrompt(topic: TopicDefinition, spec: LanguageSpec, sourceLanguage: 'native' | 'english', displayName: string): string {
  const [h1, h2] = spec.hosts;
  const sources = sourceLanguage === 'native'
    ? `SOURCES: the stories below are current headlines in ${spec.name} with the outlet in brackets. Say only what the headlines and short summaries support. Paraphrase in your own words, name the outlet on air for a story ("according to ..."), quote at most a short phrase with attribution, do not invent facts, numbers or quotes, do not read out URLs.`
    : `SOURCES: the stories below are in English. Retell them in natural ${spec.name}, in your own words, as if reporting for ${spec.name}-speaking listeners. Do not read English titles aloud. Name the outlet when one is given, do not invent facts, numbers or quotes, do not read out URLs.`;
  return `You are a professional podcast script writer. Create a short daily briefing about ${displayName} for listeners who speak ${spec.name}.

HOSTS: host1 is ${h1} (a woman), upbeat and conversational, who drives the discussion. host2 is ${h2} (a man), thoughtful, who adds context. They may address each other by first name.

LANGUAGE: write ALL dialogue in ${spec.name} (${spec.nativeName}) as native speakers talk on a radio show: natural spoken register, short sentences, no word-for-word translation from English, no English filler words. SENTENCES: one idea per sentence, each sentence at most ${spec.sentenceCap} characters.
${numberRule(spec)}
${nameRule(spec)}

GUIDELINES:
1. Natural dialogue between the two hosts, alternating.
2. Cover 4-6 of the most important stories with smooth transitions.
3. Keep total runtime to about ${topic.targetDurationMinutes} minutes.
4. ${topic.promptContext}
5. Be neutral and factual on politics and conflicts; no opinions, no advice (no medical, legal or financial advice).

${sources}${sourceLanguage === 'native' ? '' : `\n\n${SOURCE_HANDLING_RULES}`}

FORMAT: return ONLY a JSON array of segments, no markdown:
[{"speaker": "host1", "text": "...", "type": "intro"}, {"speaker": "host2", "text": "...", "type": "intro"}, ...]
speaker is exactly "host1" or "host2". VALID TYPES: intro, news, outro (use "news" for all content segments).`;
}

export function buildUserPrompt(topic: TopicDefinition, spec: LanguageSpec, stories: readonly AggregatedStory[], dateLabel: string): string {
  const list = stories.slice(0, 10).map((s, i) => formatStoryLine(s, i)).join('\n');
  return `Create today's ${topic.name} podcast for ${dateLabel}. Write the ENTIRE script in ${spec.name}, with every number written as words.

TOP STORIES:
${list}

Create an engaging ${topic.targetDurationMinutes}-minute podcast covering the most important 4-6 stories. Return ONLY valid JSON.`;
}

export function rewritePrompt(spec: LanguageSpec, previous: string, violations: DigitViolation[]): string {
  const where = violations.slice(0, 8).map((v) => `line ${v.line}: "${v.snippet}"`).join('\n');
  return `Your script contains digits or symbols that the voice cannot read:\n${where}\n\nRewrite the COMPLETE script with the same content, but with every number, year, date, time, percentage, ordinal and symbol written as words in ${spec.name}, in the correct grammatical case. No digit characters and none of % $ € £ ¥ # + = ° anywhere. Return ONLY the JSON array.\n\nSCRIPT:\n${previous.slice(0, 20_000)}`;
}

export interface ScriptDeps {
  generate?: (req: TextRequest) => Promise<TextResult>;
  log?: (m: string) => void;
}

export interface ScriptInput {
  topic: TopicDefinition;
  spec: LanguageSpec;
  stories: readonly AggregatedStory[];
  sourceLanguage: 'native' | 'english';
  /** YYYY-MM-DD */
  date: string;
  displayName?: string;
}

export interface ScriptOutput { segments: ScriptSegment[]; calls: number; rewrote: boolean; model?: string }

export function formatDateFor(spec: LanguageSpec, date: string): string {
  try {
    return new Date(`${date}T12:00:00Z`).toLocaleDateString(spec.dateLocale, { weekday: 'long', month: 'long', day: 'numeric', timeZone: 'UTC' });
  } catch { return date; }
}

export async function generateNewLanguageScript(input: ScriptInput, deps: ScriptDeps = {}): Promise<ScriptOutput> {
  const gen = deps.generate ?? ((r: TextRequest) => realGenerateText(r));
  const log = deps.log ?? ((m: string) => console.warn(m));
  const { topic, spec } = input;
  const system = buildSystemPrompt(topic, spec, input.sourceLanguage, input.displayName ?? topic.name);
  const user = buildUserPrompt(topic, spec, input.stories, formatDateFor(spec, input.date));
  const minChars = Math.round(topic.targetDurationMinutes * 150);
  const base = { feature: 'topic_script', system, maxTokens: spec.maxTokens, temperature: 0.7, anthropicModel: 'claude-sonnet-4-6', preferFallbackModel: spec.preferLargeModel } as const;

  let calls = 0; let parsed: ParsedSegment[] | undefined; let raw = ''; let model: string | undefined;
  for (let attempt = 1; attempt <= 2; attempt++) {
    const res = await gen({ ...base, user: attempt === 1 ? user : `${user}\n\nYour previous reply could not be used. Reply with ONLY the JSON array of segments: no markdown, no commentary, and write the full-length script.` });
    calls++; raw = res.text; model = res.model;
    try { parsed = parseTopicScript(res.text, minChars); break; } catch (e) {
      if (!(e instanceof ScriptParseError) || attempt === 2) throw e;
      log(`[languages] ${spec.code} script reply unusable (${e.reason}), retrying once`);
    }
  }

  let violations = findDigitViolations(parsed!, spec);
  let rewrote = false;
  if (violations.length > 0) {
    log(`[languages] ${spec.code} script has digits in ${violations.length} line(s), asking for one rewrite`);
    rewrote = true;
    const res = await gen({ ...base, user: rewritePrompt(spec, raw, violations) });
    calls++; model = res.model;
    parsed = parseTopicScript(res.text, minChars); // a rewrite that cannot be parsed fails the episode
    violations = findDigitViolations(parsed, spec);
    if (violations.length > 0) throw new ScriptRuleError('digits', `Script still has digits after one rewrite (${violations.length} line(s))`);
  }
  const segments: ScriptSegment[] = parsed!.map((seg, i) => ({ sequence: i + 1, speaker: seg.speaker, text: seg.text, type: seg.type }));
  return { segments, calls, rewrote, model };
}
