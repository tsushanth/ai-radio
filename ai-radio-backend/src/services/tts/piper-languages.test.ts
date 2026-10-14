import test from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_LANGUAGE_VOICES, DailyCap, languageVoices, onDemandLanguages, trimLeadingAndFade, voiceForHost } from './piper-languages';

function pcm(samples: number[]): Buffer {
  const b = Buffer.alloc(samples.length * 2);
  samples.forEach((v, i) => b.writeInt16LE(v, i * 2));
  return b;
}

test('every default language has a female and a male voice id in the custom: namespace', () => {
  for (const v of Object.values(DEFAULT_LANGUAGE_VOICES)) {
    assert.match(v.f, /^custom:[a-z0-9_-]+$/);
    assert.match(v.m, /^custom:[a-z0-9_-]+$/);
  }
  assert.deepEqual(Object.keys(DEFAULT_LANGUAGE_VOICES).sort(), ['de', 'es', 'fr', 'it', 'pt']);
});

test('voiceForHost: shimmer and nova get the female voice, the rest the male one; unknown language is null', () => {
  assert.equal(voiceForHost('de', 'shimmer', {}), 'custom:de-de-mls-f');
  assert.equal(voiceForHost('de', 'onyx', {}), 'custom:de-de-mls-m');
  assert.equal(voiceForHost('ja', 'onyx', {}), null);
});

test('PIPER_LANG_VOICES overrides valid entries and ignores malformed ones', () => {
  const env = { PIPER_LANG_VOICES: JSON.stringify({ de: { f: 'custom:x-f', m: 'custom:x-m' }, fr: { f: 'bad', m: 'custom:y' }, zzz: { f: 'custom:a', m: 'custom:b' } }) };
  const v = languageVoices(env);
  assert.equal(v.de.f, 'custom:x-f');
  assert.equal(v.fr.f, DEFAULT_LANGUAGE_VOICES.fr.f);
  assert.equal(v.zzz, undefined);
  assert.deepEqual(languageVoices({ PIPER_LANG_VOICES: 'not json' }), DEFAULT_LANGUAGE_VOICES);
});

test('onDemandLanguages: all with voices by default, narrowed by ON_DEMAND_LANGUAGES, empty string disables', () => {
  assert.deepEqual(onDemandLanguages({}).sort(), ['de', 'es', 'fr', 'it', 'pt']);
  assert.deepEqual(onDemandLanguages({ ON_DEMAND_LANGUAGES: 'fr, es ,xx' }).sort(), ['es', 'fr']);
  assert.deepEqual(onDemandLanguages({ ON_DEMAND_LANGUAGES: '' }), []);
});

test('trimLeadingAndFade drops a long quiet lead-in, keeps 40 ms, and fades in', () => {
  const sr = 24000;
  const quiet = new Array(sr / 2).fill(2); // 500 ms near-silence
  const speech = new Array(2400).fill(10000); // 100 ms loud
  const out = trimLeadingAndFade(pcm([...quiet, ...speech]), sr);
  const kept = out.length / 2;
  assert.ok(kept <= 2400 + 960 + 1 && kept >= 2400 + 900, `kept ${kept} samples`);
  assert.equal(out.readInt16LE(0), 0); // fade starts at zero
  assert.equal(out.readInt16LE(out.length - 2), 10000); // end untouched
});

test('trimLeadingAndFade leaves silence and empty buffers alone', () => {
  assert.equal(trimLeadingAndFade(Buffer.alloc(0)).length, 0);
  const z = pcm([0, 0, 0, 0]);
  assert.deepEqual(trimLeadingAndFade(z), z);
});

test('DailyCap allows up to the limit per UTC day and resets the next day', () => {
  let now = new Date('2026-10-14T10:00:00Z');
  const cap = new DailyCap(2, () => now);
  assert.equal(cap.tryTake(), true);
  assert.equal(cap.tryTake(), true);
  assert.equal(cap.tryTake(), false);
  now = new Date('2026-10-15T00:00:01Z');
  assert.equal(cap.tryTake(), true);
});
