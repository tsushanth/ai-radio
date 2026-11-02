import test from 'node:test';
import assert from 'node:assert/strict';
import { unwrapTopicEpisode, topicErrorMessage, waitForEpisode, GenerationTimeout } from '../src/lib/topic-generation.ts';

const done = { status: 'completed', audioUrl: 'https://x/a.mp3', updatedAt: 'new' };

test('unwrapTopicEpisode accepts { episode } and a bare episode, rejects junk', () => {
  assert.deepEqual(unwrapTopicEpisode({ episode: { id: 'a', status: 'completed' }, isNew: false }), { id: 'a', status: 'completed' });
  assert.deepEqual(unwrapTopicEpisode({ id: 'a', status: 'completed' }), { id: 'a', status: 'completed' });
  for (const bad of [null, undefined, 'x', 5, {}, { message: 'hi' }]) assert.equal(unwrapTopicEpisode(bad), null, String(bad));
});

test('topicErrorMessage prefers the server sentence over the error code', () => {
  const e = Object.assign(new Error('daily_limit'), { body: { error: 'daily_limit', message: 'Try again tomorrow.' } });
  assert.equal(topicErrorMessage(e), 'Try again tomorrow.');
  assert.equal(topicErrorMessage(new Error('boom')), 'boom');
  assert.equal(topicErrorMessage('x'), 'Failed to generate episode');
});

function clock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => { t += ms; }, at: () => t };
}

test('waitForEpisode polls through not_generated / generating until completed with audio', async () => {
  const c = clock();
  const answers = [null, { status: 'not_generated' }, { status: 'generating' }, { status: 'completed' }, done];
  let i = 0;
  const ep = await waitForEpisode(async () => answers[i++], { ...c, intervalMs: 5000 });
  assert.equal(ep, done);
  assert.equal(i, 5);
  assert.equal(c.at(), 20000);
});

test('waitForEpisode ignores the stale completed episode while regenerating', async () => {
  const c = clock();
  const stale = { status: 'completed', audioUrl: 'https://x/old.mp3', updatedAt: 'old' };
  const answers = [stale, stale, { status: 'generating', updatedAt: 'mid' }, done];
  let i = 0;
  const ep = await waitForEpisode(async () => answers[i++], { ...c, staleUpdatedAt: 'old' });
  assert.equal(ep, done);
  assert.equal(i, 4);
});

test('waitForEpisode throws on a failed episode, with the server error', async () => {
  const c = clock();
  await assert.rejects(() => waitForEpisode(async () => ({ status: 'failed', error: 'tts down' }), c), /Generation failed: tts down/);
  await assert.rejects(() => waitForEpisode(async () => ({ status: 'failed' }), c), /Generation failed/);
});

test('waitForEpisode times out with GenerationTimeout', async () => {
  const c = clock();
  await assert.rejects(
    () => waitForEpisode(async () => ({ status: 'generating' }), { ...c, intervalMs: 1000, timeoutMs: 5000 }),
    (e: unknown) => e instanceof GenerationTimeout
  );
  assert.equal(c.at(), 5000);
});

test('waitForEpisode tolerates blips but gives up after 3 failed checks in a row', async () => {
  const c = clock();
  let i = 0;
  const blippy = async () => { i++; if (i === 2 || i === 4) throw new Error('network'); return i < 5 ? { status: 'generating' } : done; };
  assert.equal(await waitForEpisode(blippy, c), done); // two isolated errors are fine

  i = 0;
  await assert.rejects(() => waitForEpisode(async () => { i++; throw new Error('offline'); }, c), /offline/);
  assert.equal(i, 3);
});

test('waitForEpisode stops quietly when the caller aborts (page left)', async () => {
  const c = clock();
  const signal = { aborted: false };
  let i = 0;
  const r = await waitForEpisode(async () => { if (++i === 2) signal.aborted = true; return { status: 'generating' }; }, { ...c, signal });
  assert.equal(r, null);
  assert.equal(i, 2);
});
