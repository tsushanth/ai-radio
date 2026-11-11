/**
 * Caller authentication for per-user routes.
 *
 * The app signs in with Google and then signs in to Supabase with the Google ID token, so every signed-in user holds a Supabase
 * access token (a JWT). A route that acts on one user's data requires that token and checks that its verified email is the email
 * in the URL, so nobody can act on an account just by knowing the address.
 *
 * Pure module: no environment access at import time. The verifier is injected (production wires Supabase's auth.getUser).
 */
import type { NextFunction, Request, Response } from 'express';
import { bearerToken } from './shared-secret';

export interface VerifiedUser {
  /** Auth-provider user id (Supabase auth.users.id). */
  id: string;
  /** Verified email address, as the provider stores it. */
  email: string;
}

/** Resolves a bearer token to a verified user, or null when the token is invalid, expired or the email is unconfirmed. */
export type TokenVerifier = (token: string) => Promise<VerifiedUser | null>;

/** Minimal shape of the Supabase client used to verify tokens (keeps this module testable without the SDK). */
export interface SupabaseAuthLike {
  auth: {
    getUser(jwt: string): Promise<{
      data: { user: { id: string; email?: string | null; email_confirmed_at?: string | null; confirmed_at?: string | null } | null };
      error: unknown;
    }>;
  };
}

/**
 * Verifies a Supabase access token server-side (Supabase checks the signature, expiry and that the session still exists).
 * Requires a confirmed email so that someone cannot register an unconfirmed account under another person's address.
 */
export function supabaseTokenVerifier(client: SupabaseAuthLike | null | undefined): TokenVerifier {
  return async (token: string) => {
    if (!client || !token) return null;
    try {
      const { data, error } = await client.auth.getUser(token);
      const user = data?.user;
      if (error || !user?.id || !user.email) return null;
      if (!user.email_confirmed_at && !user.confirmed_at) return null;
      return { id: user.id, email: user.email };
    } catch {
      return null;
    }
  };
}

export const sameEmail = (a: string, b: string): boolean => a.trim().toLowerCase() === b.trim().toLowerCase();

/**
 * Express middleware: 401 without a valid bearer token, 403 when the token belongs to someone other than req.params[param].
 * On success the verified user is available as res.locals.authUser.
 */
