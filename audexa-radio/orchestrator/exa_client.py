"""Exa search as a news source for the radio topics that opt in (TopicDefinition.exa_query).

Request shape: https://exa.ai/docs/search/quickstart.md. POST https://api.exa.ai/search, `Authorization: Bearer <key>`,
type "lite" (cheapest, no live fetch), numResults 8, startPublishedDate = now - 48 h, category "news" where it fits,
contents = text (maxCharacters 1500) + highlights. No summary, no deep types, nothing `lite` would reject with a 400.

Spend controls (this module never makes one search per segment):
  * results are cached per topic for EXA_CACHE_TTL_SEC (default 6 h), also on the volume so a restart does not re-spend;
  * a failed topic is not retried for EXA_FAIL_COOLDOWN_SEC (default 30 min);
  * a persisted per-UTC-day counter stops all searches at EXA_DAILY_CAP (default 60) and alerts once at 80 %;
  * 401/402/403/400 (bad key, credits gone, bad request) switch Exa off for an hour, 429 honours Retry-After.
Everything fails soft: any problem returns None and the caller falls through to RSS/HN and then the last good cache.
The API key comes only from the EXA_API_KEY environment variable and is never logged.
"""

import asyncio
import logging
import math
import os
import re
import time
from datetime import datetime, timedelta, timezone
from typing import Awaitable, Callable, Optional
from urllib.parse import urlparse

import aiohttp

from source_cache import SourceCache
from stories import AggregatedStory

logger = logging.getLogger(__name__)

EXA_SEARCH_URL = "https://api.exa.ai/search"
REQUEST_TIMEOUT_SEC = 15
NUM_RESULTS = 8
MAX_CHARS = 1500
MIN_TEXT_CHARS = 400          # shorter pages are hub/index/live-blog pages, not articles
TRUNCATED_AT = 1000           # some publishers (NYT, Politico, CNN) hand back text cut at exactly 1000 chars: usable, but partial
MAX_PER_DOMAIN = 2
MAX_AGE_HOURS = 72            # defensive: the request already asks for the last 48 h
FUTURE_SLACK = timedelta(hours=1)
SUMMARY_CHARS = 700
MAX_RETRY_AFTER_SEC = 10      # a longer Retry-After than this switches Exa off until it expires instead of waiting

_HUB_SEGMENTS = {
    "news", "latest", "latest-news", "sports", "space", "science", "tech", "technology", "business", "politics", "world",
    "markets", "gaming", "games", "ai", "startups", "cricket", "live", "topics", "category", "home", "index",
}

_OUTLETS = {
    "cnbc.com": "CNBC", "nytimes.com": "The New York Times", "politico.com": "Politico", "cnn.com": "CNN",
    "apnews.com": "the Associated Press", "reuters.com": "Reuters", "bbc.com": "the BBC", "bbc.co.uk": "the BBC",
    "npr.org": "NPR", "nbcnews.com": "NBC News", "pbs.org": "PBS", "thehill.com": "The Hill", "techcrunch.com": "TechCrunch",
    "theverge.com": "The Verge", "wsj.com": "The Wall Street Journal", "ft.com": "the Financial Times",
    "bloomberg.com": "Bloomberg", "aljazeera.com": "Al Jazeera", "theguardian.com": "The Guardian", "fortune.com": "Fortune",
    "businessinsider.com": "Business Insider", "space.com": "Space.com", "venturebeat.com": "VentureBeat",
    "wired.com": "Wired", "arstechnica.com": "Ars Technica", "marketwatch.com": "MarketWatch", "investopedia.com": "Investopedia",
    "yahoo.com": "Yahoo", "forbes.com": "Forbes", "axios.com": "Axios", "infoq.com": "InfoQ", "dev.to": "DEV Community",
    "cricbuzz.com": "Cricbuzz", "espncricinfo.com": "ESPNcricinfo", "eu-startups.com": "EU-Startups", "crunchbase.com": "Crunchbase",
}


def flag(name: str, default: bool) -> bool:
    v = os.getenv(name, "").strip().lower()
    if not v:
        return default
    return v in ("1", "true", "on", "yes")


def exa_enabled() -> bool:
    """SOURCE_EXA_ENABLED, default OFF. Also needs EXA_API_KEY to actually search."""
    return flag("SOURCE_EXA_ENABLED", False)


def _env_num(name: str, default: float) -> float:
    try:
        v = float(os.environ[name])
        return v if v >= 0 else default
    except (KeyError, ValueError):
        return default


def domain_of(url: str) -> str:
    host = (urlparse(url).hostname or "").lower()
    return host[4:] if host.startswith("www.") else host


