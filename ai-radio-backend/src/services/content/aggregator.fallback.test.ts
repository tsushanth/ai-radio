import test from 'node:test';
import assert from 'node:assert/strict';
import { contentAggregator, googleNewsFallbackEnabled, googleNewsSearchUrl, redditUserAgent } from './aggregator.service.ts';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
<item><title>Spring planting guide</title><link>https://example.com/a</link><pubDate>Thu, 29 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Soil tips</title><link>https://example.com/b</link><pubDate>Thu, 29 Oct 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`;

type Call = { url: string; headers: Record<string, string> };

/** Replace global fetch with a router; returns the call log and a restore function. */
function stubFetch(route: (url: string) => Response | Promise<Response>) {
  const real = globalThis.fetch;
  const calls: Call[] = [];
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input);
    calls.push({ url, headers: { ...(init?.headers ?? {}) } });
    return route(url);
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = real; } };
}

const topic = (sources: any[]) => ({ id: 't1', name: 'Gardening', description: 'Plants and soil', sources } as any);
const redditTopic = topic([{ type: 'reddit', name: 'r/gardening', subreddit: 'gardening', maxItems: 5 }]);

test('googleNewsSearchUrl encodes the topic name and limits to two days', () => {
  const u = googleNewsSearchUrl('Home & Garden');
  assert.match(u, /^https:\/\/news\.google\.com\/rss\/search\?q=Home%20%26%20Garden%20when%3A2d&/);
});

test('redditUserAgent prefers REDDIT_USER_AGENT and falls back to the old literal', () => {
  const prev = process.env.REDDIT_USER_AGENT;
  process.env.REDDIT_USER_AGENT = '  audexa/1.0 (by /u/someone)  ';
  assert.equal(redditUserAgent(), 'audexa/1.0 (by /u/someone)');
  delete process.env.REDDIT_USER_AGENT;
  assert.equal(redditUserAgent(), 'BriefCast/1.0 (by /u/BriefCastApp)');
  if (prev !== undefined) process.env.REDDIT_USER_AGENT = prev;
});

test('single-source reddit topic: when Reddit is blocked (403) Google News fills in, HackerNews is not needed', async () => {
  process.env.REDDIT_CLIENT_ID = 'id'; process.env.REDDIT_CLIENT_SECRET = 'secret';
  const { calls, restore } = stubFetch(url => {
    if (url.includes('/api/v1/access_token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
    if (url.includes('oauth.reddit.com')) return new Response('blocked', { status: 403 });
    if (url.includes('news.google.com')) return new Response(RSS, { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const content = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(content.stories.length, 2);
    assert.equal(content.stories[0].source, 'Google News (fallback)');
    assert.ok(!calls.some(c => c.url.includes('hacker-news')), 'HackerNews not called once Google News produced stories');
    assert.equal(calls.filter(c => c.url.includes('oauth.reddit.com')).length, 1, '403 is not retried');
  } finally { restore(); }
});

test('Google News is not called when a configured source returns stories', async () => {
  const { calls, restore } = stubFetch(url => {
    if (url.includes('/api/v1/access_token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
    if (url.includes('oauth.reddit.com')) return new Response(JSON.stringify({ data: { children: [
      { data: { title: 'Tomato blight', subreddit: 'gardening', permalink: '/r/gardening/x', score: 50, num_comments: 3, created_utc: 1761700000, author: 'a', is_self: false, stickied: false, over_18: false, url: 'https://example.com' } },
    ] } }), { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const content = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(content.stories.length, 1);
    assert.ok(!calls.some(c => c.url.includes('news.google.com')));
    assert.equal(calls.find(c => c.url.includes('oauth.reddit.com'))!.headers['User-Agent'], redditUserAgent());
  } finally { restore(); }
});

test('Reddit 429 is retried once, then succeeds', async () => {
  process.env.REDDIT_RETRY_DELAY_MS = '1';
  let n = 0;
  const { calls, restore } = stubFetch(url => {
    if (url.includes('/api/v1/access_token')) return new Response(JSON.stringify({ access_token: 'tok2', expires_in: 3600 }), { status: 200 });
    if (url.includes('oauth.reddit.com')) {
      n++;
      if (n === 1) return new Response('slow down', { status: 429 });
      return new Response(JSON.stringify({ data: { children: [
        { data: { title: 'Mulch', subreddit: 'gardening', permalink: '/r/gardening/y', score: 5, num_comments: 1, created_utc: 1761700000, author: 'a', is_self: false, stickied: false, over_18: false, url: 'https://example.com' } },
      ] } }), { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const content = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(content.stories.length, 1);
    assert.equal(calls.filter(c => c.url.includes('oauth.reddit.com')).length, 2);
  } finally { restore(); }
});

test('when Reddit and Google News both fail, the HackerNews fallback still runs', async () => {
  const { calls, restore } = stubFetch(url => {
    if (url.includes('/api/v1/access_token')) return new Response('no', { status: 401 });
    if (url.includes('oauth.reddit.com')) return new Response('blocked', { status: 403 });
    if (url.includes('news.google.com')) return new Response('nope', { status: 503 });
    if (url.endsWith('/topstories.json')) return new Response(JSON.stringify([1]), { status: 200 });
    if (url.includes('/item/1.json')) return new Response(JSON.stringify({ id: 1, type: 'story', title: 'Gardening robots', score: 9, by: 'x', time: 1761700000, descendants: 2, url: 'https://example.com/h' }), { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const content = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(content.stories.length, 1);
    assert.equal(content.stories[0].sourceType, 'hackernews');
    assert.ok(calls.some(c => c.url.includes('news.google.com')));
  } finally { restore(); }
});

test('GOOGLE_NEWS_FALLBACK=0 disables the Google News fallback; HackerNews still runs', async () => {
  const prev = process.env.GOOGLE_NEWS_FALLBACK;
  process.env.GOOGLE_NEWS_FALLBACK = '0';
  assert.equal(googleNewsFallbackEnabled(), false);
  const { calls, restore } = stubFetch(url => {
    if (url.includes('/api/v1/access_token')) return new Response('no', { status: 401 });
    if (url.includes('oauth.reddit.com')) return new Response('blocked', { status: 403 });
    if (url.endsWith('/topstories.json')) return new Response(JSON.stringify([]), { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(calls.some(c => c.url.includes('news.google.com')), false);
  } finally {
    restore();
    if (prev === undefined) delete process.env.GOOGLE_NEWS_FALLBACK; else process.env.GOOGLE_NEWS_FALLBACK = prev;
  }
  assert.equal(googleNewsFallbackEnabled(), true, 'on by default');
});
