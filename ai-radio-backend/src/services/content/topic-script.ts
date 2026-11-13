/**
 * Parses the model's reply to the topic-podcast prompt into the segment structure the TTS and the app use
 * ({ speaker: 'host1' | 'host2', text, type }). Tolerant of what cheaper models do (code fences, a wrapping object, alias keys, speaker
 * names instead of ids, trailing commas, a reply cut off at max_tokens) but strict about what matters: enough spoken text, two voices.
 * Pure: no env, no network.
 */
import { extractJson } from '../../lib/tolerantJson';
import type { ScriptSegment } from '../../types/database';

export class ScriptParseError extends Error {
  constructor(readonly reason: 'no_json' | 'bad_shape' | 'too_few_segments' | 'too_short', message: string) {
    super(message);
    this.name = 'ScriptParseError';
  }
}

const VALID_TYPES = new Set<ScriptSegment['type']>(['intro', 'calendar', 'email', 'news', 'weather', 'teaser', 'outro', 'pause']);
export const MIN_SEGMENTS = 4;

export interface ParsedSegment { speaker: 'host1' | 'host2'; text: string; type: ScriptSegment['type'] }

const LIST_KEYS = ['segments', 'script', 'dialogue', 'dialog', 'lines', 'transcript'];
const TEXT_KEYS = ['text', 'line', 'content', 'dialogue', 'message'];

function listFrom(value: unknown): unknown[] | null {
  if (Array.isArray(value)) return value;
  if (value && typeof value === 'object') {
    for (const k of LIST_KEYS) { const v = (value as Record<string, unknown>)[k]; if (Array.isArray(v)) return v; }
  }
  return null;
}

function speakerOf(raw: unknown): 'host1' | 'host2' | null {
  const s = String(raw ?? '').trim().toLowerCase().replace(/[\s_-]+/g, '');
  if (/^(host)?1$/.test(s) || s.startsWith('host1') || s.startsWith('alex') || s === 'a') return 'host1';
  if (/^(host)?2$/.test(s) || s.startsWith('host2') || s.startsWith('jordan') || s === 'j') return 'host2';
  return null;
}

/**
 * @param minChars reject replies with fewer spoken characters than this (a model that answers with a two-line stub must be retried, not
 *   aired). Characters, not words, so Japanese and Chinese scripts (no spaces) are measured fairly.
 */
export function parseTopicScript(raw: string, minChars = 0): ParsedSegment[] {
  const found = extractJson(raw);
  if (!found) throw new ScriptParseError('no_json', 'Failed to parse script JSON');
  const list = listFrom(found.value);
  if (!list) throw new ScriptParseError('bad_shape', 'Failed to parse script: JSON has no segment list');

  const out: ParsedSegment[] = [];
  for (const item of list) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    const textKey = TEXT_KEYS.find((k) => typeof o[k] === 'string' && (o[k] as string).trim() !== '');
    if (!textKey) continue;
    const text = (o[textKey] as string).replace(/\s+/g, ' ').trim();
    // unknown or missing speaker: the other voice from the previous line, so the dialogue still alternates
    const speaker = speakerOf(o.speaker ?? o.host ?? o.name) ?? (out.length && out[out.length - 1].speaker === 'host1' ? 'host2' : 'host1');
    const t = String(o.type ?? '').trim().toLowerCase() as ScriptSegment['type'];
    out.push({ speaker, text, type: VALID_TYPES.has(t) ? t : 'news' });
  }
  if (out.length < MIN_SEGMENTS) throw new ScriptParseError('too_few_segments', `Failed to parse script: only ${out.length} usable segments`);
  const chars = out.reduce((n, s) => n + s.text.length, 0);
  if (chars < minChars) throw new ScriptParseError('too_short', `Failed to parse script: only ${chars} characters (need ${minChars})`);
  return out;
}
