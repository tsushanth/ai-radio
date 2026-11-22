'use client';

// "Website visits (Gaugemint)" card of /admin: landing-page visits of audexa.app from Gaugemint, our own cookieless analytics.
// Data comes from /api/admin/gaugemint, which repeats the admin check and calls Gaugemint with a server-side read key. Nothing here
// talks to Gaugemint, and a failure here is contained: the rest of the admin page does not depend on this card, and this card does
// not depend on the radio-health overview. Styled with the page's own adm-* classes (see CSS in app/admin/page.tsx).
import { useEffect, useState } from 'react';
import {
  GAUGEMINT_PERIODS, fmtDuration, isGaugemintResult,
  type GaugemintPeriod, type GaugemintResult, type GaugemintRow,
} from '@/lib/gaugemintTypes';

const PERIOD_LABEL: Record<GaugemintPeriod, string> = { '7d': '7 days', '30d': '30 days', '12mo': '12 months' };
const TITLE = 'Website visits (Gaugemint)';
const SCOPE = 'Landing-page visits only: the tracking tag is on the public home page (signed-out visitors), not inside the app or the radio.';
const num = (n: number) => n.toLocaleString('en-US');

function regionName(code: string): string {
  try {
    return /^[A-Za-z]{2}$/.test(code) ? new Intl.DisplayNames(['en'], { type: 'region' }).of(code.toUpperCase()) || code : code;
  } catch { return code; }
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <section className="adm-card" aria-label={TITLE}>
      <header><h2>{TITLE}</h2></header>
      <p className="adm-sub" style={{ marginBottom: 10 }}>{SCOPE}</p>
      {children}
    </section>
  );
}

