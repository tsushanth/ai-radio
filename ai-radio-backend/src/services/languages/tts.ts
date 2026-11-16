/**
 * Speech for the additional languages: the ReadAloud API (https://api.readaloudai.org), a dedicated key from READALOUD_API_KEY.
 *
 *   native route   POST /v1/text-to-speech                    {text, voice, language_code, format:'pcm_24000', normalize?}
 *   mp3 route      POST /v1/text-to-speech/{voice}?output_format=mp3_44100_128   {text, language_code, normalize?}
 *
 * Facts the code is built around (measured by the engine owner, not guessed):
 *   - no per-key caps exist: Audexa enforces its own quotas (controls.ts) and counts the characters it actually sends, one count per
 *     HTTP attempt (a retry counts again);
 *   - at most 2 requests in flight; at most 5000 characters per request (413 above): we send sentence-sized pieces (170 characters,
 *     90 for Japanese), which also makes a retry cheap;
 *   - roughly 0.25x real time (an 80 s piece takes about 20 s): per-request timeout 150 s, up to 3 retries (3 s, 9 s, 21 s) on 502 / 503 / 429 / network error;
 *   - HTTP 402 = the account is out of credits: never retried; generation is paused (onOutOfCredits) and the episode fails with
 *     TtsUnavailableError so the request path answers "paused";
 *   - a missing key fails closed before any text is sent;
 *   - normalize is NOT sent blindly: only languages whose registry policy says so (hi, and only when the text has Devanagari digits).
 *
 * Default (LANG_TTS_FORMAT=pcm): each piece is fetched as 24 kHz PCM, equalised to a common level, joined with short gaps, and the
 * whole episode is encoded ONCE to a loudness-normalised MP3 by the PR audio pipeline (finalizeEpisodeAudio). That avoids joining
 * separately encoded MP3 files and keeps one lossy generation.
 * LANG_TTS_FORMAT=mp3 stores the mp3 route's output directly (pieces concatenated, ID3 headers stripped): no ffmpeg needed, no level
 * equalisation across pieces. It is the fallback when the encoder is unavailable.
 */
import type { AudioSegment } from '../../types/podcast';
import type { PodcastScript, ScriptSegment } from '../../types/database';
import { pcmToWav, PIPER_SAMPLE_RATE } from '../tts/piper.client';
import { concatenateBuffers } from '../tts/audio.utils';
import { normalizeWavRms, readWavInfo } from '../audio/episode-audio';
import { requireLanguageSpec, type LanguageSpec } from './registry';
import type { FlagRow } from './controls.store';

export const READALOUD_MAX_CHARS = 5000;
/** Up to 4 attempts per piece, waiting 3 s, 9 s, 21 s: the API answered 503 for single pieces under load on the first live run (2 of 17 pieces with one retry). */
const MAX_ATTEMPTS = 4;
const RETRY_BACKOFF = [1, 3, 7];
export const DEFAULT_BASE_URL = 'https://api.readaloudai.org';

export type TtsUnavailableReason = 'no_key' | 'out_of_credits' | 'failed';
export class TtsUnavailableError extends Error {
  readonly code = 'tts_unavailable';
  constructor(readonly reason: TtsUnavailableReason, message?: string) {
    super(message ?? (reason === 'no_key' ? 'READALOUD_API_KEY is not set' : reason === 'out_of_credits' ? 'The speech account is out of credits' : 'Speech is unavailable'));
    this.name = 'TtsUnavailableError';
  }
}
export const isTtsUnavailable = (e: unknown): e is TtsUnavailableError => e instanceof TtsUnavailableError || (e as { code?: string } | null)?.code === 'tts_unavailable';

export type TtsFormat = 'pcm' | 'mp3';

