import test from 'node:test';
import assert from 'node:assert/strict';
import { filterExaResults, outletName, MIN_BODY_CHARS } from './exa.filter.ts';

const now = new Date('2026-11-13T05:00:00.000Z');
const since = new Date(now.getTime() - 48 * 3600_000);
const body = (n = 900) => 'The central bank held rates steady on Wednesday and signalled patience. '.repeat(Math.ceil(n / 70)).slice(0, n);
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3600_000).toISOString();
const r = (over: Record<string, unknown> = {}) => ({ title: 'Fed holds rates', url: 'https://www.cnbc.com/2026/11/12/fed-holds-rates.html', publishedDate: hoursAgo(5), text: body(), ...over });
const run = (results: any[]) => filterExaResults(results, { now, since });

test('a good article becomes a web story with the outlet name and a 1500-char cap, without author', () => {
  const { stories } = run([r({ text: body(3000), author: 'Jane Doe' })]);
  assert.equal(stories.length, 1);
  assert.equal(stories[0].source, 'CNBC');
  assert.equal(stories[0].sourceType, 'web');
  assert.equal(stories[0].excerpt!.length, 1500);
  assert.equal(stories[0].author, undefined);
  assert.equal(stories[0].url, 'https://www.cnbc.com/2026/11/12/fed-holds-rates.html');
});

test('drops hub/index pages (short text or section URLs)', () => {
  const { stories, dropped } = run([
    r({ title: 'Latest news', url: 'https://www.sportstar.com/', text: body(MIN_BODY_CHARS + 100) }),
    r({ title: 'Space', url: 'https://www.theverge.com/space', text: body() }),
    r({ title: 'Transactions', url: 'https://apnews.com/article/wednesday-transactions-abc', text: body(MIN_BODY_CHARS - 1) }),
  ]);
  assert.equal(stories.length, 0);
  assert.equal(dropped.hub_or_short, 3);
});

test('drops future-dated, undated and out-of-window results; keeps one hour of clock slack', () => {
  const { stories, dropped } = run([
    r({ title: 'future', url: 'https://a.com/x/1', publishedDate: hoursAgo(-20) }),
    r({ title: 'undated', url: 'https://b.com/x/2', publishedDate: null }),
    r({ title: 'old', url: 'https://c.com/x/3', publishedDate: hoursAgo(80) }),
    r({ title: 'slightly ahead', url: 'https://d.com/x/4', publishedDate: hoursAgo(-0.5), text: body(800) + ' d' }),
  ]);
  assert.deepEqual(stories.map(s => s.title), ['slightly ahead']);
  assert.equal(dropped.future_dated, 1);
  assert.equal(dropped.undated, 1);
  assert.equal(dropped.outside_window, 1);
});

test('drops syndicated duplicates (same title or same opening text) and repost sites', () => {
  const { stories, dropped } = run([
    r({ title: 'Fed holds rates', url: 'https://cnbc.com/a/b' }),
    r({ title: 'FED HOLDS RATES!', url: 'https://other.com/a/b', text: body(1000) + ' extra' }),
    r({ title: 'Different headline', url: 'https://third.com/a/b' }),
    r({ title: 'Repost', url: 'https://www.devdiscourse.com/article/x/y', text: 'Unique text. ' + body() }),
  ]);
  assert.equal(stories.length, 1);
  assert.equal(dropped.duplicate, 2);
  assert.equal(dropped.syndicator, 1);
});

test('drops social/personal pages, non-English pages and results without a title or valid url', () => {
  const korean = '한국어 기사 본문입니다 '.repeat(80);
  const { stories, dropped } = run([
    r({ url: 'https://www.linkedin.com/posts/someone-123' }),
    r({ url: 'https://www.reddit.com/r/space/comments/abc/x/' }),
    r({ title: 'korean', url: 'https://okky.kr/articles/1/a', text: korean }),
    r({ title: '' }),
    r({ url: 'not a url' }),
  ]);
  assert.equal(stories.length, 0);
  assert.equal(dropped.blocked_domain, 2);
  assert.equal(dropped.non_english, 1);
  assert.equal(dropped.invalid, 2);
});

test('falls back to highlights when text is missing and respects max', () => {
  const { stories } = run([
    r({ text: undefined, highlights: [body(300), body(300)] }),
    r({ title: 'B', url: 'https://example-news.com/p/q', text: 'Second story opens differently. ' + body(800) }),
    r({ title: 'C', url: 'https://other-news.com/p/q', text: 'Third story also opens differently. ' + body(800) }),
  ]);
  assert.equal(stories.length, 3);
  assert.equal(filterExaResults([r(), r({ title: 'B2', url: 'https://example-news.com/p/q', text: 'Other opening words. ' + body() })], { now, since, max: 1 }).stories.length, 1);
});

test('outletName maps known outlets and prettifies others', () => {
  assert.equal(outletName('https://www.cnbc.com/x/y'), 'CNBC');
  assert.equal(outletName('https://edition.cnn.com/x/y'), 'CNN');
  assert.equal(outletName('https://www.eu-startups.com/a/b'), 'Eu-startups');
  assert.equal(outletName('https://www.bbc.co.uk/news/a/b'), 'the BBC');
  assert.equal(outletName('garbage'), 'the web');
});
