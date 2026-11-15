/**
 * Retention for topic episode audio (bucket `topic-podcasts`).
 *
 * Policy: the audio of an episode is deleted once its date is older than RETENTION days: 14 for non-English, 30 for English
 * (AUDIO_RETENTION_DAYS_OTHER / AUDIO_RETENTION_DAYS_EN). Never less than 7 days whatever the setting. The `topic_episodes` row is
 * kept (title, script, stories, play count); only `audio_url` is cleared so listings stop offering a dead link.
 *
 * This module only PLANS and, when asked, applies. It is not scheduled anywhere. `runRetention` is a dry run unless `apply` is true,
 * and apply is also limited to `maxDeletes` objects per run. Only objects named `<topic>/<yyyy-mm-dd>-<lang>.mp3` are ever touched:
 * `ask/` audio, other buckets and anything unexpected are skipped and counted.
 */

export const MIN_RETENTION_DAYS = 7;
export const DEFAULT_RETENTION_DAYS_EN = 30;
export const DEFAULT_RETENTION_DAYS_OTHER = 14;
export const DEFAULT_MAX_DELETES = 500;

export interface RetentionConfig { daysEn: number; daysOther: number; maxDeletes: number }

const intOr = (v: string | undefined, dflt: number) => { const n = Number((v ?? '').trim()); return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : dflt; };

export function readRetentionConfig(env: NodeJS.ProcessEnv = process.env): RetentionConfig {
  return {
    daysEn: Math.max(MIN_RETENTION_DAYS, intOr(env.AUDIO_RETENTION_DAYS_EN, DEFAULT_RETENTION_DAYS_EN)),
    daysOther: Math.max(MIN_RETENTION_DAYS, intOr(env.AUDIO_RETENTION_DAYS_OTHER, DEFAULT_RETENTION_DAYS_OTHER)),
    maxDeletes: Math.max(1, intOr(env.AUDIO_RETENTION_MAX_DELETES, DEFAULT_MAX_DELETES)),
  };
}

export const retentionDaysFor = (language: string, cfg: RetentionConfig) => ((language || 'en').toLowerCase() === 'en' ? cfg.daysEn : cfg.daysOther);

/** The newest date (YYYY-MM-DD, UTC) whose audio is still kept for this language: dates strictly before it are expired. */
export function keepFromDate(language: string, cfg: RetentionConfig, now: Date): string {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  d.setUTCDate(d.getUTCDate() - retentionDaysFor(language, cfg));
  return d.toISOString().slice(0, 10);
}

export interface EpisodeRow { id: string; topic_id: string; date: string; language: string | null; audio_path: string | null; audio_url: string | null }

export interface RetentionStore {
  /** Completed episodes that still have audio and a date before `beforeDate`, a page at a time (cursor = last id of the previous page). */
  listEpisodes(beforeDate: string, afterId: string | null, limit: number): Promise<EpisodeRow[]>;
  /** Size in bytes per object path, null when unknown. */
  objectSizes(paths: string[]): Promise<Map<string, number | null>>;
  deleteObjects(paths: string[]): Promise<{ deleted: string[]; failed: string[] }>;
  /** Clear audio_url on these rows. */
  markExpired(ids: string[]): Promise<void>;
}

const PATH_RE = /^[a-z0-9][a-z0-9_-]*\/\d{4}-\d{2}-\d{2}-[a-z]{2,3}\.mp3$/;

export interface LangReport { episodes: number; bytes: number; unknownSize: number }
export interface RetentionReport {
  mode: 'dry-run' | 'apply';
  asOf: string;
  policy: { daysEn: number; daysOther: number; maxDeletes: number };
  candidates: number;
  /** Candidates that fit under maxDeletes (the ones an apply run would delete now). */
  wouldDelete: number;
  deferredByCap: number;
  skippedUnsafePath: number;
  bytes: number;
  objectsWithUnknownSize: number;
  byLanguage: Record<string, LangReport>;
  oldestDate: string | null;
  newestDate: string | null;
  applied?: { deleted: number; failed: number; rowsMarked: number };
}

export interface RunOptions { apply?: boolean; now?: Date; config?: RetentionConfig; pageSize?: number }

