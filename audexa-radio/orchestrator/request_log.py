"""
Outcome of every listener topic request, kept on the data volume so restarts do not erase it.

One JSON line per event: {"ts": 1795600000, "event": "accepted"|"generated"|"failed", "id": "..."}. Never any topic text.
A request that is accepted and has no outcome was lost (the request queue is in memory) or is stuck.
"""

import json
import logging
import os
import time
from pathlib import Path
from typing import Optional

logger = logging.getLogger("audexa-radio.requests")

RETENTION_SEC = 30 * 24 * 3600
# A request is normally generated within a few minutes; older than this without an outcome counts as unresolved.
UNRESOLVED_AFTER_SEC = 30 * 60


def log_path() -> Path:
    return Path(os.getenv("REQUEST_LOG_PATH") or os.path.join(os.getenv("LOGS_DIR", "/app/logs"), "listener_requests.jsonl"))


def record(event: str, request_id: str, now: Optional[float] = None, path: Optional[Path] = None) -> None:
    """Append one event. Never raises: bookkeeping must not break a request."""
    line = json.dumps({"ts": int(time.time() if now is None else now), "event": event, "id": request_id})
    try:
        with open(path or log_path(), "a", encoding="utf-8") as f:
            f.write(line + "\n")
    except OSError as e:
        logger.warning(f"Could not record listener request {event}: {e}")


def summary(window_sec: float, now: Optional[float] = None, path: Optional[Path] = None) -> dict:
    """Requests accepted in the window and what became of them."""
    now = time.time() if now is None else now
    accepted: dict[str, float] = {}
    outcomes: dict[str, str] = {}
    try:
        with open(path or log_path(), encoding="utf-8") as f:
            for line in f:
                try:
                    row = json.loads(line)
                    ts, event, rid = float(row["ts"]), row["event"], row["id"]
                except (ValueError, KeyError, TypeError):
                    continue
                if ts < now - min(window_sec, RETENTION_SEC):
                    continue
                if event == "accepted":
                    accepted[rid] = ts
                elif event in ("generated", "failed"):
                    outcomes[rid] = event
    except FileNotFoundError:
        pass
    results = [outcomes.get(rid) for rid in accepted]
    return {
        "window_hours": round(window_sec / 3600, 2),
        "accepted": len(accepted),
        "generated": results.count("generated"),
        "failed": results.count("failed"),
        "unresolved": sum(1 for rid, ts in accepted.items() if rid not in outcomes and now - ts > UNRESOLVED_AFTER_SEC),
    }
