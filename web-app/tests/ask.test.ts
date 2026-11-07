import test from 'node:test';
import assert from 'node:assert/strict';
import {
  ASK_MAX_CHARS, ASK_MAX_PER_DAY, ASK_MIN_GAP_MS, askBlockedReason, askEpisodeUrl, askShareText, formatDuration, getInstallId, makeInstallId,
  recentAsks, safeHref, stageLabel, toJobStatus, validateAskText, waitForAsk, ASK_INSTALL_KEY, type AskEpisodeView,
} from '../src/lib/ask.ts';

const view = (over: Partial<AskEpisodeView> = {}): AskEpisodeView => ({
  id: '11111111-2222-3333-4444-555555555555', status: 'writing', progress: 50, language: 'en', title: null, description: null, audioUrl: null,
  durationSeconds: null, sources: [], reason: null, message: null, createdAt: '2026-11-07T00:00:00.000Z', ...over,
});

test('validateAskText trims, collapses whitespace and enforces length', () => {
  assert.deepEqual(validateAskText('  Who won   the Warriors game? '), { ok: true, text: 'Who won the Warriors game?' });
  assert.equal(validateAskText('short').ok, false);
  assert.equal(validateAskText('x'.repeat(ASK_MAX_CHARS + 1)).ok, false);
  assert.equal(validateAskText('x'.repeat(ASK_MAX_CHARS)).ok, true);
});

test('install id is generated once, matches the backend pattern and is reused', () => {
  const id = makeInstallId();
  assert.match(id, /^[A-Za-z0-9_-]{8,64}$/);
  const mem = new Map<string, string>();
  const storage = { getItem: (k: string) => mem.get(k) ?? null, setItem: (k: string, v: string) => void mem.set(k, v) };
  const first = getInstallId(storage);
  assert.equal(getInstallId(storage), first);
  mem.set(ASK_INSTALL_KEY, 'bad id!');
  assert.match(getInstallId(storage)!, /^[A-Za-z0-9_-]{8,64}$/);
  assert.equal(getInstallId(null), undefined);
  assert.equal(getInstallId({ getItem: () => { throw new Error('blocked'); }, setItem: () => {} }), undefined);
});

test('browser courtesy limit: gap between asks and a daily maximum; junk history ignored', () => {
  const now = 1_000_000_000_000;
  assert.equal(askBlockedReason([], now), null);
  assert.equal(askBlockedReason('junk', now), null);
  assert.match(askBlockedReason([now - 5_000], now)!, /wait/);
  assert.equal(askBlockedReason([now - ASK_MIN_GAP_MS - 1], now), null);
  const full = Array.from({ length: ASK_MAX_PER_DAY }, (_, i) => now - (i + 1) * 60_000);
  assert.match(askBlockedReason(full, now)!, /tomorrow/);
  assert.deepEqual(recentAsks([now - 10, 'x', NaN, now + 5_000], now), [now - 10]);
});

test('toJobStatus: finished with audio => episode; refused / no coverage / failed => failure with the server message; otherwise progress', () => {
  const done = view({ status: 'completed', audioUrl: 'https://a', progress: 100 });
  assert.deepEqual(toJobStatus(done), { status: 'completed', progress: 100, episode: done });
  for (const status of ['rejected', 'no_coverage', 'failed']) {
    assert.deepEqual(toJobStatus(view({ status, message: 'We could not find enough recent news' })), { status: 'failed', error: 'We could not find enough recent news' });
  }
  assert.equal(toJobStatus(view({ status: 'completed', audioUrl: null })).status, 'failed', 'a finished row without audio must not poll forever');
  assert.deepEqual(toJobStatus(view({ status: 'recording', progress: 75 })), { status: 'recording', progress: 75 });
});

test('waitForAsk polls until the episode is ready and surfaces the honest no-coverage message', async () => {
  const seq = [view({ status: 'queued', progress: 5 }), view({ status: 'writing' }), view({ status: 'completed', audioUrl: 'https://a', title: 'T', progress: 100 })];
  const seen: string[] = [];
  const ep = await waitForAsk('x', { sleep: async () => {}, onProgress: (_p, s) => seen.push(s.status) }, async () => seq.shift()!);
  assert.equal(ep?.title, 'T');
  assert.deepEqual(seen, ['queued', 'writing', 'completed']);

  await assert.rejects(
    waitForAsk('x', { sleep: async () => {} }, async () => view({ status: 'no_coverage', message: 'We could not find enough recent news coverage about this to discuss it accurately, so we did not make an episode.' })),
    /did not make an episode/,
  );
});

test('labels, urls, durations and links', () => {
  assert.match(stageLabel('searching'), /headlines/);
  assert.equal(askEpisodeUrl('abc'), 'https://audexa.app/ask/abc');
  assert.match(askShareText('Warriors beat Lakers'), /AI-generated/);
  assert.equal(formatDuration(187), '3:07');
  assert.equal(formatDuration(187.6), '3:08');
  assert.equal(formatDuration(null), '');
  assert.equal(safeHref('https://news.example.com/a'), 'https://news.example.com/a');
  assert.equal(safeHref('javascript:alert(1)'), null);
  assert.equal(safeHref('http://insecure.test'), null);
});
