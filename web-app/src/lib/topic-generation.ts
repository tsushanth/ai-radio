// Topic episodes are generated in the background by the backend: POST /topics/:id/generate answers at once with a
// `generating` placeholder (always for a forced regeneration or a non-English first load) and the client polls
// GET /topics/:id/episode until it is `completed`. These helpers hold that logic without any React so it can be tested.

export interface PolledEpisode {
  status: string;
  audioUrl?: string;
  error?: string;
  updatedAt?: string;
}

/** Both topic endpoints answer `{ data: { episode, ... } }`; older code expected `{ data: episode }`. Accept either. */
export function unwrapTopicEpisode<T>(data: unknown): T | null {
  if (!data || typeof data !== 'object') return null;
  const inner = (data as { episode?: unknown }).episode;
  if (inner && typeof inner === 'object') return inner as T;
  return 'status' in data || 'id' in data ? (data as T) : null;
}

/** The backend puts the useful sentence in `message` (language_unavailable, daily_limit) and a code in `error`; prefer the sentence. */
export function topicErrorMessage(err: unknown, fallback = 'Failed to generate episode'): string {
  const body = (err as { body?: { message?: unknown } } | null)?.body;
  if (body && typeof body.message === 'string' && body.message) return body.message;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

export interface WaitOptions {
  intervalMs?: number;
  timeoutMs?: number;
  /** Consecutive failed checks tolerated before giving up. */
  maxErrors?: number;
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  signal?: { aborted: boolean };
  /**
   * When regenerating over an existing episode the backend keeps serving the old, completed one until the new one is saved.
   * Pass the old episode's `updatedAt` and a completed episode carrying that same value is ignored.
   */
  staleUpdatedAt?: string;
}

export class GenerationTimeout extends Error {
  constructor() {
    super('This episode is still being prepared. Check back in a few minutes.');
    this.name = 'GenerationTimeout';
  }
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/**
 * Calls `check` until the episode is completed with audio. Resolves with it; throws on a failed episode, on timeout
 * (GenerationTimeout) or after `maxErrors` failed checks in a row. Resolves null if the caller aborted (e.g. left the page).
 */
export async function waitForEpisode<T extends PolledEpisode>(
  check: () => Promise<T | null>,
  opts: WaitOptions = {}
): Promise<T | null> {
  const { intervalMs = 5000, timeoutMs = 15 * 60 * 1000, maxErrors = 3, sleep = realSleep, now = Date.now, signal, staleUpdatedAt } = opts;
  const deadline = now() + timeoutMs;
  let errors = 0;
  for (;;) {
    if (signal?.aborted) return null;
    try {
      const ep = await check();
      errors = 0;
      if (ep?.status === 'completed' && ep.audioUrl && !(staleUpdatedAt && ep.updatedAt === staleUpdatedAt)) return ep;
      if (ep?.status === 'failed') throw new Error(ep.error ? `Generation failed: ${ep.error}` : 'Generation failed. Please try again.');
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Generation failed')) throw err;
      if (++errors >= maxErrors) throw err;
    }
    if (now() >= deadline) throw new GenerationTimeout();
    await sleep(intervalMs);
  }
}
