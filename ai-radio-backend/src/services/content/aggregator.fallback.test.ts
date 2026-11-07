import test from 'node:test';
import assert from 'node:assert/strict';
import { contentAggregator, googleNewsFallbackEnabled, googleNewsSearchUrl, redditOAuthEnabled, redditUserAgent } from './aggregator.service.ts';
import { resetRedditRssState } from './reddit.rss.ts';

const RSS = `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>
<item><title>Spring planting guide</title><link>https://example.com/a</link><pubDate>Thu, 29 Oct 2026 10:00:00 GMT</pubDate></item>
<item><title>Soil tips</title><link>https://example.com/b</link><pubDate>Thu, 29 Oct 2026 09:00:00 GMT</pubDate></item>
</channel></rss>`;

/** Run fn with GOOGLE_NEWS_FALLBACK set to value (undefined = unset), restoring afterwards. */
async function withFlag<T>(value: string | undefined, fn: () => Promise<T>): Promise<T> {
  const prev = process.env.GOOGLE_NEWS_FALLBACK;
  if (value === undefined) delete process.env.GOOGLE_NEWS_FALLBACK; else process.env.GOOGLE_NEWS_FALLBACK = value;
  try { return await fn(); } finally {
    if (prev === undefined) delete process.env.GOOGLE_NEWS_FALLBACK; else process.env.GOOGLE_NEWS_FALLBACK = prev;
  }
}

/** OAuth is opt-in; these tests exercise that path (with creds) and clear everything afterwards. */
function oauthOn() { process.env.REDDIT_USE_OAUTH = '1'; process.env.REDDIT_CLIENT_ID = 'id'; process.env.REDDIT_CLIENT_SECRET = 'secret'; resetRedditRssState(); }
function oauthOff() { delete process.env.REDDIT_USE_OAUTH; delete process.env.REDDIT_CLIENT_ID; delete process.env.REDDIT_CLIENT_SECRET; resetRedditRssState(); }

/** Atom feed shaped like Reddit's /top/.rss: one link post, one text post. */
const REDDIT_ATOM = `<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom" xmlns:media="http://search.yahoo.com/mrss/"><title>top</title><updated>2026-11-07T17:00:00+00:00</updated>
<entry><author><name>/u/alice</name></author><content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;span&gt;&lt;a href="https://example.com/article?a=1&amp;amp;b=2"&gt;[link]&lt;/a&gt;&lt;/span&gt; &lt;span&gt;&lt;a href="https://www.reddit.com/r/gardening/comments/aaa/blight/"&gt;[comments]&lt;/a&gt;&lt;/span&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content><id>t3_aaa</id><link href="https://www.reddit.com/r/gardening/comments/aaa/blight/"/><updated>2026-11-07T10:00:00+00:00</updated><title>Tomato blight</title></entry>
<entry><author><name>/u/bob</name></author><content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;!-- SC_OFF --&gt;&lt;div class="md"&gt;&lt;p&gt;My lawn is now beds &amp;amp; it&amp;#39;s great.&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt; &amp;#32; submitted by &amp;#32; &lt;a href="https://www.reddit.com/user/bob"&gt; /u/bob &lt;/a&gt; &lt;br/&gt;&lt;span&gt;&lt;a href="https://www.reddit.com/r/gardening/comments/bbb/lawn/"&gt;[link]&lt;/a&gt;&lt;/span&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content><id>t3_bbb</id><link href="https://www.reddit.com/r/gardening/comments/bbb/lawn/"/><updated>2026-11-07T09:00:00+00:00</updated><title>Lawn to beds</title></entry>
</feed>`;

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

