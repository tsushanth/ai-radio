// Polling for the async daily-brief job (GET /podcast/job/:id). Pure so it can be tested; the page supplies the fetch and an
// abort flag (Cancel, or leaving the page). There is no server-side cancel route: aborting only stops waiting, the job on the
// backend runs to the end (same as Android's cancelGeneration, which just resets its state).

export interface JobStatus<E> {
  status: string;
  progress?: number;
  episode?: E;
  error?: { message?: string } | string;
}

export interface PollOptions<E> {
  onProgress?: (progress: number, status: JobStatus<E>) => void;
  intervalMs?: number;
  timeoutMs?: number;
  /** Consecutive failed status calls tolerated. */
  maxErrors?: number;
  signal?: { aborted: boolean };
  sleep?: (ms: number) => Promise<void>;
  now?: () => number;
  /** Wait before the next status call, given how many calls have been made so far (1 after the first). Default: always `intervalMs`. */
  nextIntervalMs?: (calls: number) => number;
}

/**
 * Thrown by a status call to say "not now, ask again after this long" (for example the server answered 429). The wait is taken,
 * the call is retried, and it does not count as a failed call. The overall timeout still applies.
 */
export class PollRetryLater extends Error {
  readonly afterMs: number;
  constructor(afterMs: number, message = 'Rate limited') {
    super(message);
    this.name = 'PollRetryLater';
    this.afterMs = afterMs;
  }
}

const realSleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export class JobFailed extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'JobFailed';
  }
}

/** Resolves with the finished episode, or null if aborted. Throws JobFailed on a failed job or timeout, or the last error after maxErrors in a row. */
export async function pollJob<E>(getStatus: () => Promise<JobStatus<E>>, opts: PollOptions<E> = {}): Promise<E | null> {
  const { onProgress, intervalMs = 2000, timeoutMs = 10 * 60_000, maxErrors = 3, signal, sleep = realSleep, now = Date.now, nextIntervalMs } = opts;
  const deadline = now() + timeoutMs;
  let errors = 0;
  let calls = 0;
  let waitMs: number | null = null;
  for (;;) {
    if (signal?.aborted) return null;
    let status: JobStatus<E> | null = null;
    waitMs = null;
    try {
      calls++;
      status = await getStatus();
      errors = 0;
    } catch (err) {
      if (err instanceof PollRetryLater) waitMs = err.afterMs;
      else if (++errors >= maxErrors) throw err;
    }
    if (signal?.aborted) return null;
    if (status) {
      onProgress?.(status.progress || 0, status);
      if (status.status === 'completed' && status.episode) return status.episode;
      if (status.status === 'failed') {
        const e = status.error;
        throw new JobFailed(typeof e === 'string' ? e : e?.message || 'Generation failed');
      }
    }
    if (now() >= deadline) throw new JobFailed('Generation is taking too long. Please try again.');
    await sleep(waitMs ?? nextIntervalMs?.(calls) ?? intervalMs);
  }
}
