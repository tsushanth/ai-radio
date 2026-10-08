import test from 'node:test';
import assert from 'node:assert/strict';
import { languagesForTopic } from './batch-languages.ts';

test('a universal topic is generated in English', () => {
  assert.deepEqual(languagesForTopic(['all'], undefined), ['en']);
  assert.deepEqual(languagesForTopic(['all'], 'piper'), ['en']);
});

test('a topic with no languages defaults to English', () => {
  assert.deepEqual(languagesForTopic(undefined, undefined), ['en']);
  assert.deepEqual(languagesForTopic([], 'piper'), ['en']);
});

test('a locale topic is generated in its own languages with the old voice', () => {
  assert.deepEqual(languagesForTopic(['es', 'pt'], 'kokoro'), ['es', 'pt']);
  assert.deepEqual(languagesForTopic(['fr'], undefined), ['fr']);
});

test('with Piper only English is generated: locale-only topics are skipped, mixed ones keep English', () => {
  assert.deepEqual(languagesForTopic(['es', 'pt'], 'piper'), []);
  assert.deepEqual(languagesForTopic(['en', 'es'], 'piper'), ['en']);
});

test('the input list is not modified', () => {
  const input = ['es', 'en']; languagesForTopic(input, 'piper'); assert.deepEqual(input, ['es', 'en']);
});
