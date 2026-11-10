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
