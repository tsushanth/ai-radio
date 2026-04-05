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
    languages: ['all'],
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
    languages: ['en'],
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
    languages: ['all'],
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
    languages: ['all'],
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
    languages: ['all'],
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
    languages: ['all'],
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
    languages: ['all'],
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
    languages: ['all'],
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
    languages: ['all'],
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
    languages: ['all'],
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
        name: 'Medical News Today',
        url: 'https://www.medicalnewstoday.com/newsfeeds/rss/medical_news.xml',
        maxItems: 12,
      },
      {
        type: 'rss',
        name: 'NIH News',
        url: 'https://www.nih.gov/news-events/news-releases/feed',
        maxItems: 10,
      },
      {
        type: 'reddit',
        name: 'r/health',
        subreddit: 'health',
        maxItems: 10,
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
    languages: ['all'],
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
    languages: ['all'],
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
    languages: ['en'],
  },

  // SPANISH
  {
    id: 'noticias-latinoamerica',
    name: 'Latinoamérica Hoy',
    description: 'Noticias principales de América Latina',
    icon: 'globe.americas.fill',
    color: '#E74C3C',
    category: 'news',
    languages: ['es'],
    localizedNames: { es: 'Latinoamérica Hoy' },
    localizedDescriptions: { es: 'Noticias principales de América Latina' },
    sources: [
      { type: 'rss', name: 'BBC Mundo', url: 'https://feeds.bbci.co.uk/mundo/rss.xml', maxItems: 12 },
      { type: 'rss', name: 'El País', url: 'https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada', maxItems: 10 },
    ],
    promptContext: 'Cover Latin American news. Focus on regional politics, economy, and culture.',
    targetDurationMinutes: 4,
    isActive: true,
  },
  {
    id: 'futbol-mundial',
    name: 'Fútbol Mundial',
    description: 'Resultados y noticias del fútbol mundial',
    icon: 'sportscourt.fill',
    color: '#27AE60',
    category: 'sports',
    languages: ['es', 'pt'],
    localizedNames: { es: 'Fútbol Mundial', pt: 'Futebol Mundial' },
    localizedDescriptions: { es: 'Resultados y noticias del fútbol mundial', pt: 'Resultados e notícias do futebol mundial' },
    sources: [
      { type: 'rss', name: 'Marca', url: 'https://e00-marca.uecdn.es/rss/futbol/futbol-internacional.xml', maxItems: 12 },
      { type: 'rss', name: 'AS', url: 'https://as.com/rss/tags/ultimas_noticias.xml', maxItems: 10 },
    ],
    promptContext: 'Cover world football/soccer news with passion. Include La Liga, Premier League, Champions League, and Latin American leagues.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // FRENCH
  {
    id: 'actualites-france',
    name: 'Actualités France',
    description: "L'essentiel de l'actualité française",
    icon: 'newspaper.fill',
    color: '#3498DB',
    category: 'news',
    languages: ['fr'],
    localizedNames: { fr: 'Actualités France' },
    localizedDescriptions: { fr: "L'essentiel de l'actualité française" },
    sources: [
      { type: 'rss', name: 'Le Monde', url: 'https://www.lemonde.fr/rss/une.xml', maxItems: 12 },
      { type: 'rss', name: 'France 24', url: 'https://www.france24.com/fr/rss', maxItems: 10 },
    ],
    promptContext: 'Cover French news comprehensively. Include politics, culture, and society.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // GERMAN
  {
    id: 'nachrichten-deutschland',
    name: 'Nachrichten Deutschland',
    description: 'Die wichtigsten Nachrichten aus Deutschland',
    icon: 'newspaper.fill',
    color: '#F39C12',
    category: 'news',
    languages: ['de'],
    localizedNames: { de: 'Nachrichten Deutschland' },
    localizedDescriptions: { de: 'Die wichtigsten Nachrichten aus Deutschland' },
    sources: [
      { type: 'rss', name: 'Tagesschau', url: 'https://www.tagesschau.de/xml/rss2/', maxItems: 12 },
      { type: 'rss', name: 'Spiegel', url: 'https://www.spiegel.de/schlagzeilen/index.rss', maxItems: 10 },
    ],
    promptContext: 'Cover German news. Include politics, economy, and European affairs.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // PORTUGUESE (Brazil)
  {
    id: 'noticias-brasil',
    name: 'Notícias do Brasil',
    description: 'As principais notícias do Brasil',
    icon: 'newspaper.fill',
    color: '#2ECC71',
    category: 'news',
    languages: ['pt'],
    localizedNames: { pt: 'Notícias do Brasil' },
    localizedDescriptions: { pt: 'As principais notícias do Brasil' },
    sources: [
      { type: 'rss', name: 'G1 Globo', url: 'https://g1.globo.com/rss/g1/', maxItems: 12 },
      { type: 'rss', name: 'Folha', url: 'https://feeds.folha.uol.com.br/folha/emcimadahora/rss091.xml', maxItems: 10 },
    ],
    promptContext: 'Cover Brazilian news. Include politics, economy, culture, and sports.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // JAPANESE
  {
    id: 'nihon-news',
    name: '日本ニュース',
    description: '日本の最新ニュース',
    icon: 'newspaper.fill',
    color: '#E74C3C',
    category: 'news',
    languages: ['ja'],
    localizedNames: { ja: '日本ニュース' },
    localizedDescriptions: { ja: '日本の最新ニュース' },
    sources: [
      { type: 'rss', name: 'NHK News', url: 'https://www3.nhk.or.jp/rss/news/cat0.xml', maxItems: 12 },
      { type: 'rss', name: 'Japan Times', url: 'https://www.japantimes.co.jp/feed/', maxItems: 10 },
    ],
    promptContext: 'Cover Japanese news. Include domestic politics, economy, technology, and culture.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // KOREAN
  {
    id: 'hanguk-news',
    name: '한국 뉴스',
    description: '한국의 주요 뉴스',
    icon: 'newspaper.fill',
    color: '#1E3A5F',
    category: 'news',
    languages: ['ko'],
    localizedNames: { ko: '한국 뉴스' },
    localizedDescriptions: { ko: '한국의 주요 뉴스' },
    sources: [
      { type: 'rss', name: 'Yonhap News', url: 'https://en.yna.co.kr/RSS/news.xml', maxItems: 12 },
      { type: 'rss', name: 'Korea Herald', url: 'http://www.koreaherald.com/common/rss_xml.php?ct=102', maxItems: 10 },
    ],
    promptContext: 'Cover Korean news. Include domestic politics, K-culture, technology, and economy.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // HINDI
  {
    id: 'bharat-samachar',
    name: 'भारत समाचार',
    description: 'भारत की ताज़ा खबरें',
    icon: 'newspaper.fill',
    color: '#FF9933',
    category: 'news',
    languages: ['hi'],
    localizedNames: { hi: 'भारत समाचार' },
    localizedDescriptions: { hi: 'भारत की ताज़ा खबरें' },
    sources: [
      { type: 'rss', name: 'NDTV', url: 'https://feeds.feedburner.com/ndtvnews-top-stories', maxItems: 12 },
      { type: 'rss', name: 'Times of India', url: 'https://timesofindia.indiatimes.com/rssfeedstopstories.cms', maxItems: 10 },
    ],
    promptContext: 'Cover Indian news. Include politics, economy, technology, cricket, and Bollywood.',
    targetDurationMinutes: 4,
    isActive: true,
  },
  {
    id: 'cricket-updates',
    name: 'Cricket Updates',
    description: 'Latest cricket scores and news',
    icon: 'sportscourt.fill',
    color: '#138808',
    category: 'sports',
    languages: ['hi', 'en'],
    localizedNames: { hi: 'क्रिकेट अपडेट', en: 'Cricket Updates' },
    localizedDescriptions: { hi: 'क्रिकेट के ताज़ा स्कोर और खबरें', en: 'Latest cricket scores and news' },
    sources: [
      { type: 'rss', name: 'ESPNcricinfo', url: 'https://www.espncricinfo.com/rss/content/story/feeds/0.xml', maxItems: 12 },
      { type: 'rss', name: 'Cricbuzz', url: 'https://www.cricbuzz.com/cb-rss/cb-top-stories', maxItems: 10 },
    ],
    promptContext: 'Cover cricket news with enthusiasm. Include IPL, international matches, and player updates.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // CHINESE
  {
    id: 'zhongguo-xinwen',
    name: '中国新闻',
    description: '中国和亚洲的最新新闻',
    icon: 'newspaper.fill',
    color: '#DE2910',
    category: 'news',
    languages: ['zh'],
    localizedNames: { zh: '中国新闻' },
    localizedDescriptions: { zh: '中国和亚洲的最新新闻' },
    sources: [
      { type: 'rss', name: 'BBC Chinese', url: 'https://feeds.bbci.co.uk/zhongwen/simp/rss.xml', maxItems: 12 },
      { type: 'rss', name: 'South China Morning Post', url: 'https://www.scmp.com/rss/91/feed', maxItems: 10 },
    ],
    promptContext: 'Cover Chinese and East Asian news. Include technology, economy, and culture.',
    targetDurationMinutes: 4,
    isActive: true,
  },

  // ITALIAN
  {
    id: 'notizie-italia',
    name: 'Notizie Italia',
    description: "Le ultime notizie dall'Italia",
    icon: 'newspaper.fill',
    color: '#009246',
    category: 'news',
    languages: ['it'],
    localizedNames: { it: 'Notizie Italia' },
    localizedDescriptions: { it: "Le ultime notizie dall'Italia" },
    sources: [
      { type: 'rss', name: 'ANSA', url: 'https://www.ansa.it/sito/ansait_rss.xml', maxItems: 12 },
      { type: 'rss', name: 'La Repubblica', url: 'https://www.repubblica.it/rss/homepage/rss2.0.xml', maxItems: 10 },
    ],
    promptContext: 'Cover Italian news. Include politics, culture, Serie A football, and European affairs.',
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