export interface ReadAloudOptions {
  baseUrl?: string;
  /** Read per call so a secret set after boot is picked up; never logged. */
  apiKey?: () => string | undefined;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  format?: TtsFormat;
  timeoutMs?: number;
  retryDelayMs?: number;
  maxConcurrent?: number;
  /** Called before EVERY HTTP attempt with the character count. May throw (breaker tripped): the attempt is not made. */
  onChars?: (chars: number) => Promise<void>;
  /** Called once when the API answers 402. */
  onOutOfCredits?: () => void | Promise<void>;
}

export interface SpeechRequest { text: string; voice: string; language: string; normalize?: 'numbers' }
export interface SpeechResult { audio: Buffer; format: TtsFormat }

class Semaphore {
  private active = 0;
  private waiters: Array<() => void> = [];
  constructor(private readonly max: number) {}
  async run<T>(fn: () => Promise<T>): Promise<T> {
    if (this.active >= this.max) await new Promise<void>((r) => this.waiters.push(r));
    this.active++;
    try { return await fn(); } finally { this.active--; this.waiters.shift()?.(); }
  }
}

/** At most 2 speech requests in flight for the whole process, however many episodes are being spoken. */
const SHARED_SEMAPHORE = new Semaphore(2);

export class ReadAloudClient {
  private readonly base: string;
  private readonly sem: Semaphore;
  private creditsGone = false;
  constructor(private readonly o: ReadAloudOptions = {}) {
    this.base = (o.baseUrl ?? process.env.READALOUD_API_URL ?? DEFAULT_BASE_URL).replace(/\/+$/, '');
    this.sem = o.maxConcurrent === undefined ? SHARED_SEMAPHORE : new Semaphore(Math.max(1, Math.min(2, o.maxConcurrent)));
  }
  get format(): TtsFormat { return this.o.format ?? (process.env.LANG_TTS_FORMAT === 'mp3' ? 'mp3' : 'pcm'); }
  private key(): string | undefined { return (this.o.apiKey ? this.o.apiKey() : process.env.READALOUD_API_KEY)?.trim() || undefined; }
  isConfigured(): boolean { return !!this.key(); }

  async synthesize(req: SpeechRequest): Promise<SpeechResult> {
    const key = this.key();
    if (!key) throw new TtsUnavailableError('no_key');
    if (this.creditsGone) throw new TtsUnavailableError('out_of_credits');
    if (!req.text.trim()) throw new Error('empty speech text');
    if (req.text.length > READALOUD_MAX_CHARS) throw new Error(`speech text over ${READALOUD_MAX_CHARS} characters`);
    return this.sem.run(() => this.withRetry(req, key));
  }

