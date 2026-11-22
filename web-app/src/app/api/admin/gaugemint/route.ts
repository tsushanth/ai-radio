// GET /api/admin/gaugemint?period=7d|30d|12mo: landing-page visit numbers of this site from Gaugemint, for the admin page.
// Same admin check as /api/admin/overview (authorizeAdmin with ADMIN_EMAILS: 401 bad/expired session, 403 not on the allowlist).
// Separate route on purpose: a slow or broken Gaugemint can only affect its own card, never the radio-health overview. The key
// (GAUGEMINT_READ_KEY) stays on the server and the domain is fixed by GAUGEMINT_DOMAIN, never taken from the request.
import { createClient } from '@supabase/supabase-js';
import { authorizeAdmin, type AuthUser } from '@/lib/admin-auth';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';
import { adminGaugemint } from '@/lib/adminGaugemint';
import { getGaugemintStats } from '@/lib/gaugemintRead';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

async function getUser(token: string): Promise<AuthUser | null> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

export async function GET(req: Request) {
  const decision = await authorizeAdmin(req.headers.get('authorization'), process.env.ADMIN_EMAILS, getUser);
  if (!decision.ok) {
    return new Response(null, { status: decision.status, headers: { 'cache-control': 'no-store' } });
  }

  const r = await adminGaugemint({ isAdmin: true, period: new URL(req.url).searchParams.get('period'), getStats: getGaugemintStats });
  return new Response(r.body, { status: r.status, headers: { 'content-type': r.contentType, 'cache-control': 'no-store' } });
}
