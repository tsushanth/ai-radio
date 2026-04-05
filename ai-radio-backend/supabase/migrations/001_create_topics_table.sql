-- Migration: Create topics table
-- Migrates hardcoded topic definitions to a Supabase table

CREATE TABLE IF NOT EXISTS topics (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT NOT NULL,
  icon TEXT NOT NULL,
  color TEXT NOT NULL,
  category TEXT NOT NULL CHECK (category IN ('news', 'technology', 'business', 'science', 'lifestyle', 'entertainment', 'sports')),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  prompt_context TEXT NOT NULL DEFAULT '',
  target_duration_minutes INTEGER NOT NULL DEFAULT 4,
  is_active BOOLEAN NOT NULL DEFAULT true,
  languages JSONB NOT NULL DEFAULT '["all"]'::jsonb,
  localized_names JSONB DEFAULT NULL,
  localized_descriptions JSONB DEFAULT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Index for filtering by category and active status
CREATE INDEX IF NOT EXISTS idx_topics_category ON topics (category);
CREATE INDEX IF NOT EXISTS idx_topics_is_active ON topics (is_active);

-- Auto-update updated_at on row change
CREATE OR REPLACE FUNCTION update_topics_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER topics_updated_at
  BEFORE UPDATE ON topics
  FOR EACH ROW
  EXECUTE FUNCTION update_topics_updated_at();

-- RLS: Enable row-level security
ALTER TABLE topics ENABLE ROW LEVEL SECURITY;

-- Public read access (anyone can list topics)
CREATE POLICY "Allow public read access on topics"
  ON topics
  FOR SELECT
  USING (true);

-- Service role can do everything (inserts/updates from backend)
CREATE POLICY "Allow service role full access on topics"
  ON topics
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

-- Seed data: insert all existing hardcoded topics

INSERT INTO topics (id, name, description, icon, color, category, sources, prompt_context, target_duration_minutes, is_active, languages, localized_names, localized_descriptions) VALUES

-- NEWS
('daily-news', 'Daily News Brief', 'Top headlines from around the world', 'newspaper.fill', '#FF6B35', 'news',
 '[{"type":"rss","name":"BBC World","url":"http://feeds.bbci.co.uk/news/world/rss.xml","maxItems":10},{"type":"rss","name":"NPR News","url":"https://feeds.npr.org/1001/rss.xml","maxItems":10},{"type":"rss","name":"CBS News","url":"https://www.cbsnews.com/latest/rss/main","maxItems":10}]'::jsonb,
 'Focus on the most impactful global stories. Be objective and balanced.', 4, true, '["all"]'::jsonb, NULL, NULL),

('us-politics', 'US Politics', 'Latest from Washington and Capitol Hill', 'building.columns.fill', '#1E3A5F', 'news',
 '[{"type":"rss","name":"Politico","url":"https://www.politico.com/rss/politicopicks.xml","maxItems":10},{"type":"rss","name":"The Hill","url":"https://thehill.com/feed/","maxItems":10},{"type":"hackernews","name":"HackerNews Politics","keywords":["congress","senate","white house","election","legislation"],"maxItems":5}]'::jsonb,
 'Cover US political news objectively. Explain policy implications for everyday people.', 4, true, '["en"]'::jsonb, NULL, NULL),

('world-update', 'World Update', 'International news and global affairs', 'globe.americas.fill', '#2E8B57', 'news',
 '[{"type":"rss","name":"Al Jazeera","url":"https://www.aljazeera.com/xml/rss/all.xml","maxItems":10},{"type":"rss","name":"NPR World","url":"https://feeds.npr.org/1004/rss.xml","maxItems":10},{"type":"rss","name":"BBC World","url":"http://feeds.bbci.co.uk/news/world/rss.xml","maxItems":8}]'::jsonb,
 'Provide balanced international coverage. Explain context for complex geopolitical situations.', 4, true, '["all"]'::jsonb, NULL, NULL),

-- TECHNOLOGY
('ai-ml', 'AI & Machine Learning', 'Latest in artificial intelligence and ML breakthroughs', 'brain.head.profile', '#9B59B6', 'technology',
 '[{"type":"hackernews","name":"HackerNews AI","keywords":["AI","GPT","LLM","OpenAI","Anthropic","Claude","Llama","machine learning","neural network"],"maxItems":15},{"type":"reddit","name":"r/MachineLearning","subreddit":"MachineLearning","maxItems":10},{"type":"reddit","name":"r/LocalLLaMA","subreddit":"LocalLLaMA","maxItems":8},{"type":"rss","name":"VentureBeat AI","url":"https://venturebeat.com/category/ai/feed/","maxItems":10}]'::jsonb,
 'Make AI news accessible to tech-savvy listeners. Explain implications of new models and research.', 5, true, '["all"]'::jsonb, NULL, NULL),

('tech-news', 'Tech News Daily', 'Silicon Valley updates and tech industry news', 'laptopcomputer', '#4A90E2', 'technology',
 '[{"type":"hackernews","name":"HackerNews Top","keywords":[],"maxItems":15},{"type":"reddit","name":"r/technology","subreddit":"technology","maxItems":10},{"type":"rss","name":"TechCrunch","url":"https://techcrunch.com/feed/","maxItems":10},{"type":"rss","name":"The Verge","url":"https://www.theverge.com/rss/index.xml","maxItems":10}]'::jsonb,
 'Cover major tech industry moves, product launches, and company news. Be engaging and slightly playful.', 4, true, '["all"]'::jsonb, NULL, NULL),

('coding-dev', 'Code & Coffee', 'Programming news, releases, and developer culture', 'chevron.left.forwardslash.chevron.right', '#2ECC71', 'technology',
 '[{"type":"hackernews","name":"HackerNews Dev","keywords":["programming","developer","release","framework","library","open source","github","rust","python","javascript"],"maxItems":15},{"type":"reddit","name":"r/programming","subreddit":"programming","maxItems":10},{"type":"rss","name":"Dev.to","url":"https://dev.to/feed","maxItems":10},{"type":"rss","name":"InfoQ","url":"https://feed.infoq.com/","maxItems":8}]'::jsonb,
 'Cover developer news with enthusiasm. Mention interesting open source projects and language updates.', 4, true, '["all"]'::jsonb, NULL, NULL),

-- BUSINESS
('startups-vc', 'Startups & VC', 'Startup news, funding rounds, and founder stories', 'chart.line.uptrend.xyaxis', '#E67E22', 'business',
 '[{"type":"rss","name":"TechCrunch Startups","url":"https://techcrunch.com/category/startups/feed/","maxItems":12},{"type":"hackernews","name":"HackerNews Startups","keywords":["startup","YC","funding","seed","series A","acquisition","IPO","founder","launch"],"maxItems":12},{"type":"reddit","name":"r/startups","subreddit":"startups","maxItems":8},{"type":"rss","name":"Crunchbase News","url":"https://news.crunchbase.com/feed/","maxItems":10}]'::jsonb,
 'Cover startup ecosystem news. Highlight interesting funding rounds and founder insights.', 4, true, '["all"]'::jsonb, NULL, NULL),

('markets-finance', 'Markets & Finance', 'Stock market updates and financial news', 'dollarsign.circle.fill', '#27AE60', 'business',
 '[{"type":"rss","name":"CNBC Top News","url":"https://www.cnbc.com/id/100003114/device/rss/rss.html","maxItems":12},{"type":"reddit","name":"r/investing","subreddit":"investing","maxItems":8},{"type":"rss","name":"MarketWatch","url":"https://feeds.marketwatch.com/marketwatch/topstories/","maxItems":12},{"type":"rss","name":"Yahoo Finance","url":"https://finance.yahoo.com/news/rssindex","maxItems":10}]'::jsonb,
 'Provide clear market updates without financial advice. Explain market movements in plain terms.', 4, true, '["all"]'::jsonb, NULL, NULL),

-- SCIENCE
('space-nasa', 'Space & NASA', 'Space exploration, astronomy, and NASA updates', 'sparkles', '#1A1A2E', 'science',
 '[{"type":"rss","name":"NASA Breaking","url":"https://www.nasa.gov/rss/dyn/breaking_news.rss","maxItems":12},{"type":"reddit","name":"r/space","subreddit":"space","maxItems":10},{"type":"rss","name":"Space.com","url":"https://www.space.com/feeds/all","maxItems":12},{"type":"hackernews","name":"HackerNews Space","keywords":["space","nasa","spacex","rocket","astronomy","mars","moon","satellite"],"maxItems":10}]'::jsonb,
 'Cover space news with wonder and excitement. Explain scientific concepts clearly.', 4, true, '["all"]'::jsonb, NULL, NULL),

('science-discoveries', 'Science Discoveries', 'Breakthroughs in science and research', 'atom', '#3498DB', 'science',
 '[{"type":"rss","name":"Science Daily","url":"https://www.sciencedaily.com/rss/all.xml","maxItems":12},{"type":"reddit","name":"r/science","subreddit":"science","maxItems":10},{"type":"rss","name":"Phys.org","url":"https://phys.org/rss-feed/","maxItems":12},{"type":"hackernews","name":"HackerNews Science","keywords":["science","research","study","discovery","breakthrough","physics","biology","chemistry"],"maxItems":10}]'::jsonb,
 'Make scientific discoveries accessible and exciting. Explain implications for everyday life.', 4, true, '["all"]'::jsonb, NULL, NULL),

-- LIFESTYLE
('health-wellness', 'Health & Wellness', 'Health tips, medical news, and wellness trends', 'heart.fill', '#E74C3C', 'lifestyle',
 '[{"type":"rss","name":"Medical News Today","url":"https://www.medicalnewstoday.com/newsfeeds/rss/medical_news.xml","maxItems":12},{"type":"rss","name":"NIH News","url":"https://www.nih.gov/news-events/news-releases/feed","maxItems":10},{"type":"reddit","name":"r/health","subreddit":"health","maxItems":10},{"type":"hackernews","name":"HackerNews Health","keywords":["health","medicine","medical","study","wellness","diet","exercise","mental health"],"maxItems":10}]'::jsonb,
 'Share health news responsibly. Cite sources and avoid giving medical advice.', 4, true, '["all"]'::jsonb, NULL, NULL),

-- ENTERTAINMENT
('gaming', 'Gaming News', 'Video game news, releases, and industry updates', 'gamecontroller.fill', '#8E44AD', 'entertainment',
 '[{"type":"rss","name":"IGN","url":"https://feeds.feedburner.com/ign/news","maxItems":12},{"type":"reddit","name":"r/Games","subreddit":"Games","maxItems":10},{"type":"rss","name":"Kotaku","url":"https://kotaku.com/rss","maxItems":10},{"type":"hackernews","name":"HackerNews Gaming","keywords":["game","gaming","steam","playstation","xbox","nintendo","esports","unity","unreal"],"maxItems":10}]'::jsonb,
 'Cover gaming news with enthusiasm. Balance AAA and indie game coverage.', 4, true, '["all"]'::jsonb, NULL, NULL),

-- SPORTS
('sports-roundup', 'Sports Roundup', 'Scores, highlights, and sports news', 'sportscourt.fill', '#F39C12', 'sports',
 '[{"type":"rss","name":"ESPN Top","url":"https://www.espn.com/espn/rss/news","maxItems":15},{"type":"rss","name":"CBS Sports","url":"https://www.cbssports.com/rss/headlines/","maxItems":12},{"type":"rss","name":"Yahoo Sports","url":"https://sports.yahoo.com/rss/","maxItems":10}]'::jsonb,
 'Cover major sports stories with energy. Include scores and highlight key performances.', 4, true, '["en"]'::jsonb, NULL, NULL),

-- SPANISH
('noticias-latinoamerica', 'Latinoamerica Hoy', 'Noticias principales de America Latina', 'globe.americas.fill', '#E74C3C', 'news',
 '[{"type":"rss","name":"BBC Mundo","url":"https://feeds.bbci.co.uk/mundo/rss.xml","maxItems":12},{"type":"rss","name":"El Pais","url":"https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/portada","maxItems":10}]'::jsonb,
 'Cover Latin American news. Focus on regional politics, economy, and culture.', 4, true, '["es"]'::jsonb, '{"es":"Latinoam\u00e9rica Hoy"}'::jsonb, '{"es":"Noticias principales de Am\u00e9rica Latina"}'::jsonb),

('futbol-mundial', 'Futbol Mundial', 'Resultados y noticias del futbol mundial', 'sportscourt.fill', '#27AE60', 'sports',
 '[{"type":"rss","name":"Marca","url":"https://e00-marca.uecdn.es/rss/futbol/futbol-internacional.xml","maxItems":12},{"type":"rss","name":"AS","url":"https://as.com/rss/tags/ultimas_noticias.xml","maxItems":10}]'::jsonb,
 'Cover world football/soccer news with passion. Include La Liga, Premier League, Champions League, and Latin American leagues.', 4, true, '["es","pt"]'::jsonb, '{"es":"F\u00fatbol Mundial","pt":"Futebol Mundial"}'::jsonb, '{"es":"Resultados y noticias del f\u00fatbol mundial","pt":"Resultados e not\u00edcias do futebol mundial"}'::jsonb),

-- FRENCH
('actualites-france', 'Actualites France', 'L''essentiel de l''actualite francaise', 'newspaper.fill', '#3498DB', 'news',
 '[{"type":"rss","name":"Le Monde","url":"https://www.lemonde.fr/rss/une.xml","maxItems":12},{"type":"rss","name":"France 24","url":"https://www.france24.com/fr/rss","maxItems":10}]'::jsonb,
 'Cover French news comprehensively. Include politics, culture, and society.', 4, true, '["fr"]'::jsonb, '{"fr":"Actualit\u00e9s France"}'::jsonb, '{"fr":"L''essentiel de l''actualit\u00e9 fran\u00e7aise"}'::jsonb),

-- GERMAN
('nachrichten-deutschland', 'Nachrichten Deutschland', 'Die wichtigsten Nachrichten aus Deutschland', 'newspaper.fill', '#F39C12', 'news',
 '[{"type":"rss","name":"Tagesschau","url":"https://www.tagesschau.de/xml/rss2/","maxItems":12},{"type":"rss","name":"Spiegel","url":"https://www.spiegel.de/schlagzeilen/index.rss","maxItems":10}]'::jsonb,
 'Cover German news. Include politics, economy, and European affairs.', 4, true, '["de"]'::jsonb, '{"de":"Nachrichten Deutschland"}'::jsonb, '{"de":"Die wichtigsten Nachrichten aus Deutschland"}'::jsonb),

-- PORTUGUESE (Brazil)
('noticias-brasil', 'Noticias do Brasil', 'As principais noticias do Brasil', 'newspaper.fill', '#2ECC71', 'news',
 '[{"type":"rss","name":"G1 Globo","url":"https://g1.globo.com/rss/g1/","maxItems":12},{"type":"rss","name":"Folha","url":"https://feeds.folha.uol.com.br/folha/emcimadahora/rss091.xml","maxItems":10}]'::jsonb,
 'Cover Brazilian news. Include politics, economy, culture, and sports.', 4, true, '["pt"]'::jsonb, '{"pt":"Not\u00edcias do Brasil"}'::jsonb, '{"pt":"As principais not\u00edcias do Brasil"}'::jsonb),

-- JAPANESE
('nihon-news', '\u65e5\u672c\u30cb\u30e5\u30fc\u30b9', '\u65e5\u672c\u306e\u6700\u65b0\u30cb\u30e5\u30fc\u30b9', 'newspaper.fill', '#E74C3C', 'news',
 '[{"type":"rss","name":"NHK News","url":"https://www3.nhk.or.jp/rss/news/cat0.xml","maxItems":12},{"type":"rss","name":"Japan Times","url":"https://www.japantimes.co.jp/feed/","maxItems":10}]'::jsonb,
 'Cover Japanese news. Include domestic politics, economy, technology, and culture.', 4, true, '["ja"]'::jsonb, '{"ja":"\u65e5\u672c\u30cb\u30e5\u30fc\u30b9"}'::jsonb, '{"ja":"\u65e5\u672c\u306e\u6700\u65b0\u30cb\u30e5\u30fc\u30b9"}'::jsonb),

-- KOREAN
('hanguk-news', '\ud55c\uad6d \ub274\uc2a4', '\ud55c\uad6d\uc758 \uc8fc\uc694 \ub274\uc2a4', 'newspaper.fill', '#1E3A5F', 'news',
 '[{"type":"rss","name":"Yonhap News","url":"https://en.yna.co.kr/RSS/news.xml","maxItems":12},{"type":"rss","name":"Korea Herald","url":"http://www.koreaherald.com/common/rss_xml.php?ct=102","maxItems":10}]'::jsonb,
 'Cover Korean news. Include domestic politics, K-culture, technology, and economy.', 4, true, '["ko"]'::jsonb, '{"ko":"\ud55c\uad6d \ub274\uc2a4"}'::jsonb, '{"ko":"\ud55c\uad6d\uc758 \uc8fc\uc694 \ub274\uc2a4"}'::jsonb),

-- HINDI
('bharat-samachar', '\u092d\u093e\u0930\u0924 \u0938\u092e\u093e\u091a\u093e\u0930', '\u092d\u093e\u0930\u0924 \u0915\u0940 \u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902', 'newspaper.fill', '#FF9933', 'news',
 '[{"type":"rss","name":"NDTV","url":"https://feeds.feedburner.com/ndtvnews-top-stories","maxItems":12},{"type":"rss","name":"Times of India","url":"https://timesofindia.indiatimes.com/rssfeedstopstories.cms","maxItems":10}]'::jsonb,
 'Cover Indian news. Include politics, economy, technology, cricket, and Bollywood.', 4, true, '["hi"]'::jsonb, '{"hi":"\u092d\u093e\u0930\u0924 \u0938\u092e\u093e\u091a\u093e\u0930"}'::jsonb, '{"hi":"\u092d\u093e\u0930\u0924 \u0915\u0940 \u0924\u093e\u091c\u093c\u093e \u0916\u092c\u0930\u0947\u0902"}'::jsonb),

('cricket-updates', 'Cricket Updates', 'Latest cricket scores and news', 'sportscourt.fill', '#138808', 'sports',
 '[{"type":"rss","name":"ESPNcricinfo","url":"https://www.espncricinfo.com/rss/content/story/feeds/0.xml","maxItems":12},{"type":"rss","name":"Cricbuzz","url":"https://www.cricbuzz.com/cb-rss/cb-top-stories","maxItems":10}]'::jsonb,
 'Cover cricket news with enthusiasm. Include IPL, international matches, and player updates.', 4, true, '["hi","en"]'::jsonb, '{"hi":"\u0915\u094d\u0930\u093f\u0915\u0947\u091f \u0905\u092a\u0921\u0947\u091f","en":"Cricket Updates"}'::jsonb, '{"hi":"\u0915\u094d\u0930\u093f\u0915\u0947\u091f \u0915\u0947 \u0924\u093e\u091c\u093c\u093e \u0938\u094d\u0915\u094b\u0930 \u0914\u0930 \u0916\u092c\u0930\u0947\u0902","en":"Latest cricket scores and news"}'::jsonb),

-- CHINESE
('zhongguo-xinwen', '\u4e2d\u56fd\u65b0\u95fb', '\u4e2d\u56fd\u548c\u4e9a\u6d32\u7684\u6700\u65b0\u65b0\u95fb', 'newspaper.fill', '#DE2910', 'news',
 '[{"type":"rss","name":"BBC Chinese","url":"https://feeds.bbci.co.uk/zhongwen/simp/rss.xml","maxItems":12},{"type":"rss","name":"South China Morning Post","url":"https://www.scmp.com/rss/91/feed","maxItems":10}]'::jsonb,
 'Cover Chinese and East Asian news. Include technology, economy, and culture.', 4, true, '["zh"]'::jsonb, '{"zh":"\u4e2d\u56fd\u65b0\u95fb"}'::jsonb, '{"zh":"\u4e2d\u56fd\u548c\u4e9a\u6d32\u7684\u6700\u65b0\u65b0\u95fb"}'::jsonb),

-- ITALIAN
('notizie-italia', 'Notizie Italia', 'Le ultime notizie dall''Italia', 'newspaper.fill', '#009246', 'news',
 '[{"type":"rss","name":"ANSA","url":"https://www.ansa.it/sito/ansait_rss.xml","maxItems":12},{"type":"rss","name":"La Repubblica","url":"https://www.repubblica.it/rss/homepage/rss2.0.xml","maxItems":10}]'::jsonb,
 'Cover Italian news. Include politics, culture, Serie A football, and European affairs.', 4, true, '["it"]'::jsonb, '{"it":"Notizie Italia"}'::jsonb, '{"it":"Le ultime notizie dall''Italia"}'::jsonb)

ON CONFLICT (id) DO NOTHING;
