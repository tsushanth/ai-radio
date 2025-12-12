/**
 * Topic Definitions
 * Predefined topics with their content sources
 */

import type { TopicDefinition, TopicCategory } from '../types/topics';

/**
 * Category display names
 */
export const CATEGORY_NAMES: Record<TopicCategory, string> = {
  news: 'News',
  technology: 'Technology',
  business: 'Business',
  science: 'Science',
  lifestyle: 'Lifestyle',
  entertainment: 'Entertainment',
  sports: 'Sports',
};

/**
 * All available topics
 */
export const TOPICS: TopicDefinition[] = [
  // NEWS
  {
    id: 'daily-news',
    name: 'Daily News Brief',
    description: 'Top headlines from around the world',
    icon: 'newspaper.fill',
    color: '#FF6B35',
    category: 'news',
    sources: [
      {
        type: 'rss',
        name: 'BBC World',
        url: 'http://feeds.bbci.co.uk/news/world/rss.xml',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'NPR News',
        url: 'https://feeds.npr.org/1001/rss.xml',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'CBS News',
        url: 'https://www.cbsnews.com/latest/rss/main',
        maxItems: 10,
      },
    ],
    promptContext: 'Focus on the most impactful global stories. Be objective and balanced.',
    targetDurationMinutes: 4,
    isActive: true,
  },
  {
    id: 'us-politics',
    name: 'US Politics',
    description: 'Latest from Washington and Capitol Hill',
    icon: 'building.columns.fill',
    color: '#1E3A5F',
    category: 'news',
    sources: [
      {
        type: 'rss',
        name: 'Politico',
        url: 'https://www.politico.com/rss/politicopicks.xml',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'The Hill',
        url: 'https://thehill.com/feed/',
        maxItems: 10,
      },
      {
        type: 'hackernews',
        name: 'HackerNews Politics',
        keywords: ['congress', 'senate', 'white house', 'election', 'legislation'],
        maxItems: 5,
      },
    ],
    promptContext: 'Cover US political news objectively. Explain policy implications for everyday people.',
    targetDurationMinutes: 4,
    isActive: true,
  },
  {
    id: 'world-update',
    name: 'World Update',
    description: 'International news and global affairs',
    icon: 'globe.americas.fill',
    color: '#2E8B57',
    category: 'news',
    sources: [
      {
        type: 'rss',
        name: 'Al Jazeera',
        url: 'https://www.aljazeera.com/xml/rss/all.xml',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'NPR World',
        url: 'https://feeds.npr.org/1004/rss.xml',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'BBC World',
        url: 'http://feeds.bbci.co.uk/news/world/rss.xml',
        maxItems: 8,
      },
    ],
    promptContext: 'Provide balanced international coverage. Explain context for complex geopolitical situations.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // TECHNOLOGY
  {
    id: 'ai-ml',
    name: 'AI & Machine Learning',
    description: 'Latest in artificial intelligence and ML breakthroughs',
    icon: 'brain.head.profile',
    color: '#9B59B6',
    category: 'technology',
    sources: [
      {
        type: 'hackernews',
        name: 'HackerNews AI',
        keywords: ['AI', 'GPT', 'LLM', 'OpenAI', 'Anthropic', 'Claude', 'Llama', 'machine learning', 'neural network'],
        maxItems: 15,
      },
      {
        type: 'reddit',
        name: 'r/MachineLearning',
        subreddit: 'MachineLearning',
        maxItems: 10,
      },
      {
        type: 'reddit',
        name: 'r/LocalLLaMA',
        subreddit: 'LocalLLaMA',
        maxItems: 8,
      },
      {
        type: 'rss',
        name: 'VentureBeat AI',
        url: 'https://venturebeat.com/category/ai/feed/',
        maxItems: 10,
      },
    ],
    promptContext: 'Make AI news accessible to tech-savvy listeners. Explain implications of new models and research.',
    targetDurationMinutes: 5,
    isActive: true,
  },
  {
    id: 'tech-news',
    name: 'Tech News Daily',
    description: 'Silicon Valley updates and tech industry news',
    icon: 'laptopcomputer',
    color: '#4A90E2',
    category: 'technology',
    sources: [
      {
        type: 'hackernews',
        name: 'HackerNews Top',
        keywords: [],
        maxItems: 15,
      },
      {
        type: 'reddit',
        name: 'r/technology',
        subreddit: 'technology',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'TechCrunch',
        url: 'https://techcrunch.com/feed/',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'The Verge',
        url: 'https://www.theverge.com/rss/index.xml',
        maxItems: 10,
      },
    ],
    promptContext: 'Cover major tech industry moves, product launches, and company news. Be engaging and slightly playful.',
    targetDurationMinutes: 4,
    isActive: true,
  },
  {
    id: 'coding-dev',
    name: 'Code & Coffee',
    description: 'Programming news, releases, and developer culture',
    icon: 'chevron.left.forwardslash.chevron.right',
    color: '#2ECC71',
    category: 'technology',
    sources: [
      {
        type: 'hackernews',
        name: 'HackerNews Dev',
        keywords: ['programming', 'developer', 'release', 'framework', 'library', 'open source', 'github', 'rust', 'python', 'javascript'],
        maxItems: 15,
      },
      {
        type: 'reddit',
        name: 'r/programming',
        subreddit: 'programming',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'Dev.to',
        url: 'https://dev.to/feed',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'InfoQ',
        url: 'https://feed.infoq.com/',
        maxItems: 8,
      },
    ],
    promptContext: 'Cover developer news with enthusiasm. Mention interesting open source projects and language updates.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // BUSINESS
  {
    id: 'startups-vc',
    name: 'Startups & VC',
    description: 'Startup news, funding rounds, and founder stories',
    icon: 'chart.line.uptrend.xyaxis',
    color: '#E67E22',
    category: 'business',
    sources: [
      {
        type: 'rss',
        name: 'TechCrunch Startups',
        url: 'https://techcrunch.com/category/startups/feed/',
        maxItems: 12,
      },
      {
        type: 'hackernews',
        name: 'HackerNews Startups',
        keywords: ['startup', 'YC', 'funding', 'seed', 'series A', 'acquisition', 'IPO', 'founder', 'launch'],
        maxItems: 12,
      },
      {
        type: 'reddit',
        name: 'r/startups',
        subreddit: 'startups',
        maxItems: 8,
      },
      {
        type: 'rss',
        name: 'Crunchbase News',
        url: 'https://news.crunchbase.com/feed/',
        maxItems: 10,
      },
    ],
    promptContext: 'Cover startup ecosystem news. Highlight interesting funding rounds and founder insights.',
    targetDurationMinutes: 4,
    isActive: true,
  },
  {
    id: 'markets-finance',
    name: 'Markets & Finance',
    description: 'Stock market updates and financial news',
    icon: 'dollarsign.circle.fill',
    color: '#27AE60',
    category: 'business',
    sources: [
      {
        type: 'rss',
        name: 'CNBC Top News',
        url: 'https://www.cnbc.com/id/100003114/device/rss/rss.html',
        maxItems: 12,
      },
      {
        type: 'reddit',
        name: 'r/investing',
        subreddit: 'investing',
        maxItems: 8,
      },
      {
        type: 'rss',
        name: 'MarketWatch',
        url: 'https://feeds.marketwatch.com/marketwatch/topstories/',
        maxItems: 12,
      },
      {
        type: 'rss',
        name: 'Yahoo Finance',
        url: 'https://finance.yahoo.com/news/rssindex',
        maxItems: 10,
      },
    ],
    promptContext: 'Provide clear market updates without financial advice. Explain market movements in plain terms.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // SCIENCE
  {
    id: 'space-nasa',
    name: 'Space & NASA',
    description: 'Space exploration, astronomy, and NASA updates',
    icon: 'sparkles',
    color: '#1A1A2E',
    category: 'science',
    sources: [
      {
        type: 'rss',
        name: 'NASA Breaking',
        url: 'https://www.nasa.gov/rss/dyn/breaking_news.rss',
        maxItems: 12,
      },
      {
        type: 'reddit',
        name: 'r/space',
        subreddit: 'space',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'Space.com',
        url: 'https://www.space.com/feeds/all',
        maxItems: 12,
      },
      {
        type: 'hackernews',
        name: 'HackerNews Space',
        keywords: ['space', 'nasa', 'spacex', 'rocket', 'astronomy', 'mars', 'moon', 'satellite'],
        maxItems: 10,
      },
    ],
    promptContext: 'Cover space news with wonder and excitement. Explain scientific concepts clearly.',
    targetDurationMinutes: 4,
    isActive: true,
  },
  {
    id: 'science-discoveries',
    name: 'Science Discoveries',
    description: 'Breakthroughs in science and research',
    icon: 'atom',
    color: '#3498DB',
    category: 'science',
    sources: [
      {
        type: 'rss',
        name: 'Science Daily',
        url: 'https://www.sciencedaily.com/rss/all.xml',
        maxItems: 12,
      },
      {
        type: 'reddit',
        name: 'r/science',
        subreddit: 'science',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'Phys.org',
        url: 'https://phys.org/rss-feed/',
        maxItems: 12,
      },
      {
        type: 'hackernews',
        name: 'HackerNews Science',
        keywords: ['science', 'research', 'study', 'discovery', 'breakthrough', 'physics', 'biology', 'chemistry'],
        maxItems: 10,
      },
    ],
    promptContext: 'Make scientific discoveries accessible and exciting. Explain implications for everyday life.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // LIFESTYLE
  {
    id: 'health-wellness',
    name: 'Health & Wellness',
    description: 'Health tips, medical news, and wellness trends',
    icon: 'heart.fill',
    color: '#E74C3C',
    category: 'lifestyle',
    sources: [
      {
        type: 'rss',
        name: 'WebMD Health',
        url: 'https://rssfeeds.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC',
        maxItems: 12,
      },
      {
        type: 'rss',
        name: 'Healthline',
        url: 'https://www.healthline.com/rss/health-news',
        maxItems: 12,
      },
      {
        type: 'hackernews',
        name: 'HackerNews Health',
        keywords: ['health', 'medicine', 'medical', 'study', 'wellness', 'diet', 'exercise', 'mental health'],
        maxItems: 10,
      },
    ],
    promptContext: 'Share health news responsibly. Cite sources and avoid giving medical advice.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // ENTERTAINMENT
  {
    id: 'gaming',
    name: 'Gaming News',
    description: 'Video game news, releases, and industry updates',
    icon: 'gamecontroller.fill',
    color: '#8E44AD',
    category: 'entertainment',
    sources: [
      {
        type: 'rss',
        name: 'IGN',
        url: 'https://feeds.feedburner.com/ign/news',
        maxItems: 12,
      },
      {
        type: 'reddit',
        name: 'r/Games',
        subreddit: 'Games',
        maxItems: 10,
      },
      {
        type: 'rss',
        name: 'Kotaku',
        url: 'https://kotaku.com/rss',
        maxItems: 10,
      },
      {
        type: 'hackernews',
        name: 'HackerNews Gaming',
        keywords: ['game', 'gaming', 'steam', 'playstation', 'xbox', 'nintendo', 'esports', 'unity', 'unreal'],
        maxItems: 10,
      },
    ],
    promptContext: 'Cover gaming news with enthusiasm. Balance AAA and indie game coverage.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // SPORTS
  {
    id: 'sports-roundup',
    name: 'Sports Roundup',
    description: 'Scores, highlights, and sports news',
    icon: 'sportscourt.fill',
    color: '#F39C12',
    category: 'sports',
    sources: [
      {
        type: 'rss',
        name: 'ESPN Top',
        url: 'https://www.espn.com/espn/rss/news',
        maxItems: 15,
      },
      {
        type: 'rss',
        name: 'CBS Sports',
        url: 'https://www.cbssports.com/rss/headlines/',
        maxItems: 12,
      },
      {
        type: 'rss',
        name: 'Yahoo Sports',
        url: 'https://sports.yahoo.com/rss/',
        maxItems: 10,
      },
    ],
    promptContext: 'Cover major sports stories with energy. Include scores and highlight key performances.',
    targetDurationMinutes: 4,
    isActive: true,
  },
];

/**
 * Get topic by ID
 */
export function getTopicById(id: string): TopicDefinition | undefined {
  return TOPICS.find(t => t.id === id);
}

/**
 * Get active topics
 */
export function getActiveTopics(): TopicDefinition[] {
  return TOPICS.filter(t => t.isActive);
}

/**
 * Get topics by category
 */
export function getTopicsByCategory(category: TopicCategory): TopicDefinition[] {
  return TOPICS.filter(t => t.category === category && t.isActive);
}

/**
 * Get all categories with counts
 */
export function getCategoriesWithCounts(): Array<{
  id: TopicCategory;
  name: string;
  count: number;
}> {
  const categories: TopicCategory[] = [
    'news',
    'technology',
    'business',
    'science',
    'lifestyle',
    'entertainment',
    'sports',
  ];

  return categories.map(cat => ({
    id: cat,
    name: CATEGORY_NAMES[cat],
    count: TOPICS.filter(t => t.category === cat && t.isActive).length,
  }));
}
