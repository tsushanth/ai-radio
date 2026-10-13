import { createClient } from '@supabase/supabase-js';
import { authorizeAdmin, type AuthUser } from '@/lib/admin-auth';
import { SUPABASE_URL, SUPABASE_ANON_KEY } from '@/lib/supabase';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

const RADIO = () => (process.env.RADIO_BASE_URL || 'https://radio.audexa.app').replace(/\/+$/, '');

async function getUser(token: string): Promise<AuthUser | null> {
  const sb = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await sb.auth.getUser(token);
  if (error || !data.user) return null;
  return data.user;
}

async function timed<T>(fn: (signal: AbortSignal) => Promise<T>): Promise<T | null> {
  try {
    return await fn(AbortSignal.timeout(8000));
  } catch {
    return null;
  }
}

async function json(path: string, signal: AbortSignal) {
  // scheduler-health answers 503 WITH a body when unhealthy, so accept any status that carries JSON.
  const r = await fetch(`${RADIO()}${path}`, { cache: 'no-store', signal, headers: { accept: 'application/json' } });
  try {
    return { httpStatus: r.status, body: await r.json() };
  } catch {
    return null;
  }
}

export async function GET(req: Request) {
  const decision = await authorizeAdmin(req.headers.get('authorization'), process.env.ADMIN_EMAILS, getUser);
  if (!decision.ok) {
    return new Response(null, { status: decision.status, headers: { 'cache-control': 'no-store' } });
  }

  const [stream, health, status, history] = await Promise.all([
    timed(async (signal) => {
      const r = await fetch(`${RADIO()}/stream`, { method: 'HEAD', cache: 'no-store', signal });
      return { up: r.ok, httpStatus: r.status };
    }),
    timed((s) => json('/api/scheduler-health', s)),
    timed((s) => json('/api/status?lang=en', s)),
    timed((s) => json('/api/listener-history?hours=24', s)),
  ]);

  return Response.json(
    {
      fetchedAt: new Date().toISOString(),
      stream, // null = could not check
      schedulerHealth: health?.body ?? null,
      status: status?.body ?? null,
      listenerHistory: history && history.httpStatus === 200 ? history.body : null,
    },
    { headers: { 'cache-control': 'no-store' } },
  );
}
