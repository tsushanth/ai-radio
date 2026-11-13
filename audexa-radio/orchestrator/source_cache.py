"""Small JSON file cache on the data volume for per-topic story lists.

Used for the "last good" copy of each topic's feed stories and for Exa query results. Files are written
atomically (tmp + rename). Every read and write is fail-soft: a broken or missing cache directory only logs.
"""

import json
import logging
import os
import re
import time
from dataclasses import asdict
from datetime import datetime
from typing import Callable, Optional

from stories import AggregatedStory

logger = logging.getLogger(__name__)


def default_cache_dir() -> str:
    explicit = os.getenv("SOURCE_CACHE_DIR", "").strip()
    if explicit:
        return explicit
    logs = os.getenv("LOGS_DIR", "").strip()  # /data/logs on Fly: the cache sits beside it on the same volume
    if logs:
        return os.path.join(os.path.dirname(logs.rstrip("/")) or "/", "cache", "sources")
    return "/tmp/audexa-source-cache"


def _safe(key: str) -> str:
    return re.sub(r"[^A-Za-z0-9_.-]", "_", key)[:120]


def _encode(s: AggregatedStory) -> dict:
    d = asdict(s)
    d["published_at"] = s.published_at.isoformat() if s.published_at else None
    return d


def _decode(d: dict) -> AggregatedStory:
    d = dict(d)
    p = d.get("published_at")
    d["published_at"] = datetime.fromisoformat(p) if p else None
    return AggregatedStory(**d)


class SourceCache:
    def __init__(self, directory: Optional[str] = None, now: Callable[[], float] = time.time):
        self.dir = directory or default_cache_dir()
        self._now = now

    def _path(self, key: str) -> str:
        return os.path.join(self.dir, _safe(key) + ".json")

    def get(self, key: str, max_age_sec: float) -> Optional[list[AggregatedStory]]:
        """Stories stored under `key` that are younger than max_age_sec, else None."""
        try:
            with open(self._path(key), "r", encoding="utf-8") as f:
                blob = json.load(f)
            if self._now() - float(blob["saved_at"]) >= max_age_sec:
                return None
            return [_decode(s) for s in blob["stories"]]
        except FileNotFoundError:
            return None
        except Exception as e:  # corrupt file, schema drift, unreadable volume
            logger.warning(f"source cache read failed for {key}: {e}")
            return None

    def put(self, key: str, stories: list[AggregatedStory]) -> None:
        try:
            os.makedirs(self.dir, exist_ok=True)
            tmp = self._path(key) + ".tmp"
            with open(tmp, "w", encoding="utf-8") as f:
                json.dump({"saved_at": self._now(), "stories": [_encode(s) for s in stories]}, f)
            os.replace(tmp, self._path(key))
        except Exception as e:
            logger.warning(f"source cache write failed for {key}: {e}")

    def read_json(self, name: str) -> Optional[dict]:
        try:
            with open(os.path.join(self.dir, _safe(name) + ".json"), "r", encoding="utf-8") as f:
                return json.load(f)
        except FileNotFoundError:
            return None
        except Exception as e:
            logger.warning(f"source cache read failed for {name}: {e}")
            return None

    def write_json(self, name: str, data: dict) -> None:
        try:
            os.makedirs(self.dir, exist_ok=True)
            p = os.path.join(self.dir, _safe(name) + ".json")
            with open(p + ".tmp", "w", encoding="utf-8") as f:
                json.dump(data, f)
            os.replace(p + ".tmp", p)
        except Exception as e:
            logger.warning(f"source cache write failed for {name}: {e}")
