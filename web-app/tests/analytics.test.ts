import test from 'node:test';
import assert from 'node:assert/strict';
import {
  createAnalytics, cleanLang, cleanLocale, cleanTopicId,
  OPT_OUT_KEY, ID_KEY, QUEUE_KEY, FIRST_PLAY_KEY, MAX_BATCH, MAX_QUEUE, CHECKPOINT_MS, MIN_GAP_MS,
  type StorageLike,
} from '../src/lib/analytics.ts';

class MemStorage implements StorageLike {
  m = new Map<string, string>();
  getItem(k: string) { return this.m.has(k) ? (this.m.get(k) as string) : null; }
  setItem(k: string, v: string) { this.m.set(k, v); }
  removeItem(k: string) { this.m.delete(k); }
}

function make(opts: { blocked?: boolean; status?: number | (() => number); storage?: MemStorage } = {}) {
  const storage = opts.storage ?? new MemStorage();
  const clock = { t: 1_000_000_000_000 };
  const sent: { url: string; body: any }[] = [];
  let n = 0;
  const a = createAnalytics({
    storage,
    now: () => clock.t,
    send: async (url, body) => {
      sent.push({ url, body: JSON.parse(body) });
      const s = typeof opts.status === 'function' ? opts.status() : opts.status ?? 202;
      if (s === 0) throw new Error('offline');
      return s;
    },
    newId: () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`,
    endpoint: 'https://example.test/api/events',
    appVersion: 'web',
    blocked: () => !!opts.blocked,
  });
  return { a, storage, clock, sent };
}

test('nothing is queued or sent when the browser says do not track', async () => {
  const { a, sent, storage } = make({ blocked: true });
  a.track('app_open', { locale: 'en-US' });
  a.listenStart({ source: 'radio', language: 'en' });
  a.listenStop();
  await a.flush(true);
  assert.equal(a.pending(), 0);
  assert.equal(sent.length, 0);
  assert.equal(storage.m.size, 0, 'no id and no flags are written either');
});

test('opt-out is honoured: stops tracking, deletes the id, queue and flags; opt-in starts a new id', async () => {
  const { a, storage, sent } = make();
  a.track('app_open', { locale: 'en' });
  await a.flush(true);
  const firstId = sent[0].body.install_id;
  assert.equal(storage.getItem(ID_KEY), firstId);
  a.track('topic_open', { topic_id: 'ai-ml' });
  a.setEnabled(false);
  assert.equal(a.isEnabled(), false);
  assert.equal(storage.getItem(OPT_OUT_KEY), '1');
  assert.equal(storage.getItem(ID_KEY), null);
  assert.equal(storage.getItem(QUEUE_KEY), null);
  assert.equal(storage.getItem(FIRST_PLAY_KEY), null);
  assert.equal(a.pending(), 0);
  a.track('app_open', { locale: 'en' });
  await a.flush(true);
  assert.equal(sent.length, 1, 'nothing sent after opt-out');
  a.setEnabled(true);
  a.track('app_open', { locale: 'en' });
  await a.flush(true);
  assert.equal(sent.length, 2);
  assert.notEqual(sent[1].body.install_id, firstId);
});

test('the stored opt-out flag survives a reload (new instance, same storage)', () => {
  const storage = new MemStorage();
  make({ storage }).a.setEnabled(false);
  const { a } = make({ storage });
  a.track('app_open', { locale: 'en' });
  assert.equal(a.pending(), 0);
});

test('batches events into one request with the agreed envelope and no other fields', async () => {
  const { a, sent, clock } = make();
  a.track('app_open', { locale: 'en-US' });
  clock.t += 5000;
  a.track('topic_open', { topic_id: 'ai-ml' });
  clock.t += 5000;
  await a.flush();
  assert.equal(sent.length, 1);
  const b = sent[0].body;
  assert.deepEqual(Object.keys(b).sort(), ['app_version', 'events', 'install_id', 'platform']);
  assert.equal(b.platform, 'web');
  assert.match(b.install_id, /^[0-9a-f-]{36}$/);
  assert.deepEqual(b.events, [
    { name: 'app_open', props: { locale: 'en-US' }, ago_s: 10 },
    { name: 'topic_open', props: { topic_id: 'ai-ml' }, ago_s: 5 },
  ]);
});

test('at most MAX_BATCH events per request; a long queue is sent as several requests in one flush (max 4)', async () => {
  const { a, sent } = make();
  for (let i = 0; i < 60; i++) a.track('topic_open', { topic_id: 'ai-ml' });
  await a.flush(true);
  assert.ok(sent.every((s) => s.body.events.length <= MAX_BATCH));
  assert.ok(sent.length <= 4);
});

test('reaching 20 queued events triggers a send without waiting for a timer', async () => {
  const { a, sent } = make();
  for (let i = 0; i < 20; i++) a.track('topic_open', { topic_id: 'ai-ml' });
  await new Promise((r) => setTimeout(r, 5));
  assert.equal(sent.length, 1);
});

test('queue is bounded (oldest dropped) so an offline browser cannot grow storage', () => {
  const { a } = make({ status: 0 });
  for (let i = 0; i < MAX_QUEUE + 50; i++) a.track('error_shown', { code: 'x' });
  assert.ok(a.pending() <= MAX_QUEUE);
});

test('offline / 5xx / 429: events are kept, persisted, and not re-sent before the backoff; recovery sends them', async () => {
  let status = 0;
  const { a, sent, clock, storage } = make({ status: () => status });
  a.track('app_open', { locale: 'en' });
  await a.flush(true);
  assert.equal(sent.length, 1);
  assert.equal(a.pending(), 1);
  assert.ok(storage.getItem(QUEUE_KEY));
  await a.flush(true); // inside the backoff
  assert.equal(sent.length, 1);
  status = 503;
  clock.t += 61_000;
  await a.flush(true);
  assert.equal(sent.length, 2);
  assert.equal(a.pending(), 1);
  status = 202;
  clock.t += 3 * 60_000;
  await a.flush(true);
  assert.equal(a.pending(), 0);
  assert.equal(storage.getItem(QUEUE_KEY), null);
});

test('a queue persisted by an earlier page load is sent by the next one', async () => {
  const storage = new MemStorage();
  const first = make({ storage, status: 0 });
  first.a.track('app_open', { locale: 'en' });
  await first.a.flush(true);
  const second = make({ storage, status: 202 });
  second.clock.t += 10 * 60_000;
  await second.a.flush(true);
  assert.equal(second.sent.length, 1);
  assert.equal(second.sent[0].body.events[0].name, 'app_open');
  assert.equal(second.sent[0].body.events[0].ago_s, 600);
});

test('a 4xx answer (other than 429) drops the batch instead of retrying forever; the disabled 202 also clears it', async () => {
  const { a } = make({ status: 400 });
  a.track('app_open', { locale: 'en' });
  await a.flush(true);
  assert.equal(a.pending(), 0);
});

test('minimum gap between sends unless the page is being hidden', async () => {
  const { a, sent, clock } = make();
  a.track('app_open', { locale: 'en' });
  await a.flush();
  a.track('topic_open', { topic_id: 'ai-ml' });
  await a.flush();
  assert.equal(sent.length, 1);
  clock.t += MIN_GAP_MS + 1;
  await a.flush();
  assert.equal(sent.length, 2);
});

test('listening: 30 s buckets, remainder carried, nothing under 30 s', () => {
  const { a, clock } = make();
  a.listenStart({ source: 'topic', language: 'en', topicId: 'ai-ml' });
  clock.t += 20_000;
  a.listenStop(); // 20 s: not reported yet
  const countAfterFirstPlay = a.pending(); // first_play_start only
  assert.equal(countAfterFirstPlay, 1);
  a.listenStart({ source: 'topic', language: 'en', topicId: 'ai-ml' });
  clock.t += 50_000;
  a.listenStop(); // 20 + 50 = 70 s -> one 60 s event, 10 s carried
  assert.equal(a.pending(), 2);
});

test('listening event content: typed props only, topic id and language validated', async () => {
  const { a, sent, clock } = make();
  a.listenStart({ source: 'topic', language: 'FR', topicId: 'bad topic id!' });
  clock.t += 95_000;
  a.listenStop();
  await a.flush(true);
  const events = sent[0].body.events;
  assert.equal(events[0].name, 'first_play_start');
  assert.deepEqual(events[0].props, { source: 'topic', language: 'fr' });
  assert.deepEqual(events[1].props, { source: 'topic', language: 'fr', seconds: 90 }); // bad topic id dropped, 95 s -> 90
});

test('first_play_start is sent once per install, not per play', () => {
  const { a, clock } = make();
  for (let i = 0; i < 3; i++) {
    a.listenStart({ source: 'radio', language: 'en' });
    clock.t += 1000;
    a.listenStop();
  }
  assert.equal(a.pending(), 1);
});

test('radio listening reports no topic id', async () => {
  const { a, sent, clock } = make();
  a.listenStart({ source: 'radio', language: 'en' });
  clock.t += 60_000;
  a.listenStop();
  await a.flush(true);
  assert.equal('topic_id' in sent[0].body.events[1].props, false);
});

test('long listening is checkpointed every 5 minutes, not only at pause', () => {
  const { a, clock } = make();
  a.listenStart({ source: 'radio', language: 'en' });
  const before = a.pending();
  for (let i = 0; i < 4; i++) { clock.t += 60_000; a.checkpoint(); }
  assert.equal(a.pending(), before, 'under 5 minutes: nothing yet');
  clock.t += 60_000; a.checkpoint();
  assert.equal(a.pending(), before + 1);
  assert.ok(CHECKPOINT_MS === 300_000);
});

test('a suspended tab cannot turn into hours of listening (one step is capped at 15 minutes)', async () => {
  const { a, sent, clock } = make();
  a.listenStart({ source: 'radio', language: 'en' });
  clock.t += 6 * 3600_000;
  a.listenStop();
  await a.flush(true);
  const secs = sent[0].body.events.filter((e: any) => e.name === 'listen_progress').reduce((s: number, e: any) => s + e.props.seconds, 0);
  assert.equal(secs, 900);
});

test('a single report never exceeds 3600 seconds', async () => {
  const { a, sent, clock } = make();
  a.listenStart({ source: 'radio', language: 'en' });
  for (let i = 0; i < 6; i++) { clock.t += 15 * 60_000; a.checkpoint(); }
  a.listenStop();
  await a.flush(true);
  for (const s of sent) for (const e of s.body.events) if (e.name === 'listen_progress') assert.ok(e.props.seconds <= 3600 && e.props.seconds % 30 === 0);
});

test('no listening is recorded while opted out', () => {
  const { a, clock } = make();
  a.setEnabled(false);
  a.listenStart({ source: 'radio', language: 'en' });
  clock.t += 120_000;
  a.listenStop();
  assert.equal(a.pending(), 0);
});

test('sanitisers', () => {
  assert.equal(cleanLocale('en_US'), 'en-US');
  assert.equal(cleanLocale('<script>'), 'und');
  assert.equal(cleanLocale(undefined), 'und');
  assert.equal(cleanLang('FR'), 'fr');
  assert.equal(cleanLang('zh-CN'), 'zh');
  assert.equal(cleanLang(''), 'en');
  assert.equal(cleanLang(5), 'en');
  assert.equal(cleanTopicId('world-update'), 'world-update');
  assert.equal(cleanTopicId('a b'), undefined);
  assert.equal(cleanTopicId('x'.repeat(65)), undefined);
});
