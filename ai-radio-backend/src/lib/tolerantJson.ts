/**
 * Pulls one JSON value out of a model reply that may wrap it in prose, a code fence or a <think> block, leave trailing commas, or be
 * cut off by max_tokens. Pure and dependency-free.
 *
 * It never invents content: a truncated ARRAY keeps only the elements that were completed; a truncated object is rejected.
 */

const THINK = /<think(?:ing)?>[\s\S]*?<\/think(?:ing)?>/gi;
const FENCE = /```(?:json|JSON)?\s*([\s\S]*?)```/;

export interface ExtractedJson { value: unknown; repaired: boolean; truncated: boolean }

/** End (inclusive index) of the balanced value starting at `start`, plus the end of the last completed element for arrays. */
function scan(s: string, start: number): { end: number; lastElementEnd: number } {
  const open = s[start];
  const close = open === '[' ? ']' : '}';
  let depth = 0; let inStr = false; let esc = false; let lastElementEnd = -1;
  for (let i = start; i < s.length; i++) {
    const c = s[i];
    if (inStr) {
      if (esc) esc = false; else if (c === '\\') esc = true; else if (c === '"') inStr = false;
      continue;
    }
    if (c === '"') { inStr = true; continue; }
    if (c === '[' || c === '{') depth++;
    else if (c === ']' || c === '}') {
      depth--;
      if (depth === 1 && open === '[') lastElementEnd = i; // an element of the top-level array just closed
      if (depth === 0) return { end: c === close ? i : -1, lastElementEnd };
    }
  }
  return { end: -1, lastElementEnd };
}

const cleanup = (s: string) => s.replace(/,\s*([}\]])/g, '$1');

function tryParse(s: string): { ok: true; value: unknown; repaired: boolean } | { ok: false } {
  try { return { ok: true, value: JSON.parse(s), repaired: false }; } catch { /* repair below */ }
  try { return { ok: true, value: JSON.parse(cleanup(s)), repaired: true }; } catch { return { ok: false }; }
}

/**
 * Returns the left-most JSON value in the reply (an object or a non-scalar array). The caller decides what shape it needs: a segment
 * list may come bare or wrapped in an object, so both are returned as found.
 */
export function extractJson(raw: string): ExtractedJson | null {
  if (typeof raw !== 'string') return null;
  let text = raw.replace(THINK, '').trim();
  const fenced = FENCE.exec(text);
  if (fenced && /[[{]/.test(fenced[1])) text = fenced[1].trim();
  for (let from = text.search(/[[{]/); from !== -1 && from < text.length; from = nextOpen(text, from + 1)) {
    const ch = text[from];
    const { end, lastElementEnd } = scan(text, from);
    if (end !== -1) {
      const r = tryParse(text.slice(from, end + 1));
      if (!r.ok || typeof r.value !== 'object' || r.value === null) continue;
      // a tiny scalar array such as "[1]" in prose is not the payload we are looking for
      if (Array.isArray(r.value) && r.value.length > 0 && r.value.every((v) => typeof v !== 'object')) continue;
      return { value: r.value, repaired: r.repaired, truncated: false };
    }
    // ran off the end: the reply was cut off. Keep the completed elements of an array; never descend into a cut-off object.
    if (ch === '[' && lastElementEnd > from) {
      const r = tryParse(`${text.slice(from, lastElementEnd + 1)}]`);
      if (r.ok && Array.isArray(r.value) && r.value.length > 0) return { value: r.value, repaired: true, truncated: true };
    }
    return null;
  }
  return null;
}

function nextOpen(text: string, from: number): number {
  const rest = text.slice(from).search(/[[{]/);
  return rest === -1 ? -1 : from + rest;
}
