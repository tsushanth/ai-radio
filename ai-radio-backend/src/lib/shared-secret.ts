/**
 * Constant-time shared-secret checks for operator-only endpoints.
 * Fails closed: an unset or empty expected secret never matches anything.
 */
import { createHash, timingSafeEqual } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';

const digest = (s: string) => createHash('sha256').update(s).digest();

/** True only when both are non-empty strings and equal. Hashing first makes the comparison constant-time for any lengths. */
export function secretMatches(provided: unknown, expected: string | undefined): boolean {
  if (typeof provided !== 'string' || provided.length === 0) return false;
  if (!expected) return false;
  return timingSafeEqual(digest(provided), digest(expected));
}

/** Extracts the token from an "Authorization: Bearer <token>" header ('' when absent or malformed). */
export function bearerToken(header: unknown): string {
  if (typeof header !== 'string') return '';
  const m = /^Bearer\s+(.+)$/.exec(header.trim());
  return m ? m[1] : '';
}

/**
 * Express middleware: requires "Authorization: Bearer <BATCH_SECRET>" (the same operator secret /batch/* and regenerate-audio use).
 * The secret is read per request so tests (and secret rotation without restart of the module) work.
 */
export function requireOperatorSecret(getSecret: () => string | undefined = () => process.env.BATCH_SECRET) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!secretMatches(bearerToken(req.headers.authorization), getSecret())) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    next();
  };
}
