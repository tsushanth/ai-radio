import test from 'node:test';
import assert from 'node:assert/strict';
import {
  LlmBudget, LlmBudgetExceeded, MemoryBudgetStore, SupabaseBudgetStore, isBudgetExceeded, readBudgetConfig, type BudgetStore,
} from './llmBudget.ts';

type Report = { flow: string; context: Record<string, string> };
function make(env: Record<string, string> = {}, store: BudgetStore = new MemoryBudgetStore(), start = '2026-11-13T10:00:00Z') {
  let now = Date.parse(start);
  const reports: Report[] = [];
  const logs: string[] = [];
  const b = new LlmBudget({
    store, env, now: () => now, flushMs: 5, refreshMs: -1, // -1: always re-read (the fake clock does not move)
   
    report: (flow, _e, context) => reports.push({ flow, context: context ?? {} }),
    log: (m) => logs.push(m),
  });
  return { b, store, reports, logs, advance: (ms: number) => { now += ms; }, setNow: (iso: string) => { now = Date.parse(iso); } };
}
const settle = () => new Promise((r) => setTimeout(r, 15));

test('config: defaults are $3 and 600 calls; env overrides; 0 means no such cap; LLM_BUDGET=off disables', () => {
  assert.deepEqual(readBudgetConfig({}), { enabled: true, capUsd: 3, capCalls: 600, alertFraction: 0.8 });
  assert.deepEqual(readBudgetConfig({ LLM_DAILY_CAP_USD: '1.5', LLM_DAILY_CAP_CALLS: '10' }), { enabled: true, capUsd: 1.5, capCalls: 10, alertFraction: 0.8 });
  assert.equal(readBudgetConfig({ LLM_DAILY_CAP_USD: '0' }).capUsd, 0);
  assert.equal(readBudgetConfig({ LLM_DAILY_CAP_USD: 'abc', LLM_DAILY_CAP_CALLS: '-4' }).capUsd, 3);
  assert.equal(readBudgetConfig({ LLM_BUDGET: 'off' }).enabled, false);
});

test('dollars accumulate and the cap trips at exactly the cap; assert() throws a typed error that carries 429', async () => {
  const { b } = make({ LLM_DAILY_CAP_USD: '1', LLM_DAILY_CAP_CALLS: '0' });
  b.record({ ok: true, usd: 0.4 });
  b.record({ ok: true, usd: 0.4 });
  assert.equal((await b.status()).capped, false);
  await b.assert();
  b.record({ ok: true, usd: 0.2 });
  const st = await b.status();
  assert.equal(st.capped, true);
  assert.ok(Math.abs(st.usd - 1) < 1e-9);
  await assert.rejects(b.assert(), (e: unknown) => e instanceof LlmBudgetExceeded && e.status === 429 && /tomorrow/i.test(e.message) && isBudgetExceeded(e));
});

test('the call cap trips independently of dollars (what matters with a model that costs $0.0007 a script)', async () => {
  const { b } = make({ LLM_DAILY_CAP_USD: '3', LLM_DAILY_CAP_CALLS: '3' });
  for (let i = 0; i < 3; i++) b.record({ ok: true, usd: 0.0007 });
  assert.equal((await b.status()).capped, true);
});

test('failed calls neither cost nor count', async () => {
  const { b } = make({ LLM_DAILY_CAP_CALLS: '2' });
  for (let i = 0; i < 5; i++) b.record({ ok: false, usd: 0 });
  assert.equal((await b.status()).calls, 0);
});

test('alerts: one at 80% and one at the cap, through the failure-reporter path, never repeated the same UTC day', async () => {
  const { b, reports } = make({ LLM_DAILY_CAP_USD: '1', LLM_DAILY_CAP_CALLS: '0' });
  b.record({ ok: true, usd: 0.7 });
  await settle();
  assert.equal(reports.length, 0);
  b.record({ ok: true, usd: 0.15 }); // 85%
  b.record({ ok: true, usd: 0.01 });
  await settle();
  assert.deepEqual(reports.map((r) => r.flow), ['llm_daily_cap_80pct']);
  assert.equal(reports[0].context.cap_usd, '1');
  b.record({ ok: true, usd: 0.2 }); // over the cap
  b.record({ ok: true, usd: 0.2 });
  await b.status();
  await settle();
  assert.deepEqual(reports.map((r) => r.flow), ['llm_daily_cap_80pct', 'llm_daily_cap_reached']);
});

test('alerts are claimed in the shared store, so a second machine or a restart does not repeat them', async () => {
  const store = new MemoryBudgetStore();
  const a = make({ LLM_DAILY_CAP_CALLS: '5', LLM_DAILY_CAP_USD: '0' }, store);
  const b = make({ LLM_DAILY_CAP_CALLS: '5', LLM_DAILY_CAP_USD: '0' }, store);
  for (let i = 0; i < 5; i++) a.b.record({ ok: true, usd: 0 });
  await settle();
  for (let i = 0; i < 5; i++) b.b.record({ ok: true, usd: 0 });
  await settle();
  assert.deepEqual(a.reports.map((r) => r.flow).sort(), ['llm_daily_cap_80pct', 'llm_daily_cap_reached']);
  assert.deepEqual(b.reports, []);
});

