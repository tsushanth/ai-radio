import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchExaStories, resetExaSourceState } from './exa.source.ts';
import { MemorySourceStateStore, type SourceStateStore } from './source-state.store.ts';
import { ExaError } from './exa.client.ts';

const now = new Date('2026-11-13T05:00:00.000Z');
const topic = { id: 'startups-vc', name: 'Startups & VC' };
const cfg = { query: 'startup news', category: 'news' as const, position: 'fallback' as const };
const body = (tag: string) => `${tag} The company raised a new round on Wednesday and plans to hire more engineers across several offices this year. `.repeat(8);
const item = (i: number, over: Record<string, unknown> = {}) => ({
  title: `Startup story ${i}`, url: `https://news${i}.example/2026/11/12/story-${i}`, publishedDate: new Date(now.getTime() - i * 3600_000).toISOString(), text: body(`Story ${i}.`), ...over,
});
const eight = () => Array.from({ length: 8 }, (_, i) => item(i + 1));

interface Harness { store: MemorySourceStateStore; calls: any[]; warns: string[]; reports: string[]; deps: any }
function harness(searchResults: () => any[] | Error, env: Record<string, string> = {}): Harness {
  const store = new MemorySourceStateStore();
  const calls: any[] = [], warns: string[] = [], reports: string[] = [];
  const deps = {
    store, now: () => now, env: { EXA_API_KEY: 'k', ...env }, warn: (m: string) => warns.push(m), log: () => {}, report: (f: string) => reports.push(f),
    search: async (p: any) => { calls.push(p); const r = searchResults(); if (r instanceof Error) throw r; return { results: r }; },
  };
  return { store, calls, warns, reports, deps };
}
beforeEach(() => resetExaSourceState());

test('searches once with numResults 8, a 48 h window, news category and 1500 chars, and returns stories', async () => {
  const h = harness(eight);
  const stories = await fetchExaStories(topic, cfg, h.deps);
  assert.equal(stories!.length, 8);
  assert.equal(h.calls.length, 1);
  assert.equal(h.calls[0].numResults, 8);
  assert.equal(h.calls[0].maxCharacters, 1500);
  assert.equal(h.calls[0].category, 'news');
  assert.equal(h.calls[0].startPublishedDate.toISOString(), '2026-11-11T05:00:00.000Z');
});

test('a topic may widen its window to 7 days', async () => {
  const h = harness(eight);
  await fetchExaStories({ id: 'slow', name: 'Slow' }, { query: 'q', windowHours: 168, position: 'fallback' }, h.deps);
  assert.equal(h.calls[0].startPublishedDate.toISOString(), '2026-11-06T05:00:00.000Z');
});

test('each topic is searched at most once per day: the second call reuses the cached stories, no search and no counter spend', async () => {
  const h = harness(eight);
  const first = await fetchExaStories(topic, cfg, h.deps);
  const second = await fetchExaStories(topic, cfg, h.deps);
  assert.equal(h.calls.length, 1);
  assert.equal(h.store.counts.get('2026-11-13'), 1);
  assert.equal(second!.length, first!.length);
});

test('concurrent calls for one topic share a single search', async () => {
  const h = harness(eight);
  const [a, b] = await Promise.all([fetchExaStories(topic, cfg, h.deps), fetchExaStories(topic, cfg, h.deps)]);
  assert.equal(h.calls.length, 1);
  assert.equal(a!.length, b!.length);
});

test('a failed search is not retried the same day, but is the next day', async () => {
  let fail = true;
  const h = harness(() => (fail ? new ExaError('boom', 'http', 500) : eight()));
  assert.equal(await fetchExaStories(topic, cfg, h.deps), undefined);
  fail = false;
  assert.equal(await fetchExaStories(topic, cfg, h.deps), undefined, 'same day: no retry');
  assert.equal(h.calls.length, 1);
  resetExaSourceState();
  const tomorrow = { ...h.deps, now: () => new Date(now.getTime() + 24 * 3600_000) };
  assert.equal((await fetchExaStories(topic, cfg, tomorrow))!.length, 8);
});

