"""
Topic Definitions with regional source variants.

Each TopicDefinition can have region-specific ContentSource overrides.
When a region is set in config, sources are swapped for local ones.
Falls back to default (US) sources for any unsupported region.
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
    sources: list[ContentSource]               # default (US/global) sources
    prompt_context: str
    target_duration_minutes: int = 4
    is_active: bool = True
    # Optional per-region source overrides — keyed by region code (uk, in, au, ca, de, ...)
    regional_sources: dict[str, list[ContentSource]] = field(default_factory=dict)


def get_sources_for_region(topic: "TopicDefinition", region: str) -> list[ContentSource]:
    """Return region-appropriate sources, falling back to default."""
    if region and region in topic.regional_sources:
        return topic.regional_sources[region]
    return topic.sources


TOPICS: list[TopicDefinition] = [

    # ── NEWS ──────────────────────────────────────────────────────────────────

    TopicDefinition(
        id="daily-news",
        name="Daily News Brief",
        description="Top headlines from around the world",
        category="news",
        sources=[
            ContentSource(type="rss", name="BBC World", url="http://feeds.bbci.co.uk/news/world/rss.xml", max_items=10),
            ContentSource(type="rss", name="NPR News", url="https://feeds.npr.org/1001/rss.xml", max_items=10),
            ContentSource(type="rss", name="CBS News", url="https://www.cbsnews.com/latest/rss/main", max_items=10),
            ContentSource(type="rss", name="AP News", url="https://rsshub.app/apnews/topics/apf-topnews", max_items=10),
        ],
        prompt_context="Focus on the most impactful global stories. Be objective and balanced.",
        target_duration_minutes=4,
        regional_sources={
            "uk": [
                ContentSource(type="rss", name="BBC UK", url="http://feeds.bbci.co.uk/news/uk/rss.xml", max_items=12),
                ContentSource(type="rss", name="The Guardian UK", url="https://www.theguardian.com/uk/rss", max_items=10),
                ContentSource(type="rss", name="The Independent", url="https://www.independent.co.uk/news/uk/rss", max_items=10),
                ContentSource(type="rss", name="Sky News", url="https://feeds.skynews.com/feeds/rss/uk.xml", max_items=8),
            ],
            "in": [
                ContentSource(type="rss", name="The Hindu", url="https://www.thehindu.com/feeder/default.rss", max_items=12),
                ContentSource(type="rss", name="NDTV", url="https://feeds.feedburner.com/ndtvnews-top-stories", max_items=10),
                ContentSource(type="rss", name="Times of India", url="https://timesofindia.indiatimes.com/rssfeedstopstories.cms", max_items=10),
                ContentSource(type="rss", name="Indian Express", url="https://indianexpress.com/feed/", max_items=8),
            ],
            "au": [
                ContentSource(type="rss", name="ABC News AU", url="https://www.abc.net.au/news/feed/51120/rss.xml", max_items=12),
                ContentSource(type="rss", name="Sydney Morning Herald", url="https://www.smh.com.au/rss/feed.xml", max_items=10),
                ContentSource(type="rss", name="The Australian", url="https://www.theaustralian.com.au/feed", max_items=10),
            ],
            "ca": [
                ContentSource(type="rss", name="CBC News", url="https://www.cbc.ca/cmlink/rss-topstories", max_items=12),
                ContentSource(type="rss", name="Globe and Mail", url="https://www.theglobeandmail.com/arc/outboundfeeds/rss/category/canada/", max_items=10),
                ContentSource(type="rss", name="Toronto Star", url="https://www.thestar.com/content/thestar/feed.RSSManagerServlet.articles.topstories.rss", max_items=10),
            ],
            "de": [
                ContentSource(type="rss", name="Der Spiegel", url="https://www.spiegel.de/schlagzeilen/tops/index.rss", max_items=12),
                ContentSource(type="rss", name="DW News", url="https://rss.dw.com/rdf/rss-en-all", max_items=10),
                ContentSource(type="rss", name="Deutsche Welle", url="https://rss.dw.com/rdf/rss-en-ger", max_items=10),
            ],
            "fr": [
                ContentSource(type="rss", name="Le Monde", url="https://www.lemonde.fr/rss/une.xml", max_items=12),
                ContentSource(type="rss", name="France 24", url="https://www.france24.com/en/rss", max_items=10),
                ContentSource(type="rss", name="RFI", url="https://www.rfi.fr/en/rss", max_items=10),
            ],
            "br": [
                ContentSource(type="rss", name="G1 Globo", url="https://g1.globo.com/rss/g1/index.xml", max_items=12),
                ContentSource(type="rss", name="Folha de S.Paulo", url="https://feeds.folha.uol.com.br/emcimadahora/rss091.xml", max_items=10),
                ContentSource(type="rss", name="BBC Brasil", url="https://www.bbc.com/portuguese/index.xml", max_items=10),
            ],
            "ae": [
                ContentSource(type="rss", name="Al Jazeera", url="https://www.aljazeera.com/xml/rss/all.xml", max_items=12),
                ContentSource(type="rss", name="Gulf News", url="https://gulfnews.com/rss", max_items=10),
                ContentSource(type="rss", name="The National UAE", url="https://www.thenationalnews.com/rss", max_items=10),
            ],
            "sg": [
                ContentSource(type="rss", name="Channel NewsAsia", url="https://www.channelnewsasia.com/rssfeeds/8395744", max_items=12),
                ContentSource(type="rss", name="Straits Times", url="https://www.straitstimes.com/news/singapore/rss.xml", max_items=10),
                ContentSource(type="rss", name="Today Singapore", url="https://www.todayonline.com/feed", max_items=10),
            ],
        }
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
            ContentSource(type="rss", name="Reuters World", url="https://feeds.reuters.com/Reuters/worldNews", max_items=10),
        ],
        prompt_context="Provide balanced international coverage. Explain context for complex geopolitical situations.",
        target_duration_minutes=4,
    ),

    # ── TECHNOLOGY ────────────────────────────────────────────────────────────

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
        regional_sources={
            "in": [
                ContentSource(type="rss", name="Economic Times Tech", url="https://economictimes.indiatimes.com/tech/rss.cms", max_items=12),
                ContentSource(type="rss", name="TechCrunch", url="https://techcrunch.com/feed/", max_items=10),
                ContentSource(type="hackernews", name="HackerNews Top", keywords=[], max_items=12),
                ContentSource(type="reddit", name="r/india", subreddit="india", max_items=8),
            ],
        }
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

    # ── BUSINESS ─────────────────────────────────────────────────────────────

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
        regional_sources={
            "in": [
                ContentSource(type="rss", name="YourStory", url="https://yourstory.com/feed", max_items=12),
                ContentSource(type="rss", name="Inc42", url="https://inc42.com/feed/", max_items=10),
                ContentSource(type="rss", name="TechCrunch India", url="https://techcrunch.com/feed/", max_items=10),
                ContentSource(type="reddit", name="r/india", subreddit="india", max_items=8),
            ],
            "uk": [
                ContentSource(type="rss", name="Tech.eu", url="https://tech.eu/feed/", max_items=12),
                ContentSource(type="rss", name="Sifted", url="https://sifted.eu/feed/", max_items=10),
                ContentSource(type="rss", name="TechCrunch", url="https://techcrunch.com/feed/", max_items=10),
            ],
        }
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
        regional_sources={
            "uk": [
                ContentSource(type="rss", name="Financial Times", url="https://www.ft.com/rss/home", max_items=12),
                ContentSource(type="rss", name="The Economist", url="https://www.economist.com/finance-and-economics/rss.xml", max_items=10),
                ContentSource(type="rss", name="BBC Business", url="http://feeds.bbci.co.uk/news/business/rss.xml", max_items=10),
            ],
            "in": [
                ContentSource(type="rss", name="Economic Times Markets", url="https://economictimes.indiatimes.com/markets/rss.cms", max_items=12),
                ContentSource(type="rss", name="Mint", url="https://www.livemint.com/rss/markets", max_items=10),
                ContentSource(type="rss", name="Business Standard", url="https://www.business-standard.com/rss/home_page_top_stories.rss", max_items=10),
            ],
        }
    ),

    # ── SCIENCE ───────────────────────────────────────────────────────────────

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

    # ── LIFESTYLE ─────────────────────────────────────────────────────────────

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

    # ── ENTERTAINMENT ─────────────────────────────────────────────────────────

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

    # ── SPORTS ────────────────────────────────────────────────────────────────

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
        regional_sources={
            "uk": [
                ContentSource(type="rss", name="BBC Sport", url="http://feeds.bbci.co.uk/sport/rss.xml", max_items=15),
                ContentSource(type="rss", name="Sky Sports", url="https://www.skysports.com/rss/12040", max_items=12),
                ContentSource(type="rss", name="The Guardian Sport", url="https://www.theguardian.com/sport/rss", max_items=10),
            ],
            "in": [
                ContentSource(type="rss", name="ESPN Cricinfo", url="https://www.espncricinfo.com/rss/content/story/feeds/0.xml", max_items=12),
                ContentSource(type="rss", name="Times of India Sports", url="https://timesofindia.indiatimes.com/rssfeeds/-2128821144.cms", max_items=12),
                ContentSource(type="rss", name="Sportskeeda", url="https://www.sportskeeda.com/feed", max_items=10),
            ],
            "au": [
                ContentSource(type="rss", name="Fox Sports AU", url="https://www.foxsports.com.au/feeds/latest-news.xml", max_items=12),
                ContentSource(type="rss", name="ABC Sport AU", url="https://www.abc.net.au/news/sport/feed/51892/rss.xml", max_items=12),
            ],
        }
    ),
]


def get_topic_by_id(topic_id: str) -> TopicDefinition | None:
    return next((t for t in TOPICS if t.id == topic_id), None)


def get_active_topics() -> list[TopicDefinition]:
    return [t for t in TOPICS if t.is_active]


def get_topics_by_category(category: str) -> list[TopicDefinition]:
    return [t for t in TOPICS if t.category == category and t.is_active]
