import test from 'node:test';
import assert from 'node:assert/strict';
import type { SupabaseClient } from '@supabase/supabase-js';
import { reapStuckRows, REAP_NOTE, REAP_MAX_ROWS, RUN_STUCK_HOURS, EPISODE_STUCK_HOURS } from './stuck-reaper.ts';

type Row = Record<string, any>;

/** Minimal in-memory stand-in for the supabase-js query builder (select/update + eq/lt/in/limit), enough for the reaper. */
function fakeSupabase(tables: Record<string, Row[]>) {
  const log: Array<{ table: string; patch: Row; ids: string[] }> = [];
  const from = (table: string) => {
    const filters: Array<(r: Row) => boolean> = [];
    let patch: Row | null = null;
    let lim = Infinity;
    const q: any = {
      select() { return q; },
      update(p: Row) { patch = p; return q; },
      eq(c: string, v: any) { filters.push(r => r[c] === v); return q; },
      lt(c: string, v: any) { filters.push(r => r[c] != null && r[c] < v); return q; },
      in(c: string, vs: any[]) { filters.push(r => vs.includes(r[c])); return q; },
      limit(n: number) { lim = n; return q; },
      then(resolve: any) {
        const hit = tables[table].filter(r => filters.every(f => f(r))).slice(0, lim);
        if (patch) { for (const r of hit) Object.assign(r, patch); log.push({ table, patch, ids: hit.map(r => r.id) }); }
        resolve({ data: hit.map(r => ({ id: r.id })), error: null });
      },
    };
    return q;
  };
  return { client: { from } as unknown as SupabaseClient, log };
}

const NOW = new Date('2026-10-29T12:00:00Z');
const ago = (h: number) => new Date(NOW.getTime() - h * 3600_000).toISOString();

test('marks old running runs and old generating episodes failed, leaves younger or other-status rows alone', async () => {
  const tables = {
    batch_generation_runs: [
      { id: 'old-run', status: 'running', started_at: ago(RUN_STUCK_HOURS + 1), results: null },
      { id: 'young-run', status: 'running', started_at: ago(RUN_STUCK_HOURS - 1), results: null },
      { id: 'done-run', status: 'completed', started_at: ago(100), results: [1] },
    ],
    topic_episodes: [
      { id: 'old-ep', status: 'generating', updated_at: ago(EPISODE_STUCK_HOURS + 1), error: null },
      { id: 'young-ep', status: 'generating', updated_at: ago(EPISODE_STUCK_HOURS - 1), error: null },
      { id: 'ok-ep', status: 'completed', updated_at: ago(100), error: null },
    ],
  };
  const { client } = fakeSupabase(tables);
  const reports: Array<{ flow: string; msg: string; ctx: Record<string, string> }> = [];
  const res = await reapStuckRows(client, (flow, err, ctx) => { reports.push({ flow, msg: (err as Error).message, ctx: ctx ?? {} }); }, NOW);

  assert.deepEqual(res, { runs: 1, episodes: 1 });
  assert.equal(tables.batch_generation_runs[0].status, 'failed');
  assert.deepEqual(tables.batch_generation_runs[0].results, { error: REAP_NOTE });
  assert.equal(tables.batch_generation_runs[1].status, 'running');
  assert.equal(tables.batch_generation_runs[2].status, 'completed');
  assert.deepEqual(tables.batch_generation_runs[2].results, [1]);
  assert.equal(tables.topic_episodes[0].status, 'failed');
  assert.equal(tables.topic_episodes[0].error, REAP_NOTE);
  assert.equal(tables.topic_episodes[1].status, 'generating');
  assert.equal(tables.topic_episodes[2].status, 'completed');
  assert.equal(reports.length, 1);
  assert.equal(reports[0].flow, 'stuck_rows_reaped');
  assert.deepEqual(reports[0].ctx, { runs: '1', episodes: '1' });
});

test('caps each pass at 200 rows', async () => {
  const eps = Array.from({ length: 250 }, (_, i) => ({ id: `e${i}`, status: 'generating', updated_at: ago(50), error: null }));
  const { client } = fakeSupabase({ batch_generation_runs: [], topic_episodes: eps });
  const res = await reapStuckRows(client, () => {}, NOW);
  assert.equal(res.episodes, REAP_MAX_ROWS);
  assert.equal(eps.filter(e => e.status === 'failed').length, 200);
});

test('nothing stuck: no change and no report', async () => {
  const { client, log } = fakeSupabase({ batch_generation_runs: [], topic_episodes: [] });
  let n = 0;
  const res = await reapStuckRows(client, () => { n++; }, NOW);
  assert.deepEqual(res, { runs: 0, episodes: 0 });
  assert.equal(n, 0);
  assert.equal(log.length, 0);
});

test('no database client: does nothing and does not throw', async () => {
  assert.deepEqual(await reapStuckRows(null, () => { throw new Error('should not report'); }, NOW), { runs: 0, episodes: 0 });
});

test('a database error is swallowed (the batch must still run)', async () => {
  const boom = { from: () => { const q: any = { select: () => q, eq: () => q, lt: () => q, limit: () => q, then: (r: any) => r({ data: null, error: { message: 'db down' } }) }; return q; } } as unknown as SupabaseClient;
  assert.deepEqual(await reapStuckRows(boom, () => {}, NOW), { runs: 0, episodes: 0 });
});
