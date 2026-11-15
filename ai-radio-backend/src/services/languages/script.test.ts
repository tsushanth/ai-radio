import test from 'node:test';
import assert from 'node:assert/strict';
import { buildSystemPrompt, buildUserPrompt, findDigitViolations, generateNewLanguageScript, ScriptRuleError, numberRule, formatDateFor } from './script.ts';
import { NEW_LANGUAGES, requireLanguageSpec } from './registry.ts';
import type { TextRequest, TextResult } from '../../lib/llmText.ts';

const topic = { id: 'tech-news', name: 'Tech News', description: 'd', icon: '', color: '', category: 'technology', sources: [], promptContext: 'Focus on launches.', targetDurationMinutes: 4, isActive: true, languages: ['all'] } as any;
const stories = [{ title: 'Nový telefon', source: 'CT24', sourceType: 'rss' }, { title: 'Další zpráva', source: 'iROZHLAS', sourceType: 'rss' }] as any;

const lines = (texts: string[]) => JSON.stringify(texts.map((text, i) => ({ speaker: i % 2 ? 'host2' : 'host1', text, type: i === 0 ? 'intro' : 'news' })));
const long = 'Toto je dostatečně dlouhá věta slovy bez jakýchkoli číslic. '.repeat(3);
const CLEAN = lines([long, long, long, long, long, long]);
const WITH_DIGITS = lines([long, 'V roce 2026 vzrostl zisk o 12 %.', long, long, long, long]);

function fakeGen(replies: string[]) {
  const calls: TextRequest[] = [];
  const generate = async (req: TextRequest): Promise<TextResult> => {
    calls.push(req);
    return { text: replies[Math.min(calls.length - 1, replies.length - 1)], inputTokens: 1, outputTokens: 1, provider: 'openrouter', model: 'm', costUsd: 0, truncated: false };
  };
  return { generate, calls };
}
const input = (code: string) => ({ topic, spec: requireLanguageSpec(code), stories, sourceLanguage: 'native' as const, date: '2026-11-15' });

