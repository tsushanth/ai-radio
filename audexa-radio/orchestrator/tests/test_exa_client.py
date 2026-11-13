import asyncio
import os
import sys
import tempfile
import unittest
from datetime import datetime, timedelta, timezone

from aiohttp import web
from aiohttp.test_utils import TestServer

sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))
import exa_client as ex  # noqa: E402
from source_cache import SourceCache  # noqa: E402

NOW = datetime(2026, 11, 13, 12, 0, tzinfo=timezone.utc)
TEXT = "Word " * 120  # 600 chars


def iso(hours_ago: float) -> str:
    return (NOW - timedelta(hours=hours_ago)).strftime("%Y-%m-%dT%H:%M:%S.000Z")


def res(title, url, hours_ago=3.0, text=TEXT, **kw):
    return {"title": title, "url": url, "publishedDate": iso(hours_ago), "text": text, **kw}


def good_payload(n=4):
    return {"results": [res(f"Story number {i} about markets", f"https://site{i}.example.com/news/story-{i}") for i in range(n)]}


class ParseResultsTests(unittest.TestCase):
    def parse(self, results):
        return ex.parse_results({"results": results}, NOW)

    def test_keeps_a_normal_article_and_attributes_the_outlet(self):
        [s] = self.parse([res("Fed holds rates", "https://www.cnbc.com/2026/11/13/fed-holds.html", author="Jane Reporter")])
        self.assertEqual((s.source, s.source_type, s.partial), ("CNBC", "exa", False))
        self.assertIsNone(s.author)  # never carry a byline into a script
        self.assertLessEqual(len(s.summary), ex.SUMMARY_CHARS + 3)

    def test_drops_pages_with_less_than_400_chars_of_text(self):
        self.assertEqual(self.parse([res("Hub page", "https://a.example.com/x/y", text="x" * 399)]), [])
        self.assertEqual(len(self.parse([res("Short but ok", "https://a.example.com/x/y", text="x" * 400)])), 1)

    def test_drops_future_dated_and_undated_results(self):
        future = res("From the future", "https://a.example.com/a/1", hours_ago=-20)
        slightly_ahead = res("Clock skew", "https://b.example.com/a/2", hours_ago=-0.5)
        undated = res("No date", "https://c.example.com/a/3")
        del undated["publishedDate"]
        stale = res("Way too old", "https://d.example.com/a/4", hours_ago=200)
        titles = [s.title for s in self.parse([future, slightly_ahead, undated, stale])]
        self.assertEqual(titles, ["Clock skew"])

    def test_dedupes_by_title_and_limits_per_domain(self):
        rows = [
            res("Same Story!", "https://a.example.com/n/1"),
            res("same story", "https://b.example.com/n/2"),  # duplicate title, other domain
            res("Other one", "https://a.example.com/n/3"),
            res("Third from a", "https://a.example.com/n/4"),  # third from a.example.com
        ]
        out = self.parse(rows)
        self.assertEqual([s.title for s in out], ["Same Story!", "Other one"])

    def test_text_cut_at_1000_chars_is_usable_but_partial(self):
        [s] = self.parse([res("Paywalled", "https://www.nytimes.com/2026/11/13/x.html", text="a" * 1000)])
        self.assertTrue(s.partial)
        self.assertEqual(s.source, "The New York Times")
        [full] = self.parse([res("Full text", "https://www.nytimes.com/2026/11/13/y.html", text="a" * 1500)])
        self.assertFalse(full.partial)

    def test_drops_hub_and_index_urls_and_bad_rows(self):
        out = self.parse([
            res("Space hub", "https://www.space.com/space"),
            res("Home", "https://www.space.com/"),
            res("No url", ""),
            {"url": "https://x.example.com/a/b", "text": TEXT, "publishedDate": iso(1)},  # no title
            "not a dict",
        ])
        self.assertEqual(out, [])

    def test_empty_or_malformed_payloads(self):
        self.assertEqual(ex.parse_results({}, NOW), [])
        self.assertEqual(ex.parse_results({"results": None}, NOW), [])
        self.assertEqual(ex.parse_results(None, NOW), [])

    def test_outlet_names(self):
        self.assertEqual(ex.outlet_name("https://www.bbc.co.uk/news/x"), "the BBC")
        self.assertEqual(ex.outlet_name("https://some-blog.example.org/post"), "Example")
        self.assertEqual(ex.outlet_name("https://eu-startups.com/a"), "EU-Startups")


