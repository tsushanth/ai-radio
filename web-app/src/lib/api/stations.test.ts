import test from 'node:test';
import assert from 'node:assert/strict';
import { pickActiveStations } from './stations.ts';

const ALL = ['en', 'es', 'fr', 'de'].map((language) => ({ id: language, language }));
const langs = (xs: { language: string }[]) => xs.map((x) => x.language);

test('shows only the languages the radio reports as live', () => {
  assert.deepEqual(langs(pickActiveStations(ALL, ['en'])), ['en']);
  assert.deepEqual(langs(pickActiveStations(ALL, ['en', 'fr'])), ['en', 'fr']);
});

test('keeps the catalogue order, not the order the server lists them in', () => {
  assert.deepEqual(langs(pickActiveStations(ALL, ['de', 'es', 'en'])), ['en', 'es', 'de']);
});

test('a language that is not in the catalogue is ignored', () => {
  assert.deepEqual(langs(pickActiveStations(ALL, ['en', 'tl'])), ['en']);
});

test('falls back to English when the answer is missing, empty or malformed', () => {
  for (const bad of [undefined, null, [], 'en', { en: true }, [1, 2], ['xx']]) {
    assert.deepEqual(langs(pickActiveStations(ALL, bad)), ['en'], JSON.stringify(bad));
  }
});

test('never returns an empty list, even if English is not in the catalogue', () => {
  assert.deepEqual(pickActiveStations([{ language: 'es' }], ['en']), []);
});
