/**
 * Production wiring for lib/user-auth.ts: one Supabase service client used to verify session tokens and to delete user data.
 * Tests replace the verifier with setTokenVerifierForTests().
 */
import { createClient } from '@supabase/supabase-js';
import { supabaseTokenVerifier, type TokenVerifier } from './user-auth';

let cachedClient: any = null;
export function serviceClient(): any {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) return null;
  if (!cachedClient) cachedClient = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  return cachedClient;
}

let override: TokenVerifier | null = null;
/** Test hook: use this verifier instead of Supabase. Pass null to restore. */
export function setTokenVerifierForTests(v: TokenVerifier | null): void {
  override = v;
}

export const tokenVerifier = (): TokenVerifier => override ?? supabaseTokenVerifier(serviceClient());
