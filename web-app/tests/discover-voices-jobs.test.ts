import test from 'node:test';
import assert from 'node:assert/strict';
import { groupTopicsByCategory } from '../src/lib/discover.ts';
import { voiceOptionsFromApi, voiceLabel, FALLBACK_VOICES, ACCEPTED_VOICE_IDS } from '../src/lib/voices.ts';
import { pollJob, JobFailed } from '../src/lib/job-poll.ts';

const t = (id: string, category: string) => ({ id, category });

test('groupTopicsByCategory matches ids to display names case-insensitively, keeps server order, drops empty categories', () => {
  const topics = [t('a', 'technology'), t('b', 'news'), t('c', 'technology'), t('d', 'sports')];
  const groups = groupTopicsByCategory(topics, ['News', 'Technology', 'Business', 'Sports']);
  assert.deepEqual(groups.map((g) => [g.title, g.topics.map((x) => x.id)]), [
    ['News', ['b']], ['Technology', ['a', 'c']], ['Sports', ['d']],
  ]);
});

test('groupTopicsByCategory never drops a topic: unknown categories are appended A-Z', () => {
  const groups = groupTopicsByCategory([t('x', 'zoology'), t('y', 'news'), t('z', 'art'), t('w', '')], ['News']);
  assert.deepEqual(groups.map((g) => g.title), ['News', 'Art', 'Zoology', 'Other']);
  assert.equal(groups.flatMap((g) => g.topics).length, 4);
});

test('groupTopicsByCategory with no topics is empty', () => {
  assert.deepEqual(groupTopicsByCategory([], ['News']), []);
});

// Shaped like the live GET /api/voices answer (trimmed)
const apiVoices = {
  success: true, total: 9,
  voices: [
    { id: 'openai:alloy', name: 'Alloy', provider: 'openai', gender: 'male', description: 'Neutral, balanced voice' },
    { id: 'openai:echo', name: 'Echo', provider: 'openai', gender: 'male', description: 'Male voice, warm and engaging' },
    { id: 'openai:fable', name: 'Fable', provider: 'openai', gender: 'male', description: 'Male voice, articulate' },
    { id: 'openai:onyx', name: 'Onyx', provider: 'openai', gender: 'male', description: 'Deep male voice, authoritative' },
    { id: 'openai:nova', name: 'Nova', provider: 'openai', gender: 'female', description: 'Female voice, upbeat and energetic' },
    { id: 'openai:shimmer', name: 'Shimmer', provider: 'openai', gender: 'female', description: 'Female voice, soft and gentle' },
    { id: 'elevenlabs:pNInz6obpgDQGcFmaJgB', name: 'Adam', provider: 'elevenlabs', gender: 'male' },
    { id: 'openai:ballad', name: 'Ballad', provider: 'openai' },
  ],
};

test('voices: only ids the TTS path accepts, bare (no "openai:" prefix), elevenlabs and unknown names dropped', () => {
  const v = voiceOptionsFromApi(apiVoices);
  assert.deepEqual(v.map((x) => x.id), [...ACCEPTED_VOICE_IDS]);
  assert.equal(v.every((x) => !x.id.includes(':')), true);
  assert.equal(v.find((x) => x.id === 'nova')?.description, 'Female voice, upbeat and energetic');
  assert.equal(voiceLabel(v[0]), 'Alloy - Neutral, balanced voice');
});

test('voices: a partial answer is topped up from the built-in six; junk or empty answers fall back to them', () => {
  const partial = voiceOptionsFromApi({ voices: [apiVoices.voices[4]] });
  assert.deepEqual(partial.map((x) => x.id), [...ACCEPTED_VOICE_IDS]);
  assert.equal(partial.find((x) => x.id === 'nova')?.gender, 'female');
  for (const bad of [null, undefined, 'x', {}, { voices: 'no' }, { voices: [] }, { voices: [{ id: 'elevenlabs:1', provider: 'elevenlabs' }] }]) {
    assert.deepEqual(voiceOptionsFromApi(bad), FALLBACK_VOICES, JSON.stringify(bad));
  }
  assert.equal(voiceLabel({ id: 'nova', name: 'Nova' }), 'Nova');
});

function clock() {
  let t0 = 0;
  return { now: () => t0, sleep: async (ms: number) => { t0 += ms; }, at: () => t0 };
}

test('pollJob reports progress and resolves with the episode', async () => {
  const c = clock();
  const answers = [{ status: 'queued' }, { status: 'processing', progress: 40 }, { status: 'completed', progress: 100, episode: { id: 'e1' } }];
  let i = 0;
  const seen: number[] = [];
  const ep = await pollJob(async () => answers[i++], { ...c, onProgress: (p) => seen.push(p) });
  assert.deepEqual(ep, { id: 'e1' });
  assert.deepEqual(seen, [0, 40, 100]);
  assert.equal(c.at(), 4000);
});

test('pollJob stops quietly when cancelled, before and during a status call', async () => {
  const c = clock();
  const signal = { aborted: false };
  let calls = 0;
  const r = await pollJob(async () => { if (++calls === 2) signal.aborted = true; return { status: 'processing', progress: 10 }; }, { ...c, signal });
  assert.equal(r, null);
  assert.equal(calls, 2);
  assert.equal(await pollJob(async () => { throw new Error('never called'); }, { ...c, signal }), null);
});

test('pollJob throws JobFailed with the server message on a failed job', async () => {
  const c = clock();
  await assert.rejects(() => pollJob(async () => ({ status: 'failed', error: { message: 'Gmail token expired' } }), c), (e: unknown) => e instanceof JobFailed && /Gmail token expired/.test(e.message));
  await assert.rejects(() => pollJob(async () => ({ status: 'failed' }), c), /Generation failed/);
});

test('pollJob tolerates two blips, gives up on the third in a row, and times out', async () => {
  const c = clock();
  let i = 0;
  const flaky = async () => { i++; if (i <= 2) throw new Error('net'); return { status: 'completed', episode: { id: 'ok' } }; };
  assert.deepEqual(await pollJob(flaky, c), { id: 'ok' });

  let n = 0;
  await assert.rejects(() => pollJob(async () => { n++; throw new Error('offline'); }, c), /offline/);
  assert.equal(n, 3);

  await assert.rejects(() => pollJob(async () => ({ status: 'processing' }), { ...c, intervalMs: 1000, timeoutMs: 3000 }), /taking too long/);
});
