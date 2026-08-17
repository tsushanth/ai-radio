"""
Topic Podcast Injector — pulls today's completed topic-podcast episodes
from ai-radio-backend and pushes them into the radio rotation alongside
the 13 hardcoded radio topics.

Why: radio rotation hits the same 13 topic names all day. The backend
already renders ~55 topic-podcast episodes (universal + locale-specific
JP/ES) every day as MP3s sitting in Supabase. Injecting them costs zero
TTS budget on the radio side, and gets the listener real variety without
expanding the hardcoded list.

Routing rule: a podcast tagged `["all"]` (universal) or `["<lang>"]` is
eligible for that language's stream. So Spanish-curated topics
(`languages=["es"]`) only feed the ES stream — matching the existing
per-language scheduler design.

Throttling: at most one podcast per language per cycle, and only when the
ready buffer for that language has room. That keeps the generation loop
fed with fresh segments without flooding the queue with cached MP3s.
"""

import asyncio
import logging
import os
import time
from datetime import datetime, timezone
from typing import Callable, Optional

import aiohttp

from queue_manager import QueueManager
from email_alerter import report_error, mark_generation_success

logger = logging.getLogger(__name__)

BACKEND_BASE = "https://ai-radio-backend.fly.dev/api"
POLL_INTERVAL_SEC = 120  # Inject once per language per 2 min
# Per-language soft cap: skip injection if the language already has this
# many segments queued. Keeps cached MP3s from monopolizing playback.
MAX_QUEUED_PER_LANG = 8
# Topic catalog barely changes day-to-day. Cache the per-language list for
# an hour so we don't hammer the backend's rate limiter (was returning 429
# on a 2-minute poll interval).
TOPIC_LIST_TTL_SEC = 3600


