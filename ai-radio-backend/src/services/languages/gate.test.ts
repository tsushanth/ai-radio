import test from 'node:test';
import assert from 'node:assert/strict';
import { cer, editDistance, evaluateGate, normalizeForCompare, repetitionCheck } from './gate.ts';

const SCRIPT = 'Predsjednik je jučer stigao u glavni grad gdje će se sastati s vođama stranaka i razgovarati o proračunu za iduću godinu. '.repeat(12);

test('normalisation: case, punctuation and accents are ignored; Serbian Cyrillic compares as Latin', () => {
  assert.equal(normalizeForCompare('Čačak, ĐORĐE!'), 'cacak dorde');
  assert.equal(cer('Đorđe žuri u školu', 'Ђорђе жури у школу'), 0);
  assert.ok(cer('Đorđe žuri u školu', 'Pera ide kući') > 0.5);
  assert.equal(editDistance(['a', 'b'], ['a', 'c']), 1);
});

test('repetition: a looped character or token, and a repeated phrase, are caught; ordinary speech is not', () => {
  const loop = 'dobro jutro ' + 'ha '.repeat(30) + 'kraj';
  const r = repetitionCheck(loop);
  assert.equal(r.ok, false); assert.equal(r.longestTokenRun.token, 'ha'); assert.ok(r.longestTokenRun.run >= 30);
  const phrase = repetitionCheck('uvod ' + 'to je to '.repeat(8) + 'zakljucak');
  assert.equal(phrase.ok, false); assert.ok(phrase.worstPhrase.repeats >= 4);
  const natural = 'predsjednik je jucer stigao u glavni grad gdje ce se sastati s vodama stranaka i razgovarati o proracunu za iducu godinu a zatim je odrzao konferenciju za novinare o gospodarstvu i obrazovanju';
  assert.equal(repetitionCheck(natural).ok, true);
  const spaceless = '你好'.repeat(40);
  assert.equal(repetitionCheck(spaceless).ok, false); // one character looped without spaces
});

test('gate: a faithful transcript at a human speaking rate passes', () => {
  const lines = Array.from({ length: 12 }, (_, i) => ({ text: SCRIPT.slice(i * 120, i * 120 + 120), seconds: 7.5 }));
  const chars = [...SCRIPT.replace(/\s+/g, '')].length;
  const r = evaluateGate({ script: SCRIPT, lines, totalSeconds: chars / 14, transcript: SCRIPT.replace(/,/g, '') });
  assert.equal(r.ok, true, r.failures.join('; ')); assert.ok(r.cer < 0.01);
});

test('gate: audio far longer than the text needs (a voice that loops one character) fails on rate and on the transcript', () => {
  const chars = [...SCRIPT.replace(/\s+/g, '')].length;
  const r = evaluateGate({ script: SCRIPT, lines: [{ text: SCRIPT.slice(0, 200), seconds: 60 }], totalSeconds: chars / 3, transcript: 'aaa '.repeat(200) });
  assert.equal(r.ok, false);
  assert.ok(r.failures.some((f) => /characters per second/.test(f)));
  assert.ok(r.failures.some((f) => /looping|CER|repeated/.test(f)));
});

test('gate: a short test sentence is not enough, and dropped text (transcript far shorter) fails', () => {
  assert.equal(evaluateGate({ script: 'Kratka rečenica.', lines: [], totalSeconds: 2, transcript: 'Kratka rečenica.' }).ok, false);
  const chars = [...SCRIPT.replace(/\s+/g, '')].length;
  const half = SCRIPT.slice(0, SCRIPT.length / 3);
  const r = evaluateGate({ script: SCRIPT, lines: [], totalSeconds: chars / 14, transcript: half });
  assert.equal(r.ok, false); assert.ok(r.failures.some((f) => /CER|transcript length/.test(f)));
});