def outlet_name(url: str) -> str:
    """Name used for on-air attribution, e.g. 'CNBC'. Unknown hosts get a readable form of the registrable domain."""
    d = domain_of(url)
    parts = d.split(".")
    for n in (3, 2):  # match foo.co.uk style and plain foo.com
        key = ".".join(parts[-n:])
        if key in _OUTLETS:
            return _OUTLETS[key]
    if len(parts) >= 2:
        base = parts[-3] if len(parts) >= 3 and parts[-2] in ("co", "com", "org", "net") else parts[-2]
        return base.replace("-", " ").title()
    return d or "the web"


def _is_hub_url(url: str) -> bool:
    segs = [s for s in urlparse(url).path.split("/") if s]
    return not segs or (len(segs) == 1 and segs[0].lower() in _HUB_SEGMENTS)


def _title_key(title: str) -> str:
    return re.sub(r"[^\w\s]", "", title.lower()).strip()[:50]


def _parse_date(s) -> Optional[datetime]:
    if not s or not isinstance(s, str):
        return None
    try:
        d = datetime.fromisoformat(s.replace("Z", "+00:00"))
    except ValueError:
        return None
    return d if d.tzinfo else d.replace(tzinfo=timezone.utc)


def _clip(text: str, n: int) -> str:
    if len(text) <= n:
        return text
    cut = text[:n].rsplit(" ", 1)[0]
    return cut.rstrip(",;:- ") + "..."


def parse_results(payload: dict, now: Optional[datetime] = None) -> list[AggregatedStory]:
    """Turn an Exa /search response into usable stories. Pure function: no I/O."""
    now = now or datetime.now(timezone.utc)
    out: list[AggregatedStory] = []
    seen_titles: set[str] = set()
    per_domain: dict[str, int] = {}
    for r in (payload or {}).get("results") or []:
        if not isinstance(r, dict):
            continue
        title = re.sub(r"\s+", " ", str(r.get("title") or "")).strip()
        url = str(r.get("url") or "").strip()
        text = re.sub(r"\s+", " ", str(r.get("text") or "")).strip()
        if not title or not url.startswith(("http://", "https://")):
            continue
        if len(text) < MIN_TEXT_CHARS or _is_hub_url(url):
            continue
        published = _parse_date(r.get("publishedDate"))
        if published is None:  # freshness cannot be checked
            continue
        if published > now + FUTURE_SLACK or published < now - timedelta(hours=MAX_AGE_HOURS):
            continue
        key = _title_key(title)
        dom = domain_of(url)
        if key in seen_titles or per_domain.get(dom, 0) >= MAX_PER_DOMAIN:
            continue
        seen_titles.add(key)
        per_domain[dom] = per_domain.get(dom, 0) + 1
        out.append(AggregatedStory(
            title=title,
            source=outlet_name(url),
            source_type="exa",
            summary=_clip(text, SUMMARY_CHARS),
            url=url,
            published_at=published,
            author=None,  # never carry personal names into a script
            partial=len(text) == TRUNCATED_AT,
        ))
    return out


class DailyBudget:
    """Persisted per-UTC-day search counter with a hard cap and a one-time alert at 80 %."""

    def __init__(self, cache: SourceCache, cap: int, alert: Callable[[str], None], now: Callable[[], float] = time.time):
        self.cache = cache
        self.cap = cap
        self.alert = alert
        self._now = now
        self._name = "exa_usage"

    def _today(self) -> str:
        return datetime.fromtimestamp(self._now(), tz=timezone.utc).strftime("%Y-%m-%d")

    def _load(self) -> dict:
        d = self.cache.read_json(self._name) or {}
        if d.get("date") != self._today():
            d = {"date": self._today(), "count": 0, "warned": False, "capped": False}
        return d

    def used(self) -> int:
        return int(self._load().get("count", 0))

    def reserve(self) -> bool:
        """Count one search. False (and nothing counted) once the cap is reached."""
        d = self._load()
        if d["count"] >= self.cap:
            if not d.get("capped"):
                d["capped"] = True
                self.cache.write_json(self._name, d)
                msg = f"Exa daily search cap reached ({d['count']}/{self.cap}); Exa is off until 00:00 UTC, feeds and cache keep the radio running"
                logger.warning(msg)
                self.alert(msg)
            return False
        d["count"] += 1
        threshold = math.ceil(self.cap * 0.8)
        if d["count"] >= threshold and not d.get("warned"):
            d["warned"] = True
            msg = f"Exa daily searches at {d['count']}/{self.cap} (80% of the cap)"
            logger.warning(msg)
            self.alert(msg)
        self.cache.write_json(self._name, d)
        return True


