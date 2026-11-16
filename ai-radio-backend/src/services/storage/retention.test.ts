import test from 'node:test';
import assert from 'node:assert/strict';
import {
  runRetention, readRetentionConfig, keepFromDate, retentionDaysFor, formatReport, type EpisodeRow, type RetentionStore,
} from './retention.ts';
import { parseArgs } from '../../scripts/audio-retention.ts';

const NOW = new Date('2026-11-15T10:00:00Z');
const CFG = { daysEn: 30, daysOther: 14, maxDeletes: 500 };
const MB = 1024 * 1024;

const row = (topic: string, date: string, lang: string, over: Partial<EpisodeRow> = {}): EpisodeRow => ({
  id: `${topic}-${date}-${lang}`, topic_id: topic, date, language: lang,
  audio_path: `${topic}/${date}-${lang}.mp3`, audio_url: `https://x.invalid/${topic}/${date}-${lang}.mp3`, ...over,
});

/** In-memory store. Every call is logged so tests can prove a dry run touched nothing. */
function fakeStore(rows: EpisodeRow[], sizes: Record<string, number> = {}, failDelete: string[] = []) {
  const calls: string[] = []; const deleted: string[] = []; const marked: string[] = [];
  const store: RetentionStore = {
    async listEpisodes(before, afterId, limit) {
      calls.push('list');
      return rows.filter((r) => r.date < before && (!afterId || r.id > afterId)).sort((a, b) => (a.id < b.id ? -1 : 1)).slice(0, limit);
    },
    async objectSizes(paths) { calls.push('sizes'); return new Map(paths.map((p) => [p, sizes[p] ?? null])); },
    async deleteObjects(paths) { calls.push('delete'); const bad = paths.filter((p) => failDelete.includes(p)); const ok = paths.filter((p) => !bad.includes(p)); deleted.push(...ok); return { deleted: ok, failed: bad }; },
    async markExpired(ids) { calls.push('mark'); marked.push(...ids); },
  };
  return { store, calls, deleted, marked };
}

test('policy: 30 days English, 14 days other, never under 7 days whatever the env says', () => {
  assert.deepEqual(readRetentionConfig({}), { daysEn: 30, daysOther: 14, maxDeletes: 500 });
  assert.deepEqual(readRetentionConfig({ AUDIO_RETENTION_DAYS_EN: '1', AUDIO_RETENTION_DAYS_OTHER: '0', AUDIO_RETENTION_MAX_DELETES: '10' }), { daysEn: 7, daysOther: 7, maxDeletes: 10 });
  assert.equal(retentionDaysFor('en', CFG), 30); assert.equal(retentionDaysFor('cs', CFG), 14); assert.equal(retentionDaysFor('', CFG), 30);
  assert.equal(keepFromDate('en', CFG, NOW), '2026-10-16'); assert.equal(keepFromDate('cs', CFG, NOW), '2026-11-01');
});

test('dry run reports counts and sizes per language and calls nothing that changes data', async () => {
  const rows = [
    row('tech-news', '2026-10-01', 'en'), row('tech-news', '2026-10-20', 'en'),   // old English (expired), recent English (kept)
    row('world-update', '2026-10-25', 'cs'), row('world-update', '2026-11-10', 'cs'), // old Czech (expired), recent Czech (kept)
    row('eli5', '2026-10-30', 'de'),
  ];
  const f = fakeStore(rows, { 'tech-news/2026-10-01-en.mp3': 11 * MB, 'world-update/2026-10-25-cs.mp3': 4 * MB });
  const r = await runRetention(f.store, { now: NOW, config: CFG });
  assert.equal(r.mode, 'dry-run'); assert.equal(r.candidates, 3); assert.equal(r.wouldDelete, 3);
  assert.deepEqual(r.byLanguage.en, { episodes: 1, bytes: 11 * MB, unknownSize: 0 });
  assert.deepEqual(r.byLanguage.cs, { episodes: 1, bytes: 4 * MB, unknownSize: 0 });
  assert.deepEqual(r.byLanguage.de, { episodes: 1, bytes: 0, unknownSize: 1 });
  assert.equal(r.bytes, 15 * MB); assert.equal(r.objectsWithUnknownSize, 1);
  assert.equal(r.oldestDate, '2026-10-01'); assert.equal(r.newestDate, '2026-10-30');
  assert.deepEqual(f.deleted, []); assert.deepEqual(f.marked, []);
  assert.ok(!f.calls.includes('delete') && !f.calls.includes('mark'));
  assert.match(formatReport(r), /Would delete: 3 objects, 15\.0 MB known \(\+1 of unknown size\)[\s\S]*Nothing was deleted \(dry run\)\./);
});