class TopicPodcastInjector:
    def __init__(
        self,
        queue: QueueManager,
        push_to_liquidsoap: Callable[..., bool],
        get_queue_name_for_language: Callable[[str], str],
        languages: list[str],
    ):
        self.queue = queue
        self.push_to_liquidsoap = push_to_liquidsoap
        self.get_queue_name_for_language = get_queue_name_for_language
        self.languages = languages
        # Tracks (topic_id, date_iso, lang) we've already pushed — prevents
        # duplicate pushes within the same UTC day even across restarts of
        # the inner loop. Resets on full process restart.
        self._pushed: set[tuple[str, str, str]] = set()
        # Per-language rotating cursor so we cycle through topics evenly
        # instead of always pushing the same one until exhausted.
        self._cursor: dict[str, int] = {lang: 0 for lang in languages}
        # Cache per-language topic ID lists. Refreshed every TOPIC_LIST_TTL_SEC.
        self._topic_ids_cache: dict[str, tuple[float, list[str]]] = {}

    async def _fetch_topic_ids_for_lang(
        self, session: aiohttp.ClientSession, lang: str
    ) -> list[str]:
        now = time.monotonic()
        cached = self._topic_ids_cache.get(lang)
        if cached and (now - cached[0]) < TOPIC_LIST_TTL_SEC:
            return cached[1]

        url = f"{BACKEND_BASE}/topics?lang={lang}"
        try:
            async with session.get(
                url, timeout=aiohttp.ClientTimeout(total=30)
            ) as resp:
                resp.raise_for_status()
                data = await resp.json()
        except aiohttp.ClientResponseError as e:
            # Rate-limited or 5xx: re-use the last-good list if we have one,
            # otherwise propagate so the loop's error handler can log.
            if cached:
                logger.warning(
                    f"[{lang}] topic list fetch failed ({e.status}); "
                    f"using cached {len(cached[1])} topics"
                )
                return cached[1]
            raise

        topics = data.get("data", {}).get("topics", []) or []
        eligible: list[str] = []
        for t in topics:
            langs = t.get("languages") or ["all"]
            if "all" in langs or lang in langs:
                eligible.append(t["id"])
        self._topic_ids_cache[lang] = (now, eligible)
        return eligible

    async def _fetch_episode(
        self, session: aiohttp.ClientSession, topic_id: str, lang: str
    ) -> Optional[dict]:
        url = f"{BACKEND_BASE}/topics/{topic_id}/episode?lang={lang}"
        async with session.get(url, timeout=aiohttp.ClientTimeout(total=30)) as resp:
            if resp.status != 200:
                return None
            data = await resp.json()
        ep = (data.get("data") or {}).get("episode") or {}
        if ep.get("status") != "completed":
            return None
        if not ep.get("audioUrl"):
            return None
        return ep

    async def _download_mp3(
        self, session: aiohttp.ClientSession, audio_url: str
    ) -> bytes:
        async with session.get(
            audio_url, timeout=aiohttp.ClientTimeout(total=120)
        ) as resp:
            resp.raise_for_status()
            return await resp.read()

    def _count_queued_for_lang(self, lang: str) -> int:
        try:
            segments = self.queue.list_ready_segments()
        except Exception:
            return 0
        if lang == "en":
            return sum(1 for s in segments if not s["topic_name"].startswith("["))
        marker = f"[{lang}]"
        return sum(1 for s in segments if s["topic_name"].startswith(marker))

    async def inject_one_for_lang(
        self, session: aiohttp.ClientSession, lang: str
    ) -> bool:
        # Buffer guard: don't pile on if this language already has plenty queued.
        if self._count_queued_for_lang(lang) >= MAX_QUEUED_PER_LANG:
            return False

        topic_ids = await self._fetch_topic_ids_for_lang(session, lang)
        if not topic_ids:
            return False

        today = datetime.now(timezone.utc).date().isoformat()
        # Try up to MAX_PROBES_PER_CYCLE topics per cycle to stay gentle on
        # the backend rate limiter. Topics that don't have a completed
        # episode today get reconsidered on a later cycle via the cursor.
        MAX_PROBES_PER_CYCLE = 3
        probes = 0
        for _ in range(len(topic_ids)):
            if probes >= MAX_PROBES_PER_CYCLE:
                break
            idx = self._cursor[lang] % len(topic_ids)
            self._cursor[lang] = (idx + 1) % len(topic_ids)
            tid = topic_ids[idx]
            key = (tid, today, lang)
            if key in self._pushed:
                continue

            probes += 1
            ep = await self._fetch_episode(session, tid, lang)
            if not ep:
                continue

            try:
                audio_bytes = await self._download_mp3(session, ep["audioUrl"])
            except Exception as e:
                logger.warning(f"[{lang}] failed to download {tid}: {e}")
                continue

            # Render as a plain topic name in the UI — listener shouldn't see
            # "podcast: ..." or the trailing " - <weekday>, <month> <day>"
            # date suffix (which is just today's date and reads as noise).
            raw_title = ep.get("title") or tid
            display_title = raw_title.split(" - ")[0].strip()[:60]
            # Prefix with [<lang>] so the reconcile loop routes it correctly.
            # The "en" branch keys off the absence of the bracket prefix, so
            # for EN we omit it to match the existing scheduled-segment naming.
            topic_name = (
                display_title if lang == "en" else f"[{lang}] {display_title}"
            )
            filepath = await self.queue.push_ready_segment(
                audio_bytes,
                segment_type="topic_podcast",
                priority=1,  # Same as scheduled — interleaves naturally
                topic_name=topic_name,
            )
            queue_name = self.get_queue_name_for_language(lang)
            self.push_to_liquidsoap(filepath, queue_name=queue_name)
            self._pushed.add(key)
            logger.info(
                f"[{lang}] injected podcast '{display_title}' "
                f"({len(audio_bytes)//1024}KB) into {queue_name}"
            )
            return True

        return False

    async def run_loop(self):
        """Run forever. Each cycle: one podcast per language (if room)."""
        last_reset_day = datetime.now(timezone.utc).date()
        # Send BATCH_SECRET bearer so the backend's rate limiter skips us —
        # we're a first-party worker, not a public client. Without this the
        # api hits 429 within the first cycle (10 langs × topic+episode probes).
        headers = {}
        secret = os.environ.get("BATCH_SECRET")
        if secret:
            headers["Authorization"] = f"Bearer {secret}"
        else:
            logger.warning(
                "BATCH_SECRET not set — expect 429s from backend rate limiter"
            )
        async with aiohttp.ClientSession(headers=headers) as session:
            while True:
                try:
                    # Daily reset of the dedupe set so tomorrow's batch is eligible.
                    today = datetime.now(timezone.utc).date()
                    if today != last_reset_day:
                        self._pushed.clear()
                        last_reset_day = today
                        logger.info("Topic podcast injector: reset daily dedupe set")

                    for lang in self.languages:
                        try:
                            await self.inject_one_for_lang(session, lang)
                        except Exception as e:
                            report_error(
                                e,
                                source="topic_podcast_injector",
                                context={"lang": lang},
                            )
                        # Space out per-language work so we don't burst the
                        # backend's rate limiter when iterating 10 languages.
                        await asyncio.sleep(2)
                    mark_generation_success()
                except Exception as e:
                    report_error(e, source="topic_podcast_injector_loop")

                await asyncio.sleep(POLL_INTERVAL_SEC)