class FakeExa:
    def __init__(self, responses=None):
        self.responses = list(responses or [(200, good_payload(), {})])
        self.requests = []

    def app(self):
        async def search(req):
            self.requests.append({"headers": dict(req.headers), "json": await req.json()})
            status, payload, headers = self.responses.pop(0) if len(self.responses) > 1 else self.responses[0]
            return web.json_response(payload, status=status, headers=headers)

        a = web.Application()
        a.router.add_post("/search", search)
        return a


class ExaClientTests(unittest.IsolatedAsyncioTestCase):
    ENV = ("SOURCE_EXA_ENABLED", "EXA_API_KEY", "EXA_DAILY_CAP", "EXA_CACHE_TTL_SEC", "EXA_FAIL_COOLDOWN_SEC", "EXA_OFF_SEC")

    async def asyncSetUp(self):
        for k in self.ENV:
            os.environ.pop(k, None)
            self.addCleanup(os.environ.pop, k, None)
        os.environ["SOURCE_EXA_ENABLED"] = "1"
        os.environ["EXA_API_KEY"] = "test-key-not-real"
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.clock = [NOW.timestamp()]
        self.sleeps = []
        self.alerts = []

    async def make(self, fake):
        server = TestServer(fake.app())
        await server.start_server()
        self.addAsyncCleanup(server.close)
        import aiohttp
        session = aiohttp.ClientSession()
        self.addAsyncCleanup(session.close)

        async def getter():
            return session

        async def sleep(s):
            self.sleeps.append(s)

        cache = SourceCache(self.tmp.name, now=lambda: self.clock[0])
        c = ex.ExaClient(getter, cache, alert=self.alerts.append, now=lambda: self.clock[0], sleep=sleep)
        c.url = f"http://{server.host}:{server.port}/search"
        return c

    async def test_request_shape_and_auth(self):
        fake = FakeExa()
        c = await self.make(fake)
        stories = await c.fetch_topic("markets-finance", "stock market news", "news")
        self.assertEqual(len(stories), 4)
        req = fake.requests[0]
        self.assertEqual(req["headers"]["Authorization"], "Bearer test-key-not-real")
        body = req["json"]
        self.assertEqual(body["type"], "lite")
        self.assertEqual(body["numResults"], 8)
        self.assertEqual(body["category"], "news")
        self.assertEqual(body["contents"], {"text": {"maxCharacters": 1500}, "highlights": True})
        self.assertNotIn("summary", body["contents"])
        start = datetime.strptime(body["startPublishedDate"], "%Y-%m-%dT%H:%M:%S.000Z").replace(tzinfo=timezone.utc)
        self.assertEqual(NOW - start, timedelta(hours=48))

    async def test_no_category_when_topic_has_none(self):
        fake = FakeExa()
        c = await self.make(fake)
        await c.fetch_topic("coding-dev", "dev news", None)
        self.assertNotIn("category", fake.requests[0]["json"])

    async def test_off_by_default_and_without_key_makes_no_request(self):
        fake = FakeExa()
        c = await self.make(fake)
        os.environ["SOURCE_EXA_ENABLED"] = "0"
        self.assertIsNone(await c.fetch_topic("t", "q"))
        os.environ["SOURCE_EXA_ENABLED"] = "1"
        del os.environ["EXA_API_KEY"]
        self.assertIsNone(await c.fetch_topic("t", "q"))
        self.assertEqual(fake.requests, [])

    async def test_results_are_cached_for_six_hours_then_refreshed(self):
        fake = FakeExa()
        c = await self.make(fake)
        await c.fetch_topic("ai-ml", "q")
        self.clock[0] += 5.9 * 3600
        await c.fetch_topic("ai-ml", "q")
        self.assertEqual(len(fake.requests), 1)  # still inside the 6 h window
        self.clock[0] += 0.2 * 3600
        await c.fetch_topic("ai-ml", "q")
        self.assertEqual(len(fake.requests), 2)  # window over: one new search

    async def test_cache_survives_a_restart(self):
        fake = FakeExa()
        await (await self.make(fake)).fetch_topic("ai-ml", "q")
        again = await self.make(fake)  # new client, same volume directory
        self.assertEqual(len(await again.fetch_topic("ai-ml", "q")), 4)
        self.assertEqual(len(fake.requests), 1)

    async def test_concurrent_segments_share_one_search(self):
        fake = FakeExa()
        c = await self.make(fake)
        out = await asyncio.gather(*[c.fetch_topic("ai-ml", "q") for _ in range(5)])
        self.assertTrue(all(len(o) == 4 for o in out))
        self.assertEqual(len(fake.requests), 1)

    async def test_daily_cap_is_hard_and_persisted_and_alerts_at_80_percent(self):
        os.environ["EXA_DAILY_CAP"] = "5"
        fake = FakeExa()
        c = await self.make(fake)
        for i in range(5):
            self.assertIsNotNone(await c.fetch_topic(f"topic-{i}", "q"))
        self.assertEqual(len(fake.requests), 5)
        self.assertEqual(len([a for a in self.alerts if "80%" in a]), 1)  # fired once, at the 4th search
        self.assertIsNone(await c.fetch_topic("topic-6", "q"))
        self.assertEqual(len(fake.requests), 5)  # cap reached: nothing sent
        self.assertEqual(len([a for a in self.alerts if "cap reached" in a]), 1)
        restarted = await self.make(fake)  # the counter is on the volume, a restart does not reset it
        self.assertIsNone(await restarted.fetch_topic("topic-7", "q"))
        self.assertEqual(len(fake.requests), 5)
        self.clock[0] += 24 * 3600  # next UTC day
        self.assertIsNotNone(await restarted.fetch_topic("topic-7", "q"))

    async def test_429_with_short_retry_after_waits_once_and_retries(self):
        fake = FakeExa([(429, {"error": "slow"}, {"Retry-After": "3"}), (200, good_payload(), {})])
        c = await self.make(fake)
        self.assertEqual(len(await c.fetch_topic("t", "q")), 4)
        self.assertEqual(self.sleeps, [3.0])
        self.assertEqual(len(fake.requests), 2)

    async def test_429_with_long_retry_after_pauses_exa_without_sleeping(self):
        fake = FakeExa([(429, {"error": "slow"}, {"Retry-After": "300"})])
        c = await self.make(fake)
        self.assertIsNone(await c.fetch_topic("t", "q"))
        self.assertEqual(self.sleeps, [])
        self.assertIsNone(await c.fetch_topic("other", "q"))
        self.assertEqual(len(fake.requests), 1)  # paused for the whole Retry-After window
        self.clock[0] += 301
        self.assertTrue(c.available())

    async def test_credit_or_auth_errors_switch_exa_off_for_an_hour(self):
        fake = FakeExa([(402, {"error": "no credits"}, {})])
        c = await self.make(fake)
        self.assertIsNone(await c.fetch_topic("t", "q"))
        self.assertTrue(any("402" in a for a in self.alerts))
        self.assertIsNone(await c.fetch_topic("other", "q"))
        self.assertEqual(len(fake.requests), 1)
        self.clock[0] += 3601
        self.assertTrue(c.available())

    async def test_failed_topic_is_not_retried_every_segment(self):
        fake = FakeExa([(500, {"error": "boom"}, {}), (200, good_payload(), {})])
        c = await self.make(fake)
        self.assertIsNone(await c.fetch_topic("t", "q"))
        self.assertIsNone(await c.fetch_topic("t", "q"))
        self.assertEqual(len(fake.requests), 1)  # 30 min cooldown
        self.clock[0] += 1801
        self.assertEqual(len(await c.fetch_topic("t", "q")), 4)

    async def test_nothing_usable_counts_as_failure(self):
        fake = FakeExa([(200, {"results": [res("Hub", "https://a.example.com/news")]}, {})])
        c = await self.make(fake)
        self.assertIsNone(await c.fetch_topic("t", "q"))

    async def test_api_key_is_never_logged(self):
        fake = FakeExa([(500, {"error": "boom"}, {})])
        c = await self.make(fake)
        with self.assertLogs("exa_client", level="DEBUG") as logs:
            await c.fetch_topic("t", "q")
            ex.logger.info("marker")
        self.assertNotIn("test-key-not-real", "\n".join(logs.output))


if __name__ == "__main__":
    unittest.main()
