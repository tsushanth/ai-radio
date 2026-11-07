import asyncio
import os
import sys
import unittest

from aiohttp import web
from aiohttp.test_utils import TestServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import content_fetcher as cf  # noqa: E402
from topics import ContentSource  # noqa: E402

ATOM = """<?xml version="1.0" encoding="UTF-8"?><feed xmlns="http://www.w3.org/2005/Atom"><title>top</title>
<entry><author><name>/u/alice</name></author><content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;span&gt;&lt;a href="https://example.com/article?a=1&amp;amp;b=2"&gt;[link]&lt;/a&gt;&lt;/span&gt; &lt;span&gt;&lt;a href="https://www.reddit.com/r/technology/comments/aaa/x/"&gt;[comments]&lt;/a&gt;&lt;/span&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content><id>t3_aaa</id><link href="https://www.reddit.com/r/technology/comments/aaa/x/"/><updated>2026-11-07T10:00:00+00:00</updated><title>Link post</title></entry>
<entry><author><name>/u/bob</name></author><content type="html">&lt;table&gt;&lt;tr&gt;&lt;td&gt;&lt;!-- SC_OFF --&gt;&lt;div class="md"&gt;&lt;p&gt;It&amp;#39;s &amp;amp; great.&lt;/p&gt;&lt;/div&gt;&lt;!-- SC_ON --&gt; submitted by &lt;a href="https://www.reddit.com/user/bob"&gt;/u/bob&lt;/a&gt; &lt;span&gt;&lt;a href="https://www.reddit.com/r/technology/comments/bbb/y/"&gt;[link]&lt;/a&gt;&lt;/span&gt;&lt;/td&gt;&lt;/tr&gt;&lt;/table&gt;</content><id>t3_bbb</id><link href="https://www.reddit.com/r/technology/comments/bbb/y/"/><updated>2026-11-07T09:00:00+00:00</updated><title>Text post</title></entry>
</feed>"""


class FakeReddit:
    def __init__(self, statuses=None, headers=None):
        self.statuses = list(statuses or [200])
        self.headers = headers or {}
        self.requests = []

    def app(self):
        async def feed(req):
            self.requests.append((req.path_qs, req.headers.get("User-Agent")))
            st = self.statuses.pop(0) if len(self.statuses) > 1 else self.statuses[0]
            return web.Response(status=st, text=ATOM if st == 200 else "blocked", headers=self.headers)

        a = web.Application()
        a.router.add_get("/r/{sub}/top/.rss", feed)
        return a


class RedditFeedTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        for k in ("REDDIT_USE_OAUTH", "REDDIT_RSS_MAX_WAIT_SEC", "REDDIT_RSS_CACHE_TTL_SEC", "REDDIT_USER_AGENT"):
            os.environ.pop(k, None)

    async def make(self, fake, **kw):
        server = TestServer(fake.app())
        await server.start_server()
        self.addAsyncCleanup(server.close)
        f = cf.ContentFetcher(**kw)
        f.REDDIT_WEB_BASE = f"http://{server.host}:{server.port}"
        self.slept = []

        async def sleep(s):
            self.slept.append(s)

        f._sleep = sleep
        self.addAsyncCleanup(f.close)
        return f

    src = ContentSource(type="reddit", name="r/technology", subreddit="technology", max_items=5)

    async def test_feed_is_parsed_and_uses_configured_user_agent(self):
        os.environ["REDDIT_USER_AGENT"] = "audexa-test/1.0"
        fake = FakeReddit()
        f = await self.make(fake)
        stories = await f._fetch_from_source(self.src)
        self.assertEqual([s.title for s in stories], ["Link post", "Text post"])
        self.assertEqual(stories[0].url, "https://example.com/article?a=1&b=2")
        self.assertEqual(stories[1].url, "https://www.reddit.com/r/technology/comments/bbb/y/")
        self.assertEqual(stories[1].summary, "It's & great.")
        self.assertEqual(stories[0].author, "alice")
        self.assertEqual(stories[0].source_type, "reddit")
        self.assertEqual(fake.requests[0][1], "audexa-test/1.0")
        self.assertIn("t=day", fake.requests[0][0])

    async def test_oauth_is_not_used_by_default_even_with_credentials(self):
        f = await self.make(FakeReddit(), reddit_client_id="id", reddit_client_secret="secret")
        self.assertFalse(f._reddit_oauth_enabled())
        os.environ["REDDIT_USE_OAUTH"] = "1"
        self.assertTrue(f._reddit_oauth_enabled())
        os.environ.pop("REDDIT_USE_OAUTH")

    async def test_result_is_cached(self):
        fake = FakeReddit()
        f = await self.make(fake)
        await f._fetch_from_source(self.src)
        await f._fetch_from_source(self.src)
        self.assertEqual(len(fake.requests), 1)

    async def test_429_with_short_reset_waits_once_and_retries(self):
        fake = FakeReddit(statuses=[429, 200], headers={"x-ratelimit-reset": "2"})
        f = await self.make(fake)
        stories = await f._fetch_from_source(self.src)
        self.assertEqual(len(stories), 2)
        self.assertEqual(len(fake.requests), 2)
        self.assertEqual(len(self.slept), 1)
        self.assertGreaterEqual(self.slept[0], 2.0)

    async def test_429_with_long_reset_fails_fast_without_sleeping(self):
        fake = FakeReddit(statuses=[429], headers={"x-ratelimit-reset": "300"})
        f = await self.make(fake)
        with self.assertRaises(ValueError):
            await f._fetch_from_source(self.src)
        self.assertEqual(len(fake.requests), 1)
        self.assertEqual(self.slept, [])

    async def test_403_backs_off_and_serves_stale_copy(self):
        os.environ["REDDIT_RSS_CACHE_TTL_SEC"] = "0"
        fake = FakeReddit(statuses=[200, 403])
        f = await self.make(fake)
        self.assertEqual(len(await f._fetch_from_source(self.src)), 2)
        self.assertEqual(len(await f._fetch_from_source(self.src)), 2)  # 403 -> stale copy
        self.assertEqual(len(await f._fetch_from_source(self.src)), 2)  # backoff -> no request
        self.assertEqual(len(fake.requests), 2)

    async def test_403_without_cache_raises_so_topic_falls_back(self):
        f = await self.make(FakeReddit(statuses=[403]))
        with self.assertRaises(ValueError):
            await f._fetch_from_source(self.src)

    async def test_invalid_subreddit_never_hits_the_network(self):
        fake = FakeReddit()
        f = await self.make(fake)
        with self.assertRaises(ValueError):
            await f._fetch_from_source(ContentSource(type="reddit", name="x", subreddit="../x?y=1"))
        self.assertEqual(fake.requests, [])


if __name__ == "__main__":
    unittest.main()