export function requireSelf(getVerifier: () => TokenVerifier, param = 'userId') {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const token = bearerToken(req.headers.authorization);
    if (!token) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    let user: VerifiedUser | null = null;
    try {
      user = await getVerifier()(token);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    const target = req.params[param];
    if (typeof target !== 'string' || !sameEmail(user.email, target)) {
      res.status(403).json({ success: false, error: 'Forbidden' });
      return;
    }
    res.locals.authUser = user;
    next();
  };
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Per-route caller check with a compatibility window for clients that do not send a token yet.
//
// Shipped clients (Android 12.10.1 vc 47, the BriefCast iOS app and the web app) send NO Authorization header on the podcast routes
// and on POST /linked-accounts, so those routes cannot be made strict without breaking the daily brief. For those routes only:
//   - a request WITH a token is always enforced (401 invalid token, 403 token belongs to someone else);
//   - a request WITHOUT a token is let through, counted and logged ("legacy anonymous"), until the route is removed from
//     USER_AUTH_LEGACY_ANON (or USER_AUTH_STRICT=on) once clients send the token.
// Routes that no shipped client calls without a token are strict from day one (no legacy key).
// ---------------------------------------------------------------------------------------------------------------------------------

/** Route keys that shipped clients still call without a token. Overridable at runtime with USER_AUTH_LEGACY_ANON (comma list). */
export const DEFAULT_LEGACY_ANON_KEYS: readonly string[] = [
  'podcast.generate-async',
  'podcast.script',
  'podcast.job',
  'podcast.episodes',
  'linked-accounts.create',
];

/** Which route keys may still be called without a token. USER_AUTH_STRICT=on (or "true"/"1") turns every legacy window off. */
export function legacyAnonKeys(env: Record<string, string | undefined> = process.env): Set<string> {
  const strict = (env.USER_AUTH_STRICT ?? '').trim().toLowerCase();
  if (strict === 'on' || strict === 'true' || strict === '1') return new Set();
  const raw = env.USER_AUTH_LEGACY_ANON;
  if (raw === undefined) return new Set(DEFAULT_LEGACY_ANON_KEYS);
  return new Set(raw.split(',').map((s) => s.trim()).filter(Boolean));
}

const legacyCounts = new Map<string, number>();
/** Number of token-less requests let through per route key since the process started (for the logs and the deploy-order check). */
export function legacyAnonCounts(): Record<string, number> {
  return Object.fromEntries(legacyCounts);
}
export function resetLegacyAnonCounts(): void {
  legacyCounts.clear();
}

export interface RequireUserOptions {
  /** Route key, e.g. "podcast.script". Token-less requests are only allowed when this key is in the legacy set. */
  key: string;
  /** The user the route acts for (path param, body field...). null = no binding here (the handler checks ownership itself). */
  target: ((req: Request) => unknown) | null;
  /** Legacy keys, read per request (defaults to the environment). */
  legacyKeys?: () => Set<string>;
}

/**
 * Express middleware for per-user routes. res.locals.authUser is the verified user, or null for an allowed legacy request.
 *   - Authorization header present but not a usable bearer token, or a token that does not verify: 401.
 *   - verified token whose email differs from the target user: 403.
 *   - no Authorization header: 401, except for a key in the legacy set (counted and logged, no email address in the log).
 */
export function requireUser(getVerifier: () => TokenVerifier, opts: RequireUserOptions) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const header = req.headers.authorization;
    const token = bearerToken(header);
    const hasHeader = typeof header === 'string' && header.trim() !== '';

    if (!token) {
      if (!hasHeader && (opts.legacyKeys ?? (() => legacyAnonKeys()))().has(opts.key)) {
        const n = (legacyCounts.get(opts.key) ?? 0) + 1;
        legacyCounts.set(opts.key, n);
        if (n === 1 || n % 50 === 0) {
          console.warn(`[LegacyAnon] ${req.method} ${opts.key} served without a token (count=${n}); clients must send the session token`);
        }
        res.locals.authUser = null;
        next();
        return;
      }
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }

    let user: VerifiedUser | null = null;
    try {
      user = await getVerifier()(token);
    } catch {
      user = null;
    }
    if (!user) {
      res.status(401).json({ success: false, error: 'Unauthorized' });
      return;
    }
    if (opts.target) {
      const target = opts.target(req);
      // A missing or non-string target is the handler's validation error (400); the handler never runs unbound work without one.
      if (target !== undefined && target !== null && (typeof target !== 'string' || !sameEmail(user.email, target))) {
        res.status(403).json({ success: false, error: 'Forbidden' });
        return;
      }
    }
    res.locals.authUser = user;
    next();
  };
}

/**
 * Optional caller for routes that stay open to token-less clients (POST /topics/suggest): the verified token's email is the owner
 * of whatever the request creates. 'invalid' = a token was sent but is not valid.
 */
export async function optionalUser(
  getVerifier: () => TokenVerifier,
  authorization: unknown
): Promise<{ kind: 'none' } | { kind: 'invalid' } | { kind: 'ok'; user: VerifiedUser }> {
  const hasHeader = typeof authorization === 'string' && authorization.trim() !== '';
  const token = bearerToken(authorization);
  if (!hasHeader) return { kind: 'none' };
  if (!token) return { kind: 'invalid' };
  try {
    const user = await getVerifier()(token);
    return user ? { kind: 'ok', user } : { kind: 'invalid' };
  } catch {
    return { kind: 'invalid' };
  }
}

/** Owner to store on a new row: the verified user wins; a body userId that names someone else is a conflict. */
export function ownerForNewRow(
  verified: VerifiedUser | null,
  bodyUserId: string | null
): { userId: string | null; conflict: boolean } {
  if (!verified) return { userId: bodyUserId, conflict: false };
  if (bodyUserId && !sameEmail(verified.email, bodyUserId)) return { userId: null, conflict: true };
  return { userId: verified.email, conflict: false };
}
