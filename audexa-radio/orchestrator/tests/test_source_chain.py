import os
import sys
import tempfile
import unittest
from datetime import datetime, timezone

from aiohttp import web
from aiohttp.test_utils import TestServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import content_fetcher as cf  # noqa: E402
from prompts import build_headlines_prompt, format_stories_for_prompt  # noqa: E402
from source_cache import SourceCache  # noqa: E402
from stories import AggregatedStory  # noqa: E402
from topics import ContentSource, TOPICS, TopicDefinition  # noqa: E402

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
ENV = (
    "SOURCE_EXA_ENABLED", "EXA_API_KEY", "EXA_DAILY_CAP", "SOURCE_REDDIT_ENABLED", "SOURCE_REDDIT_ARCHIVE_ENABLED",
    "SOURCE_REDDIT_RSS_ENABLED", "SOURCE_RSS_ENABLED", "SOURCE_HN_ENABLED", "SOURCE_MIN_RESULTS", "SOURCE_STALE_SEC",
    "REDDIT_ARCHIVE_CACHE_TTL_SEC", "REDDIT_ARCHIVE_MIN_GAP_SEC", "REDDIT_ARCHIVE_MIN_SCORE",
)


def rss(n):
    items = "".join(f"<item><title>Feed headline {i}</title><link>https://feed.example.com/{i}</link><description>d{i}</description></item>" for i in range(n))
    return f'<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>{items}</channel></rss>'


def exa_payload(n):
    return {"results": [{
        "title": f"Exa story {i}", "url": f"https://outlet{i}.example.com/news/story-{i}", "text": "Body " * 120,
        "publishedDate": "2026-11-13T09:00:00.000Z"} for i in range(n)]}


class Fakes:
    """RSS feed, Exa and Arctic Shift on one local server. Nothing here talks to the internet."""

    def __init__(self):
        self.rss_items = 5
        self.rss_status = 200
        self.exa_status = 200
        self.exa_results = 4
        self.archive = []          # list of (status, payload, headers)
        self.exa_requests = []
        self.archive_requests = []
        self.rss_requests = 0

    def app(self):
        async def feed(req):
            self.rss_requests += 1
            return web.Response(status=self.rss_status, text=rss(self.rss_items) if self.rss_status == 200 else "x")

        async def exa(req):
            self.exa_requests.append(await req.json())
            return web.json_response(exa_payload(self.exa_results), status=self.exa_status)

        async def archive(req):
            self.archive_requests.append(dict(req.query))
            st, payload, headers = self.archive.pop(0) if len(self.archive) > 1 else self.archive[0]
            return web.json_response(payload, status=st, headers=headers)

        a = web.Application()
        a.router.add_get("/feed.xml", feed)
        a.router.add_post("/exa", exa)
        a.router.add_get("/api/posts/search", archive)
        return a