class ExaClient:
    def __init__(
        self,
        session_getter: Callable[[], Awaitable[aiohttp.ClientSession]],
        cache: SourceCache,
        alert: Optional[Callable[[str], None]] = None,
        now: Callable[[], float] = time.time,
        sleep: Callable[[float], Awaitable[None]] = asyncio.sleep,
    ):
        self._session_getter = session_getter
        self.cache = cache
        self._alert = alert or (lambda msg: None)
        self._now = now
        self._sleep = sleep
        self.url = EXA_SEARCH_URL
        self.budget = DailyBudget(cache, int(_env_num("EXA_DAILY_CAP", 60)), self._alert, now)
        self._locks: dict[str, asyncio.Lock] = {}
        self._failed_until: dict[str, float] = {}
        self._off_until = 0.0
        self.requests_made = 0

    def _key(self) -> Optional[str]:
        k = os.getenv("EXA_API_KEY", "").strip()
        return k or None

    def available(self) -> bool:
        return exa_enabled() and self._key() is not None and self._now() >= self._off_until

    async def fetch_topic(self, topic_id: str, query: str, category: Optional[str] = "news") -> Optional[list[AggregatedStory]]:
        """>= 1 usable stories, or None when Exa is off, capped, failing or returned nothing usable.

        The caller applies the minimum-results rule. A cached answer (<= EXA_CACHE_TTL_SEC old) is returned without a search.
        """
        if not exa_enabled():
            return None
        ttl = _env_num("EXA_CACHE_TTL_SEC", 6 * 3600)
        cache_key = f"exa-{topic_id}"
        cached = self.cache.get(cache_key, ttl)
        if cached:
            return cached
        if not self.available():
            return None
        lock = self._locks.setdefault(topic_id, asyncio.Lock())
        async with lock:  # concurrent segments for one topic share one search
            cached = self.cache.get(cache_key, ttl)
            if cached:
                return cached
            if self._now() < self._failed_until.get(topic_id, 0):
                return None
            stories = await self._search(topic_id, query, category)
            if not stories:
                self._failed_until[topic_id] = self._now() + _env_num("EXA_FAIL_COOLDOWN_SEC", 1800)
                return None
            self.cache.put(cache_key, stories)
            return stories

    async def _search(self, topic_id: str, query: str, category: Optional[str]) -> Optional[list[AggregatedStory]]:
        now_dt = datetime.fromtimestamp(self._now(), tz=timezone.utc)
        body: dict = {
            "query": query,
            "type": "lite",
            "numResults": NUM_RESULTS,
            "startPublishedDate": (now_dt - timedelta(hours=48)).strftime("%Y-%m-%dT%H:%M:%S.000Z"),
            "contents": {"text": {"maxCharacters": MAX_CHARS}, "highlights": True},
        }
        if category:
            body["category"] = category
        for attempt in range(2):
            if not self.budget.reserve():
                return None
            self.requests_made += 1
            try:
                session = await self._session_getter()
                headers = {"Authorization": f"Bearer {self._key()}", "Content-Type": "application/json"}
                async with session.post(
                    self.url, json=body, headers=headers, timeout=aiohttp.ClientTimeout(total=REQUEST_TIMEOUT_SEC)
                ) as resp:
                    status = resp.status
                    retry_after = resp.headers.get("Retry-After")
                    payload = await resp.json(content_type=None) if status == 200 else None
            except (aiohttp.ClientError, asyncio.TimeoutError, ValueError) as e:
                logger.warning(f"Exa search for {topic_id} failed: {type(e).__name__}")
                return None
            if status == 429:
                wait = _retry_after_seconds(retry_after)
                if attempt == 0 and wait <= MAX_RETRY_AFTER_SEC:
                    logger.warning(f"Exa 429 for {topic_id}: retrying once after {wait:.0f}s")
                    await self._sleep(wait)
                    continue
                self._off_until = self._now() + max(wait, 60.0)
                logger.warning(f"Exa 429 for {topic_id}: Exa paused for {max(wait, 60.0):.0f}s")
                return None
            if status in (400, 401, 402, 403):
                self._off_until = self._now() + _env_num("EXA_OFF_SEC", 3600)
                msg = f"Exa returned {status}: Exa is off for {int(_env_num('EXA_OFF_SEC', 3600) // 60)} min (check EXA_API_KEY / credits)"
                logger.error(msg)
                self._alert(msg)
                return None
            if status != 200 or not isinstance(payload, dict):
                logger.warning(f"Exa search for {topic_id}: HTTP {status}")
                return None
            stories = parse_results(payload, now_dt)
            logger.info(f"Exa {topic_id}: {len(stories)} usable of {len(payload.get('results') or [])} results (budget {self.budget.used()}/{self.budget.cap})")
            return stories or None
        return None


def _retry_after_seconds(v: Optional[str]) -> float:
    try:
        return max(0.0, float(v)) if v is not None else 60.0
    except ValueError:
        return 60.0
