/**
 * Client for the shared Piper TTS app (piper-tts-sjc on Fly). Same politeness rules as the radio's orchestrator/piper_client.py:
 * Audexa is the LOW-priority tenant, because Calldesk phone calls use the same machines and the server has no priority lane.
 *  - one request at a time
 *  - before every request, poll GET /health and wait while the machine reports `active` >= busyActive sessions
 *  - back off and retry on 503/429 (at capacity), honouring Retry-After
 * Unlike the live radio (which must never go silent), topic episodes are not live: if Piper is still busy after maxWaitMs this
 * THROWS PiperBusyError by default, so the episode is retried later instead of competing with a call.
 * Auth is a static bearer (PIPER_AUTH_TOKEN) over Fly's private network. The token is never logged or put in an error.
 */

export const PIPER_SAMPLE_RATE = 24000;
export const MAX_CHUNK_CHARS = 900; // the server limits request size; stay well under it

export class PiperError extends Error {
  constructor(message: string) { super(message); this.name = 'PiperError'; }
}
/** Piper stayed busy (a call is using it) for the whole wait. Not retried inside the client. */
export class PiperBusyError extends PiperError {
  constructor(message: string) { super(message); this.name = 'PiperBusyError'; }
}

/** Split at sentence boundaries into chunks of at most `limit` characters. */
export function splitText(text: string, limit: number = MAX_CHUNK_CHARS): string[] {
  const sentences = text.trim().split(/(?<=[.!?])\s+/);
  const chunks: string[] = [];
  let cur = '';
  for (let s of sentences) {
    while (s.length > limit) { // one huge "sentence": hard split on whitespace
      let cut = s.lastIndexOf(' ', limit);
      if (cut <= 0) cut = limit;
      if (cur) { chunks.push(cur); cur = ''; }
      chunks.push(s.slice(0, cut).trim());
      s = s.slice(cut).trim();
    }
    if (cur && cur.length + 1 + s.length > limit) { chunks.push(cur); cur = s; }
    else cur = `${cur} ${s}`.trim();
  }
  if (cur) chunks.push(cur);
  return chunks.filter(Boolean);
}

/** Wrap 16-bit mono PCM in a 44-byte WAV header. */
export function pcmToWav(pcm: Buffer, rate: number = PIPER_SAMPLE_RATE): Buffer {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0, 'ascii');
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write('WAVE', 8, 'ascii');
  header.write('fmt ', 12, 'ascii');
  header.writeUInt32LE(16, 16);          // fmt chunk size
  header.writeUInt16LE(1, 20);           // PCM
  header.writeUInt16LE(1, 22);           // mono
  header.writeUInt32LE(rate, 24);
  header.writeUInt32LE(rate * 2, 28);    // byte rate
  header.writeUInt16LE(2, 32);           // block align
  header.writeUInt16LE(16, 34);          // bits per sample
  header.write('data', 36, 'ascii');
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

export interface PiperOptions {
  baseUrl: string;
  token: string;
  busyActive?: number;
  maxWaitMs?: number;
  pollMs?: number;
  retries?: number;
  requestTimeoutMs?: number;
  /** 'throw' (default): give up with PiperBusyError. 'proceed': go ahead anyway, as the live radio does. */
  onBusyTimeout?: 'throw' | 'proceed';
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
}

export interface PiperResult { wav: Buffer; durationSeconds: number }

export class PiperTtsClient {
  private readonly base: string;
  private readonly token: string;
  private readonly busyActive: number;
  private readonly maxWaitMs: number;
  private readonly pollMs: number;
  private readonly retries: number;
  private readonly requestTimeoutMs: number;
  private readonly onBusyTimeout: 'throw' | 'proceed';
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => number;
  private tail: Promise<unknown> = Promise.resolve(); // serialises requests: one at a time

  constructor(o: PiperOptions) {
    this.base = o.baseUrl.replace(/\/+$/, '');
    this.token = o.token;
    this.busyActive = o.busyActive ?? 2;
    this.maxWaitMs = o.maxWaitMs ?? 120_000;
    this.pollMs = o.pollMs ?? 2_000;
    this.retries = o.retries ?? 4;
    this.requestTimeoutMs = o.requestTimeoutMs ?? 60_000;
    this.onBusyTimeout = o.onBusyTimeout ?? 'throw';
    this.fetchImpl = o.fetchImpl ?? fetch;
    this.sleep = o.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
    this.now = o.now ?? Date.now;
  }

