"""
Topic Scheduler — rotates through topics and alternates segment types.
"""

import logging
from datetime import datetime, timezone
from typing import Literal

from topics import TopicDefinition, get_active_topics

logger = logging.getLogger(__name__)

SegmentType = Literal["headlines", "deep_dive"]


class TopicScheduler:
    def __init__(self, topics: list[TopicDefinition] | None = None):
        self.topics = topics or get_active_topics()
        self._topic_index = 0
        self._segment_toggle = False  # False=headlines, True=deep_dive
        self._last_used: dict[str, datetime] = {}

    def next_topic(self) -> TopicDefinition:
        """Get the next topic in rotation, skipping recently used ones."""
        now = datetime.now(timezone.utc)
        attempts = 0

        while attempts < len(self.topics):
            topic = self.topics[self._topic_index]
            self._topic_index = (self._topic_index + 1) % len(self.topics)

            # Skip if used within last 20 minutes
            last = self._last_used.get(topic.id)
            if last and (now - last).total_seconds() < 1200:
                attempts += 1
                continue

            self._last_used[topic.id] = now
            logger.info(f"Next topic: {topic.name} ({topic.category})")
            return topic

        # All topics used recently — just return the next one
        topic = self.topics[self._topic_index]
        self._topic_index = (self._topic_index + 1) % len(self.topics)
        self._last_used[topic.id] = now
        return topic

    def next_segment_type(self) -> SegmentType:
        """Alternate between headlines and deep_dive."""
        self._segment_toggle = not self._segment_toggle
        seg_type: SegmentType = "deep_dive" if self._segment_toggle else "headlines"
        return seg_type

    def reset(self):
        """Reset the scheduler state."""
        self._topic_index = 0
        self._segment_toggle = False
        self._last_used.clear()
