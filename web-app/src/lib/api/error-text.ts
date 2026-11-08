// The text of an API error, from the JSON body of a non-2xx answer. Pure, so it can be tested without a browser.

/** A machine code such as `advice` or `install_limit` (lowercase words joined by underscores), as opposed to a sentence. */
export const isErrorCode = (v: unknown): v is string => typeof v === 'string' && /^[a-z][a-z0-9]*(_[a-z0-9]+)*$/.test(v);

const nonEmpty = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;

/**
 * Routes that answer `{ error: '<code>', message: '<sentence>' }` (Ask the hosts, the topic endpoints) get the sentence.
 * Everything else is unchanged: a sentence in `error` is used as is, then `message`, then `API error: <status>`.
 */
export function apiErrorText(body: unknown, status: number): string {
  const b = (body && typeof body === 'object' ? body : {}) as Record<string, unknown>;
  if (isErrorCode(b.error) && nonEmpty(b.message)) return b.message;
  if (typeof b.error === 'string') return b.error;
  if (typeof b.message === 'string') return b.message;
  return `API error: ${status}`;
}

/** Seconds (or an HTTP date) in a Retry-After header as milliseconds, or undefined when absent or unreadable. */
export function retryAfterMs(header: string | null | undefined, now: number = Date.now()): number | undefined {
  if (!header) return undefined;
  const secs = Number(header);
  if (Number.isFinite(secs) && secs >= 0) return Math.round(secs * 1000);
  const at = Date.parse(header);
  return Number.isFinite(at) ? Math.max(0, at - now) : undefined;
}
