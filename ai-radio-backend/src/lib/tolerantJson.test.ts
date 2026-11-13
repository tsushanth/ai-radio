import test from 'node:test';
import assert from 'node:assert/strict';
import { extractJson } from './tolerantJson.ts';

const seg = (n: number) => ({ speaker: n % 2 ? 'host2' : 'host1', text: `Line ${n}, with "quotes" and a ] bracket and { brace.`, type: 'news' });

test('plain array, array inside prose, and array inside a code fence', () => {
  const arr = [seg(0), seg(1)];
  assert.deepEqual(extractJson(JSON.stringify(arr))!.value, arr);
  assert.deepEqual(extractJson(`Here is your script:\n${JSON.stringify(arr)}\nEnjoy!`)!.value, arr);
  assert.deepEqual(extractJson('```json\n' + JSON.stringify(arr, null, 2) + '\n```')!.value, arr);
  assert.deepEqual(extractJson('```\n' + JSON.stringify(arr) + '\n```')!.value, arr);
});

test('brackets and braces inside strings do not confuse the scanner', () => {
  const arr = [seg(0), seg(1), seg(2)];
  const r = extractJson(`Sure ${JSON.stringify(arr)} done ]`)!;
  assert.equal((r.value as unknown[]).length, 3);
  assert.equal(r.truncated, false);
});

test('a leading <think> block and a stray "[1]" in the prose are skipped', () => {
  const arr = [seg(0), seg(1)];
  const r = extractJson(`<think>I should output [1] list {x}</think>\nNote [1]: ${JSON.stringify(arr)}`)!;
  assert.deepEqual(r.value, arr);
});

test('trailing commas are repaired and flagged', () => {
  const r = extractJson('[{"speaker":"host1","text":"hi",},{"speaker":"host2","text":"yo"},]')!;
  assert.equal((r.value as unknown[]).length, 2);
  assert.equal(r.repaired, true);
});

test('a reply cut off at max_tokens keeps only the COMPLETED elements of an array', () => {
  const full = JSON.stringify([seg(0), seg(1), seg(2)]);
  const cut = full.slice(0, full.length - 25); // inside the last element
  const r = extractJson(cut)!;
  assert.equal(r.truncated, true);
  assert.equal((r.value as unknown[]).length, 2);
});

test('a truncated OBJECT is rejected (nothing is invented); garbage and non-strings give null', () => {
  assert.equal(extractJson('{"title":"T","segments":[{"speaker":"host1","text":"a"},'), null);
  assert.equal(extractJson('no json here'), null);
  assert.equal(extractJson('{nope}'), null);
  assert.equal(extractJson(undefined as unknown as string), null);
  assert.equal(extractJson(''), null);
});

test('the left-most value is returned as found: a bare list stays a list, a wrapping object stays an object', () => {
  const obj = { title: 'T', segments: [seg(0)] };
  assert.deepEqual(extractJson(JSON.stringify(obj))!.value, obj);
  assert.deepEqual(extractJson('[{"a":1}]')!.value, [{ a: 1 }]);
  assert.deepEqual(extractJson('Intro {not json} then {"a":1}')!.value, { a: 1 }, 'an unparseable brace group in prose is skipped');
});