test('fewer than 3 usable results is a failure (hub pages, future dates and duplicates do not count)', async () => {
  const h = harness(() => [item(1), item(2, { publishedDate: new Date(now.getTime() + 20 * 3600_000).toISOString() }), item(3, { text: 'short' }), item(4, { title: 'Startup story 1' })]);
  assert.equal(await fetchExaStories(topic, cfg, h.deps), undefined);
  assert.ok(h.warns.some(w => w.includes('only 1 usable')));
  assert.equal(h.store.topics.get(topic.id)!.exaAttemptOk, false);
});

test('exactly 3 usable results is enough', async () => {
  const h = harness(() => [item(1), item(2), item(3)]);
  assert.equal((await fetchExaStories(topic, cfg, h.deps))!.length, 3);
});

test('hard daily cap: the 81st search of the day is refused without calling Exa', async () => {
  const h = harness(eight, { EXA_DAILY_CAP: '80' });
  h.store.counts.set('2026-11-13', 80);
  assert.equal(await fetchExaStories(topic, cfg, h.deps), undefined);
  assert.equal(h.calls.length, 0);
  assert.ok(h.warns.some(w => w.includes('daily cap reached')));
  assert.deepEqual(h.reports, ['exa_daily_cap_reached']);
});

test('EXA_DAILY_CAP is read from the environment', async () => {
  const h = harness(eight, { EXA_DAILY_CAP: '2' });
  for (const id of ['a', 'b', 'c']) await fetchExaStories({ id, name: id }, cfg, h.deps);
  assert.equal(h.calls.length, 2);
});

test('an alert line and one report are raised when the 80th percent of the cap is reached, once per day', async () => {
  const h = harness(eight, { EXA_DAILY_CAP: '10' });
  for (let i = 0; i < 10; i++) await fetchExaStories({ id: `t${i}`, name: 't' }, cfg, h.deps);
  const alerts = h.warns.filter(w => w.includes('ALERT'));
  assert.equal(alerts.length, 1);
  assert.match(alerts[0], /8\/10 daily searches used \(80%\)/);
  assert.equal(h.reports.filter(r => r === 'exa_daily_cap_80pct').length, 1);
});

test('fails closed when the counter or the state cannot be read: no search is made', async () => {
  const h = harness(eight);
  const broken: SourceStateStore = { ...h.store, reserveExaSearch: async () => { throw new Error('no table'); }, getTopicState: async () => undefined, saveExaResult: async () => {}, saveGoodStories: async () => {} };
  assert.equal(await fetchExaStories(topic, cfg, { ...h.deps, store: broken }), undefined);
  const broken2: SourceStateStore = { ...broken, getTopicState: async () => { throw new Error('down'); } };
  assert.equal(await fetchExaStories({ id: 'z', name: 'z' }, cfg, { ...h.deps, store: broken2 }), undefined);
  assert.equal(h.calls.length, 0);
});

test('a rejected key or exhausted credit raises one stable report, never containing the key', async () => {
  const h = harness(() => new ExaError('Exa rejected the API key (401)', 'auth', 401), { EXA_API_KEY: 'sekret-key-value' });
  await fetchExaStories(topic, cfg, h.deps);
  await fetchExaStories({ id: 'other', name: 'o' }, cfg, h.deps);
  assert.equal(h.reports.filter(r => r === 'exa_auth').length, 1);
  assert.ok(![...h.warns, ...h.reports].some(m => m.includes('sekret-key-value')));
});

test('unexpected errors fall through instead of throwing', async () => {
  const h = harness(() => { throw new TypeError('weird'); });
  assert.equal(await fetchExaStories(topic, cfg, h.deps), undefined);
});
