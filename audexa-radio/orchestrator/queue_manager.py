"""
Queue Manager — two-queue system for the radio orchestrator.

Request Queue (in-memory): raw topic strings from Retell callers
Ready Queue (file-based): rendered MP3 segments ready for Liquidsoap
"""

import asyncio
import json
import logging
import os
import time
from dataclasses import dataclass, field
from datetime import datetime, timezone
from pathlib import Path
from typing import Optional

logger = logging.getLogger(__name__)


@dataclass
class ListenerRequest:
    topic: str
    caller_phone: str = ""
    requested_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))


@dataclass
class ReadySegment:
    """Metadata for a rendered segment in the ready queue."""
    filepath: str
    segment_type: str  # headlines, deep_dive, listener_request, transition
    priority: int  # 0 = listener request (top), 1 = scheduled
    topic_name: str = ""
    created_at: float = field(default_factory=time.time)


class QueueManager:
    def __init__(self, ready_dir: str, rendering_dir: str):
        self.ready_dir = Path(ready_dir)
        self.rendering_dir = Path(rendering_dir)
        self.ready_dir.mkdir(parents=True, exist_ok=True)
        self.rendering_dir.mkdir(parents=True, exist_ok=True)

        # In-memory request queue (persists only while orchestrator runs)
        self._request_queue: list[ListenerRequest] = []
        self._lock = asyncio.Lock()

    # --- Request Queue (in-memory) ---

    async def add_listener_request(self, topic: str, caller_phone: str = "") -> int:
        """Add a listener request. Returns position in queue (0-based)."""
        async with self._lock:
            request = ListenerRequest(topic=topic, caller_phone=caller_phone)
            self._request_queue.append(request)
            position = len(self._request_queue) - 1
            logger.info(f"Listener request queued at position {position}: '{topic}'")
            return position

    async def pop_listener_request(self) -> Optional[ListenerRequest]:
        """Pop the next listener request (FIFO)."""
        async with self._lock:
            if self._request_queue:
                return self._request_queue.pop(0)
            return None

    def get_request_queue_depth(self) -> int:
        """Number of pending listener requests."""
        return len(self._request_queue)

    def estimate_wait_minutes(self) -> float:
        """Estimate wait for a new request: (queue_depth * 5 min) + 2 min rendering."""
        return (len(self._request_queue) * 5) + 2

    # --- Ready Queue (file-based) ---

    async def push_ready_segment(
        self,
        audio_bytes: bytes,
        segment_type: str,
        priority: int,
        topic_name: str = "",
    ) -> str:
        """
        Write an MP3 file to the ready directory.
        Filename: {priority}_{timestamp_ms}_{type}.mp3
        Priority 0 = listener request (sorts first), 1 = scheduled.
        """
        timestamp = int(time.time() * 1000)
        filename = f"{priority}_{timestamp}_{segment_type}.mp3"
        filepath = self.ready_dir / filename

        filepath.write_bytes(audio_bytes)

        # Write metadata sidecar
        meta = {
            "segment_type": segment_type,
            "priority": priority,
            "topic_name": topic_name,
            "created_at": datetime.now(timezone.utc).isoformat(),
            "size_bytes": len(audio_bytes),
        }
        meta_path = filepath.with_suffix(".json")
        meta_path.write_text(json.dumps(meta))

        logger.info(f"Ready segment: {filename} ({len(audio_bytes) // 1024}KB, priority={priority})")
        return str(filepath)

    def count_ready_segments(self) -> int:
        """Count MP3 files in the ready directory."""
        return len(list(self.ready_dir.glob("*.mp3")))

    def is_buffer_full(self, max_segments: int = 6) -> bool:
        return self.count_ready_segments() >= max_segments

    def get_next_segment_path(self) -> Optional[str]:
        """
        Get the path of the next segment to play (sorted by filename).
        Priority 0 files sort before priority 1.
        """
        files = sorted(self.ready_dir.glob("*.mp3"))
        return str(files[0]) if files else None

    def remove_played_segment(self, filepath: str):
        """Remove a segment and its metadata after it's been played."""
        path = Path(filepath)
        path.unlink(missing_ok=True)
        path.with_suffix(".json").unlink(missing_ok=True)
        logger.debug(f"Removed played segment: {path.name}")

    def list_ready_segments(self) -> list[dict]:
        """List all ready segments with metadata."""
        segments = []
        for mp3 in sorted(self.ready_dir.glob("*.mp3")):
            meta_path = mp3.with_suffix(".json")
            meta = {}
            if meta_path.exists():
                try:
                    meta = json.loads(meta_path.read_text())
                except Exception:
                    pass
            segments.append({
                "filename": mp3.name,
                "filepath": str(mp3),
                "size_bytes": mp3.stat().st_size,
                **meta,
            })
        return segments