test('totals persist: a new process (fresh LlmBudget on the same store) starts from what was already spent today', async () => {
  const store = new MemoryBudgetStore();
  const first = make({ LLM_DAILY_CAP_USD: '1', LLM_DAILY_CAP_CALLS: '0' }, store);
  first.b.record({ ok: true, usd: 0.6 });
  await first.b.flush();
  assert.deepEqual(await store.get('2026-11-13'), { calls: 1, usd: 0.6 });
  const restarted = make({ LLM_DAILY_CAP_USD: '1', LLM_DAILY_CAP_CALLS: '0' }, store);
  assert.equal((await restarted.b.status()).usd, 0.6);
  restarted.b.record({ ok: true, usd: 0.5 });
  assert.equal((await restarted.b.status()).capped, true);
});

test('two machines see each other: after a flush the returned total includes the other one', async () => {
  const store = new MemoryBudgetStore();
  const a = make({ LLM_DAILY_CAP_USD: '1', LLM_DAILY_CAP_CALLS: '0' }, store);
  const b = make({ LLM_DAILY_CAP_USD: '1', LLM_DAILY_CAP_CALLS: '0' }, store);
  a.b.record({ ok: true, usd: 0.6 });
  await a.b.flush();
  b.b.record({ ok: true, usd: 0.5 });
  await b.b.flush();
  assert.equal((await b.b.status()).capped, true);
  assert.equal((await a.b.status()).capped, true, 'a re-reads the shared total');
});

test('a new UTC day starts at zero and yesterday is not lost', async () => {
  const { b, store, setNow } = make({ LLM_DAILY_CAP_CALLS: '2', LLM_DAILY_CAP_USD: '0' }, undefined, '2026-11-13T23:59:00Z');
  b.record({ ok: true, usd: 0.1 });
  b.record({ ok: true, usd: 0.1 });
  assert.equal((await b.status()).capped, true);
  setNow('2026-11-14T00:00:30Z');
  assert.equal((await b.status()).capped, false);
  b.record({ ok: true, usd: 0.1 });
  await b.flush();
  assert.deepEqual(await store.get('2026-11-13'), { calls: 2, usd: 0.2 });
  assert.equal((await store.get('2026-11-14')).calls, 1);
});

test('a broken store (migration not applied, network down) never blocks: the local tally still enforces the cap, and it warns once', async () => {
  const broken: BudgetStore = {
    add: async () => { throw new Error('relation does not exist'); },
    get: async () => { throw new Error('relation does not exist'); },
    markAlert: async () => { throw new Error('relation does not exist'); },
  };
  const { b, logs, reports } = make({ LLM_DAILY_CAP_CALLS: '3', LLM_DAILY_CAP_USD: '0' }, broken);
  b.record({ ok: true, usd: 0 });
  assert.equal((await b.status()).capped, false, 'not capped, and no throw');
  await b.flush(); await b.flush();
  b.record({ ok: true, usd: 0 }); b.record({ ok: true, usd: 0 });
  assert.equal((await b.status()).capped, true);
  await settle();
  assert.equal(logs.filter((l) => /store unavailable/.test(l)).length, 1);
  assert.ok(reports.some((r) => r.flow === 'llm_daily_cap_reached'), 'the process alerts itself when the store cannot decide who is first');
});

test('LLM_BUDGET=off: never capped, nothing recorded', async () => {
  const { b } = make({ LLM_BUDGET: 'off', LLM_DAILY_CAP_CALLS: '1' });
  for (let i = 0; i < 5; i++) b.record({ ok: true, usd: 10 });
  assert.equal((await b.status()).capped, false);
  await b.assert();
});

test('SupabaseBudgetStore maps the three RPCs and turns RPC errors and malformed data into throws', async () => {
  const calls: Array<[string, Record<string, unknown>]> = [];
  let reply: { data: unknown; error: { message: string } | null } = { data: { calls: 3, usd: 0.0021 }, error: null };
  const s = new SupabaseBudgetStore({ rpc: async (fn, args) => { calls.push([fn, args]); return reply; } });
  assert.deepEqual(await s.add('2026-11-13', 1, 0.0007), { calls: 3, usd: 0.0021 });
  assert.deepEqual(await s.get('2026-11-13'), { calls: 3, usd: 0.0021 });
  reply = { data: true, error: null };
  assert.equal(await s.markAlert('2026-11-13', 'warn'), true);
  reply = { data: false, error: null };
  assert.equal(await s.markAlert('2026-11-13', 'cap'), false);
  assert.deepEqual(calls.map(([fn]) => fn), ['llm_budget_add', 'llm_budget_get', 'llm_budget_mark_alert', 'llm_budget_mark_alert']);
  assert.deepEqual(calls[0][1], { p_day: '2026-11-13', p_calls: 1, p_usd: 0.0007 });
  reply = { data: null, error: { message: 'function not found' } };
  await assert.rejects(s.add('2026-11-13', 1, 0), /function not found/);
  reply = { data: { calls: 'x' }, error: null };
  await assert.rejects(s.get('2026-11-13'), /malformed/);
});
