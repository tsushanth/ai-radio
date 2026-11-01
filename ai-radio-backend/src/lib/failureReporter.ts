/**
 * Sends backend failures to the unified app-failure-reporter Worker (dedupes and emails the owner).
 * Fire-and-forget: never throws, never blocks. Silent unless FAILURE_REPORTER_KEY is set (Fly secret), and always silent when
 * FAILURE_REPORTER_DISABLED=1, NODE_ENV is test/development, or a test runner is detected (node --test sets NODE_TEST_CONTEXT;
 * FAILURE_REPORTER_FORCE=1 overrides that, for the reporter's own tests).
 * Never pass user content (transcripts, topic text, emails) as message or context: counts, reason codes and sources only.
 * Template: ~/Documents/GitHub/app-failure-reporter/node/failureReporter.ts.tmpl (env is read per call so tests can toggle it).
 */
const DEFAULT_ENDPOINT = 'https://app-failure-reporter.t-sushanth.workers.dev/v1/report';

type Kind = 'crash' | 'failure' | 'backend_error';

/** True when a report would actually be sent. */
export function failureReporterEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  if (!env.FAILURE_REPORTER_KEY) return false;
  if (env.FAILURE_REPORTER_DISABLED === '1') return false;
  if (env.NODE_ENV === 'test' || env.NODE_ENV === 'development') return false;
  return !(env.NODE_TEST_CONTEXT && env.FAILURE_REPORTER_FORCE !== '1');
}

async function post(kind: Kind, flow: string, err: unknown, context: Record<string, string>, timeoutMs: number): Promise<void> {
  if (!failureReporterEnabled()) return;
  try {
    const e = err instanceof Error ? err : new Error(String(err));
    await fetch(process.env.FAILURE_REPORTER_URL || DEFAULT_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'X-Report-Key': process.env.FAILURE_REPORTER_KEY as string },
      body: JSON.stringify({
        kind,
        platform: 'backend',
        version: process.env.FLY_IMAGE_REF || process.env.npm_package_version || 'unknown',
        flow,
        message: e.message || e.name,
        stack: e.stack ?? '',
        context,
      }),
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch { /* reporting must never cause a failure of its own */ }
}

/** A handled server error (5xx). Route pattern only: never log concrete urls or query strings, they can carry tokens or ids. */
export function reportBackendError(req: { method: string; path?: string }, err: unknown, statusCode: number): void {
  if (statusCode < 500) return;
  void post('backend_error', `${req.method} ${req.path ?? ''}`, err, { status: String(statusCode) }, 5000);
}

/** Process is about to die: await this before process.exit so the email actually goes out. */
export function reportCrash(flow: string, err: unknown): Promise<void> {
  return post('crash', flow, err, {}, 2500);
}

/** Daily counters for the reporter dashboard (idempotent per app/day/metric). Fire-and-forget. */
export function reportUsage(metrics: Record<string, number>): void {
  if (!failureReporterEnabled()) return;
  const day = new Date().toISOString().slice(0, 10);
  const url = (process.env.FAILURE_REPORTER_URL || DEFAULT_ENDPOINT).replace(/\/report$/, '/usage');
  void fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Report-Key': process.env.FAILURE_REPORTER_KEY as string },
    body: JSON.stringify(Object.entries(metrics).map(([metric, value]) => ({ metric, value, day }))),
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}

/** A background job or flow failed (worker, queue, cron). */
export function reportFailure(flow: string, err: unknown, context: Record<string, string> = {}): void {
  void post('failure', flow, err, context, 5000);
}

export type FailureReporter = typeof reportFailure;
