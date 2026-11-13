import test, { beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { contentAggregator } from './aggregator.service.ts';
import { resetRedditRssState } from './reddit.rss.ts';
import { resetArchiveState } from './reddit.archive.ts';
import { resetExaSourceState } from './exa.source.ts';
import { MemorySourceStateStore, setSourceStateStore } from './source-state.store.ts';

process.env.ARCHIVE_MIN_GAP_MS = '0';
const NOW_S = Math.floor(Date.now() / 1000);
const FLAGS = ['SOURCE_EXA_ENABLED', 'SOURCE_REDDIT_ENABLED', 'SOURCE_REDDIT_ARCHIVE_ENABLED', 'SOURCE_CACHE_ENABLED', 'EXA_API_KEY', 'EXA_DAILY_CAP', 'SOURCE_CACHE_STALE_HOURS', 'GOOGLE_NEWS_FALLBACK'];
let store: MemorySourceStateStore;
beforeEach(() => {
  for (const f of FLAGS) delete process.env[f];
  store = new MemorySourceStateStore();
  setSourceStateStore(store);
  resetRedditRssState(); resetArchiveState(); resetExaSourceState();
});
afterEach(() => { for (const f of FLAGS) delete process.env[f]; setSourceStateStore(undefined); });

const hnStory = (id: number) => ({ id, type: 'story', title: `Startups HN story ${id}`, score: 10 + id, by: 'u', time: NOW_S - 600, descendants: 1, url: `https://example.com/${id}` });
const article = (i: number) => ({
  title: `Funding round ${i}`, url: `https://outlet${i}.example/2026/11/12/round-${i}`, publishedDate: new Date(Date.now() - i * 3600_000).toISOString(),
  text: `Article ${i}. The startup closed a round led by existing investors and will expand its team this year. `.repeat(8),
});
const posts = (n: number, base = 100) => Array.from({ length: n }, (_, i) => ({ id: `p${i}`, title: `Reddit post ${i}`, selftext: '', score: base + i * 10, num_comments: 4, created_utc: NOW_S - 7200, over_18: false }));

type Route = (url: string, init?: any) => Response | undefined;
function stub(...routes: Route[]) {
  const real = globalThis.fetch;
  const calls: string[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input); calls.push(url);
    for (const r of routes) { const res = r(url, init); if (res) return res; }
    throw new Error(`unexpected fetch ${url}`);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}
const hn = (n: number): Route => url => {
  if (url.endsWith('/topstories.json')) return new Response(JSON.stringify(Array.from({ length: n }, (_, i) => i + 1)), { status: 200 });
  const m = url.match(/\/item\/(\d+)\.json/); if (m) return new Response(JSON.stringify(hnStory(Number(m[1]))), { status: 200 });
};
const archive = (data: unknown, status = 200): Route => url => (url.includes('arctic-shift') && url.includes('/posts/search') ? new Response(JSON.stringify({ data }), { status }) : undefined);
const archiveComments = (data: unknown): Route => url => (url.includes('/comments/search') ? new Response(JSON.stringify({ data }), { status: 200 }) : undefined);
const exa = (results: unknown[] | number): Route => url => (url === 'https://api.exa.ai/search' ? (typeof results === 'number' ? new Response('', { status: results }) : new Response(JSON.stringify({ results }), { status: 200 })) : undefined);
const redditRss = (status: number, body = ''): Route => url => (url.includes('www.reddit.com/r/') ? new Response(body, { status }) : undefined);

const startups = (sources: any[]) => ({ id: 'startups-vc', name: 'Startups & VC', description: 'Startup news', sources } as any);
const hnSource = { type: 'hackernews', name: 'HackerNews', keywords: [], maxItems: 10 };
const subSource = { type: 'reddit', name: 'r/startups', subreddit: 'startups', maxItems: 10 };

test('default flags: Exa is never called, even when the feeds return nothing', async () => {
  const s = stub(hn(0), archive([]), redditRss(403));
  try { await contentAggregator.aggregateTopicContent(startups([hnSource, subSource])); } finally { s.restore(); }
  assert.ok(!s.calls.some(c => c.includes('api.exa.ai')));
});

test('Reddit source reads the archive first and attributes it as discussion on r/<sub>; reddit.com is not touched', async () => {
  const s = stub(archive(posts(6)), redditRss(200, 'should not be asked'));
  let c; try { c = await contentAggregator.aggregateTopicContent(startups([subSource])); } finally { s.restore(); }
  assert.equal(c.stories.length, 6);
  assert.ok(c.stories.every(x => x.source === 'discussion on r/startups'));
  assert.equal(c.stories[0].score, 150);
  assert.ok(!s.calls.some(u => u.includes('www.reddit.com')));
  assert.ok(c.stories.every(x => (x as any).author === undefined));
});

test('archive failure falls through to reddit.com RSS, then to the HackerNews keyword fallback when that also fails', async () => {
  const s = stub(archive([], 502), redditRss(403, 'blocked'), hn(3));
  let c; try { c = await contentAggregator.aggregateTopicContent(startups([subSource])); } finally { s.restore(); }
  assert.ok(s.calls.some(u => u.includes('arctic-shift')) && s.calls.some(u => u.includes('www.reddit.com')));
  assert.equal(c.stories[0].sourceType, 'hackernews');
});

test('an EMPTY reddit.com answer (200, no entries) counts as a failed source, not a success', async () => {
  const empty = '<?xml version="1.0"?><feed xmlns="http://www.w3.org/2005/Atom"><title>top</title></feed>';
  process.env.SOURCE_REDDIT_ARCHIVE_ENABLED = '0';
  const s = stub(redditRss(200, empty), hn(2));
  let c; try { c = await contentAggregator.aggregateTopicContent(startups([subSource])); } finally { s.restore(); }
  assert.equal(c.stories[0].sourceType, 'hackernews');
  assert.equal(c.successfulSources, 1, 'only the HN fallback succeeded; the empty Reddit feed did not count');
});

test('SOURCE_REDDIT_ENABLED=0 and archive off: no Reddit request at all', async () => {
  process.env.SOURCE_REDDIT_ENABLED = '0'; process.env.SOURCE_REDDIT_ARCHIVE_ENABLED = '0';
  const s = stub(hn(8));
  let c; try { c = await contentAggregator.aggregateTopicContent(startups([hnSource, subSource])); } finally { s.restore(); }
  assert.ok(!s.calls.some(u => u.includes('reddit')));
  assert.equal(c.stories.length, 8);
});

test('SOURCE_REDDIT_ENABLED=0 alone still allows the archive', async () => {
  process.env.SOURCE_REDDIT_ENABLED = '0';
  const s = stub(archive(posts(3)));
  let c; try { c = await contentAggregator.aggregateTopicContent(startups([subSource])); } finally { s.restore(); }
  assert.equal(c.stories.length, 3);
});

test('Exa fallback: thin feeds (< 3 stories) + flag on + key set => the Exa stories are used; Exa searched once per day across calls', async () => {
  process.env.SOURCE_EXA_ENABLED = '1'; process.env.EXA_API_KEY = 'k';
  const s = stub(hn(2), exa([1, 2, 3, 4, 5, 6, 7, 8].map(article)));
  let c, c2; try {
    c = await contentAggregator.aggregateTopicContent(startups([hnSource]));
    c2 = await contentAggregator.aggregateTopicContent(startups([hnSource]));
  } finally { s.restore(); }
  assert.equal(s.calls.filter(u => u.includes('api.exa.ai')).length, 1);
  assert.equal(c.stories.filter(x => x.sourceType === 'web').length, 8);
  assert.equal(c2.stories.filter(x => x.sourceType === 'web').length, 8, 'second call served from the per-topic daily cache');
  assert.ok(c.stories.find(x => x.sourceType === 'web')!.excerpt);
});

test('Exa fallback is skipped when the feeds already gave 3 or more fresh stories', async () => {
  process.env.SOURCE_EXA_ENABLED = '1'; process.env.EXA_API_KEY = 'k';
  const s = stub(hn(3), exa([1, 2, 3].map(article)));
  try { await contentAggregator.aggregateTopicContent(startups([hnSource])); } finally { s.restore(); }
  assert.ok(!s.calls.some(u => u.includes('api.exa.ai')));
});

test('topics without an Exa policy never search Exa, even with the flag on', async () => {
  process.env.SOURCE_EXA_ENABLED = '1'; process.env.EXA_API_KEY = 'k';
  const s = stub(hn(1), exa([1, 2, 3].map(article)));
  try { await contentAggregator.aggregateTopicContent({ ...startups([hnSource]), id: 'user-suggested-topic' }); } finally { s.restore(); }
  assert.ok(!s.calls.some(u => u.includes('api.exa.ai')));
});

test('preview requests never search Exa', async () => {
  process.env.SOURCE_EXA_ENABLED = '1'; process.env.EXA_API_KEY = 'k';
  const s = stub(hn(1), exa([1, 2, 3].map(article)));
  try { await contentAggregator.aggregateTopicContent(startups([hnSource]), { preview: true }); } finally { s.restore(); }
  assert.ok(!s.calls.some(u => u.includes('api.exa.ai')));
});

test('Exa failure (HTTP 500) falls through: the topic keeps its feed stories', async () => {
  process.env.SOURCE_EXA_ENABLED = '1'; process.env.EXA_API_KEY = 'k';
  const s = stub(hn(2), exa(500));
  let c; try { c = await contentAggregator.aggregateTopicContent(startups([hnSource])); } finally { s.restore(); }
  assert.equal(c.stories.length, 2);
  assert.ok(c.stories.every(x => x.sourceType === 'hackernews'));
});

test('last good cache: used when every live source fails, and not when too old', async () => {
  process.env.SOURCE_CACHE_ENABLED = '1';
  let s = stub(hn(3));
  try { await contentAggregator.aggregateTopicContent(startups([hnSource])); } finally { s.restore(); }
  assert.equal(store.topics.get('startups-vc')!.stories!.length, 3);

  s = stub(hn(0), archive([], 502), redditRss(403));
  let c; try { c = await contentAggregator.aggregateTopicContent(startups([hnSource, subSource])); } finally { s.restore(); }
  assert.equal(c.stories.length, 3, 'served from the last good cache');
  assert.equal(c.stories[0].publishedAt instanceof Date, true);

  store.topics.get('startups-vc')!.storiesAt = new Date(Date.now() - 100 * 3600_000);
  resetArchiveState();
  s = stub(hn(0), archive([], 502), redditRss(403));
  try { c = await contentAggregator.aggregateTopicContent(startups([hnSource, subSource])); } finally { s.restore(); }
  assert.equal(c.stories.length, 0, 'older than 72 h: not used');
});

test('last good cache is off by default (nothing read, nothing written)', async () => {
  const s = stub(hn(3));
  try { await contentAggregator.aggregateTopicContent(startups([hnSource])); } finally { s.restore(); }
  assert.equal(store.topics.size, 0);
});

test('show topic with a real-subreddit override: the invalid catalog name is replaced by r/explainlikeimfive, with replies', async () => {
  const s = stub(archive(posts(4, 100)), archiveComments([{ body: 'A long and helpful reply that explains the idea simply to a child.', score: 3, parent_id: 't3_p3' }]));
  let c; try { c = await contentAggregator.aggregateTopicContent({ id: 'eli5', name: "Explain Like I'm 5", description: 'd', sources: [{ type: 'reddit', name: 'r/eli5', subreddit: 'eli5', maxItems: 10 }] } as any); } finally { s.restore(); }
  assert.ok(s.calls.some(u => u.includes('subreddit=explainlikeimfive')));
  assert.ok(!s.calls.some(u => u.includes('subreddit=eli5')));
  assert.equal(c.stories[0].source, 'discussion on r/explainlikeimfive');
  assert.match(c.stories[0].excerpt!, /Top replies/);
});

test('preview of an override topic fetches no replies', async () => {
  const s = stub(archive(posts(4, 100)), archiveComments([]));
  try { await contentAggregator.aggregateTopicContent({ id: 'eli5', name: 'e', description: 'd', sources: [{ type: 'reddit', name: 'r/eli5', subreddit: 'eli5' }] } as any, { preview: true }); } finally { s.restore(); }
  assert.ok(!s.calls.some(u => u.includes('/comments/search')));
});

test('exaPosition "first" (us-politics): Exa runs before the feeds and, when it gives 3+ stories, the feeds are not fetched', async () => {
  process.env.SOURCE_EXA_ENABLED = '1'; process.env.EXA_API_KEY = 'k';
  const s = stub(exa([1, 2, 3, 4].map(article)), hn(9));
  let c; try { c = await contentAggregator.aggregateTopicContent({ ...startups([hnSource]), id: 'us-politics' }); } finally { s.restore(); }
  assert.ok(c.stories.every(x => x.sourceType === 'web'));
  assert.ok(!s.calls.some(u => u.includes('hacker-news')), 'feeds skipped');
});

test('exaPosition "first": when Exa fails the feeds still run', async () => {
  process.env.SOURCE_EXA_ENABLED = '1'; process.env.EXA_API_KEY = 'k';
  const s = stub(exa(503), hn(4));
  let c; try { c = await contentAggregator.aggregateTopicContent({ ...startups([hnSource]), id: 'us-politics' }); } finally { s.restore(); }
  assert.equal(c.stories.length, 4);
  assert.ok(c.stories.every(x => x.sourceType === 'hackernews'));
});

test('catalog source fixes: dead or wrong sources are dropped (Twitter in nba, Hindi/Indian sources in us-politics, Cricbuzz)', async () => {
  const names = (id: string, list: string[]) => (contentAggregator as any).applySourceFixes(list.map(name => ({ type: 'rss', name, url: `https://x.example/${name}` })), (require('./source-policy.ts') as any).getSourcePolicy(id)).map((x: any) => x.name);
  assert.deepEqual(names('nba-basketball', ['NBA Twitter Official', 'Bleacher Report NBA']), ['Bleacher Report NBA']);
  assert.deepEqual(names('us-politics', ['Politico', 'The Hill', 'NDTV India Hindi', 'BBC Hindi', 'Aaj Tak', 'r/IndianPolitics']), ['Politico', 'The Hill']);
  assert.deepEqual(names('cricket-updates', ['ESPNcricinfo', 'Cricbuzz']), ['ESPNcricinfo']);
  assert.deepEqual(names('tech-news', ['TechCrunch', 'ESPN News', 'Sports Illustrated', 'CBS Sports', 'Fox Sports News']), ['TechCrunch']);
  assert.deepEqual(names('markets-finance', ['CNBC Top News', 'Yahoo Finance']), ['CNBC Top News']);
  const politico = (contentAggregator as any).applySourceFixes([{ type: 'rss', name: 'Politico', url: 'https://www.politico.com/rss/politicopicks.xml' }], (require('./source-policy.ts') as any).getSourcePolicy('us-politics'));
  assert.equal(politico[0].url, 'https://rss.politico.com/politics-news.xml');
});
