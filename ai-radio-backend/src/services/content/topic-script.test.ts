import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTopicScript, ScriptParseError } from './topic-script.ts';

const lines = (n: number, len = 60) => Array.from({ length: n }, (_, i) => ({ speaker: i % 2 ? 'host2' : 'host1', text: `Segment ${i} ${'word '.repeat(len / 5)}`.trim(), type: i === 0 ? 'intro' : i === n - 1 ? 'outro' : 'news' }));

test('the exact format the Sonnet prompt asks for parses into the same segment structure', () => {
  const out = parseTopicScript(JSON.stringify(lines(8)));
  assert.equal(out.length, 8);
  assert.deepEqual(Object.keys(out[0]).sort(), ['speaker', 'text', 'type']);
  assert.deepEqual([out[0].type, out[3].type, out[7].type], ['intro', 'news', 'outro']);
  assert.deepEqual(out.map((s) => s.speaker).slice(0, 4), ['host1', 'host2', 'host1', 'host2']);
});

test('luna-style replies: code fence, wrapping object, alias keys, speaker names, odd types', () => {
  const messy = '```json\n' + JSON.stringify({ segments: lines(6).map((s, i) => ({ host: i % 2 ? 'Jordan' : 'Alex', line: s.text, type: i === 2 ? 'Headline' : s.type })) }) + '\n```';
  const out = parseTopicScript(messy);
  assert.equal(out.length, 6);
  assert.deepEqual(out.slice(0, 2).map((s) => s.speaker), ['host1', 'host2']);
  assert.equal(out[2].type, 'news', 'unknown types fall back to news');
  const named = parseTopicScript(JSON.stringify(lines(5).map((s, i) => ({ ...s, speaker: i % 2 ? 'Host 2' : 'host_1' }))));
  assert.deepEqual(named.map((s) => s.speaker), ['host1', 'host2', 'host1', 'host2', 'host1']);
});

test('an unknown or missing speaker takes the other voice from the previous line, so the dialogue still alternates', () => {
  const out = parseTopicScript(JSON.stringify(lines(5).map((s) => ({ text: s.text }))));
  assert.deepEqual(out.map((s) => s.speaker), ['host1', 'host2', 'host1', 'host2', 'host1']);
});

test('entries without text are dropped; too few usable segments is an error with a parse-class message', () => {
  const out = parseTopicScript(JSON.stringify([...lines(5), { speaker: 'host1', text: '  ' }, 'junk', null, { speaker: 'host2' }]));
  assert.equal(out.length, 5);
  assert.throws(() => parseTopicScript(JSON.stringify(lines(3))), (e: unknown) => e instanceof ScriptParseError && e.reason === 'too_few_segments' && /failed to parse script/i.test(e.message));
});

test('a reply that is too short for the episode length is rejected (stub answer), measured in characters so CJK is fair', () => {
  const stub = JSON.stringify(lines(4, 20));
  assert.throws(() => parseTopicScript(stub, 600), (e: unknown) => e instanceof ScriptParseError && e.reason === 'too_short');
  assert.equal(parseTopicScript(stub, 0).length, 4);
  const cjk = JSON.stringify(Array.from({ length: 8 }, (_, i) => ({ speaker: i % 2 ? 'host2' : 'host1', text: '今日のニュースをお伝えします。'.repeat(4), type: 'news' })));
  assert.equal(parseTopicScript(cjk, 400).length, 8);
});

test('no JSON and a JSON object without a segment list are errors; a truncated array keeps its completed segments', () => {
  assert.throws(() => parseTopicScript('I cannot do that.'), (e: unknown) => e instanceof ScriptParseError && e.reason === 'no_json');
  assert.throws(() => parseTopicScript('{"title":"x","body":"y"}'), (e: unknown) => e instanceof ScriptParseError);
  const full = JSON.stringify(lines(8));
  const out = parseTopicScript(full.slice(0, full.length - 30));
  assert.equal(out.length, 7);
});
