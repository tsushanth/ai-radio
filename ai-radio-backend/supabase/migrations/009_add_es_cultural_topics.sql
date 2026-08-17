-- 009_add_es_cultural_topics.sql
-- Add 6 Spanish-speaking-market topics so ES users see culturally-relevant
-- content beyond the generic `noticias-latinoamerica` + `futbol-mundial`.
--
-- Markets covered: España + LATAM (Mexico, Argentina, Colombia, Chile,
-- Peru, Venezuela, …). Categories chosen to mirror what worked for JP:
-- specific sport league, music/pop culture, tech, business, politics,
-- entertainment.

INSERT INTO topics (id, name, description, icon, color, category, sources, prompt_context, target_duration_minutes, is_active, languages, localized_names, localized_descriptions) VALUES

-- La Liga (Spanish football + LATAM football leagues)
('liga-espanola', 'La Liga & Fútbol', 'La Liga, Champions League, and LATAM football coverage', 'sportscourt.fill', '#EE2A7B', 'sports',
 '[{"type":"rss","name":"Marca","url":"https://e00-marca.uecdn.es/rss/futbol/primera-division.xml","maxItems":12},{"type":"rss","name":"AS Liga","url":"https://as.com/rss/futbol/primera/portada.xml","maxItems":10},{"type":"rss","name":"Mundo Deportivo","url":"https://www.mundodeportivo.com/feed/rss/futbol/laliga","maxItems":10}]'::jsonb,
 'Cubre La Liga española, Champions League, selecciones nacionales hispanohablantes (España, México, Argentina, Colombia, Chile). Equipos clave: Real Madrid, Barcelona, Atlético de Madrid, Sevilla. Jugadores: Lamine Yamal, Vinicius, Bellingham, Mbappé, Pedri. Tono: entusiasta pero objetivo, usa nombres propios en español.',
 4, true, '["es"]'::jsonb,
 '{"es":"La Liga y Fútbol"}'::jsonb,
 '{"es":"La Liga, Champions League y cobertura del fútbol latinoamericano"}'::jsonb),

-- Música urbana (reggaeton, Latin pop, Latin urban)
('musica-urbana', 'Música Urbana', 'Reggaeton, Latin pop, urban music, and global Latin stars', 'music.note', '#F72585', 'entertainment',
 '[{"type":"rss","name":"Los40","url":"https://los40.com/feed/rss/","maxItems":12},{"type":"rss","name":"Billboard Latin","url":"https://www.billboard.com/feed/","maxItems":10},{"type":"rss","name":"Rolling Stone España","url":"https://es.rollingstone.com/feed/","maxItems":10}]'::jsonb,
 'Cubre música urbana en español: reggaeton, Latin pop, trap latino, urbano. Artistas: Bad Bunny, Karol G, Rosalía, J Balvin, Maluma, Peso Pluma, Feid, Quevedo, Aitana. Incluye lanzamientos, colaboraciones, giras, premios Latin Grammy y Premios Lo Nuestro. Tono: dinámico, entusiasta. Usa nombres de artistas y canciones tal como se escriben.',
 4, true, '["es"]'::jsonb,
 '{"es":"Música Urbana"}'::jsonb,
 '{"es":"Reggaeton, Latin pop y las estrellas urbanas hispanohablantes"}'::jsonb),

-- Política España (Spain-specific politics, distinct from generic LatAm news)
('politica-espana', 'Política España', 'Congreso, Gobierno, autonomías y política española', 'building.columns.fill', '#C60B1E', 'news',
 '[{"type":"rss","name":"El País Política","url":"https://feeds.elpais.com/mrss-s/pages/ep/site/elpais.com/section/politica/portada","maxItems":12},{"type":"rss","name":"ABC España","url":"https://www.abc.es/rss/feeds/abc_Espana.xml","maxItems":10},{"type":"rss","name":"El Mundo España","url":"https://e00-elmundo.uecdn.es/elmundo/rss/espana.xml","maxItems":10}]'::jsonb,
 'Cobertura objetiva de política española: Congreso de los Diputados, Gobierno, partidos (PSOE, PP, Sumar, Vox), comunidades autónomas, política europea y exterior. Explica implicaciones para los ciudadanos. Evita editorializar. Usa terminología institucional correcta.',
 4, true, '["es"]'::jsonb,
 '{"es":"Política España"}'::jsonb,
 '{"es":"Congreso, Gobierno, autonomías y política española"}'::jsonb),