export async function runRetention(store: RetentionStore, o: RunOptions = {}): Promise<RetentionReport> {
  const now = o.now ?? new Date();
  const cfg = o.config ?? readRetentionConfig();
  const pageSize = o.pageSize ?? 500;
  const apply = o.apply === true;
  // widest bound: the shorter of the two retention periods, so one scan finds everything either policy could expire
  const scanBefore = keepFromDate('en', { ...cfg, daysEn: Math.min(cfg.daysEn, cfg.daysOther) }, now);

  const expired: EpisodeRow[] = [];
  let skippedUnsafePath = 0;
  let cursor: string | null = null;
  for (;;) {
    const page = await store.listEpisodes(scanBefore, cursor, pageSize);
    for (const r of page) {
      if (!r.audio_path || !r.audio_url) continue;
      const lang = (r.language || 'en').toLowerCase();
      if (!(r.date < keepFromDate(lang, cfg, now))) continue;
      if (!PATH_RE.test(r.audio_path)) { skippedUnsafePath++; continue; }
      expired.push(r);
    }
    if (page.length < pageSize) break;
    cursor = page[page.length - 1].id;
  }
  expired.sort((a, b) => (a.date === b.date ? (a.id < b.id ? -1 : 1) : a.date < b.date ? -1 : 1)); // oldest first

  const toDelete = expired.slice(0, cfg.maxDeletes);
  const sizes = toDelete.length ? await store.objectSizes(toDelete.map((r) => r.audio_path!)) : new Map<string, number | null>();
  const byLanguage: Record<string, LangReport> = {};
  let bytes = 0; let unknown = 0;
  for (const r of toDelete) {
    const lang = (r.language || 'en').toLowerCase();
    const l = (byLanguage[lang] ??= { episodes: 0, bytes: 0, unknownSize: 0 });
    const sz = sizes.get(r.audio_path!);
    l.episodes++;
    if (typeof sz === 'number') { l.bytes += sz; bytes += sz; } else { l.unknownSize++; unknown++; }
  }
  const report: RetentionReport = {
    mode: apply ? 'apply' : 'dry-run',
    asOf: now.toISOString(),
    policy: { daysEn: cfg.daysEn, daysOther: cfg.daysOther, maxDeletes: cfg.maxDeletes },
    candidates: expired.length,
    wouldDelete: toDelete.length,
    deferredByCap: expired.length - toDelete.length,
    skippedUnsafePath,
    bytes,
    objectsWithUnknownSize: unknown,
    byLanguage,
    oldestDate: expired[0]?.date ?? null,
    newestDate: expired.length ? expired[expired.length - 1].date : null,
  };
  if (!apply || toDelete.length === 0) return report;

  let deleted = 0; let failed = 0; let marked = 0;
  for (let i = 0; i < toDelete.length; i += 100) {
    const batch = toDelete.slice(i, i + 100);
    const res = await store.deleteObjects(batch.map((r) => r.audio_path!));
    const gone = new Set(res.deleted);
    deleted += res.deleted.length; failed += res.failed.length;
    const ids = batch.filter((r) => gone.has(r.audio_path!)).map((r) => r.id);
    if (ids.length) { await store.markExpired(ids); marked += ids.length; }
  }
  report.applied = { deleted, failed, rowsMarked: marked };
  return report;
}

export function formatReport(r: RetentionReport): string {
  const mb = (b: number) => `${(b / (1024 * 1024)).toFixed(1)} MB`;
  const lines = [
    `Audio retention (${r.mode}) as of ${r.asOf}`,
    `Policy: English ${r.policy.daysEn} days, other languages ${r.policy.daysOther} days, at most ${r.policy.maxDeletes} objects per run`,
    `Expired episodes found: ${r.candidates} (${r.wouldDelete} in this run, ${r.deferredByCap} deferred by the cap, ${r.skippedUnsafePath} skipped: unexpected path)`,
    `${r.mode === 'apply' ? 'Targeted' : 'Would delete'}: ${r.wouldDelete} objects, ${mb(r.bytes)} known${r.objectsWithUnknownSize ? ` (+${r.objectsWithUnknownSize} of unknown size)` : ''}`,
  ];
  for (const [lang, l] of Object.entries(r.byLanguage).sort()) lines.push(`  ${lang}: ${l.episodes} objects, ${mb(l.bytes)}${l.unknownSize ? `, ${l.unknownSize} unknown` : ''}`);
  if (r.oldestDate) lines.push(`Date range: ${r.oldestDate} .. ${r.newestDate}`);
  if (r.applied) lines.push(`Applied: ${r.applied.deleted} deleted, ${r.applied.failed} failed, ${r.applied.rowsMarked} rows cleared`);
  else lines.push('Nothing was deleted (dry run).');
  return lines.join('\n');
}
