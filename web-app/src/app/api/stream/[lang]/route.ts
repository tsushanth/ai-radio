import { upstreamStreamUrl } from '@/lib/api/stations';

// Passes the live radio stream through from this site so the browser plays it same-origin (see lib/api/stations.ts for why).
export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

export async function GET(req: Request, ctx: { params: Promise<{ lang: string }> }) {
  const { lang } = await ctx.params;
  const url = upstreamStreamUrl(lang);
  if (!url) return new Response('Unknown station', { status: 404 });

  let upstream: Response;
  try {
    // the request's abort signal closes the upstream connection when the listener leaves
    upstream = await fetch(url, { signal: req.signal, cache: 'no-store' });
  } catch {
    return new Response('The radio is not reachable right now.', { status: 502 });
  }
  if (!upstream.ok || !upstream.body) return new Response('The radio is not reachable right now.', { status: 502 });

  return new Response(upstream.body, {
    status: 200,
    headers: {
      'content-type': 'audio/mpeg',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      'x-accel-buffering': 'no',
    },
  });
}
