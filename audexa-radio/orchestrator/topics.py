"""
Topic Definitions — ported from ai-radio-backend/src/config/topics.ts
"""

from dataclasses import dataclass, field
from typing import Literal, Optional


@dataclass
class ContentSource:
    type: Literal["rss", "hackernews", "reddit"]
    name: str
    url: Optional[str] = None
    subreddit: Optional[str] = None
    keywords: list[str] = field(default_factory=list)
    max_items: int = 10


@dataclass
class TopicDefinition:
    id: str
    name: str
    description: str
    category: str
    sources: list[ContentSource]
    prompt_context: str
    target_duration_minutes: int = 4
    is_active: bool = True


TOPICS: list[TopicDefinition] = [
    # --- NEWS ---
    TopicDefinition(
        id="daily-news",
        name="Daily News Brief",
        description="Top headlines from around the world",
        category="news",
        sources=[
            ContentSource(type="rss", name="BBC World", url="http://feeds.bbci.co.uk/news/world/rss.xml", max_items=10),
            ContentSource(type="rss", name="NPR News", url="https://feeds.npr.org/1001/rss.xml", max_items=10),
            ContentSource(type="rss", name="CBS News", url="https://www.cbsnews.com/latest/rss/main", max_items=10),
        ],
        prompt_context="Focus on the most impactful global stories. Be objective and balanced.",
        target_duration_minutes=4,
    ),
    TopicDefinition(
        id="us-politics",
        name="US Politics",
        description="Latest from Washington and Capitol Hill",
        category="news",
        sources=[
            ContentSource(type="rss", name="Politico", url="https://www.politico.com/rss/politicopicks.xml", max_items=10),
            ContentSource(type="rss", name="The Hill", url="https://thehill.com/feed/", max_items=10),
            ContentSource(type="hackernews", name="HackerNews Politics", keywords=["congress", "senate", "white house", "election", "legislation"], max_items=5),
        ],
        prompt_context="Cover US political news objectively. Explain policy implications for everyday people.",
        target_duration_minutes=4,
    ),
    TopicDefinition(
        id="world-update",
        name="World Update",
        description="International news and global affairs",
        category="news",
        sources=[
            ContentSource(type="rss", name="Al Jazeera", url="https://www.aljazeera.com/xml/rss/all.xml", max_items=10),
            ContentSource(type="rss", name="NPR World", url="https://feeds.npr.org/1004/rss.xml", max_items=10),
            ContentSource(type="rss", name="BBC World", url="http://feeds.bbci.co.uk/news/world/rss.xml", max_items=8),
        ],
        prompt_context="Provide balanced international coverage. Explain context for complex geopolitical situations.",
        target_duration_minutes=4,
    ),

    # --- TECHNOLOGY ---
    TopicDefinition(
        id="ai-ml",
        name="AI & Machine Learning",
        description="Latest in artificial intelligence and ML breakthroughs",
        category="technology",
        sources=[
            ContentSource(type="hackernews", name="HackerNews AI", keywords=["AI", "GPT", "LLM", "OpenAI", "Anthropic", "Claude", "Llama", "machine learning", "neural network"], max_items=15),
            ContentSource(type="reddit", name="r/MachineLearning", subreddit="MachineLearning", max_items=10),
            ContentSource(type="reddit", name="r/LocalLLaMA", subreddit="LocalLLaMA", max_items=8),
            ContentSource(type="rss", name="VentureBeat AI", url="https://venturebeat.com/category/ai/feed/", max_items=10),
        ],
        prompt_context="Make AI news accessible to tech-savvy listeners. Explain implications of new models and research.",
        target_duration_minutes=5,
    ),
    TopicDefinition(
        id="tech-news",
        name="Tech News Daily",
        description="Silicon Valley updates and tech industry news",
        category="technology",
        sources=[
            ContentSource(type="hackernews", name="HackerNews Top", keywords=[], max_items=15),
            ContentSource(type="reddit", name="r/technology", subreddit="technology", max_items=10),
            ContentSource(type="rss", name="TechCrunch", url="https://techcrunch.com/feed/", max_items=10),
            ContentSource(type="rss", name="The Verge", url="https://www.theverge.com/rss/index.xml", max_items=10),
        ],
        prompt_context="Cover major tech industry moves, product launches, and company news. Be engaging and slightly playful.",
        target_duration_minutes=4,
    ),
    TopicDefinition(
        id="coding-dev",
        name="Code & Coffee",
        description="Programming news, releases, and developer culture",
        category="technology",
        sources=[
            ContentSource(type="hackernews", name="HackerNews Dev", keywords=["programming", "developer", "release", "framework", "library", "open source", "github", "rust", "python", "javascript"], max_items=15),
            ContentSource(type="reddit", name="r/programming", subreddit="programming", max_items=10),
            ContentSource(type="rss", name="Dev.to", url="https://dev.to/feed", max_items=10),
            ContentSource(type="rss", name="InfoQ", url="https://feed.infoq.com/", max_items=8),
        ],
        prompt_context="Cover developer news with enthusiasm. Mention interesting open source projects and language updates.",
        target_duration_minutes=4,
    ),

    # --- BUSINESS ---
    TopicDefinition(
        id="startups-vc",
        name="Startups & VC",
        description="Startup news, funding rounds, and founder stories",
        category="business",
        sources=[
            ContentSource(type="rss", name="TechCrunch Startups", url="https://techcrunch.com/category/startups/feed/", max_items=12),
            ContentSource(type="hackernews", name="HackerNews Startups", keywords=["startup", "YC", "funding", "seed", "series A", "acquisition", "IPO", "founder", "launch"], max_items=12),
            ContentSource(type="reddit", name="r/startups", subreddit="startups", max_items=8),
            ContentSource(type="rss", name="Crunchbase News", url="https://news.crunchbase.com/feed/", max_items=10),
        ],
        prompt_context="Cover startup ecosystem news. Highlight interesting funding rounds and founder insights.",
        target_duration_minutes=4,
    ),
    TopicDefinition(
        id="markets-finance",
        name="Markets & Finance",
        description="Stock market updates and financial news",
        category="business",
        sources=[
            ContentSource(type="rss", name="CNBC Top News", url="https://www.cnbc.com/id/100003114/device/rss/rss.html", max_items=12),
            ContentSource(type="reddit", name="r/investing", subreddit="investing", max_items=8),
            ContentSource(type="rss", name="MarketWatch", url="https://feeds.marketwatch.com/marketwatch/topstories/", max_items=12),
            ContentSource(type="rss", name="Yahoo Finance", url="https://finance.yahoo.com/news/rssindex", max_items=10),
        ],
        prompt_context="Provide clear market updates without financial advice. Explain market movements in plain terms.",
        target_duration_minutes=4,
    ),

    # --- SCIENCE ---
    TopicDefinition(
        id="space-nasa",
        name="Space & NASA",
        description="Space exploration, astronomy, and NASA updates",
        category="science",
        sources=[
            ContentSource(type="rss", name="NASA Breaking", url="https://www.nasa.gov/rss/dyn/breaking_news.rss", max_items=12),
            ContentSource(type="reddit", name="r/space", subreddit="space", max_items=10),
            ContentSource(type="rss", name="Space.com", url="https://www.space.com/feeds/all", max_items=12),
            ContentSource(type="hackernews", name="HackerNews Space", keywords=["space", "nasa", "spacex", "rocket", "astronomy", "mars", "moon", "satellite"], max_items=10),
        ],
        prompt_context="Cover space news with wonder and excitement. Explain scientific concepts clearly.",
        target_duration_minutes=4,
    ),
    TopicDefinition(
        id="science-discoveries",
        name="Science Discoveries",
        description="Breakthroughs in science and research",
        category="science",
        sources=[
            ContentSource(type="rss", name="Science Daily", url="https://www.sciencedaily.com/rss/all.xml", max_items=12),
            ContentSource(type="reddit", name="r/science", subreddit="science", max_items=10),
            ContentSource(type="rss", name="Phys.org", url="https://phys.org/rss-feed/", max_items=12),
            ContentSource(type="hackernews", name="HackerNews Science", keywords=["science", "research", "study", "discovery", "breakthrough", "physics", "biology", "chemistry"], max_items=10),
        ],
        prompt_context="Make scientific discoveries accessible and exciting. Explain implications for everyday life.",
        target_duration_minutes=4,
    ),

    # --- LIFESTYLE ---
    TopicDefinition(
        id="health-wellness",
        name="Health & Wellness",
        description="Health tips, medical news, and wellness trends",
        category="lifestyle",
        sources=[
            ContentSource(type="rss", name="Medical News Today", url="https://www.medicalnewstoday.com/newsfeeds/rss/medical_news.xml", max_items=12),
            ContentSource(type="rss", name="NIH News", url="https://www.nih.gov/news-events/news-releases/feed", max_items=10),
            ContentSource(type="reddit", name="r/health", subreddit="health", max_items=10),
            ContentSource(type="hackernews", name="HackerNews Health", keywords=["health", "medicine", "medical", "study", "wellness", "diet", "exercise", "mental health"], max_items=10),
        ],
        prompt_context="Share health news responsibly. Cite sources and avoid giving medical advice.",
        target_duration_minutes=4,
    ),

    # --- ENTERTAINMENT ---
    TopicDefinition(
        id="gaming",
        name="Gaming News",
        description="Video game news, releases, and industry updates",
        category="entertainment",
        sources=[
            ContentSource(type="rss", name="IGN", url="https://feeds.feedburner.com/ign/news", max_items=12),
            ContentSource(type="reddit", name="r/Games", subreddit="Games", max_items=10),
            ContentSource(type="rss", name="Kotaku", url="https://kotaku.com/rss", max_items=10),
            ContentSource(type="hackernews", name="HackerNews Gaming", keywords=["game", "gaming", "steam", "playstation", "xbox", "nintendo", "esports", "unity", "unreal"], max_items=10),
        ],
        prompt_context="Cover gaming news with enthusiasm. Balance AAA and indie game coverage.",
        target_duration_minutes=4,
    ),

    # --- SPORTS ---
    TopicDefinition(
        id="sports-roundup",
        name="Sports Roundup",
        description="Scores, highlights, and sports news",
        category="sports",
        sources=[
            ContentSource(type="rss", name="ESPN Top", url="https://www.espn.com/espn/rss/news", max_items=15),
            ContentSource(type="rss", name="CBS Sports", url="https://www.cbssports.com/rss/headlines/", max_items=12),
            ContentSource(type="rss", name="Yahoo Sports", url="https://sports.yahoo.com/rss/", max_items=10),
        ],
        prompt_context="Cover major sports stories with energy. Include scores and highlight key performances.",
        target_duration_minutes=4,
    ),
]


def get_topic_by_id(topic_id: str) -> TopicDefinition | None:
    return next((t for t in TOPICS if t.id == topic_id), None)


def get_active_topics() -> list[TopicDefinition]:
    return [t for t in TOPICS if t.is_active]


def get_topics_by_category(category: str) -> list[TopicDefinition]:
    return [t for t in TOPICS if t.category == category and t.is_active]
