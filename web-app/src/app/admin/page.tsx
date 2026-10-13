'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';
import {
  type Level,
  THRESHOLDS,
  diskLevel,
  formatAge,
  generationLevel,
  segmentLevel,
  streamLevel,
  worst,
} from '@/lib/admin-status';

type Bucket = { ts: number; avg: number | null; max: number | null };
type Overview = {
  fetchedAt: string;
  stream: { up: boolean; httpStatus: number } | null;
  schedulerHealth: {
    scheduler_ok?: boolean;
    newest_segment_age_sec?: number | null;
    disk_used_pct?: number;
    seconds_since_last_generation?: number | null;
    ready_segments?: number;
  } | null;
  status: {
    now_playing?: unknown;
    total_ready?: number;
    buffer_max?: number;
    request_queue_depth?: number;
  } | null;
  listenerHistory: {
    buckets: Bucket[];
    peak: { ts: number; listeners: number } | null;
    current: { ts: number; total: number | null; age_sec: number } | null;
  } | null;
};

const REFRESH_MS = 30_000;
const ICON: Record<Level, string> = { green: '✔', amber: '!', red: '✖', unknown: '?' };
const WORD: Record<Level, string> = { green: 'OK', amber: 'Warning', red: 'Problem', unknown: 'Unknown' };

function nowPlayingText(np: unknown): string {
  if (!np) return 'nothing reported';
  if (typeof np === 'string') return np;
  if (typeof np === 'object') {
    const o = np as Record<string, unknown>;
    for (const k of ['title', 'topic_name', 'name', 'filename', 'raw']) {
      if (typeof o[k] === 'string' && o[k]) return o[k] as string;
    }
  }
  return 'playing (no title)';
}

function Badge({ level }: { level: Level }) {
  return (
    <span className={`adm-badge adm-${level}`}>
      <span aria-hidden>{ICON[level]}</span> {WORD[level]}
    </span>
  );
}

function Card({ title, level, children }: { title: string; level?: Level; children: React.ReactNode }) {
  return (
    <section className="adm-card">
      <header>
        <h2>{title}</h2>
        {level && <Badge level={level} />}
      </header>
      {children}
    </section>
  );
}

