"""
Listener sampler: every SAMPLE_INTERVAL_SEC read Icecast's status-json.xsl, append one aggregate
record to a JSONL file on the data volume, and serve bucketed history for the admin page.

Privacy: only per-mount listener COUNTS are stored. Icecast's status-json does not carry IPs or
user agents in the public status, and this module copies nothing but the integer counts.

Failure policy: any Icecast error is recorded as a sample with total=None; the loop never raises.
Record format (one JSON object per line):
    {"ts": 1760000000, "total": 12, "mounts": {"/stream": 9, "/stream-es": 3}}
    {"ts": 1760000060, "total": null, "mounts": null}          # Icecast unreachable
"""

import asyncio
import json
import logging
import os
import time
import urllib.request
from pathlib import Path
from typing import Any, Optional
from urllib.parse import urlparse

logger = logging.getLogger("audexa-radio.listeners")

SAMPLE_INTERVAL_SEC = int(os.getenv("LISTENER_SAMPLE_INTERVAL_SEC", "60"))
RETENTION_SEC = 30 * 24 * 3600
BUCKET_SEC = 300
PRUNE_EVERY_N_WRITES = 60  # ~hourly; pruning rewrites the file, so not every write
ICECAST_STATUS_URL = os.getenv("ICECAST_STATUS_URL", "http://127.0.0.1:8000/status-json.xsl")
HISTORY_PATH = os.getenv("LISTENER_HISTORY_PATH", "/data/logs/listener_history.jsonl")


def parse_icecast_status(doc: Any) -> dict[str, int]:
    """Icecast status-json: icestats.source is a dict (one mount), a list (several) or absent (none)."""
    stats = doc.get("icestats") if isinstance(doc, dict) else None
    if not isinstance(stats, dict):
        raise ValueError("not an icecast status document")
    src = stats.get("source")
    if src is None:
        return {}
    sources = [src] if isinstance(src, dict) else list(src)
    out: dict[str, int] = {}
    for s in sources:
        if not isinstance(s, dict):
            continue
        mount = urlparse(str(s.get("listenurl", ""))).path or str(s.get("server_name", "")) or "?"
        try:
            n = int(s.get("listeners", 0))
        except (TypeError, ValueError):
            continue
        out[mount] = out.get(mount, 0) + max(n, 0)
    return out


def fetch_icecast_listeners(url: str = ICECAST_STATUS_URL, timeout: float = 5.0) -> dict[str, int]:
    with urllib.request.urlopen(url, timeout=timeout) as resp:  # noqa: S310 (loopback URL from config)
        return parse_icecast_status(json.loads(resp.read(1_000_000)))


def make_sample(now: float, mounts: Optional[dict[str, int]]) -> dict:
    if mounts is None:
        return {"ts": int(now), "total": None, "mounts": None}
    return {"ts": int(now), "total": sum(mounts.values()), "mounts": mounts}


def append_sample(path: str, sample: dict) -> None:
    p = Path(path)
    p.parent.mkdir(parents=True, exist_ok=True)
    with open(p, "a", encoding="utf-8") as f:
        f.write(json.dumps(sample, separators=(",", ":")) + "\n")


def load_samples(path: str, since_ts: float = 0) -> list[dict]:
    """Read valid records with ts >= since_ts, skipping corrupt lines (e.g. a torn last write)."""
    out: list[dict] = []
    try:
        with open(path, "r", encoding="utf-8") as f:
            for line in f:
                try:
                    r = json.loads(line)
                    ts = r["ts"]
                    if isinstance(ts, (int, float)) and ts >= since_ts:
                        out.append(r)
                except (ValueError, KeyError, TypeError):
                    continue
    except FileNotFoundError:
        pass
    return out


def prune(path: str, now: float, retention_sec: int = RETENTION_SEC) -> int:
    """Rewrite the file keeping only records inside the retention window. Returns records kept."""
    if not os.path.exists(path):
        return 0
    kept = load_samples(path, now - retention_sec)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as f:
        for r in kept:
            f.write(json.dumps(r, separators=(",", ":")) + "\n")
    os.replace(tmp, path)
    return len(kept)


def bucketize(samples: list[dict], hours: float, now: float, bucket_sec: int = BUCKET_SEC) -> dict:
    """Aggregate samples into fixed buckets. Aggregate counts only.

    A bucket's `avg`/`max` ignore null samples; a bucket with no valid sample has avg/max = None
    (shown as a gap, never as zero).
    """
    since = now - hours * 3600
    start = int(since // bucket_sec) * bucket_sec
    acc: dict[int, list[int]] = {}
    for r in samples:
        ts = r.get("ts")
        total = r.get("total")
        if not isinstance(ts, (int, float)) or ts < since or ts > now:
            continue
        b = int(ts // bucket_sec) * bucket_sec
        acc.setdefault(b, [])
        if isinstance(total, int):
            acc[b].append(total)

    buckets = []
    peak: Optional[dict] = None
    b = start
    end = int(now // bucket_sec) * bucket_sec
    while b <= end:
        vals = acc.get(b, [])
        if vals:
            mx = max(vals)
            buckets.append({"ts": b, "avg": round(sum(vals) / len(vals), 2), "max": mx})
            if peak is None or mx > peak["listeners"]:
                peak = {"ts": b, "listeners": mx}
        else:
            buckets.append({"ts": b, "avg": None, "max": None})
        b += bucket_sec

    latest = None
    for r in samples:
        if isinstance(r.get("ts"), (int, float)) and r["ts"] <= now and (latest is None or r["ts"] > latest["ts"]):
            latest = r
    current = None
    if latest is not None:
        current = {"ts": latest["ts"], "total": latest.get("total"), "age_sec": int(now - latest["ts"])}
    return {"hours": hours, "bucket_sec": bucket_sec, "buckets": buckets, "peak": peak, "current": current}


def history(hours: float, now: Optional[float] = None, path: str = HISTORY_PATH) -> dict:
    now = time.time() if now is None else now
    hours = min(max(hours, 1 / 12), RETENTION_SEC / 3600)
    return bucketize(load_samples(path, now - hours * 3600), hours, now)


async def sample_once(path: str = HISTORY_PATH, url: str = ICECAST_STATUS_URL, fetch=fetch_icecast_listeners) -> dict:
    try:
        mounts: Optional[dict[str, int]] = await asyncio.to_thread(fetch, url)
    except Exception as e:  # Icecast down, bad JSON, timeout: record a gap, do not crash
        logger.warning("icecast status unavailable: %s", type(e).__name__)
        mounts = None
    sample = make_sample(time.time(), mounts)
    await asyncio.to_thread(append_sample, path, sample)
    return sample


async def run_loop(path: str = HISTORY_PATH, url: str = ICECAST_STATUS_URL, interval: int = SAMPLE_INTERVAL_SEC, fetch=fetch_icecast_listeners) -> None:
    writes = 0
    try:
        await asyncio.to_thread(prune, path, time.time())
    except Exception:
        logger.exception("listener history prune failed at start")
    while True:
        try:
            await sample_once(path, url, fetch)
            writes += 1
            if writes % PRUNE_EVERY_N_WRITES == 0:
                await asyncio.to_thread(prune, path, time.time())
        except asyncio.CancelledError:
            raise
        except Exception:
            logger.exception("listener sampler iteration failed")  # e.g. disk full: keep looping
        await asyncio.sleep(interval)
