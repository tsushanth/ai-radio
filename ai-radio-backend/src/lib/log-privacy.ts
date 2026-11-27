/**
 * Keeps personal data out of the logs.
 *
 * Two layers: log statements themselves print references, counts and lengths (guarded by log-privacy.test.ts), and every console
 * line is also masked on the way out, because error objects from libraries can carry addresses, tokens and request bodies.
 *
 * Pure module: nothing is patched on import (see log-privacy-install.ts).
 */
import { createHash, randomBytes } from 'node:crypto';
import { format } from 'node:util';

// New per process, so a reference cannot be matched against a list of addresses. It links lines of one process only.
const salt = randomBytes(16);

/** Stable (per process) stand-in for a user id or email address in a log line. */
export function userRef(id: unknown): string {
  const s = typeof id === 'string' ? id.trim().toLowerCase() : '';
  return s ? `u_${createHash('sha256').update(salt).update(s).digest('hex').slice(0, 10)}` : 'u_none';
}

// The local part is bounded so a long run of letters cannot make the match quadratic.
const EMAIL = /[A-Za-z0-9._%+-]{1,64}(?:@|%40)[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+/g;
const BEARER = /\b(Bearer|bearer)\s+[A-Za-z0-9._~+/=-]{8,}/g;
const GOOGLE_TOKEN = /\b(?:ya29\.|1\/\/0)[A-Za-z0-9._-]{10,}/g;

/** Masks email addresses and access tokens inside a piece of text. */
export function redact(text: string): string {
  return text.replace(JWT, '<token>').replace(BEARER, '$1 <token>').replace(GOOGLE_TOKEN, '<token>').replace(EMAIL, '<email>');
}

/** An Error keeps its stack and status only: client libraries attach the whole request and response (headers, bodies) to it. */
export function safeLogArg(arg: unknown): unknown {
  if (!(arg instanceof Error)) return arg;
  const { code, status } = arg as Error & { code?: unknown; status?: unknown };
  const extra = [typeof code === 'string' || typeof code === 'number' ? `code=${code}` : '', typeof status === 'number' ? `status=${status}` : '']
    .filter(Boolean).join(' ');
  return `${arg.stack || `${arg.name}: ${arg.message}`}${extra ? ` (${extra})` : ''}`;
}

const LEVELS = ['log', 'info', 'warn', 'error', 'debug', 'trace'] as const;
const INSTALLED = Symbol('logPrivacy');

/** Wraps the console methods so every line is masked. Idempotent. */
export function installLogRedaction(target: Console = console): void {
  const t = target as unknown as Record<string | symbol, unknown>;
  if (t[INSTALLED]) return;
  for (const level of LEVELS) {
    const original = (t[level] as (...a: unknown[]) => void).bind(target);
    t[level] = (...args: unknown[]) => (args.length ? original(redact(format(...args.map(safeLogArg)))) : original());
  }
  t[INSTALLED] = true;
}