function Spark({ buckets }: { buckets: Bucket[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 600, H = 120, P = 6;
  const max = Math.max(1, ...buckets.map((b) => b.max ?? 0));
  const x = (i: number) => P + (i * (W - 2 * P)) / Math.max(1, buckets.length - 1);
  const y = (v: number) => H - P - (v / max) * (H - 2 * P);
  // split into runs so null buckets are visible gaps, never zeros
  const runs: { i: number; v: number }[][] = [];
  let cur: { i: number; v: number }[] = [];
  buckets.forEach((b, i) => {
    if (b.avg === null) {
      if (cur.length) runs.push(cur);
      cur = [];
    } else cur.push({ i, v: b.avg });
  });
  if (cur.length) runs.push(cur);
  const hb = hover !== null ? buckets[hover] : null;
  return (
    <div className="adm-spark">
      <svg
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label="Listeners over the last 24 hours, 5 minute averages"
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const f = (e.clientX - r.left) / r.width;
          setHover(Math.min(buckets.length - 1, Math.max(0, Math.round(f * (buckets.length - 1)))));
        }}
        onPointerLeave={() => setHover(null)}
      >
        <line x1={P} x2={W - P} y1={H - P} y2={H - P} className="adm-axis" />
        {runs.map((run, k) => {
          const pts = run.map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`);
          return (
            <g key={k}>
              {run.length > 1 && (
                <polygon
                  points={`${x(run[0].i)},${H - P} ${pts.join(' ')} ${x(run[run.length - 1].i)},${H - P}`}
                  className="adm-area"
                />
              )}
              {run.length > 1 ? (
                <polyline points={pts.join(' ')} className="adm-line" />
              ) : (
                <circle cx={x(run[0].i)} cy={y(run[0].v)} r={2.5} className="adm-dot" />
              )}
            </g>
          );
        })}
        {hover !== null && <line x1={x(hover)} x2={x(hover)} y1={P} y2={H - P} className="adm-cross" />}
      </svg>
      <div className="adm-tip" aria-live="polite">
        {hb
          ? `${new Date(hb.ts * 1000).toLocaleString([], { hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' })}: ${
              hb.avg === null ? 'no data (sampler or Icecast gap)' : `avg ${hb.avg}, max ${hb.max}`
            }`
          : 'Hover or touch the chart for 5-minute values. Gaps mean no reading, not zero listeners.'}
      </div>
    </div>
  );
}

function SignIn() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  async function password_() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setMsg(error ? 'Sign-in failed.' : '');
    setBusy(false);
  }
  async function magic() {
    setBusy(true);
    const { error } = await supabase.auth.signInWithOtp({
      email,
      options: { emailRedirectTo: `${window.location.origin}/admin` },
    });
    setMsg(error ? 'Could not send the link.' : 'Check your email for the sign-in link.');
    setBusy(false);
  }
  return (
    <Card title="Admin sign-in">
      <form
        className="adm-form"
        onSubmit={(e) => {
          e.preventDefault();
          void password_();
        }}
      >
        <label>
          Email
          <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
        <div className="adm-row">
          <button type="submit" disabled={busy || !email || !password}>Sign in</button>
          <button type="button" className="adm-ghost" disabled={busy || !email} onClick={() => void magic()}>
            Email me a link
          </button>
        </div>
        {msg && <p role="status">{msg}</p>}
      </form>
    </Card>
  );
}

export default function AdminPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(false);
  const [data, setData] = useState<Overview | null>(null);
  const [denied, setDenied] = useState<401 | 403 | null>(null);
  const [error, setError] = useState('');
  const [loadedAt, setLoadedAt] = useState<Date | null>(null);
  const inflight = useRef(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: d }) => {
      setSession(d.session);
      setReady(true);
    });
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const token = session?.access_token;
  const load = useCallback(async () => {
    if (!token || inflight.current) return;
    inflight.current = true;
    try {
      const r = await fetch('/api/admin/overview', { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' });
      if (r.status === 401 || r.status === 403) {
        setDenied(r.status);
        setData(null);
        return;
      }
      if (!r.ok) throw new Error(String(r.status));
      setDenied(null);
      setData(await r.json());
      setLoadedAt(new Date());
      setError('');
    } catch {
      setError('Could not load the overview. Showing the last good data if any.');
    } finally {
      inflight.current = false;
    }
  }, [token]);

  useEffect(() => {
    if (!token) return;
    void load();
    const id = setInterval(() => void load(), REFRESH_MS);
    return () => clearInterval(id);
  }, [token, load]);

  const sh = data?.schedulerHealth ?? null;
  const levels = useMemo(() => {
    const stream = streamLevel(data ? (data.stream ? data.stream.up : null) : null);
    const gen = generationLevel(sh?.seconds_since_last_generation);
    const seg = segmentLevel(sh?.newest_segment_age_sec);
    const disk = diskLevel(sh?.disk_used_pct);
    return { stream, gen, seg, disk, overall: worst([stream, gen, seg, disk]) };
  }, [data, sh]);

  const lh = data?.listenerHistory ?? null;
  const q = data?.status ?? null;

  return (
    <main className="adm">
      <style>{CSS}</style>
      <div className="adm-top">
        <h1>Audexa Radio admin</h1>
        {session && (
          <div className="adm-row">
            {data && <Badge level={levels.overall} />}
            <button className="adm-ghost" onClick={() => void supabase.auth.signOut().then(() => { setData(null); setDenied(null); })}>
              Sign out
            </button>
          </div>
        )}
      </div>

      {!ready ? (
        <p>Loading</p>
      ) : !session ? (
        <SignIn />
      ) : denied ? (
        <Card title={denied === 401 ? 'Session expired' : 'Not authorized'}>
          <p>{denied === 401 ? 'Sign in again.' : 'This account is not on the admin allowlist.'}</p>
        </Card>
      ) : !data ? (
        <p>{error || 'Loading'}</p>
      ) : (
        <>
          {error && <p role="alert" className="adm-warn">{error}</p>}
          <div className="adm-grid">
            <Card title="Stream" level={levels.stream}>
              <p className="adm-big">{data.stream ? (data.stream.up ? 'Up' : 'Down') : 'Not checked'}</p>
              <p className="adm-sub">HEAD /stream {data.stream ? `returned ${data.stream.httpStatus}` : 'timed out or failed'}</p>
            </Card>
            <Card title="Generation" level={levels.gen}>
              <p className="adm-big">{formatAge(sh?.seconds_since_last_generation)}</p>
              <p className="adm-sub">since last generation (red above {THRESHOLDS.generationRedSec}s)</p>
            </Card>
            <Card title="Newest segment" level={levels.seg}>
              <p className="adm-big">{formatAge(sh?.newest_segment_age_sec)}</p>
              <p className="adm-sub">age (red above {THRESHOLDS.segmentRedSec / 3600}h)</p>
            </Card>
            <Card title="Disk" level={levels.disk}>
              <p className="adm-big">{sh?.disk_used_pct ?? 'n/a'}{sh?.disk_used_pct !== undefined ? '%' : ''}</p>
              <p className="adm-sub">volume used (red at {THRESHOLDS.diskRedPct}% or more)</p>
            </Card>
          </div>
          {!sh && <p className="adm-warn">Scheduler health unavailable: the radio API did not answer.</p>}

          <Card title="Queue and now playing">
            <p className="adm-big">{q?.total_ready ?? sh?.ready_segments ?? 'n/a'} <span className="adm-sub">ready segments (en){q?.buffer_max ? `, buffer target ${q.buffer_max}` : ''}</span></p>
            <p className="adm-sub">Now playing: {q ? nowPlayingText(q.now_playing) : 'unavailable'}</p>
            {q?.request_queue_depth !== undefined && <p className="adm-sub">Listener requests waiting: {q.request_queue_depth}</p>}
          </Card>

          <Card title="Listeners, last 24 hours">
            {lh ? (
              <>
                <div className="adm-stats">
                  <div><p className="adm-big">{lh.current?.total ?? 'n/a'}</p><p className="adm-sub">current{lh.current && lh.current.age_sec > 180 ? ` (reading is ${formatAge(lh.current.age_sec)} old)` : ''}</p></div>
                  <div><p className="adm-big">{lh.peak?.listeners ?? 'n/a'}</p><p className="adm-sub">peak 24h{lh.peak ? ` at ${new Date(lh.peak.ts * 1000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}` : ''}</p></div>
                </div>
                <Spark buckets={lh.buckets} />
              </>
            ) : (
              <p className="adm-sub">Listener history unavailable. The radio build with /api/listener-history may not be deployed yet.</p>
            )}
          </Card>

          <Card title="App events: not instrumented yet">
            <p className="adm-sub">
              No app analytics (installs, sessions, plays) are collected for Audexa, so nothing is shown here rather than
              guessing. Listener counts above come from the Icecast server only.
            </p>
          </Card>

          <p className="adm-sub">
            {loadedAt ? `Updated ${loadedAt.toLocaleTimeString()}` : ''} · refreshes every 30s
          </p>
        </>
      )}
    </main>
  );
}

const CSS = `
.adm{--bg:#f9fafb;--surface:#fff;--ink:#111827;--ink2:#4b5563;--line:#e5e7eb;--accent:#2563eb;--area:rgba(37,99,235,.14);
--g-bg:#dcfce7;--g-fg:#14532d;--a-bg:#fef3c7;--a-fg:#78350f;--r-bg:#fee2e2;--r-fg:#7f1d1d;--u-bg:#e5e7eb;--u-fg:#374151;
max-width:960px;margin:0 auto;padding:16px;color:var(--ink);min-height:100vh;background:var(--bg)}
@media (prefers-color-scheme:dark){.adm{--bg:#0b0f17;--surface:#141a24;--ink:#f3f4f6;--ink2:#9ca3af;--line:#273041;--accent:#60a5fa;--area:rgba(96,165,250,.18);
--g-bg:#14532d;--g-fg:#bbf7d0;--a-bg:#78350f;--a-fg:#fde68a;--r-bg:#7f1d1d;--r-fg:#fecaca;--u-bg:#273041;--u-fg:#d1d5db}}
.adm h1{font-size:1.25rem;font-weight:650;margin:0}
.adm h2{font-size:.8rem;font-weight:600;letter-spacing:.04em;text-transform:uppercase;color:var(--ink2);margin:0}
.adm-top{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;margin-bottom:16px}
.adm-row{display:flex;gap:8px;align-items:center;flex-wrap:wrap}
.adm-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:12px;margin-bottom:12px}
.adm-card{background:var(--surface);border:1px solid var(--line);border-radius:10px;padding:14px;margin-bottom:12px}
.adm-grid .adm-card{margin-bottom:0}
.adm-card>header{display:flex;justify-content:space-between;align-items:center;gap:8px;margin-bottom:8px}
.adm-big{font-size:1.75rem;font-weight:650;margin:0;font-variant-numeric:tabular-nums}
.adm-sub{font-size:.85rem;color:var(--ink2);margin:2px 0 0}
.adm-warn{color:var(--a-fg);background:var(--a-bg);padding:8px 10px;border-radius:8px;font-size:.9rem}
.adm-badge{font-size:.75rem;font-weight:600;padding:2px 8px;border-radius:999px;white-space:nowrap}
.adm-green{background:var(--g-bg);color:var(--g-fg)}.adm-amber{background:var(--a-bg);color:var(--a-fg)}
.adm-red{background:var(--r-bg);color:var(--r-fg)}.adm-unknown{background:var(--u-bg);color:var(--u-fg)}
.adm-stats{display:flex;gap:32px;flex-wrap:wrap;margin-bottom:8px}
.adm-spark svg{width:100%;height:auto;display:block;touch-action:none}
.adm-axis{stroke:var(--line);stroke-width:1}.adm-line{fill:none;stroke:var(--accent);stroke-width:2;stroke-linejoin:round}
.adm-area{fill:var(--area)}.adm-dot{fill:var(--accent)}.adm-cross{stroke:var(--ink2);stroke-width:1;stroke-dasharray:3 3}
.adm-tip{font-size:.8rem;color:var(--ink2);min-height:1.2em;margin-top:4px}
.adm-form{display:grid;gap:10px;max-width:360px}
.adm-form label{display:grid;gap:4px;font-size:.85rem;color:var(--ink2)}
.adm-form input{font:inherit;padding:8px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.adm button{font:inherit;font-size:.9rem;padding:8px 12px;border-radius:8px;border:1px solid var(--accent);background:var(--accent);color:#fff;cursor:pointer}
.adm button.adm-ghost{background:transparent;color:var(--ink);border-color:var(--line)}
.adm button:disabled{opacity:.5;cursor:not-allowed}
`;
