// topic.generator.generateScript through the real llmText path with OpenRouter mocked at the network edge:
// luna-style replies must come out as the same PodcastScript structure, a bad first reply is retried once, and nothing calls Anthropic.
import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_KEY: 'k',
  GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', ANTHROPIC_API_KEY: 'sk-ant-test', OPENROUTER_API_KEY: 'sk-or-test',
});
delete process.env.LLM_USAGE_KEY;
delete process.env.LLM_PROVIDER;

const urls: string[] = [];
let bodies: any[] = [];
let replies: string[] = [];
const realFetch = globalThis.fetch;
globalThis.fetch = (async (input: any, init?: any) => {
  const url = String(typeof input === 'string' ? input : input.url);
  if (!url.startsWith('https://openrouter.ai/') && !url.includes('api.anthropic.com')) return realFetch(input, init);
  urls.push(url);
  bodies.push(init?.body ? JSON.parse(init.body) : undefined);
  const text = replies.shift() ?? '[]';
  return new Response(JSON.stringify({ choices: [{ message: { content: text }, finish_reason: 'stop' }], usage: { prompt_tokens: 611, completion_tokens: 1321 } }), { status: 200 });
}) as typeof fetch;

const content = {
  topicId: 'tech-news', date: '2026-11-13', fetchedAt: new Date(), totalSources: 2, successfulSources: 2,
  stories: [1, 2, 3, 4].map((n) => ({ title: `Story ${n}`, source: 'Example', sourceType: 'rss' as const, summary: `Summary ${n}` })),
};
const topic = { id: 'tech-news', name: 'Tech News', description: 'd', promptContext: 'Be concise.', targetDurationMinutes: 4, languages: ['en'] } as any;

const dialogue = (n: number) => Array.from({ length: n }, (_, i) => ({ speaker: i % 2 ? 'host2' : 'host1', text: `Segment ${i}: ${'a fairly long spoken sentence about the news '.repeat(3)}`, type: i === 0 ? 'intro' : i === n - 1 ? 'outro' : 'news' }));

beforeEach(async () => {
  urls.length = 0; bodies = []; replies = [];
  (await import('../../lib/llmBudget')).llmBudget.reset();
});

async function script(lang = 'en') {
  const { topicPodcastGenerator } = await import('./topic.generator');
  return (topicPodcastGenerator as any).generateScript(topic, content, lang);
}

test('a luna reply (fenced JSON) becomes the same PodcastScript structure the TTS and the app use, via OpenRouter only', async () => {
  replies = ['```json\n' + JSON.stringify(dialogue(12)) + '\n```'];
  const s = await script();
  assert.equal(s.total_segments, 12);
  assert.deepEqual(Object.keys(s.segments[0]).sort(), ['sequence', 'speaker', 'text', 'type']);
  assert.deepEqual([s.segments[0].sequence, s.segments[0].type, s.segments[11].type], [1, 'intro', 'outro']);
  assert.ok(Number.isInteger(s.estimated_duration_seconds) || typeof s.estimated_duration_seconds === 'number');
  assert.equal(urls.length, 1);
  assert.match(urls[0], /openrouter\.ai/);
  assert.equal(bodies[0].model, 'openai/gpt-6-luna');
  assert.equal(bodies[0].max_tokens, 3000);
  assert.match(bodies[0].messages[0].content, /podcast script writer/, 'the existing system prompt is sent unchanged');
});

test('a first reply that is prose or a stub is retried ONCE (with a reminder) and the second reply is used', async () => {
  replies = ['Sure, here is a podcast for you!', JSON.stringify(dialogue(10))];
  const s = await script();
  assert.equal(s.total_segments, 10);
  assert.equal(urls.length, 2);
  assert.match(bodies[1].messages[1].content, /could not be used/);
  assert.ok(!/could not be used/.test(bodies[0].messages[1].content));
});

test('two unusable replies fail the episode (no third call, no Anthropic); the error text keeps the batch-health "script_parse" class', async () => {
  replies = ['nope', JSON.stringify(dialogue(2)), JSON.stringify(dialogue(10))];
  await assert.rejects(script(), /failed to parse script/i);
  assert.equal(urls.length, 2);
  assert.ok(urls.every((u) => !u.includes('anthropic')));
});
