-- 008_add_jp_cultural_topics.sql
-- Add 6 Japan-specific topics so JP users see culturally-relevant content
-- on the Discover tab in addition to the universal topics + nihon-news.
--
-- 26 of 42 May 2026 first-time installs were organic from Japan with zero
-- JP cultural topics available; adding NPB / anime / J-tech / Nikkei /
-- J-pop / domestic politics opens the personalization surface.

INSERT INTO topics (id, name, description, icon, color, category, sources, prompt_context, target_duration_minutes, is_active, languages, localized_names, localized_descriptions) VALUES

-- Japanese baseball (NPB + MLB JP players)
('nihon-yakyuu', 'Japanese Baseball', 'NPB updates, MLB Japanese players, and game highlights', 'sportscourt.fill', '#C8102E', 'sports',
 '[{"type":"rss","name":"Sponichi","url":"https://www.sponichi.co.jp/baseball/rss/news.rdf","maxItems":10},{"type":"rss","name":"Hochi Sports","url":"https://hochi.news/rss/baseball.xml","maxItems":10},{"type":"rss","name":"Nikkan Sports","url":"https://www.nikkansports.com/baseball/atom.xml","maxItems":10}]'::jsonb,
 'Cover Japanese baseball news: NPB Pacific & Central League standings, key players, MLB updates on Ohtani, Yamamoto, Suzuki and other Japanese players. Tone: enthusiastic but accurate, use proper Japanese player names and team names.',
 4, true, '["ja"]'::jsonb,
 '{"ja":"日本プロ野球"}'::jsonb,
 '{"ja":"NPB、MLBの日本人選手、ハイライト情報"}'::jsonb),

-- Anime & manga
('anime-manga', 'Anime & Manga', 'New anime releases, manga news, and otaku culture', 'sparkles', '#7B2CBF', 'entertainment',
 '[{"type":"rss","name":"Anime News Network","url":"https://www.animenewsnetwork.com/all/rss.xml","maxItems":12},{"type":"rss","name":"Crunchyroll News","url":"https://www.crunchyroll.com/news/rss","maxItems":10},{"type":"rss","name":"Comic Natalie","url":"https://natalie.mu/comic/feed/news","maxItems":10}]'::jsonb,
 'Cover anime and manga news. New season announcements, manga chapter updates, voice actor news, industry events. Use proper Japanese titles when known (e.g. "Frieren" not "Frieren: Beyond Journey''s End"). Mention English and Japanese release dates separately.',
 4, true, '["ja","en"]'::jsonb,
 '{"ja":"アニメ・マンガ","en":"Anime & Manga"}'::jsonb,
 '{"ja":"新作アニメ、マンガニュース、オタク文化","en":"New anime releases, manga news, and otaku culture"}'::jsonb),

-- Japanese tech industry
('nihon-tech', 'Japanese Tech', 'Sony, Nintendo, Toyota, SoftBank, Rakuten, and JP tech industry', 'cpu', '#0066CC', 'technology',
 '[{"type":"rss","name":"ITmedia News","url":"https://rss.itmedia.co.jp/rss/2.0/news_bursts.xml","maxItems":12},{"type":"rss","name":"Nikkei xTECH","url":"https://xtech.nikkei.com/rss/index.rdf","maxItems":10},{"type":"rss","name":"Engadget Japan","url":"https://japanese.engadget.com/rss.xml","maxItems":10}]'::jsonb,
 'Cover Japanese technology companies and product news. Sony electronics, Nintendo games, Toyota mobility, SoftBank/Rakuten enterprise moves. Mention proper Japanese product names and price in yen alongside USD when relevant.',
 4, true, '["ja"]'::jsonb,
 '{"ja":"日本のテック"}'::jsonb,
 '{"ja":"ソニー、任天堂、トヨタ、ソフトバンク、楽天など日本の技術業界"}'::jsonb),

-- Nikkei / Japanese stock market
('nikkei-keizai', 'Nikkei & Markets', 'Nikkei 225, yen, and Japanese economy', 'chart.line.uptrend.xyaxis', '#00843D', 'business',
 '[{"type":"rss","name":"Nikkei Markets","url":"https://www.nikkei.com/news/category/business/?n_cid=DSREA_rss_business","maxItems":12},{"type":"rss","name":"Reuters Japan","url":"https://jp.reuters.com/rssFeed/topNews","maxItems":10},{"type":"rss","name":"Toyo Keizai","url":"https://toyokeizai.net/list/feed/rss","maxItems":10}]'::jsonb,
 'Cover Japanese economy and markets: Nikkei 225 movements, yen/USD exchange rate, BOJ policy, major TSE-listed companies. Explain in clear terms; do not give investment advice. Use yen amounts followed by USD equivalent at current rate.',
 4, true, '["ja"]'::jsonb,
 '{"ja":"日経・経済"}'::jsonb,
 '{"ja":"日経平均、円相場、日本経済の動向"}'::jsonb),

-- J-pop & music
('jpop-music', 'J-POP & Music', 'J-pop, idols, J-rock, and Japanese music charts', 'music.note', '#F72585', 'entertainment',
 '[{"type":"rss","name":"Natalie Music","url":"https://natalie.mu/music/feed/news","maxItems":12},{"type":"rss","name":"Oricon","url":"https://www.oricon.co.jp/rss/news/total/","maxItems":10},{"type":"rss","name":"Billboard Japan","url":"https://www.billboard-japan.com/common/rss/news.xml","maxItems":10}]'::jsonb,
 'Cover Japanese music industry news: J-pop releases, idol group activities (Hello! Project, AKB48 family, Johnny''s successors), J-rock, Vocaloid, anime music. Include chart positions and tour announcements. Use artist names in original Japanese when known.',
 4, true, '["ja"]'::jsonb,
 '{"ja":"J-POP・音楽"}'::jsonb,
 '{"ja":"J-POP、アイドル、J-ROCK、日本の音楽チャート"}'::jsonb),

-- Japanese politics (Diet, cabinet, foreign policy)
('nihon-seiji', 'Japanese Politics', 'Diet, Cabinet, foreign policy, and elections', 'building.columns.fill', '#BC002D', 'news',
 '[{"type":"rss","name":"Asahi Shimbun Politics","url":"https://www.asahi.com/rss/asahi/politics.rdf","maxItems":12},{"type":"rss","name":"Mainichi Politics","url":"https://mainichi.jp/rss/etc/mainichi-flash.rss","maxItems":10},{"type":"rss","name":"NHK Politics","url":"https://www3.nhk.or.jp/rss/news/cat4.xml","maxItems":10}]'::jsonb,
 'Cover Japanese political news objectively: Diet sessions, Cabinet decisions, LDP / opposition party moves, foreign policy with China/Korea/US, elections. Explain policy implications for ordinary citizens. Avoid editorializing.',
 4, true, '["ja"]'::jsonb,
 '{"ja":"日本の政治"}'::jsonb,
 '{"ja":"国会、内閣、外交、選挙などのニュース"}'::jsonb)

ON CONFLICT (id) DO NOTHING;