test('with GOOGLE_NEWS_FALLBACK=1, single-source reddit topic: when Reddit is blocked (403 on the feed) Google News fills in, HackerNews is not needed', () => withFlag('1', async () => {
  oauthOff();
  const { calls, restore } = stubFetch(url => {
    if (url.includes('www.reddit.com/r/')) return new Response('blocked', { status: 403 });
    if (url.includes('news.google.com')) return new Response(RSS, { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const content = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(content.stories.length, 2);
    assert.equal(content.stories[0].source, 'Google News (fallback)');
    assert.ok(!calls.some(c => c.url.includes('hacker-news')), 'HackerNews not called once Google News produced stories');
    assert.equal(calls.filter(c => c.url.includes('www.reddit.com/r/')).length, 1, '403 is not retried');
    assert.ok(!calls.some(c => c.url.includes('oauth.reddit.com') || c.url.includes('access_token')), 'OAuth is not used by default');
  } finally { restore(); }
}));

test('Google News is not called when a configured source returns stories, even when enabled (OAuth opt-in path)', () => withFlag('1', async () => {
  oauthOn();
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
  } finally { restore(); oauthOff(); }
}));

test('Reddit OAuth 429 is retried once, then succeeds (OAuth opt-in path)', async () => {
  oauthOn();
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
  } finally { restore(); oauthOff(); }
});

test('when enabled and Reddit and Google News both fail, the HackerNews fallback still runs', () => withFlag('1', async () => {
  oauthOff();
  const { calls, restore } = stubFetch(url => {
    if (url.includes('www.reddit.com/r/')) return new Response('blocked', { status: 403 });
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
}));

test('Google News fallback is OFF by default and for non-enabling values; HackerNews still runs', async () => {
  for (const v of [undefined, '', '0', 'false', 'off', 'maybe']) {
    await withFlag(v, async () => {
      oauthOff();
      assert.equal(googleNewsFallbackEnabled(), false, `flag=${JSON.stringify(v)}`);
      const { calls, restore } = stubFetch(url => {
        if (url.includes('www.reddit.com/r/')) return new Response('blocked', { status: 403 });
        if (url.endsWith('/topstories.json')) return new Response(JSON.stringify([]), { status: 200 });
        throw new Error(`unexpected fetch ${url}`);
      });
      try {
        await contentAggregator.aggregateTopicContent(redditTopic);
        assert.equal(calls.some(c => c.url.includes('news.google.com')), false, `flag=${JSON.stringify(v)}`);
        assert.ok(calls.some(c => c.url.endsWith('/topstories.json')), 'HackerNews fallback ran');
      } finally { restore(); }
    });
  }
});

test('GOOGLE_NEWS_FALLBACK enables on 1/true/on/yes (case and whitespace tolerant)', async () => {
  for (const v of ['1', 'true', 'TRUE', ' on ', 'yes']) {
    await withFlag(v, async () => assert.equal(googleNewsFallbackEnabled(), true, v));
  }
});

// ---- Reddit public Atom feed (default path) ----

test('redditOAuthEnabled is off by default and needs both the flag and the credentials', () => {
  oauthOff();
  assert.equal(redditOAuthEnabled(), false);
  process.env.REDDIT_CLIENT_ID = 'id'; process.env.REDDIT_CLIENT_SECRET = 'secret';
  assert.equal(redditOAuthEnabled(), false, 'credentials alone do not turn OAuth on');
  process.env.REDDIT_USE_OAUTH = 'yes';
  assert.equal(redditOAuthEnabled(), true);
  delete process.env.REDDIT_CLIENT_SECRET;
  assert.equal(redditOAuthEnabled(), false, 'flag without credentials stays off');
  oauthOff();
});

test('default path reads the Atom feed with the configured User-Agent: external link for link posts, thread link for text posts', async () => {
  oauthOff();
  process.env.REDDIT_USER_AGENT = 'audexa-test/1.0 (by /u/tester)';
  const { calls, restore } = stubFetch(url => {
    if (url.includes('www.reddit.com/r/gardening/top/.rss')) return new Response(REDDIT_ATOM, { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const content = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(calls.length, 1);
    assert.match(calls[0].url, /^https:\/\/www\.reddit\.com\/r\/gardening\/top\/\.rss\?t=day&limit=\d+$/);
    assert.equal(calls[0].headers['User-Agent'], 'audexa-test/1.0 (by /u/tester)');
    const byTitle = Object.fromEntries(content.stories.map(s => [s.title, s]));
    assert.equal(byTitle['Tomato blight'].url, 'https://example.com/article?a=1&b=2');
    assert.equal(byTitle['Lawn to beds'].url, 'https://www.reddit.com/r/gardening/comments/bbb/lawn/');
    assert.equal(byTitle['Lawn to beds'].summary, "My lawn is now beds & it's great.");
    assert.equal(byTitle['Tomato blight'].author, 'alice');
    assert.equal(byTitle['Tomato blight'].sourceType, 'reddit');
    assert.equal(byTitle['Tomato blight'].source, 'r/gardening');
  } finally { restore(); delete process.env.REDDIT_USER_AGENT; resetRedditRssState(); }
});

test('feed results are cached: a second topic build makes no second Reddit request', async () => {
  oauthOff();
  const { calls, restore } = stubFetch(url => {
    if (url.includes('www.reddit.com/r/')) return new Response(REDDIT_ATOM, { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const a = await contentAggregator.aggregateTopicContent(redditTopic);
    const b = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(a.stories.length, 2);
    assert.equal(b.stories.length, 2);
    assert.equal(calls.length, 1);
  } finally { restore(); resetRedditRssState(); }
});

test('rate window: 429 with a reset beyond the max wait fails fast (no sleep, no second request) and the topic falls back', () => withFlag('1', async () => {
  oauthOff();
  process.env.REDDIT_RSS_MAX_WAIT_MS = '5000';
  const { calls, restore } = stubFetch(url => {
    if (url.includes('www.reddit.com/r/')) return new Response('slow', { status: 429, headers: { 'x-ratelimit-reset': '40' } });
    if (url.includes('news.google.com')) return new Response(RSS, { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const t0 = Date.now();
    const content = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.ok(Date.now() - t0 < 2000, 'did not sleep through the rate window');
    assert.equal(calls.filter(c => c.url.includes('www.reddit.com/r/')).length, 1);
    assert.equal(content.stories[0].source, 'Google News (fallback)');
  } finally { restore(); delete process.env.REDDIT_RSS_MAX_WAIT_MS; resetRedditRssState(); }
}));

test('rate window: a short reset is waited out once and the retry succeeds', async () => {
  oauthOff();
  process.env.REDDIT_RSS_MAX_WAIT_MS = '5000';
  let n = 0;
  const { calls, restore } = stubFetch(url => {
    if (url.includes('www.reddit.com/r/')) {
      n++;
      return n === 1 ? new Response('slow', { status: 429, headers: { 'x-ratelimit-reset': '1' } }) : new Response(REDDIT_ATOM, { status: 200 });
    }
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const content = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(content.stories.length, 2);
    assert.equal(calls.length, 2);
  } finally { restore(); delete process.env.REDDIT_RSS_MAX_WAIT_MS; resetRedditRssState(); }
});

test('after a 403 block the feed is not requested again during the backoff, and a cached copy is served stale', async () => {
  oauthOff();
  process.env.REDDIT_RSS_CACHE_TTL_MS = '0'; // every call wants a refresh
  let blocked = false;
  const { calls, restore } = stubFetch(url => {
    if (url.includes('www.reddit.com/r/')) return blocked ? new Response('blocked', { status: 403 }) : new Response(REDDIT_ATOM, { status: 200 });
    if (url.endsWith('/topstories.json')) return new Response(JSON.stringify([]), { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const fresh = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(fresh.stories.length, 2);
    blocked = true;
    const stale = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(stale.stories.length, 2, 'stale copy served when Reddit blocks');
    const again = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(again.stories.length, 2);
    assert.equal(calls.filter(c => c.url.includes('www.reddit.com/r/')).length, 2, 'one good request, one 403, then backoff');
  } finally { restore(); delete process.env.REDDIT_RSS_CACHE_TTL_MS; resetRedditRssState(); }
});

test('OAuth opt-in: when oauth.reddit.com is blocked the public feed is used instead', async () => {
  oauthOn();
  const { calls, restore } = stubFetch(url => {
    if (url.includes('/api/v1/access_token')) return new Response(JSON.stringify({ access_token: 'tok', expires_in: 3600 }), { status: 200 });
    if (url.includes('oauth.reddit.com')) return new Response('blocked', { status: 403 });
    if (url.includes('www.reddit.com/r/')) return new Response(REDDIT_ATOM, { status: 200 });
    throw new Error(`unexpected fetch ${url}`);
  });
  try {
    const content = await contentAggregator.aggregateTopicContent(redditTopic);
    assert.equal(content.stories.length, 2);
    assert.equal(calls.filter(c => c.url.includes('oauth.reddit.com')).length, 1);
  } finally { restore(); oauthOff(); }
});

test('an invalid subreddit name never reaches the network', async () => {
  oauthOff();
  const { calls, restore } = stubFetch(() => { throw new Error('should not fetch'); });
  try {
    const content = await contentAggregator.aggregateTopicContent(topic([{ type: 'reddit', name: 'bad', subreddit: '../x?y=1', maxItems: 3 }]));
    assert.equal(content.stories.length, 0);
    assert.equal(calls.filter(c => c.url.includes('reddit.com')).length, 0);
  } finally { restore(); }
});
