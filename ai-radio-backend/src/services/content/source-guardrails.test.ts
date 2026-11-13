import test from 'node:test';
import assert from 'node:assert/strict';
import { SOURCE_HANDLING_RULES, formatStoryLine, hasGroundedExcerpts, stripExcerpts } from './source-guardrails.ts';

const plain = { title: 'Headline', source: 'BBC', sourceType: 'rss' as const, summary: 'Summary text' };
const web = { title: 'Fed holds', source: 'CNBC', sourceType: 'web' as const, summary: 's', excerpt: 'x'.repeat(1500) };

test('rules cover paraphrase, outlet attribution, short quotes and no usernames or personal details', () => {
  assert.match(SOURCE_HANDLING_RULES, /Paraphrase/);
  assert.match(SOURCE_HANDLING_RULES, /Name the outlet on air/);
  assert.match(SOURCE_HANDLING_RULES, /discussion on r\/<name>/);
  assert.match(SOURCE_HANDLING_RULES, /under 10 words/);
  assert.match(SOURCE_HANDLING_RULES, /Never mention usernames/);
});

test('stories without an excerpt keep the original prompt line byte for byte', () => {
  assert.equal(formatStoryLine(plain, 0), '1. Headline - Summary text (BBC)');
  assert.equal(hasGroundedExcerpts([plain]), false);
});

test('stories with an excerpt show outlet and a 600-char excerpt; stripExcerpts removes it before storage', () => {
  const line = formatStoryLine(web, 1);
  assert.ok(line.startsWith('2. Fed holds (CNBC)\n   Excerpt: '));
  assert.equal(line.split('Excerpt: ')[1].length, 600);
  assert.equal(hasGroundedExcerpts([plain, web]), true);
  assert.equal('excerpt' in stripExcerpts([web])[0], false);
  assert.equal(stripExcerpts([web])[0].title, 'Fed holds');
});