test('every new language prompt carries the number rule (words, no digits, no % $ symbols), the language name and the host names', () => {
  for (const spec of NEW_LANGUAGES) {
    const p = buildSystemPrompt(topic, spec, 'native', 'Tech News');
    assert.match(p, /EVERY number as words/, spec.code);
    assert.match(p, /NO digit characters at all/, spec.code);
    assert.match(p, /% \$ € £ ¥ # \+ = °/, spec.code);
    assert.ok(p.includes(spec.name) && p.includes(spec.nativeName), spec.code);
    assert.ok(p.includes(spec.hosts[0]) && p.includes(spec.hosts[1]), spec.code);
    assert.match(p, new RegExp(`at most ${spec.sentenceCap} characters`), spec.code);
    assert.match(p, /host1/); assert.match(p, /"host2"/);
    assert.doesNotMatch(p, /Alex|Jordan/);
  }
  assert.match(numberRule(requireLanguageSpec('pl')), /ordinals, percentages \(including decimals/);
});

test('names rule: transliteration languages are told to leave no Latin letters, the others keep names as written', () => {
  assert.match(buildSystemPrompt(topic, requireLanguageSpec('ru'), 'native', 'x'), /own writing system/);
  assert.match(buildSystemPrompt(topic, requireLanguageSpec('ja'), 'native', 'x'), /Do not leave Latin letters/);
  assert.match(buildSystemPrompt(topic, requireLanguageSpec('cs'), 'native', 'x'), /keep foreign names and brands/);
});

test('source handling differs: local headlines are paraphrased with the outlet named; English stories are retold in the language', () => {
  const cs = requireLanguageSpec('cs');
  assert.match(buildSystemPrompt(topic, cs, 'native', 'x'), /current headlines in Czech/);
  const en = buildSystemPrompt(topic, cs, 'english', 'x');
  assert.match(en, /stories below are in English/); assert.match(en, /SOURCE HANDLING/);
  assert.match(buildUserPrompt(topic, cs, stories, 'sobota 15. listopadu'), /ENTIRE script in Czech/);
});

test('dates in the prompt and titles use the language locale', () => {
  assert.match(formatDateFor(requireLanguageSpec('cs'), '2026-11-15'), /neděle/);
  assert.match(formatDateFor(requireLanguageSpec('sv'), '2026-11-15'), /söndag/);
});

test('digit guard: digits in any script and the symbols are violations; plain words are not', () => {
  const cs = requireLanguageSpec('cs');
  assert.deepEqual(findDigitViolations([{ text: 'Jedna dvě tři.' }], cs), []);
  for (const bad of ['V roce 2026', 'zisk 12 %', 'cena $5', 'telefon ٣٤٥', 'साल २०२६', 'a+b', '№ 5']) {
    assert.equal(findDigitViolations([{ text: 'ok' }, { text: bad }], cs).length, 1, bad);
  }
  assert.equal(findDigitViolations([{ text: 'ok' }, { text: 'tohle 12' }], cs)[0].line, 2);
});

test('a clean script is accepted with one model call, the language token budget and the large-model preference for Czech', async () => {
  const g = fakeGen([CLEAN]);
  const out = await generateNewLanguageScript(input('cs'), { generate: g.generate, log: () => {} });
  assert.equal(g.calls.length, 1); assert.equal(out.calls, 1); assert.equal(out.rewrote, false);
  assert.equal(out.segments.length, 6); assert.equal(out.segments[0].sequence, 1);
  assert.equal(g.calls[0].maxTokens, 4000); assert.equal(g.calls[0].preferFallbackModel, true);
  const ru = fakeGen([CLEAN]);
  await generateNewLanguageScript(input('ru'), { generate: ru.generate, log: () => {} });
  assert.equal(ru.calls[0].maxTokens, 5000); assert.equal(ru.calls[0].preferFallbackModel, false);
});

test('a script with digits is sent back for ONE rewrite naming the offending lines; the rewrite is used', async () => {
  const g = fakeGen([WITH_DIGITS, CLEAN]);
  const out = await generateNewLanguageScript(input('cs'), { generate: g.generate, log: () => {} });
  assert.equal(g.calls.length, 2); assert.equal(out.rewrote, true);
  assert.match(g.calls[1].user, /line 2/); assert.match(g.calls[1].user, /2026/);
  assert.ok(out.segments.every((s) => !/\d/.test(s.text)));
});

test('digits that survive the rewrite fail the episode (no third call)', async () => {
  const g = fakeGen([WITH_DIGITS, WITH_DIGITS]);
  await assert.rejects(generateNewLanguageScript(input('pl'), { generate: g.generate, log: () => {} }), (e) => e instanceof ScriptRuleError && e.rule === 'digits');
  assert.equal(g.calls.length, 2);
});

test('an unusable reply is retried once (as for English); a second one fails; the total never exceeds 3 calls', async () => {
  const g = fakeGen(['not json at all', CLEAN]);
  assert.equal((await generateNewLanguageScript(input('nl'), { generate: g.generate, log: () => {} })).segments.length, 6);
  assert.equal(g.calls.length, 2);
  const bad = fakeGen(['nope', 'still nope']);
  await assert.rejects(generateNewLanguageScript(input('nl'), { generate: bad.generate, log: () => {} }));
  const worst = fakeGen(['nope', WITH_DIGITS, CLEAN]);
  const out = await generateNewLanguageScript(input('nl'), { generate: worst.generate, log: () => {} });
  assert.equal(out.calls, 3);
});

test('Hindi (engine normalises Devanagari digits) is still told to use words and is still guarded', async () => {
  const hi = requireLanguageSpec('hi');
  assert.equal(hi.ttsNormalize, 'numbers_devanagari');
  assert.ok(findDigitViolations([{ text: 'साल २०२६' }], hi).length === 1);
});
