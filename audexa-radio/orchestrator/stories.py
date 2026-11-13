"""Story data types shared by the content fetcher, the Exa client and the source cache."""

from dataclasses import dataclass, field
from datetime import datetime, timezone
from typing import Optional


@dataclass
class AggregatedStory:
    title: str
    source: str
    source_type: str  # "rss", "hackernews", "reddit", "exa"
    summary: Optional[str] = None
    url: Optional[str] = None
    score: int = 0
    comment_count: int = 0
    published_at: Optional[datetime] = None
    author: Optional[str] = None
    # True when the body text is known to be cut short by the publisher (the script must not claim more than it says)
    partial: bool = False


@dataclass
class TopicContent:
    topic_id: str
    date: str
    stories: list[AggregatedStory]
    fetched_at: datetime = field(default_factory=lambda: datetime.now(timezone.utc))
    total_sources: int = 0
    successful_sources: int = 0
    # Which link of the chain produced the stories: "exa", "feeds", "cache" or "partial" (fewer than the minimum, nothing better)
    tier: str = "feeds"