test('rows without audio, with an unexpected path, or already cleared are never candidates; ask/ audio is never touched', async () => {
  const rows = [
    row('a', '2026-09-01', 'en', { audio_url: null }),
    row('b', '2026-09-01', 'en', { audio_path: null }),
    row('c', '2026-09-01', 'en', { audio_path: 'ask/abc.mp3' }),
    row('d', '2026-09-01', 'en', { audio_path: '../etc/passwd' }),
    row('e', '2026-09-01', 'en'),
  ];
  const f = fakeStore(rows);
  const r = await runRetention(f.store, { now: NOW, config: CFG, apply: true });
  assert.equal(r.candidates, 1); assert.equal(r.skippedUnsafePath, 2);
  assert.deepEqual(f.deleted, ['e/2026-09-01-en.mp3']);
});

test('apply deletes expired objects, clears audio_url only for rows whose object is gone, and reports failures', async () => {
  const rows = [row('t', '2026-09-01', 'en'), row('t', '2026-09-02', 'en'), row('u', '2026-10-01', 'pl')];
  const f = fakeStore(rows, {}, ['t/2026-09-02-en.mp3']);
  const r = await runRetention(f.store, { now: NOW, config: CFG, apply: true });
  assert.equal(r.mode, 'apply');
  assert.deepEqual(r.applied, { deleted: 2, failed: 1, rowsMarked: 2 });
  assert.deepEqual(f.marked.sort(), ['t-2026-09-01-en', 'u-2026-10-01-pl']);
});

test('the per-run cap limits what is targeted, oldest first, and says how many were deferred', async () => {
  const rows = [row('t', '2026-09-03', 'en'), row('t', '2026-09-01', 'en'), row('t', '2026-09-02', 'en')];
  const f = fakeStore(rows);
  const r = await runRetention(f.store, { now: NOW, config: { ...CFG, maxDeletes: 2 }, apply: true });
  assert.equal(r.candidates, 3); assert.equal(r.wouldDelete, 2); assert.equal(r.deferredByCap, 1);
  assert.deepEqual(f.deleted.sort(), ['t/2026-09-01-en.mp3', 't/2026-09-02-en.mp3']);
});

test('paging: more rows than one page are all seen', async () => {
  const rows = Array.from({ length: 25 }, (_, i) => row('t', `2026-09-${String(i + 1).padStart(2, '0')}`, 'en'));
  const f = fakeStore(rows);
  const r = await runRetention(f.store, { now: NOW, config: CFG, pageSize: 10 });
  assert.equal(r.candidates, 25);
});

test('nothing to do: an empty report and no storage calls', async () => {
  const f = fakeStore([]);
  const r = await runRetention(f.store, { now: NOW, config: CFG, apply: true });
  assert.equal(r.candidates, 0); assert.equal(r.applied, undefined);
  assert.ok(!f.calls.includes('sizes') && !f.calls.includes('delete'));
});

test('CLI: dry run is the default; --apply is refused unless AUDIO_RETENTION_APPLY=yes is also set', () => {
  assert.deepEqual(parseArgs([], {}), { apply: false, json: false });
  assert.deepEqual(parseArgs(['--json'], {}), { apply: false, json: true });
  assert.ok(parseArgs(['--apply'], {}).refused);
  assert.equal(parseArgs(['--apply'], {}).apply, false);
  assert.deepEqual(parseArgs(['--apply'], { AUDIO_RETENTION_APPLY: 'yes' }), { apply: true, json: false });
  assert.ok(parseArgs(['--apply'], { AUDIO_RETENTION_APPLY: 'true' }).refused);
});
