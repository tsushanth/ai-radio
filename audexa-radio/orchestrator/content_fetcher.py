"""
Content Fetcher — ported from ai-radio-backend/src/services/content/aggregator.service.ts
Fetches news from RSS, Reddit (public Atom feed; OAuth is opt-in), and HackerNews, plus Exa search for the topics
that opt in (see exa_client.py).

Reddit content comes from the Arctic Shift public archive API (the reddit.com .rss feeds are shut off on 2026-11-13).

Per-topic chain: the topic's feed sources (Arctic Shift Reddit archive / RSS / HN; switches SOURCE_REDDIT_ARCHIVE_ENABLED,
SOURCE_REDDIT_ENABLED, SOURCE_RSS_ENABLED, SOURCE_HN_ENABLED) -> Exa (only topics with exa_query, only when
SOURCE_EXA_ENABLED) -> the last good copy of the topic's feed stories on the volume. Topics with exa_position="first"
(no Reddit sources, e.g. US Politics) try Exa before their feeds. A link in the chain counts as failed when it yields
fewer than SOURCE_MIN_RESULTS (default 3) usable stories.
"""

import asyncio
import html
import logging
import os
import re
import time
import xml.etree.ElementTree as ET
from base64 import b64encode
from datetime import datetime, timezone
from typing import Callable, Optional

import aiohttp
import feedparser

from exa_client import ExaClient, flag
from source_cache import SourceCache
from stories import AggregatedStory, TopicContent  # noqa: F401  (re-exported: other modules import them from here)
from topics import ContentSource, TopicDefinition

logger = logging.getLogger(__name__)


def _alert(message: str) -> None:
    """Email-batched alert (same path as every other orchestrator error); never raises."""
    try:
        from email_alerter import report_error
        report_error(message, source="exa_budget")
    except Exception as e:  # alerting must never break content fetching
        logger.warning(f"alert failed: {e}")