  /** Text to speech: one WAV for the whole text (long text is sent in chunks, in order). */
  synthesize(text: string, voiceId: string, speed: number = 1.05): Promise<PiperResult> {
    const run = async (): Promise<PiperResult> => {
      const parts: Buffer[] = [];
      for (const chunk of splitText(text)) parts.push(await this.synthPcm(chunk, voiceId, speed));
      const pcm = Buffer.concat(parts);
      if (pcm.length === 0) throw new PiperError('Piper returned no audio');
      return { wav: pcmToWav(pcm), durationSeconds: pcm.length / (PIPER_SAMPLE_RATE * 2) };
    };
    const result = this.tail.then(run, run);
    this.tail = result.catch(() => undefined);
    return result;
  }

  /** Wait while Piper reports `active` >= busyActive. Returns when it is quiet, when /health is unusable, or throws after maxWaitMs. */
  private async waitForQuiet(): Promise<void> {
    const deadline = this.now() + this.maxWaitMs;
    while (this.now() < deadline) {
      let active: number;
      try {
        const r = await this.fetchImpl(`${this.base}/health`, { signal: AbortSignal.timeout(5_000) });
        if (!r.ok) return; // unhealthy or unknown: let the real request surface the problem
        active = Number(((await r.json()) as { active?: number }).active ?? 0);
      } catch {
        return;
      }
      if (active < this.busyActive) return;
      await this.sleep(this.pollMs);
    }
    if (this.onBusyTimeout === 'throw') throw new PiperBusyError(`Piper stayed busy for ${Math.round(this.maxWaitMs / 1000)}s`);
    console.warn(`Piper still busy after ${Math.round(this.maxWaitMs / 1000)}s, proceeding anyway`);
  }

  private async synthPcm(text: string, voiceId: string, speed: number): Promise<Buffer> {
    let last = 'no attempt';
    for (let attempt = 0; attempt <= this.retries; attempt++) {
      await this.waitForQuiet(); // may throw PiperBusyError: not retried here
      let delaySec = 1;
      try {
        const r = await this.fetchImpl(`${this.base}/v1/tts/stream`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.token}` },
          body: JSON.stringify({ text, voice: voiceId, speed, format: 'pcm_24000' }),
          signal: AbortSignal.timeout(this.requestTimeoutMs),
        });
        if (r.ok) {
          const pcm = Buffer.from(await r.arrayBuffer());
          if (pcm.length === 0) throw new PiperError('Piper returned empty audio');
          return pcm;
        }
        last = `HTTP ${r.status}`;
        if (r.status !== 503 && r.status !== 429) throw new PiperError(`Piper error ${last}`);
        delaySec = Number(r.headers.get('retry-after')) || 1;
      } catch (e) {
        if (e instanceof PiperError) throw e;
        last = e instanceof Error ? e.name : 'error';
      }
      if (attempt < this.retries) await this.sleep(Math.min(delaySec * 2 ** attempt, 30) * 1000);
    }
    throw new PiperError(`Piper failed after ${this.retries + 1} attempts: ${last}`);
  }
}

let shared: PiperTtsClient | null = null;
/** The shared client for this process, built from PIPER_URL and PIPER_AUTH_TOKEN. */
export function getPiperClient(): PiperTtsClient {
  if (!shared) {
    const token = process.env.PIPER_AUTH_TOKEN;
    if (!token) throw new PiperError('TTS_BACKEND=piper requires PIPER_AUTH_TOKEN');
    shared = new PiperTtsClient({
      baseUrl: process.env.PIPER_URL || 'http://piper-tts-sjc.internal:8080',
      token,
      busyActive: Number(process.env.PIPER_BUSY_ACTIVE) || 2,
      maxWaitMs: (Number(process.env.PIPER_MAX_WAIT_SEC) || 120) * 1000,
    });
  }
  return shared;
}