  private async withRetry(req: SpeechRequest, key: string): Promise<SpeechResult> {
    const sleep = this.o.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
    let last = 'no attempt';
    for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt++) {
      if (this.creditsGone) throw new TtsUnavailableError('out_of_credits');
      if (this.o.onChars) await this.o.onChars(req.text.length); // count what is actually sent
      let retryable = false;
      try {
        const r = await this.post(req, key);
        if (r.ok) {
          const audio = Buffer.from(await r.arrayBuffer());
          if (audio.length === 0) throw new Error('empty audio');
          return { audio, format: this.format };
        }
        last = `HTTP ${r.status}`;
        if (r.status === 402) {
          this.creditsGone = true;
          try { await this.o.onOutOfCredits?.(); } catch { /* alerting must not hide the cause */ }
          throw new TtsUnavailableError('out_of_credits');
        }
        if (r.status === 401 || r.status === 403) throw new TtsUnavailableError('failed', `Speech API refused the key (HTTP ${r.status})`);
        retryable = r.status === 502 || r.status === 503 || r.status === 429;
        if (!retryable) throw new Error(`Speech API error ${last}`);
      } catch (e) {
        if (e instanceof TtsUnavailableError) throw e;
        if (e instanceof Error && /^Speech API error|^empty audio/.test(e.message)) throw e;
        last = e instanceof Error ? e.name : 'error'; // timeout / network: one retry
        retryable = true;
      }
      if (retryable && attempt < MAX_ATTEMPTS - 1) { await sleep((this.o.retryDelayMs ?? 3000) * RETRY_BACKOFF[attempt]); continue; }
      break;
    }
    throw new Error(`Speech API failed: ${last}`);
  }

  private post(req: SpeechRequest, key: string): Promise<Response> {
    const f = this.o.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
    const headers = { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` };
    const signal = AbortSignal.timeout(this.o.timeoutMs ?? 150_000);
    const norm = req.normalize ? { normalize: req.normalize } : {};
    if (this.format === 'mp3') {
      return f(`${this.base}/v1/text-to-speech/${encodeURIComponent(req.voice)}?output_format=mp3_44100_128`, {
        method: 'POST', headers, signal, body: JSON.stringify({ text: req.text, language_code: req.language, ...norm }),
      });
    }
    return f(`${this.base}/v1/text-to-speech`, {
      method: 'POST', headers, signal, body: JSON.stringify({ text: req.text, voice: req.voice, language_code: req.language, format: 'pcm_24000', ...norm }),
    });
  }
}

// ---------------------------------------------------------------------------------------------------------------------
// Pieces

/** True when the text has Devanagari digits (U+0966 to U+096F). */
export const hasDevanagariDigits = (t: string) => /[०-९]/.test(t);

/** The normalize value for one piece of text, from the language's policy. Never sent for languages with no policy. */
export function normalizeFor(spec: LanguageSpec, text: string): 'numbers' | undefined {
  if (spec.ttsNormalize === 'numbers') return 'numbers';
  if (spec.ttsNormalize === 'numbers_devanagari' && hasDevanagariDigits(text)) return 'numbers';
  return undefined;
}

/**
 * Splits spoken text into pieces of at most `limit` characters at sentence ends (. ! ? ... and the CJK / Devanagari marks), packing
 * short sentences together. A sentence longer than the limit is cut at the last space (or the limit itself when there are no spaces).
 */
export function splitSpeech(text: string, limit: number): string[] {
  const t = text.replace(/\s+/g, ' ').trim();
  if (!t) return [];
  const sentences = t.match(/[^.!?…。！？।]+(?:[.!?…。！？।]+["'”’)\]»」』]*|$)\s*/g) ?? [t];
  const out: string[] = [];
  let cur = '';
  const push = () => { if (cur.trim()) out.push(cur.trim()); cur = ''; };
  for (let s of sentences.map((x) => x.trim()).filter(Boolean)) {
    while (s.length > limit) {
      let cut = s.lastIndexOf(' ', limit);
      if (cut <= limit * 0.4) cut = limit; // no usable space (Japanese): hard cut
      push();
      out.push(s.slice(0, cut).trim());
      s = s.slice(cut).trim();
    }
    if (cur && cur.length + 1 + s.length > limit) push();
    cur = cur ? `${cur} ${s}` : s;
  }
  push();
  return out;
}

/** Strips a leading ID3v2 tag so separately encoded MP3 pieces can be joined. */
export function stripId3(mp3: Buffer): Buffer {
  if (mp3.length > 10 && mp3.subarray(0, 3).toString('ascii') === 'ID3') {
    const size = ((mp3[6] & 0x7f) << 21) | ((mp3[7] & 0x7f) << 14) | ((mp3[8] & 0x7f) << 7) | (mp3[9] & 0x7f);
    return mp3.subarray(10 + size);
  }
  return mp3;
}

const silenceWav = (ms: number) => pcmToWav(Buffer.alloc(Math.round((PIPER_SAMPLE_RATE * ms) / 1000) * 2), PIPER_SAMPLE_RATE);

export interface ScriptSynthOptions {
  client: ReadAloudClient;
  spec: LanguageSpec;
  flag: Pick<FlagRow, 'voice' | 'voiceHost2'>;
  /** Silence after each piece (PCM mode), ms. */
  gapMs?: number;
  /** Level each piece is brought to before joining (PCM mode), dBFS RMS. The final MP3 is then normalised to -16 LUFS. */
  pieceDbfs?: number;
  /** Share of pieces that may fail (not 402 / key / breaker) and be skipped before the whole episode fails. */
  maxSkippedShare?: number;
  log?: (m: string) => void;
}

/**
 * Speaks a script: one voice per host, every line in sentence-sized pieces, at most 2 requests at a time.
 * Returns one AudioSegment per script line that was spoken, in order (same shape as the Piper path), so the generator's concatenation,
 * timings and upload are shared.
 */
export async function synthesizeScript(script: PodcastScript, o: ScriptSynthOptions): Promise<AudioSegment[]> {
  const { client, spec } = o;
  const log = o.log ?? ((m: string) => console.log(m));
  const gap = o.gapMs ?? 120;
  const pieceDbfs = o.pieceDbfs ?? -20;
  const maxSkip = o.maxSkippedShare ?? 0.1;
  const fmt = client.format;

  interface Job { seg: ScriptSegment; seq: number; text: string; voice: string }
  const jobs: Job[] = [];
  script.segments.forEach((seg, seq) => {
    const voice = seg.speaker === 'host1' ? o.flag.voice : o.flag.voiceHost2;
    for (const text of splitSpeech(seg.text, spec.sentenceCap)) jobs.push({ seg, seq, text, voice });
  });
  if (jobs.length === 0) throw new Error('script has no speakable text');

  const results: Array<Buffer | null> = new Array(jobs.length).fill(null);
  let fatal: Error | null = null;
  let failed = 0;
  await Promise.all(jobs.map(async (job, i) => {
    if (fatal) return;
    try {
      const { audio } = await client.synthesize({ text: job.text, voice: job.voice, language: spec.code, normalize: normalizeFor(spec, job.text) });
      results[i] = audio;
    } catch (e) {
      if (isTtsUnavailable(e) || (e as { code?: string } | null)?.code === 'language_paused') { fatal ??= e as Error; return; }
      failed++;
      log(`[languages] ${spec.code}: speech piece ${i + 1}/${jobs.length} failed: ${e instanceof Error ? e.message : 'error'}`);
    }
  }));
  if (fatal) throw fatal;
  if (failed / jobs.length > maxSkip) throw new Error(`Too many speech pieces failed: ${failed}/${jobs.length}`);

  const bySeq = new Map<number, Buffer[]>();
  jobs.forEach((job, i) => {
    const audio = results[i];
    if (!audio) return;
    let piece: Buffer;
    if (fmt === 'pcm') {
      const wav = pcmToWav(audio, PIPER_SAMPLE_RATE);
      piece = normalizeWavRms(wav, pieceDbfs);
      (bySeq.get(job.seq) ?? bySeq.set(job.seq, []).get(job.seq)!).push(piece, ...(gap > 0 ? [silenceWav(gap)] : []));
    } else {
      (bySeq.get(job.seq) ?? bySeq.set(job.seq, []).get(job.seq)!).push(stripId3(audio));
    }
  });

  const out: AudioSegment[] = [];
  script.segments.forEach((seg, seq) => {
    const parts = bySeq.get(seq);
    if (!parts?.length) return;
    const buffer = fmt === 'pcm' ? concatenateBuffers(parts) : Buffer.concat(parts);
    let duration: number;
    if (fmt === 'pcm') { const w = readWavInfo(buffer)!; duration = w.dataBytes / (w.sampleRate * 2); } else duration = (buffer.length * 8) / 128_000;
    out.push({ buffer, duration_seconds: duration, speaker: seg.speaker, segment_type: normalizeType(seg.type) });
  });
  if (out.length === 0) throw new Error('no speech was produced');
  return out;
}

const TYPES = ['intro', 'calendar', 'email', 'news', 'weather', 'teaser', 'outro'] as const;
const normalizeType = (t: string): AudioSegment['segment_type'] => ((TYPES as readonly string[]).includes(t) ? (t as AudioSegment['segment_type']) : 'news');

export const readAloudClient = new ReadAloudClient();
export { requireLanguageSpec };