class ContentFetcher:
    HN_API_BASE = "https://hacker-news.firebaseio.com/v0"
    REDDIT_OAUTH_BASE = "https://oauth.reddit.com"
    REDDIT_WEB_BASE = "https://www.reddit.com"
    ARCHIVE_BASE = "https://arctic-shift.photon-reddit.com"
    USER_AGENT = "AudexaRadio/1.0"

    def __init__(self, reddit_client_id: str = "", reddit_client_secret: str = "", cache: Optional[SourceCache] = None,
                 alert: Callable[[str], None] = _alert):
        self.reddit_client_id = reddit_client_id
        self.reddit_client_secret = reddit_client_secret
        self._reddit_token: Optional[str] = None
        self._reddit_token_expiry: float = 0
        self._session: Optional[aiohttp.ClientSession] = None
        # Reddit public-feed state: results are cached, requests go through one gate that honours Reddit's
        # x-ratelimit-* headers, and a 403 block pauses requests for a while.
        self._reddit_cache: dict[str, tuple[float, list[AggregatedStory]]] = {}
        self._reddit_next_allowed = 0.0
        self._reddit_blocked_until = 0.0
        self._reddit_gate = asyncio.Lock()
        self._archive_gate = asyncio.Lock()
        self._archive_next_allowed = 0.0
        self._now = time.time
        self._sleep = asyncio.sleep
        self.cache = cache or SourceCache()
        self.exa = ExaClient(self._get_session, self.cache, alert=alert)

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=15)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def fetch_topic_content(self, topic: TopicDefinition) -> TopicContent:
        """Aggregate content for a topic along its chain (see the module docstring)."""
        min_results = int(self._env_num("SOURCE_MIN_RESULTS", 3))
        logger.info(f"Aggregating content for topic: {topic.name}")

        def result(stories: list[AggregatedStory], tier: str, successful: int, total: int) -> TopicContent:
            return TopicContent(
                topic_id=topic.id,
                date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
                stories=stories,
                total_sources=total,
                successful_sources=successful,
                tier=tier,
            )

        feeds: Optional[tuple[list[AggregatedStory], int]] = None

        async def run_feeds() -> Optional[TopicContent]:
            nonlocal feeds
            feeds = await self._fetch_feed_stories(topic)
            top, successful = feeds
            if len(top) >= min_results:
                self.cache.put(f"last-{topic.id}", top)
                return result(top, "feeds", successful, len(topic.sources))
            return None

        async def run_exa() -> Optional[TopicContent]:
            if not topic.exa_query:
                return None
            try:
                exa_stories = await self.exa.fetch_topic(topic.id, topic.exa_query, topic.exa_category)
            except Exception as e:  # defensive: Exa must never take a segment down
                logger.warning(f"  Exa failed for {topic.id}: {type(e).__name__}")
                return None
            if exa_stories and len(exa_stories) >= min_results:
                top = self._sort_by_relevance(exa_stories)[:15]
                logger.info(f"Total: {len(top)} stories from Exa")
                return result(top, "exa", 1, 1)
            if exa_stories:
                logger.info(f"  Exa gave {len(exa_stories)} usable stories (< {min_results})")
            return None

        steps = [run_exa, run_feeds] if topic.exa_position == "first" else [run_feeds, run_exa]
        for step in steps:
            got = await step()
            if got:
                return got

        # Last good copy of the feed stories (Exa text is never kept here; it lives only in the 6 h Exa cache).
        top, successful = feeds or ([], 0)
        cached = self.cache.get(f"last-{topic.id}", self._env_num("SOURCE_STALE_SEC", 86400))
        if cached and len(cached) > len(top):
            logger.warning(f"Topic {topic.id}: live sources gave {len(top)} stories, serving last good cache ({len(cached)})")
            return result(cached[:15], "cache", successful, len(topic.sources))
        if top:
            logger.warning(f"Topic {topic.id}: only {len(top)} stories (< {min_results}) and no cache, using them")
        return result(top, "partial", successful, len(topic.sources))

    async def _fetch_feed_stories(self, topic: TopicDefinition) -> tuple[list[AggregatedStory], int]:
        stories: list[AggregatedStory] = []
        successful = 0
        for source in topic.sources:
            if not self._source_enabled(source):
                continue
            try:
                source_stories = await self._fetch_from_source(source)
                stories.extend(source_stories)
                successful += 1
                logger.info(f"  {source.name}: {len(source_stories)} stories")
            except Exception as e:
                logger.warning(f"  {source.name} failed: {e}")
        top = self._sort_by_relevance(self._deduplicate(stories))[:15]
        logger.info(f"Total: {len(top)} unique stories from {successful}/{len(topic.sources)} sources")
        return top, successful

    @staticmethod
    def _source_enabled(source: ContentSource) -> bool:
        """Per-source-type switches. Reddit is on by default and fails soft (a failing feed is skipped, with backoff)."""
        name = {"rss": "SOURCE_RSS_ENABLED", "hackernews": "SOURCE_HN_ENABLED", "reddit": "SOURCE_REDDIT_ENABLED"}.get(source.type)
        return flag(name, True) if name else True

    async def _fetch_from_source(self, source: ContentSource) -> list[AggregatedStory]:
        if source.type == "rss":
            return await self._fetch_rss(source)
        elif source.type == "hackernews":
            return await self._fetch_hackernews(source)
        elif source.type == "reddit":
            return await self._fetch_reddit(source)
        return []

    # --- RSS ---

    async def _fetch_rss(self, source: ContentSource) -> list[AggregatedStory]:
        if not source.url:
            raise ValueError("RSS source requires URL")

        session = await self._get_session()
        async with session.get(source.url, headers={"User-Agent": self.USER_AGENT}) as resp:
            text = await resp.text()

        feed = feedparser.parse(text)
        max_items = source.max_items or 10

        stories = []
        for entry in feed.entries[:max_items]:
            summary = getattr(entry, "summary", "") or ""
            stories.append(AggregatedStory(
                title=getattr(entry, "title", "Untitled"),
                source=source.name,
                source_type="rss",
                summary=summary[:300] if summary else None,
                url=getattr(entry, "link", None),
                published_at=self._parse_date(getattr(entry, "published", None)),
                author=getattr(entry, "author", None),
            ))
        return stories

    # --- HackerNews ---

    async def _fetch_hackernews(self, source: ContentSource) -> list[AggregatedStory]:
        session = await self._get_session()
        max_items = source.max_items or 10
        keywords = source.keywords or []

        async with session.get(f"{self.HN_API_BASE}/topstories.json") as resp:
            story_ids = await resp.json()

        # Fetch more if we need to filter by keywords
        fetch_count = min(100, len(story_ids)) if keywords else max_items

        async def fetch_item(sid: int) -> Optional[dict]:
            try:
                async with session.get(f"{self.HN_API_BASE}/item/{sid}.json") as r:
                    return await r.json()
            except Exception:
                return None

        tasks = [fetch_item(sid) for sid in story_ids[:fetch_count]]
        items = await asyncio.gather(*tasks)
        items = [i for i in items if i and i.get("type") == "story"]

        # Filter by keywords
        if keywords:
            kw_lower = [k.lower() for k in keywords]
            items = [i for i in items if any(kw in i.get("title", "").lower() for kw in kw_lower)]

        stories = []
        for item in items[:max_items]:
            stories.append(AggregatedStory(
                title=item.get("title", ""),
                source=source.name,
                source_type="hackernews",
                url=item.get("url"),
                score=item.get("score", 0),
                comment_count=item.get("descendants", 0),
                published_at=datetime.fromtimestamp(item.get("time", 0), tz=timezone.utc),
                author=item.get("by"),
            ))
        return stories

    # --- Reddit ---

    async def _get_reddit_token(self) -> str:
        if self._reddit_token and time.time() < self._reddit_token_expiry - 60:
            return self._reddit_token

        if not self.reddit_client_id or not self.reddit_client_secret:
            raise ValueError("Reddit API credentials not configured")

        auth = b64encode(f"{self.reddit_client_id}:{self.reddit_client_secret}".encode()).decode()
        session = await self._get_session()

        async with session.post(
            "https://www.reddit.com/api/v1/access_token",
            headers={
                "Authorization": f"Basic {auth}",
                "Content-Type": "application/x-www-form-urlencoded",
                "User-Agent": self.USER_AGENT,
            },
            data="grant_type=client_credentials",
        ) as resp:
            if resp.status != 200:
                raise ValueError(f"Reddit OAuth error: {resp.status}")
            data = await resp.json()

        self._reddit_token = data["access_token"]
        self._reddit_token_expiry = time.time() + data["expires_in"]
        logger.info("Reddit OAuth token obtained")
        return self._reddit_token

    def _reddit_oauth_enabled(self) -> bool:
        flag = os.getenv("REDDIT_USE_OAUTH", "").strip().lower() in ("1", "true", "on", "yes")
        return flag and bool(self.reddit_client_id and self.reddit_client_secret)

    async def _fetch_reddit(self, source: ContentSource) -> list[AggregatedStory]:
        """Arctic Shift archive first (SOURCE_REDDIT_ARCHIVE_ENABLED, default ON). The reddit.com .rss feed / OAuth path
        is legacy and only used when SOURCE_REDDIT_RSS_ENABLED is set (default OFF: Reddit ends RSS on 2026-11-13)."""
        if not source.subreddit:
            raise ValueError("Reddit source requires subreddit")
        archive_err: Optional[Exception] = None
        if flag("SOURCE_REDDIT_ARCHIVE_ENABLED", True):
            try:
                return await self._fetch_reddit_archive(source)
            except Exception as e:
                archive_err = e
        if flag("SOURCE_REDDIT_RSS_ENABLED", False):
            return await self._fetch_reddit_legacy(source)
        raise archive_err or ValueError("Reddit archive and RSS sources are both switched off")

    async def _fetch_reddit_legacy(self, source: ContentSource) -> list[AggregatedStory]:
        """reddit.com public Atom feed by default; OAuth API first only when REDDIT_USE_OAUTH is set (feed is the fallback).

        oauth.reddit.com answers 403 "blocked by network security" to datacenter addresses even with a valid
        app-only token, so OAuth is off by default.
        """
        if self._reddit_oauth_enabled():
            try:
                return await self._fetch_reddit_oauth(source)
            except Exception as e:
                logger.warning(f"Reddit OAuth failed for r/{source.subreddit} ({e}), using the public feed")
        return await self._fetch_reddit_rss(source)

    # --- Reddit via the Arctic Shift public archive ---

    ARCHIVE_FIELDS = "id,title,selftext,score,num_comments,created_utc,over_18"  # never `author`

    async def _fetch_reddit_archive(self, source: ContentSource) -> list[AggregatedStory]:
        """Top posts of the last 24 h (72 h when fewer than 5 qualify) of one subreddit, ranked by score.

        Arctic Shift is a community-run free service: results are cached per subreddit (default 6 h, also on the volume),
        requests go through one gate with a minimum gap, a 429 / "slow down" 422 backs off until X-RateLimit-Reset, and any
        error serves a copy up to 24 h old or raises so the topic falls through to its RSS/HN sources. The author field is
        never requested, so no username can reach a script.
        """
        sub = (source.subreddit or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9_]{1,40}", sub):
            raise ValueError(f"Invalid subreddit {source.subreddit!r}")
        max_items = min(source.max_items or 10, 10)
        key = f"reddit-{sub.lower()}"
        ttl = self._env_num("REDDIT_ARCHIVE_CACHE_TTL_SEC", 6 * 3600)
        stale_max = self._env_num("REDDIT_ARCHIVE_STALE_SEC", 86400)
        max_wait = self._env_num("REDDIT_ARCHIVE_MAX_WAIT_SEC", 30)
        min_gap = self._env_num("REDDIT_ARCHIVE_MIN_GAP_SEC", 5)
        min_score = int(self._env_num("REDDIT_ARCHIVE_MIN_SCORE", 5))

        def relabel(stories: list[AggregatedStory]) -> list[AggregatedStory]:
            return [AggregatedStory(**s.__dict__) for s in stories[:max_items]]

        def stale_or_raise(err: Exception) -> list[AggregatedStory]:
            stale = self.cache.get(key, stale_max)
            if stale:
                logger.warning(f"Reddit archive r/{sub}: {err}; serving a cached copy")
                return relabel(stale)
            raise err

        cached = self.cache.get(key, ttl)
        if cached:
            return relabel(cached)

        async with self._archive_gate:  # one request at a time, spaced out
            cached = self.cache.get(key, ttl)
            if cached:
                return relabel(cached)
            for window_h in (24, 72):
                wait = self._archive_next_allowed - self._now()
                if wait > max_wait:
                    return stale_or_raise(ValueError(f"Reddit archive rate window closed for {int(wait)}s"))
                if wait > 0:
                    await self._sleep(wait)
                now = int(self._now())
                session = await self._get_session()
                params = {
                    "subreddit": sub, "after": now - window_h * 3600, "before": now, "limit": 100, "sort": "desc",
                    "fields": self.ARCHIVE_FIELDS,
                }
                try:
                    async with session.get(
                        f"{self.ARCHIVE_BASE}/api/posts/search", params=params, headers={"User-Agent": self.USER_AGENT}
                    ) as resp:
                        status = resp.status
                        reset = self._header_num(resp.headers.get("x-ratelimit-reset")) or self._header_num(resp.headers.get("retry-after"))
                        payload = await resp.json(content_type=None) if status == 200 else None
                except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as e:
                    self._archive_next_allowed = self._now() + 60
                    return stale_or_raise(ValueError(f"Reddit archive request failed: {type(e).__name__}"))
                self._archive_next_allowed = self._now() + max(min_gap, reset if status in (422, 429) and reset else 0)
                if status != 200 or not isinstance(payload, dict) or not isinstance(payload.get("data"), list):
                    return stale_or_raise(ValueError(f"Reddit archive error: HTTP {status}"))
                stories = self._archive_posts_to_stories(payload["data"], sub, min_score)
                if len(stories) >= 5 or window_h == 72:
                    break
            if not stories:
                return stale_or_raise(ValueError(f"Reddit archive: no posts for r/{sub}"))
            stories = stories[:max_items]
            self.cache.put(key, stories)
            return relabel(stories)

    @staticmethod
    def _archive_posts_to_stories(posts: list, sub: str, min_score: int) -> list[AggregatedStory]:
        out: list[AggregatedStory] = []
        for p in posts:
            if not isinstance(p, dict) or p.get("over_18"):
                continue
            title = re.sub(r"\s+", " ", str(p.get("title") or "")).strip()
            score = p.get("score")
            if not title or not isinstance(score, int) or score < min_score or not p.get("id"):
                continue
            body = re.sub(r"\s+", " ", str(p.get("selftext") or "")).strip()
            if body in ("[removed]", "[deleted]"):
                continue
            created = p.get("created_utc")
            out.append(AggregatedStory(
                title=title,
                source=f"discussion on r/{sub}",  # attribution read out by the hosts
                source_type="reddit",
                summary=body[:300] or None,
                url=f"https://www.reddit.com/r/{sub}/comments/{p['id']}/",
                score=score,
                comment_count=int(p.get("num_comments") or 0),
                published_at=datetime.fromtimestamp(created, tz=timezone.utc) if isinstance(created, (int, float)) else None,
                author=None,
            ))
        out.sort(key=lambda s: (-s.score, -(s.published_at.timestamp() if s.published_at else 0)))
        return out

    @staticmethod
    def _env_num(name: str, default: float) -> float:
        try:
            v = float(os.environ[name])
            return v if v >= 0 else default
        except (KeyError, ValueError):
            return default

    async def _fetch_reddit_rss(self, source: ContentSource) -> list[AggregatedStory]:
        sub = (source.subreddit or "").strip()
        if not re.fullmatch(r"[A-Za-z0-9_]{1,40}(\+[A-Za-z0-9_]{1,40}){0,9}", sub):
            raise ValueError(f"Invalid subreddit {source.subreddit!r}")
        max_items = source.max_items or 10
        key = sub.lower()
        ttl = self._env_num("REDDIT_RSS_CACHE_TTL_SEC", 1800)
        stale_max = self._env_num("REDDIT_RSS_STALE_SEC", 86400)
        max_wait = self._env_num("REDDIT_RSS_MAX_WAIT_SEC", 60)
        block_backoff = self._env_num("REDDIT_RSS_BLOCK_BACKOFF_SEC", 900)

        def from_cache(entry: tuple[float, list[AggregatedStory]]) -> list[AggregatedStory]:
            return [AggregatedStory(**{**s.__dict__, "source": source.name}) for s in entry[1][:max_items]]

        def stale_or_raise(err: Exception) -> list[AggregatedStory]:
            entry = self._reddit_cache.get(key)
            if entry and self._now() - entry[0] < stale_max:
                logger.warning(f"Reddit r/{sub}: {err}; serving cached copy from {int((self._now() - entry[0]) / 60)} min ago")
                return from_cache(entry)
            raise err

        entry = self._reddit_cache.get(key)
        if entry and self._now() - entry[0] < ttl:
            return from_cache(entry)

        async with self._reddit_gate:  # one request at a time so callers cannot burst past the rate window
            entry = self._reddit_cache.get(key)
            if entry and self._now() - entry[0] < ttl:
                return from_cache(entry)

            for attempt in range(2):
                if self._now() < self._reddit_blocked_until:
                    return stale_or_raise(ValueError("Reddit is blocking this server (backing off)"))
                wait = self._reddit_next_allowed - self._now()
                if wait > max_wait:
                    return stale_or_raise(ValueError(f"Reddit rate window closed for {int(wait)}s"))
                if wait > 0:
                    await self._sleep(wait)

                session = await self._get_session()
                url = f"{self.REDDIT_WEB_BASE}/r/{sub}/top/.rss?t=day&limit=25"
                try:
                    async with session.get(url, headers={"User-Agent": os.getenv("REDDIT_USER_AGENT", "").strip() or self.USER_AGENT}) as resp:
                        status = resp.status
                        reset = self._header_num(resp.headers.get("x-ratelimit-reset"))
                        remaining = self._header_num(resp.headers.get("x-ratelimit-remaining"))
                        retry_after = self._header_num(resp.headers.get("retry-after"))
                        text = await resp.text() if status == 200 else ""
                except (aiohttp.ClientError, asyncio.TimeoutError) as e:
                    return stale_or_raise(ValueError(f"Reddit feed request failed: {e}"))

                if status == 429:
                    secs = retry_after or reset or 60
                    self._reddit_next_allowed = max(self._reddit_next_allowed, self._now() + secs + 0.5)
                elif remaining is not None and remaining < 1 and reset:
                    self._reddit_next_allowed = max(self._reddit_next_allowed, self._now() + reset + 0.5)

                if status in (401, 404, 410, 451):  # feed shut off / removed (Reddit ends RSS on 2026-11-13): stop retrying for a while
                    self._reddit_blocked_until = self._now() + block_backoff
                    return stale_or_raise(ValueError(f"Reddit feed error: {status} (feed unavailable, backing off)"))
                if status == 403:
                    self._reddit_blocked_until = self._now() + block_backoff
                    return stale_or_raise(ValueError("Reddit feed error: 403 (blocked by network security)"))
                if status == 429:
                    if attempt == 0:
                        continue
                    return stale_or_raise(ValueError("Reddit feed error: 429"))
                if status != 200:
                    return stale_or_raise(ValueError(f"Reddit feed error: {status}"))

                try:
                    stories = self._parse_reddit_atom(text, source.name, 25)
                except ET.ParseError as e:
                    return stale_or_raise(ValueError(f"Reddit feed was not valid Atom: {e}"))
                self._reddit_cache[key] = (self._now(), stories)
                return from_cache(self._reddit_cache[key])
            return stale_or_raise(ValueError("Reddit feed error: 429"))

    @staticmethod
    def _header_num(v: Optional[str]) -> Optional[float]:
        try:
            return float(v) if v is not None else None
        except ValueError:
            return None

    @staticmethod
    def _parse_reddit_atom(xml_text: str, source_name: str, max_items: int) -> list[AggregatedStory]:
        """Link posts point at the submitted URL, text posts at the thread; the feed has no score or comment count."""
        ns = {"a": "http://www.w3.org/2005/Atom"}
        root = ET.fromstring(xml_text)
        stories: list[AggregatedStory] = []
        for entry in root.findall("a:entry", ns):
            title = (entry.findtext("a:title", default="", namespaces=ns) or "").strip()
            if not title:
                continue
            link_el = entry.find("a:link", ns)
            thread_url = link_el.get("href") if link_el is not None else None
            body = entry.findtext("a:content", default="", namespaces=ns) or ""
            m = re.search(r'<a href="([^"]+)">\[link\]</a>', body)
            submitted = html.unescape(m.group(1)) if m else None
            external = bool(submitted) and not re.match(r"https?://(www\.|old\.)?reddit\.com/", submitted, re.I)
            md = re.search(r'<div class="md">([\s\S]*?)</div>\s*<!-- SC_ON -->', body)
            summary = None
            if md:
                summary = re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", md.group(1)))).strip()[:300] or None
            published = None
            updated = entry.findtext("a:updated", default="", namespaces=ns)
            if updated:
                try:
                    published = datetime.fromisoformat(updated)
                except ValueError:
                    published = None
            author = entry.findtext("a:author/a:name", default=None, namespaces=ns)
            stories.append(AggregatedStory(
                title=title,
                source=source_name,
                source_type="reddit",
                summary=summary,
                url=submitted if external else thread_url,
                published_at=published,
                author=author[3:] if author and author.startswith("/u/") else author,
            ))
            if len(stories) >= max_items:
                break
        return stories

    async def _fetch_reddit_oauth(self, source: ContentSource) -> list[AggregatedStory]:
        max_items = source.max_items or 10
        token = await self._get_reddit_token()
        session = await self._get_session()

        url = f"{self.REDDIT_OAUTH_BASE}/r/{source.subreddit}/hot?limit={max_items * 2}"
        async with session.get(
            url,
            headers={
                "Authorization": f"Bearer {token}",
                "User-Agent": self.USER_AGENT,
            },
        ) as resp:
            if resp.status != 200:
                raise ValueError(f"Reddit API error: {resp.status}")
            data = await resp.json()

        stories = []
        for child in data.get("data", {}).get("children", []):
            post = child.get("data", {})
            if post.get("stickied") or post.get("over_18"):
                continue
            if post.get("is_self") and not post.get("selftext"):
                continue

            stories.append(AggregatedStory(
                title=post.get("title", ""),
                source=source.name,
                source_type="reddit",
                summary=(post.get("selftext") or "")[:300] or None,
                url=(f"https://reddit.com{post['permalink']}" if post.get("is_self") else post.get("url")),
                score=post.get("score", 0),
                comment_count=post.get("num_comments", 0),
                published_at=datetime.fromtimestamp(post.get("created_utc", 0), tz=timezone.utc),
                author=post.get("author"),
            ))
            if len(stories) >= max_items:
                break

        return stories

    # --- Helpers ---

    def _deduplicate(self, stories: list[AggregatedStory]) -> list[AggregatedStory]:
        seen: set[str] = set()
        unique: list[AggregatedStory] = []
        for story in stories:
            key = re.sub(r"[^\w\s]", "", story.title.lower()).strip()[:50]
            if key not in seen:
                seen.add(key)
                unique.append(story)
        return unique

    def _sort_by_relevance(self, stories: list[AggregatedStory]) -> list[AggregatedStory]:
        def sort_key(s: AggregatedStory):
            ts = s.published_at.timestamp() if s.published_at else 0
            return (-s.score, -ts)
        return sorted(stories, key=sort_key)

    def _parse_date(self, date_str: Optional[str]) -> Optional[datetime]:
        if not date_str:
            return None
        try:
            from email.utils import parsedate_to_datetime
            return parsedate_to_datetime(date_str)
        except Exception:
            return None