-- Tech en español (Spanish-speaking tech scene)
('tech-espanol', 'Tecnología', 'Apple, Google, IA y novedades tecnológicas en español', 'cpu', '#0066CC', 'technology',
 '[{"type":"rss","name":"Xataka","url":"https://feeds.weblogssl.com/xataka2","maxItems":12},{"type":"rss","name":"Genbeta","url":"https://feeds.weblogssl.com/genbeta","maxItems":10},{"type":"rss","name":"Hipertextual","url":"https://hipertextual.com/feed","maxItems":10}]'::jsonb,
 'Cubre el panorama tecnológico desde la perspectiva hispanohablante: lanzamientos de Apple, Google, Samsung; inteligencia artificial (ChatGPT, Gemini); apps; startups españolas y latinoamericanas. Explica conceptos técnicos de forma accesible. Usa términos en español cuando existan (e.g. "inteligencia artificial" en lugar de "AI" salvo siglas comunes).',
 4, true, '["es"]'::jsonb,
 '{"es":"Tecnología"}'::jsonb,
 '{"es":"Apple, Google, IA y novedades tecnológicas en español"}'::jsonb),

-- Economía & Mercados (IBEX, LatAm markets, business)
('economia-mercados', 'Economía y Mercados', 'IBEX 35, peso mexicano, real, y mercados hispanohablantes', 'chart.line.uptrend.xyaxis', '#FFC107', 'business',
 '[{"type":"rss","name":"Expansión","url":"https://e00-expansion.uecdn.es/rss/portada.xml","maxItems":12},{"type":"rss","name":"El Economista","url":"https://www.eleconomista.es/rss/rss-portada.xml","maxItems":10},{"type":"rss","name":"Cinco Días","url":"https://feeds.elpais.com/mrss-s/pages/ep/site/cincodias.elpais.com/portada","maxItems":10}]'::jsonb,
 'Cubre economía y mercados hispanohablantes: IBEX 35, principales empresas españolas (Inditex, Santander, BBVA, Telefónica, Iberdrola), peso mexicano, real brasileño, política monetaria del BCE y bancos centrales latinoamericanos. Explica con claridad sin dar consejos de inversión. Cantidades en euros con equivalente en dólares cuando proceda.',
 4, true, '["es"]'::jsonb,
 '{"es":"Economía y Mercados"}'::jsonb,
 '{"es":"IBEX 35, peso mexicano, real y mercados hispanohablantes"}'::jsonb),

-- Entretenimiento (telenovelas, celebridades, cine)
('entretenimiento-es', 'Entretenimiento', 'Cine, telenovelas, series y celebridades hispanohablantes', 'film', '#9D4EDD', 'entertainment',
 '[{"type":"rss","name":"Hola","url":"https://www.hola.com/rss/portada.xml","maxItems":12},{"type":"rss","name":"People en Español","url":"https://peopleenespanol.com/feed/","maxItems":10},{"type":"rss","name":"FilmAffinity","url":"https://www.filmaffinity.com/es/rss-news.xml","maxItems":10}]'::jsonb,
 'Cubre entretenimiento hispanohablante: cine español y latinoamericano, telenovelas, series de Netflix y plataformas en español, celebridades, premios Goya y Ariel. Incluye estrenos importantes, romances, separaciones, y noticias de famosos. Tono: ligero, entretenido, sin caer en sensacionalismo dañino.',
 4, true, '["es"]'::jsonb,
 '{"es":"Entretenimiento"}'::jsonb,
 '{"es":"Cine, telenovelas, series y celebridades hispanohablantes"}'::jsonb)

ON CONFLICT (id) DO NOTHING;