def post(i, score, **kw):
    return {"id": f"id{i}", "title": f"Post {i}", "selftext": kw.pop("selftext", f"body {i}"), "score": score,
            "num_comments": kw.pop("num_comments", score // 2), "created_utc": int(NOW.timestamp()) - 3600 * i, "over_18": False, **kw}


class SourceChainTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        for k in ENV:
            os.environ.pop(k, None)
            self.addCleanup(os.environ.pop, k, None)
        os.environ["REDDIT_ARCHIVE_MIN_GAP_SEC"] = "0"
        self.fakes = Fakes()
        self.server = TestServer(self.fakes.app())
        await self.server.start_server()
        self.addAsyncCleanup(self.server.close)
        self.base = f"http://{self.server.host}:{self.server.port}"
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.clock = [NOW.timestamp()]
        self.slept = []
        self.alerts = []

    def fetcher(self):
        f = cf.ContentFetcher(cache=SourceCache(self.tmp.name, now=lambda: self.clock[0]), alert=self.alerts.append)
        f.ARCHIVE_BASE = self.base
        f.exa.url = f"{self.base}/exa"
        f._now = lambda: self.clock[0]
        f.exa._now = lambda: self.clock[0]
        f.exa.budget._now = lambda: self.clock[0]

        async def sleep(s):
            self.slept.append(s)
            self.clock[0] += s

        f._sleep = sleep
        f.exa._sleep = sleep
        self.addAsyncCleanup(f.close)
        return f

    def topic(self, exa=True, position="first", reddit=False, tid="t1"):
        sources = [ContentSource(type="rss", name="Feed", url=f"{self.base}/feed.xml", max_items=10)]
        if reddit:
            sources.append(ContentSource(type="reddit", name="r/space", subreddit="space", max_items=8))
        return TopicDefinition(id=tid, name="T", description="d", category="news", sources=sources, prompt_context="c",
                               exa_query="q" if exa else None, exa_position=position)

    def enable_exa(self):
        os.environ["SOURCE_EXA_ENABLED"] = "1"
        os.environ["EXA_API_KEY"] = "k"

    # --- chain: Exa -> feeds -> cache ---

    async def test_exa_off_by_default_topic_uses_feeds(self):
        c = await self.fetcher().fetch_topic_content(self.topic())
        self.assertEqual((c.tier, len(c.stories)), ("feeds", 5))
        self.assertEqual(self.fakes.exa_requests, [])

    async def test_exa_first_topic_uses_exa_when_enabled(self):
        self.enable_exa()
        c = await self.fetcher().fetch_topic_content(self.topic())
        self.assertEqual(c.tier, "exa")
        self.assertEqual(self.fakes.rss_requests, 0)
        self.assertTrue(all(s.source_type == "exa" for s in c.stories))

    async def test_exa_failure_falls_through_to_feeds(self):
        self.enable_exa()
        self.fakes.exa_status = 500
        c = await self.fetcher().fetch_topic_content(self.topic())
        self.assertEqual((c.tier, len(c.stories)), ("feeds", 5))

    async def test_fewer_than_three_exa_results_counts_as_failure(self):
        self.enable_exa()
        self.fakes.exa_results = 2
        c = await self.fetcher().fetch_topic_content(self.topic())
        self.assertEqual(c.tier, "feeds")

    async def test_fewer_than_three_feed_stories_falls_through_to_last_good_cache(self):
        f = self.fetcher()
        t = self.topic(exa=False)
        self.assertEqual((await f.fetch_topic_content(t)).tier, "feeds")  # stores the last good copy
        self.fakes.rss_status = 503
        c = await f.fetch_topic_content(t)
        self.assertEqual((c.tier, len(c.stories)), ("cache", 5))

    async def test_two_feed_stories_with_no_cache_are_used_as_partial(self):
        self.fakes.rss_items = 2
        c = await self.fetcher().fetch_topic_content(self.topic(exa=False))
        self.assertEqual((c.tier, len(c.stories)), ("partial", 2))

    async def test_cache_is_dropped_after_the_stale_limit(self):
        f = self.fetcher()
        t = self.topic(exa=False)
        await f.fetch_topic_content(t)
        self.fakes.rss_status = 503
        self.clock[0] += 25 * 3600
        c = await f.fetch_topic_content(t)
        self.assertEqual((c.tier, len(c.stories)), ("partial", 0))

    async def test_exa_text_is_not_kept_in_the_last_good_cache(self):
        self.enable_exa()
        f = self.fetcher()
        t = self.topic()
        await f.fetch_topic_content(t)  # served from Exa
        self.assertIsNone(f.cache.get("last-t1", 3600))

    async def test_exa_cached_six_hours_across_segments(self):
        self.enable_exa()
        f = self.fetcher()
        t = self.topic()
        for _ in range(4):  # four segments for the same topic
            await f.fetch_topic_content(t)
        self.assertEqual(len(self.fakes.exa_requests), 1)

    async def test_fallback_position_tries_feeds_first_then_exa(self):
        self.enable_exa()
        t = self.topic(position="fallback")
        c = await self.fetcher().fetch_topic_content(t)
        self.assertEqual(c.tier, "feeds")
        self.assertEqual(self.fakes.exa_requests, [])
        self.fakes.rss_status = 503
        c = await self.fetcher().fetch_topic_content(self.topic(position="fallback", tid="t2"))
        self.assertEqual(c.tier, "exa")

    async def test_source_type_switches(self):
        os.environ["SOURCE_RSS_ENABLED"] = "0"
        c = await self.fetcher().fetch_topic_content(self.topic(exa=False))
        self.assertEqual(self.fakes.rss_requests, 0)
        self.assertEqual(c.stories, [])

    # --- Reddit via Arctic Shift ---

    async def test_archive_ranks_by_score_applies_floor_and_attributes_the_discussion(self):
        self.fakes.archive = [(200, {"data": [
            post(1, 3), post(2, 815), post(3, 125), post(4, 491), post(5, 194), post(6, 6),
            post(7, 900, over_18=True), post(8, 50, selftext="[removed]"),
        ]}, {})]
        stories = await self.fetcher()._fetch_reddit_archive(ContentSource(type="reddit", name="r/space", subreddit="space", max_items=4))
        self.assertEqual([s.score for s in stories], [815, 491, 194, 125])
        s = stories[0]
        self.assertEqual((s.source, s.source_type), ("discussion on r/space", "reddit"))
        self.assertIsNone(s.author)
        self.assertEqual(s.comment_count, 407)
        self.assertEqual(s.url, "https://www.reddit.com/r/space/comments/id2/")

    async def test_archive_request_shape_never_asks_for_the_author(self):
        self.fakes.archive = [(200, {"data": [post(i, 20 + i) for i in range(6)]}, {})]
        await self.fetcher()._fetch_reddit_archive(ContentSource(type="reddit", name="x", subreddit="space"))
        q = self.fakes.archive_requests[0]
        self.assertNotIn("author", q["fields"])
        self.assertEqual((q["subreddit"], q["limit"], q["sort"]), ("space", "100", "desc"))
        self.assertEqual(int(q["before"]) - int(q["after"]), 24 * 3600)
        self.assertEqual(len(self.fakes.archive_requests), 1)

    async def test_archive_widens_to_72_hours_when_fewer_than_five_qualify(self):
        self.fakes.archive = [(200, {"data": [post(1, 40), post(2, 9)]}, {}), (200, {"data": [post(i, 10 * i) for i in range(1, 9)]}, {})]
        stories = await self.fetcher()._fetch_reddit_archive(ContentSource(type="reddit", name="x", subreddit="space"))
        self.assertEqual(len(self.fakes.archive_requests), 2)
        q = self.fakes.archive_requests[1]
        self.assertEqual(int(q["before"]) - int(q["after"]), 72 * 3600)
        self.assertEqual(stories[0].score, 80)

    async def test_archive_cached_per_subreddit_for_six_hours_and_requests_are_spaced(self):
        os.environ["REDDIT_ARCHIVE_MIN_GAP_SEC"] = "2"
        self.fakes.archive = [(200, {"data": [post(i, 20 + i) for i in range(6)]}, {})]
        f = self.fetcher()
        a = ContentSource(type="reddit", name="x", subreddit="space")
        b = ContentSource(type="reddit", name="y", subreddit="investing")
        await f._fetch_reddit_archive(a)
        await f._fetch_reddit_archive(a)
        self.assertEqual(len(self.fakes.archive_requests), 1)
        await f._fetch_reddit_archive(b)
        self.assertEqual(len(self.fakes.archive_requests), 2)
        self.assertEqual(self.slept, [2.0])  # second subreddit waited out the gap
        self.clock[0] += 6 * 3600 + 1
        await f._fetch_reddit_archive(a)
        self.assertEqual(len(self.fakes.archive_requests), 3)

    async def test_archive_slow_down_422_backs_off_and_serves_stale_copy(self):
        os.environ["REDDIT_ARCHIVE_CACHE_TTL_SEC"] = "0"
        self.fakes.archive = [(200, {"data": [post(i, 20 + i) for i in range(6)]}, {}),
                              (422, {"data": None, "error": "Timeout. Maybe slow down a bit"}, {"x-ratelimit-reset": "600"})]
        f = self.fetcher()
        src = ContentSource(type="reddit", name="x", subreddit="space")
        self.assertEqual(len(await f._fetch_reddit_archive(src)), 6)
        self.assertEqual(len(await f._fetch_reddit_archive(src)), 6)  # 422 -> stale copy
        self.assertEqual(len(await f._fetch_reddit_archive(src)), 6)  # rate window closed -> no request
        self.assertEqual(len(self.fakes.archive_requests), 2)

    async def test_archive_errors_and_empty_raise_without_cache(self):
        src = ContentSource(type="reddit", name="x", subreddit="space")
        for status, payload in ((429, {"error": "x"}), (500, {}), (200, {"data": []}), (200, {"nope": 1})):
            self.fakes.archive = [(status, payload, {})]
            f = self.fetcher()
            with self.assertRaises(ValueError):
                await f._fetch_reddit_archive(src)

    async def test_invalid_subreddit_never_hits_the_network(self):
        f = self.fetcher()
        for bad in ("roast-my-resume", "../x", "", "a+b"):
            with self.assertRaises(ValueError):
                await f._fetch_reddit_archive(ContentSource(type="reddit", name="x", subreddit=bad))
        self.assertEqual(self.fakes.archive_requests, [])

    async def test_reddit_source_is_part_of_the_feed_chain_and_fails_soft(self):
        self.fakes.archive = [(500, {}, {})]
        c = await self.fetcher().fetch_topic_content(self.topic(exa=False, reddit=True))
        self.assertEqual((c.tier, len(c.stories)), ("feeds", 5))  # Reddit failed, RSS carried the topic
        self.fakes.archive = [(200, {"data": [post(i, 20 + i) for i in range(6)]}, {})]
        c = await self.fetcher().fetch_topic_content(self.topic(exa=False, reddit=True, tid="t2"))
        self.assertTrue(any(s.source == "discussion on r/space" for s in c.stories))

    async def test_reddit_flags(self):
        os.environ["SOURCE_REDDIT_ENABLED"] = "0"
        self.fakes.archive = [(200, {"data": [post(i, 20 + i) for i in range(6)]}, {})]
        c = await self.fetcher().fetch_topic_content(self.topic(exa=False, reddit=True))
        self.assertEqual(self.fakes.archive_requests, [])
        self.assertFalse(any(s.source_type == "reddit" for s in c.stories))
        os.environ["SOURCE_REDDIT_ENABLED"] = "1"
        os.environ["SOURCE_REDDIT_ARCHIVE_ENABLED"] = "0"
        await self.fetcher().fetch_topic_content(self.topic(exa=False, reddit=True, tid="t3"))
        self.assertEqual(self.fakes.archive_requests, [])  # archive switched off, legacy RSS off by default


class TopicConfigAndPromptTests(unittest.TestCase):
    def test_exa_topics_match_the_bakeoff_verdict(self):
        exa = {t.id: t for t in TOPICS if t.exa_query}
        self.assertEqual(set(exa), {"us-politics", "world-update", "ai-ml", "coding-dev", "startups-vc", "markets-finance"})
        for tid in ("space-nasa", "gaming", "sports-roundup"):
            self.assertIsNone(next(t for t in TOPICS if t.id == tid).exa_query)
        self.assertIsNone(exa["coding-dev"].exa_category)
        for t in exa.values():  # Reddit-fed topics keep feeds first, topics without Reddit lead with Exa
            has_reddit = any(s.type == "reddit" for s in t.sources)
            self.assertEqual(t.exa_position, "fallback" if has_reddit else "first", t.id)

    def test_dead_feeds_are_gone(self):
        urls = [s.url for t in TOPICS for s in t.sources if s.url]
        for dead in ("feeds.reuters.com", "finance.yahoo.com/news/rssindex", "rsshub.app", "politico.com/rss/politicopicks.xml"):
            self.assertFalse(any(dead in u for u in urls), dead)

    def test_every_topic_has_a_non_reddit_source(self):
        for t in TOPICS:
            self.assertTrue(any(s.type != "reddit" for s in t.sources), t.id)

    def test_prompt_carries_the_sourcing_rules_and_never_a_username(self):
        stories = [
            AggregatedStory(title="Fed holds", source="CNBC", source_type="exa", summary="x" * 900, partial=True),
            AggregatedStory(title="Big launch", source="discussion on r/space", source_type="reddit", summary="y", score=815, author="someuser"),
        ]
        text = format_stories_for_prompt(stories)
        self.assertIn("[CNBC] Fed holds", text)
        self.assertIn("[partial text]", text)
        self.assertIn("x" * 700, text)
        self.assertNotIn("x" * 701, text)  # Exa excerpts are capped at 700 chars in the prompt
        self.assertNotIn("someuser", text)
        for prompt in (build_headlines_prompt("T", text, "ctx"),):
            self.assertIn("Paraphrase", prompt)
            self.assertIn("Attribute by outlet name", prompt)
            self.assertIn("usernames", prompt)


if __name__ == "__main__":
    unittest.main()
