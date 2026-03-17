"""
Content Fetcher — ported from ai-radio-backend/src/services/content/aggregator.service.ts
Fetches news from RSS, Reddit (OAuth), and HackerNews.
"""

import asyncio
import logging
import re
import time
from base64 import b64encode
from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional

import aiohttp
import feedparser

from topics import ContentSource, TopicDefinition

logger = logging.getLogger(__name__)


@dataclass
class AggregatedStory:
    title: str
    source: str
    source_type: str  # "rss", "hackernews", "reddit"
    summary: Optional[str] = None
    url: Optional[str] = None
    score: int = 0
    comment_count: int = 0
    published_at: Optional[datetime] = None
    author: Optional[str] = None


@dataclass
class TopicContent:
    topic_id: str
    date: str
    stories: list[AggregatedStory]
    fetched_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    total_sources: int = 0
    successful_sources: int = 0


class ContentFetcher:
    HN_API_BASE = "https://hacker-news.firebaseio.com/v0"
    REDDIT_OAUTH_BASE = "https://oauth.reddit.com"
    USER_AGENT = "AudexaRadio/1.0"

    def __init__(self, reddit_client_id: str = "", reddit_client_secret: str = ""):
        self.reddit_client_id = reddit_client_id
        self.reddit_client_secret = reddit_client_secret
        self._reddit_token: Optional[str] = None
        self._reddit_token_expiry: float = 0
        self._session: Optional[aiohttp.ClientSession] = None

    async def _get_session(self) -> aiohttp.ClientSession:
        if self._session is None or self._session.closed:
            timeout = aiohttp.ClientTimeout(total=15)
            self._session = aiohttp.ClientSession(timeout=timeout)
        return self._session

    async def close(self):
        if self._session and not self._session.closed:
            await self._session.close()

    async def fetch_topic_content(self, topic: TopicDefinition) -> TopicContent:
        """Aggregate content for a topic from all its sources."""
        stories: list[AggregatedStory] = []
        successful = 0

        logger.info(f"Aggregating content for topic: {topic.name}")

        for source in topic.sources:
            try:
                source_stories = await self._fetch_from_source(source)
                stories.extend(source_stories)
                successful += 1
                logger.info(f"  {source.name}: {len(source_stories)} stories")
            except Exception as e:
                logger.warning(f"  {source.name} failed: {e}")

        unique = self._deduplicate(stories)
        sorted_stories = self._sort_by_relevance(unique)
        top = sorted_stories[:15]

        logger.info(f"Total: {len(top)} unique stories from {successful}/{len(topic.sources)} sources")

        return TopicContent(
            topic_id=topic.id,
            date=datetime.now(timezone.utc).strftime("%Y-%m-%d"),
            stories=top,
            total_sources=len(topic.sources),
            successful_sources=successful,
        )

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

    async def _fetch_reddit(self, source: ContentSource) -> list[AggregatedStory]:
        if not source.subreddit:
            raise ValueError("Reddit source requires subreddit")

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