function Ranked({ title, rows }: { title: string; rows: Array<{ name: string; n: number }> }) {
  const max = Math.max(1, ...rows.map((r) => r.n));
  return (
    <div className="adm-gm-box">
      <h3>{title}</h3>
      {rows.length === 0 ? <p className="adm-sub">Nothing in this range.</p> : (
        <ul className="adm-gm-rank">
          {rows.map((r) => (
            <li key={r.name}>
              <div className="adm-gm-rankrow"><span className="adm-gm-name">{r.name}</span><span className="adm-gm-n">{num(r.n)}</span></div>
              <div className="adm-gm-meter"><span style={{ width: `${Math.max(2, (r.n / max) * 100)}%` }} /></div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

const asRanked = (rows: GaugemintRow[], label: (n: string) => string = (n) => n) => rows.map((r) => ({ name: label(r.name), n: r.visitors }));

export default function GaugemintPanel({ token }: { token: string }) {
  const [period, setPeriod] = useState<GaugemintPeriod>('30d');
  const [res, setRes] = useState<GaugemintResult | null>(null);
  const [err, setErr] = useState('');

  useEffect(() => {
    let cancelled = false;
    setRes(null);
    setErr('');
    (async () => {
      try {
        const r = await fetch(`/api/admin/gaugemint?period=${period}`, { cache: 'no-store', headers: { authorization: `Bearer ${token}` } });
        if (r.status === 401) throw new Error('Session expired. Sign in again.');
        if (r.status === 403) throw new Error('This account is not on the admin allowlist.');
        const j: unknown = await r.json().catch(() => null); // a Gaugemint error also arrives as JSON ({ ok:false, error }) with a 5xx status
        if (!isGaugemintResult(j)) throw new Error(`Unexpected response (HTTP ${r.status}).`);
        if (!cancelled) setRes(j);
      } catch (e: unknown) { if (!cancelled) setErr(e instanceof Error && e.message ? e.message : 'failed to load'); }
    })();
    return () => { cancelled = true; };
  }, [period, token]);

  const picker = (
    <select aria-label="Website visits period" className="adm-gm-select" value={period} onChange={(e) => setPeriod(e.target.value as GaugemintPeriod)}>
      {GAUGEMINT_PERIODS.map((p) => <option key={p} value={p}>{PERIOD_LABEL[p]}</option>)}
    </select>
  );

  if (err) return <Shell><div className="adm-row">{picker}<p className="adm-warn" role="alert">Website visits could not be loaded: {err}</p></div></Shell>;
  if (!res) return <Shell><div className="adm-row">{picker}<p className="adm-sub">Loading</p></div></Shell>;

  if (!res.ok) {
    const off = res.error.kind === 'not_configured';
    return (
      <Shell>
        <div style={{ marginBottom: 10 }}>{picker}</div>
        <div className="adm-warn" role="alert">
          <strong>{off ? 'Website analytics is not configured' : 'Website analytics is unavailable'}</strong>
          <div>{res.error.message}</div>
          {off && <div className="adm-sub">The rest of the admin page is not affected. Set the Fly secret GAUGEMINT_READ_KEY (a read-only Gaugemint key for this site) to turn it on.</div>}
        </div>
      </Shell>
    );
  }

  const { stats } = res;
  const t = stats.totals;
  const unit = stats.granularity === 'month' ? 'month' : 'day';
  const peak = Math.max(0, ...stats.series.map((p) => p.visitors));
  const max = Math.max(1, peak);
  const first = stats.series[0]?.day, last = stats.series[stats.series.length - 1]?.day;

  return (
    <Shell>
      <div className="adm-row" style={{ marginBottom: 10 }}>
        {picker}
        <p className="adm-sub" style={{ margin: 0 }}>{stats.site}, last {PERIOD_LABEL[stats.period]}</p>
      </div>
      <div className="adm-gm-stats">
        <div><p className="adm-big">{num(t.visitors)}</p><p className="adm-sub">visitors</p></div>
        <div><p className="adm-big">{num(t.pageviews)}</p><p className="adm-sub">pageviews</p></div>
        <div><p className="adm-big">{num(t.visits)}</p><p className="adm-sub">visits</p></div>
        <div><p className="adm-big">{Math.round(t.bounce_rate)}%</p><p className="adm-sub">bounce rate</p></div>
        <div><p className="adm-big">{fmtDuration(t.visit_duration)}</p><p className="adm-sub">visit duration</p></div>
      </div>

      <div className="adm-gm-box" style={{ marginTop: 12 }}>
        <div className="adm-gm-head"><h3>Visitors per {unit}</h3><span className="adm-sub">peak {num(peak)}</span></div>
        {stats.series.length === 0 ? <p className="adm-sub">No data in this period.</p> : (
          <>
            <div className="adm-gm-bars" role="img" aria-label={`Visitors per ${unit}, ${stats.series.length} bars`}>
              {stats.series.map((p) => (
                <div key={p.day} title={`${p.day}: ${num(p.visitors)} visitors`} style={{ height: `${Math.max(p.visitors ? 5 : 2, (p.visitors / max) * 100)}%`, opacity: p.visitors ? 1 : 0.18 }} />
              ))}
            </div>
            <div className="adm-gm-head"><span className="adm-sub">{first}</span><span className="adm-sub">{last}</span></div>
          </>
        )}
        {stats.period === '12mo' && <p className="adm-sub">One bar per month: the sum of daily visitors (a visitor code rotates daily, so a returning person counts once per day). Gaugemint only returns what it still stores.</p>}
      </div>

      <div className="adm-gm-grid">
        <div className="adm-gm-box">
          <h3>Top pages</h3>
          {stats.pages.length === 0 ? <p className="adm-sub">Nothing in this range.</p> : (
            <table className="adm-gm-table">
              <thead><tr><th>Page</th><th>Visitors</th><th>Views</th></tr></thead>
              <tbody>{stats.pages.map((r) => (
                <tr key={r.name}><td className="adm-gm-name">{r.name}</td><td>{num(r.visitors)}</td><td>{num(r.pageviews)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </div>
        <Ranked title="Top sources" rows={asRanked(stats.sources)} />
        <Ranked title="Top countries" rows={asRanked(stats.countries, regionName)} />
        <Ranked title="Devices" rows={asRanked(stats.devices)} />
      </div>
      <p className="adm-sub" style={{ marginTop: 10 }}>From Gaugemint, updated {new Date(res.fetchedAt).toLocaleTimeString()} (cached up to 60 s). Visitors respecting Do Not Track or Global Privacy Control are not counted.</p>
    </Shell>
  );
}
