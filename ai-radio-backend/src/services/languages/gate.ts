/**
 * The enable gate for an additional language: pure checks on a real episode (script text, spoken audio, speech-to-text transcript).
 * Used by src/scripts/language-gate.ts, which produces the episode through the production path (the same pipeline, speech client and
 * speech API the backend uses) and then calls these checks. A language passes only when ALL checks pass:
 *
 *   length      the script is long enough (a real paragraph, not a short test sentence)
 *   rate        spoken characters per second over the whole episode, and per script line, are in a human range (a voice that loops one
 *               character produces far more audio than the text needs, or far less)
 *   fidelity    character error rate between the script and the transcript stays under a limit
 *   words       the transcript has about as many words as the script (a loop or a drop changes the count)
 *   repetition  no token repeated back to back, no short phrase repeated back to back, no single token dominating the transcript
 */

export interface GateThresholds {
  minScriptChars: number;
  /** spoken characters per second, whole episode (spaces excluded) */
  rateMin: number; rateMax: number;
  /** per script line of at least lineMinChars characters */
  lineRateMin: number; lineRateMax: number; lineMinChars: number;
  maxCer: number;
  wordRatioMin: number; wordRatioMax: number;
  maxTokenRun: number; maxPhraseRepeats: number; maxTokenShare: number;
}

export const DEFAULT_THRESHOLDS: GateThresholds = {
  minScriptChars: 1200,
  rateMin: 8, rateMax: 24,
  lineRateMin: 5, lineRateMax: 32, lineMinChars: 60,
  maxCer: 0.3,
  wordRatioMin: 0.7, wordRatioMax: 1.4,
  maxTokenRun: 3, maxPhraseRepeats: 3, maxTokenShare: 0.12,
};

const SR_LATIN: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', ђ: 'd', е: 'e', ж: 'z', з: 'z', и: 'i', ј: 'j', к: 'k', л: 'l', љ: 'lj', м: 'm', н: 'n', њ: 'nj',
  о: 'o', п: 'p', р: 'r', с: 's', т: 't', ћ: 'c', у: 'u', ф: 'f', х: 'h', ц: 'c', ч: 'c', џ: 'dz', ш: 's',
};

/**
 * Lower-cases, removes punctuation and accents, and maps Serbian Cyrillic to Latin, so the script and the transcript compare on letters
 * only (speech-to-text may answer in either Serbian script, and drops or adds accents).
 */
export function normalizeForCompare(text: string): string {
  return text.toLowerCase()
    .replace(/[а-яђјљњћџ]/g, (c) => SR_LATIN[c] ?? c)
    .normalize('NFD').replace(/\p{M}+/gu, '')
    .replace(/đ/g, 'd').replace(/ł/g, 'l').replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/ß/g, 'ss')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ').replace(/\s+/g, ' ').trim();
}

export const tokens = (t: string): string[] => normalizeForCompare(t).split(' ').filter(Boolean);

