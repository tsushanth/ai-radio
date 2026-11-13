import test, { beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { fetchRedditArchive, archivePostsUrl, archiveCommentsUrl, resetArchiveState, ArchiveError } from './reddit.archive.ts';

const NOW = Date.parse('2026-11-13T05:00:00.000Z');
const env = {} as NodeJS.ProcessEnv; // default spacing: 5 s
const json = (data: unknown, status = 200) => new Response(JSON.stringify({ data }), { status });
const post = (id: string, score: number, over: Record<string, unknown> = {}) => ({ id, title: `Post ${id}`, selftext: '', score, num_comments: 3, created_utc: NOW / 1000 - 3600, over_18: false, ...over });

function mk(route: (url: string) => Response | Promise<Response>) {
  const calls: string[] = [], sleeps: number[] = [];
  let t = NOW;
  const deps = {
    env, now: () => t, sleep: async (ms: number) => { sleeps.push(ms); t += ms; },
    fetchFn: (async (url: any) => { calls.push(String(url)); return route(String(url)); }) as typeof fetch,
  };
  return { calls, sleeps, deps };
}
const five = () => [1, 2, 3, 4, 5].map(i => post(`q${i}`, 40 + i));
beforeEach(() => resetArchiveState());

test('posts request: allowlisted fields only (never author), 24 h window (72 h on request), limit 100, sort desc', () => {
  const u = new URL(archivePostsUrl('space', NOW));
  assert.equal(u.origin + u.pathname, 'https://arctic-shift.photon-reddit.com/api/posts/search');
  assert.equal(u.searchParams.get('subreddit'), 'space');
  assert.equal(u.searchParams.get('limit'), '100');
  assert.equal(u.searchParams.get('sort'), 'desc');
  assert.equal(Number(u.searchParams.get('before')) - Number(u.searchParams.get('after')), 24 * 3600);
  assert.equal(Number(new URL(archivePostsUrl('space', NOW, 72)).searchParams.get('after')), NOW / 1000 - 72 * 3600);
  const fields = u.searchParams.get('fields')!.split(',');
  assert.ok(!fields.includes('author') && !fields.includes('author_fullname') && !fields.includes('permalink'));
  assert.deepEqual(fields, ['id', 'title', 'selftext', 'score', 'num_comments', 'created_utc', 'over_18']);
  assert.ok(!archiveCommentsUrl('abc').includes('author'));
  assert.match(archiveCommentsUrl('abc'), /link_id=abc&limit=100&fields=body,score,parent_id$/);
});

test('ranks by score, applies the score floor, drops NSFW/removed, builds permalinks, attributes as discussion on r/<sub>, carries no author', async () => {
  const { deps } = mk(() => json([
    post('a', 3), post('b', 815, { selftext: 'Launch window moves. '.repeat(40) }), post('c', 491), post('d', 900, { over_18: true }),
    post('e', 194, { title: '[removed]' }), post('f', 50, { author: 'someone', selftext: '[removed]' }),
  ]));
  const stories = await fetchRedditArchive({ subreddit: 'space', name: 'r/space' }, { maxItems: 3 }, deps);
  assert.deepEqual(stories.map(s => s.title), ['Post b', 'Post c', 'Post f']);
  assert.equal(stories[0].source, 'discussion on r/space');
  assert.equal(stories[0].sourceType, 'reddit');
  assert.equal(stories[0].url, 'https://www.reddit.com/r/space/comments/b/');
  assert.equal(stories[0].score, 815);
  assert.ok(stories[0].excerpt!.length <= 600);
  assert.equal(stories[2].summary, undefined, '[removed] selftext is not used');
  for (const s of stories) assert.equal((s as any).author, undefined);
});

test('caches per subreddit per day: a second call makes no request', async () => {
  const m = mk(() => json(five()));
  await fetchRedditArchive({ subreddit: 'space' }, {}, m.deps);
  await fetchRedditArchive({ subreddit: 'Space' }, { maxItems: 1 }, m.deps);
  assert.equal(m.calls.length, 1);
});

test('requests are serialised and spaced at least 5 s apart', async () => {
  const m = mk(() => json(five()));
  await Promise.all(['space', 'cricket', 'investing'].map(s => fetchRedditArchive({ subreddit: s }, {}, m.deps)));
  assert.equal(m.calls.length, 3);
  assert.deepEqual(m.sleeps, [5000, 5000]);
});

test('failures: 429, 5xx, 422 timeout, bad JSON, network error, empty list and no post above the floor all throw ArchiveError', async () => {
  const cases: Array<() => Response | Promise<Response>> = [
    () => new Response('', { status: 429, headers: { 'retry-after': '30' } }), () => new Response('', { status: 502 }),
    () => new Response('{"data":null,"error":"Timeout. Maybe slow down a bit"}', { status: 422 }), () => new Response('<html>', { status: 200 }),
    () => { throw new TypeError('fetch failed'); }, () => json([]), () => json([post('a', 1), post('b', 2)]),
  ];
  for (const route of cases) {
    resetArchiveState();
    await assert.rejects(fetchRedditArchive({ subreddit: 'space' }, {}, mk(route).deps), (e: any) => e instanceof ArchiveError);
  }
});

test('a 422 "slow down" fails soft (no retry) and holds the next request until x-ratelimit-reset', async () => {
  const m = mk(url => (url.includes('subreddit=space')
    ? new Response('{"data":null,"error":"Timeout. Maybe slow down a bit"}', { status: 422, headers: { 'x-ratelimit-reset': '23' } })
    : json([post('a', 50)])));
  await assert.rejects(fetchRedditArchive({ subreddit: 'space' }, {}, m.deps), (e: any) => e instanceof ArchiveError && e.kind === 'rate_limited');
  assert.equal(m.calls.length, 1, 'not retried');
  await fetchRedditArchive({ subreddit: 'cricket' }, {}, m.deps);
  assert.ok(m.sleeps[0] >= 22_000, `slept ${m.sleeps[0]}`);
});

test('a reset more than 60 s away fails the next call without waiting', async () => {
  const m = mk(url => (url.includes('subreddit=space') ? new Response('', { status: 429, headers: { 'retry-after': '120' } }) : json([post('a', 50)])));
  await assert.rejects(fetchRedditArchive({ subreddit: 'space' }, {}, m.deps));
  await assert.rejects(fetchRedditArchive({ subreddit: 'cricket' }, {}, m.deps), (e: any) => e.kind === 'rate_limited');
  assert.equal(m.calls.length, 1);
  assert.deepEqual(m.sleeps, []);
});

test('24 h window first; widened to 72 h only when fewer than 5 posts clear the floor; 5 or more stop at one request', async () => {
  const wide = mk(url => (url.includes(`after=${NOW / 1000 - 24 * 3600}`) ? json([post('a', 50), post('b', 60)]) : json([post('a', 50), post('b', 60), post('c', 70), post('d', 80)])));
  const s1 = await fetchRedditArchive({ subreddit: 'space' }, {}, wide.deps);
  assert.equal(wide.calls.length, 2);
  assert.equal(s1.length, 4);
  resetArchiveState();
  const enough = mk(() => json([1, 2, 3, 4, 5].map(i => post(`p${i}`, 50 + i))));
  await fetchRedditArchive({ subreddit: 'cricket' }, {}, enough.deps);
  assert.equal(enough.calls.length, 1);
  resetArchiveState();
  const quiet = mk(() => json([]));
  await assert.rejects(fetchRedditArchive({ subreddit: 'f1' }, {}, quiet.deps), (e: any) => e.kind === 'empty');
});

test('after a failure the subreddit is not requested again for 30 minutes', async () => {
  const m = mk(() => new Response('', { status: 502 }));
  await assert.rejects(fetchRedditArchive({ subreddit: 'space' }, {}, m.deps));
  await assert.rejects(fetchRedditArchive({ subreddit: 'space' }, {}, m.deps), (e: any) => e.kind === 'backoff');
  assert.equal(m.calls.length, 1);
});

test('a 429 pushes the next request out by Retry-After', async () => {
  const m = mk(url => (url.includes('subreddit=space') ? new Response('', { status: 429, headers: { 'retry-after': '30' } }) : json([post('a', 50)])));
  await assert.rejects(fetchRedditArchive({ subreddit: 'space' }, {}, m.deps));
  await fetchRedditArchive({ subreddit: 'cricket' }, {}, m.deps);
  assert.ok(m.sleeps[0] >= 29_000, `slept ${m.sleeps[0]}`);
});

test('invalid subreddit names never reach the network', async () => {
  const m = mk(() => json([]));
  for (const bad of ['simulate-this', '../x', 'a b', '']) await assert.rejects(fetchRedditArchive({ subreddit: bad }, {}, m.deps), (e: any) => e.kind === 'invalid');
  assert.equal(m.calls.length, 0);
});

test('comments: top 3 top-level replies of the best 3 posts, by score then length, no links, removed ones dropped, no author field', async () => {
  const long = (t: string) => `${t} that is long enough to be a real reply to the question asked.`;
  const m = mk(url => {
    if (url.includes('/comments/search')) return json([
      { body: long('Low'), score: 1, parent_id: 't3_a' }, { body: long('High'), score: 40, parent_id: 't3_a' }, { body: long('Mid'), score: 9, parent_id: 't3_a' },
      { body: '[removed]', score: 99, parent_id: 't3_a' }, { body: long('Nested'), score: 500, parent_id: 't1_zzz' }, { body: 'see https://x.example/a ' + long('Link'), score: 80, parent_id: 't3_a' },
      { body: long('Fourth'), score: 0, parent_id: 't3_a' },
    ]);
    return json([post('a', 300), post('b', 200), post('c', 100), post('d', 90)]);
  });
  const stories = await fetchRedditArchive({ subreddit: 'explainlikeimfive' }, { comments: true, minScore: 20 }, m.deps);
  assert.equal(m.calls.filter(c => c.includes('/comments/search')).length, 3, 'comments for the top 3 posts only');
  assert.match(stories[0].excerpt!, /Top replies: \(1\) High.*\(2\) Mid.*\(3\) Low/);
  assert.ok(!/Nested|Link|removed|Fourth/.test(stories[0].excerpt!));
  assert.ok(!m.calls.some(c => /author/.test(c)));
});

test('a failing comments request keeps the post (comments are an extra)', async () => {
  const m = mk(url => (url.includes('/comments/search') ? new Response('', { status: 500 }) : json([post('a', 300)])));
  const stories = await fetchRedditArchive({ subreddit: 'tifu' }, { comments: true }, m.deps);
  assert.equal(stories.length, 1);
});