/** Levenshtein distance over two arrays of comparable items (rolling rows). */
export function editDistance<T>(a: readonly T[], b: readonly T[]): number {
  if (a.length === 0) return b.length;
  if (b.length === 0) return a.length;
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Character error rate of `hyp` against `ref` after normalisation (spaces ignored). Capped at 1. */
export function cer(ref: string, hyp: string): number {
  const r = [...normalizeForCompare(ref).replace(/ /g, '')];
  const h = [...normalizeForCompare(hyp).replace(/ /g, '')];
  if (r.length === 0) return h.length === 0 ? 0 : 1;
  return Math.min(1, editDistance(r, h) / r.length);
}

export interface RepetitionReport { ok: boolean; longestTokenRun: { token: string; run: number }; worstPhrase: { phrase: string; repeats: number }; topTokenShare: { token: string; share: number }; reasons: string[] }

/** Back-to-back repetition in a transcript: the same token many times in a row, or the same 2 to 5 token phrase many times in a row. */
export function repetitionCheck(transcript: string, t: Pick<GateThresholds, 'maxTokenRun' | 'maxPhraseRepeats' | 'maxTokenShare'> = DEFAULT_THRESHOLDS): RepetitionReport {
  // Chinese, Thai and Japanese transcripts have no spaces: fall back to single characters for those
  const norm = normalizeForCompare(transcript);
  const words = norm.split(' ').filter(Boolean);
  const toks = words.length >= 20 || /\s/.test(norm) ? words : [...norm];
  let longest = { token: '', run: 0 };
  for (let i = 0; i < toks.length;) {
    let j = i; while (j < toks.length && toks[j] === toks[i]) j++;
    if (j - i > longest.run) longest = { token: toks[i], run: j - i };
    i = j;
  }
  let worst = { phrase: '', repeats: 1 };
  for (let n = 2; n <= 5; n++) {
    for (let i = 0; i + n * 2 <= toks.length; i++) {
      const unit = toks.slice(i, i + n).join(' ');
      let reps = 1;
      while (i + (reps + 1) * n <= toks.length && toks.slice(i + reps * n, i + (reps + 1) * n).join(' ') === unit) reps++;
      if (reps > worst.repeats) worst = { phrase: unit, repeats: reps };
    }
  }
  const freq = new Map<string, number>(); for (const w of toks) freq.set(w, (freq.get(w) ?? 0) + 1);
  let top = { token: '', share: 0 };
  // short function words are frequent in real speech: only tokens of 4+ letters count toward dominance
  if (toks.length >= 40) for (const [w, c] of freq) if ([...w].length >= 4 && c / toks.length > top.share) top = { token: w, share: c / toks.length };
  const reasons: string[] = [];
  if (longest.run > t.maxTokenRun) reasons.push(`token "${longest.token}" repeated ${longest.run} times in a row`);
  if (worst.repeats > t.maxPhraseRepeats) reasons.push(`phrase "${worst.phrase}" repeated ${worst.repeats} times in a row`);
  if (top.share > t.maxTokenShare) reasons.push(`token "${top.token}" is ${(top.share * 100).toFixed(0)}% of the transcript`);
  return { ok: reasons.length === 0, longestTokenRun: longest, worstPhrase: worst, topTokenShare: top, reasons };
}

export interface LineTiming { text: string; seconds: number }

const spoken = (s: string) => [...s.replace(/\s+/g, '')].length;

export interface GateInput { script: string; lines: LineTiming[]; totalSeconds: number; transcript: string }
export interface GateReport {
  ok: boolean;
  failures: string[];
  scriptChars: number; seconds: number; charsPerSecond: number;
  cer: number; wordRatio: number;
  slowLines: number[]; fastLines: number[];
  repetition: RepetitionReport;
}

export function evaluateGate(input: GateInput, th: GateThresholds = DEFAULT_THRESHOLDS): GateReport {
  const failures: string[] = [];
  const scriptChars = spoken(input.script);
  if (scriptChars < th.minScriptChars) failures.push(`script too short for a real test (${scriptChars} < ${th.minScriptChars} characters)`);
  const cps = input.totalSeconds > 0 ? scriptChars / input.totalSeconds : 0;
  if (!(cps >= th.rateMin && cps <= th.rateMax)) failures.push(`${cps.toFixed(1)} spoken characters per second is outside ${th.rateMin} to ${th.rateMax}`);
  const slow: number[] = []; const fast: number[] = [];
  input.lines.forEach((l, i) => {
    if (spoken(l.text) < th.lineMinChars || l.seconds <= 0) return;
    const r = spoken(l.text) / l.seconds;
    if (r < th.lineRateMin) slow.push(i + 1); else if (r > th.lineRateMax) fast.push(i + 1);
  });
  if (slow.length) failures.push(`script lines far longer in audio than their text needs (looping or long silence): ${slow.slice(0, 8).join(', ')}`);
  if (fast.length) failures.push(`script lines far shorter in audio than their text needs (dropped text): ${fast.slice(0, 8).join(', ')}`);
  const c = cer(input.script, input.transcript);
  if (c > th.maxCer) failures.push(`transcript differs from the script (CER ${c.toFixed(2)} > ${th.maxCer})`);
  const sw = tokens(input.script).length; const tw = tokens(input.transcript).length;
  const wr = sw > 0 ? tw / sw : 0;
  // languages written without spaces have 1 token per clause: compare characters instead
  const spaceless = sw < scriptChars / 12;
  const ratio = spaceless ? spoken(input.transcript) / Math.max(1, scriptChars) : wr;
  if (!(ratio >= th.wordRatioMin && ratio <= th.wordRatioMax)) failures.push(`transcript length is ${ratio.toFixed(2)}x the script (expected ${th.wordRatioMin} to ${th.wordRatioMax})`);
  const rep = repetitionCheck(input.transcript, th);
  failures.push(...rep.reasons);
  return { ok: failures.length === 0, failures, scriptChars, seconds: input.totalSeconds, charsPerSecond: cps, cer: c, wordRatio: ratio, slowLines: slow, fastLines: fast, repetition: rep };
}
