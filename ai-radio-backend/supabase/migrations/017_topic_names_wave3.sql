-- PROPOSED, NOT APPLIED. Review, then apply by hand (data only; safe to apply before or after the backend release).
--
-- Why: topic names and descriptions for the 12 launch topics in the 11 wave 3 languages (ar ca hr ms no sk sl sr th vi zh), so the picker
-- and the episode titles show the topic in the listener's language instead of English. Without this migration nothing breaks: the API falls
-- back to the English name.
--
-- Machine-written (by the assistant), NOT reviewed by native speakers: needs native review before the languages leave Beta.
-- Only ADDS keys for the new language codes. Existing keys are never overwritten: the new object is the LEFT side of ||, the existing
-- value the RIGHT side, and in jsonb || the right side wins on a duplicate key. Rows that do not exist are not touched (UPDATE only).
-- (sports-roundup is listed for English only in `topics.languages` today, so it is not offered in these languages yet; its names are
-- included so it appears correctly if that is ever widened.)
--
-- Verify afterwards:
--   SELECT id, localized_names->'ca' AS ca, localized_descriptions->'sk' AS sk FROM public.topics
--   WHERE id IN ('world-update','daily-news','tech-news','science-discoveries','space-nasa','health-wellness','markets-finance','sports-roundup','gaming','ai-ml','eli5','simulate-this');
--
-- ROLLBACK (removes exactly the keys this file added):
--   UPDATE public.topics SET localized_names = localized_names - ARRAY['ar','ca','hr','ms','no','sk','sl','sr','th','vi','zh'],
--     localized_descriptions = localized_descriptions - ARRAY['ar','ca','hr','ms','no','sk','sl','sr','th','vi','zh']
--   WHERE id IN (...the 12 ids...);   -- only if no one had added these keys before; they were absent when this was written.

BEGIN;

UPDATE public.topics SET
  localized_names = '{"ar": "أخبار العالم", "ca": "Actualitat mundial", "hr": "Svijet danas", "ms": "Kemas Kini Dunia", "no": "Verden i dag", "sk": "Svet dnes", "sl": "Svet danes", "sr": "Svet danas", "th": "ข่าวโลกอัปเดต", "vi": "Thế giới hôm nay", "zh": "世界动态"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "الأخبار الدولية والشؤون العالمية", "ca": "Notícies internacionals i afers globals", "hr": "Međunarodne vijesti i svjetska zbivanja", "ms": "Berita antarabangsa dan hal ehwal global", "no": "Internasjonale nyheter og globale saker", "sk": "Medzinárodné správy a dianie vo svete", "sl": "Mednarodne novice in svetovno dogajanje", "sr": "Međunarodne vesti i svetska zbivanja", "th": "ข่าวต่างประเทศและเหตุการณ์ระดับโลก", "vi": "Tin tức quốc tế và các vấn đề toàn cầu", "zh": "国际新闻与全球时事"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'world-update';

UPDATE public.topics SET
  localized_names = '{"ar": "موجز الأخبار اليومي", "ca": "Resum de notícies diari", "hr": "Dnevni pregled vijesti", "ms": "Ringkasan Berita Harian", "no": "Dagens nyhetsoppsummering", "sk": "Denný prehľad správ", "sl": "Dnevni pregled novic", "sr": "Dnevni pregled vesti", "th": "สรุปข่าวประจำวัน", "vi": "Bản tin hằng ngày", "zh": "每日新闻简报"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "أبرز العناوين من حول العالم", "ca": "Els titulars principals de tot el món", "hr": "Najvažnije vijesti iz cijeloga svijeta", "ms": "Tajuk utama dari seluruh dunia", "no": "Toppsakene fra hele verden", "sk": "Hlavné titulky z celého sveta", "sl": "Glavni naslovi z vsega sveta", "sr": "Najvažnije vesti iz celog sveta", "th": "พาดหัวข่าวสำคัญจากทั่วโลก", "vi": "Các tin nổi bật từ khắp nơi trên thế giới", "zh": "来自世界各地的头条新闻"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'daily-news';

UPDATE public.topics SET
  localized_names = '{"ar": "أخبار التقنية اليومية", "ca": "Notícies tecnològiques diàries", "hr": "Tehnološke vijesti", "ms": "Berita Teknologi Harian", "no": "Daglige teknologinyheter", "sk": "Technologické správy", "sl": "Tehnološke novice", "sr": "Tehnološke vesti", "th": "ข่าวเทคโนโลยีรายวัน", "vi": "Tin công nghệ mỗi ngày", "zh": "每日科技新闻"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "آخر مستجدات وادي السيليكون وقطاع التقنية", "ca": "Novetats de Silicon Valley i del sector tecnològic", "hr": "Novosti iz Silicijske doline i tehnološke industrije", "ms": "Perkembangan Silicon Valley dan industri teknologi", "no": "Nytt fra Silicon Valley og teknologibransjen", "sk": "Novinky zo Silicon Valley a technologického priemyslu", "sl": "Novosti iz Silicijeve doline in tehnološke industrije", "sr": "Novosti iz Silicijumske doline i tehnološke industrije", "th": "ความเคลื่อนไหวจากซิลิคอนวัลเลย์และวงการเทคโนโลยี", "vi": "Cập nhật từ Thung lũng Silicon và ngành công nghệ", "zh": "硅谷动态与科技行业新闻"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'tech-news';

UPDATE public.topics SET
  localized_names = '{"ar": "اكتشافات علمية", "ca": "Descobriments científics", "hr": "Znanstvena otkrića", "ms": "Penemuan Sains", "no": "Vitenskapelige oppdagelser", "sk": "Vedecké objavy", "sl": "Znanstvena odkritja", "sr": "Naučna otkrića", "th": "การค้นพบทางวิทยาศาสตร์", "vi": "Khám phá khoa học", "zh": "科学新发现"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "إنجازات جديدة في العلوم والأبحاث", "ca": "Avenços en la ciència i la recerca", "hr": "Napredak u znanosti i istraživanju", "ms": "Kejayaan terbaharu dalam sains dan penyelidikan", "no": "Gjennombrudd innen vitenskap og forskning", "sk": "Prelomové objavy vo vede a výskume", "sl": "Preboji v znanosti in raziskavah", "sr": "Prodori u nauci i istraživanju", "th": "ความก้าวหน้าในวิทยาศาสตร์และงานวิจัย", "vi": "Những đột phá trong khoa học và nghiên cứu", "zh": "科学与研究领域的重大突破"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'science-discoveries';

UPDATE public.topics SET
  localized_names = '{"ar": "الفضاء وناسا", "ca": "Espai i NASA", "hr": "Svemir i NASA", "ms": "Angkasa dan NASA", "no": "Verdensrommet og NASA", "sk": "Vesmír a NASA", "sl": "Vesolje in NASA", "sr": "Svemir i NASA", "th": "อวกาศและนาซา", "vi": "Vũ trụ và NASA", "zh": "太空与NASA"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "استكشاف الفضاء وعلم الفلك وأخبار ناسا", "ca": "Exploració espacial, astronomia i novetats de la NASA", "hr": "Istraživanje svemira, astronomija i novosti iz NASA-e", "ms": "Penerokaan angkasa, astronomi dan perkembangan NASA", "no": "Romutforskning, astronomi og nytt fra NASA", "sk": "Skúmanie vesmíru, astronómia a novinky z NASA", "sl": "Raziskovanje vesolja, astronomija in novice iz NASE", "sr": "Istraživanje svemira, astronomija i novosti iz NASA-e", "th": "การสำรวจอวกาศ ดาราศาสตร์ และความเคลื่อนไหวของนาซา", "vi": "Khám phá vũ trụ, thiên văn học và tin tức từ NASA", "zh": "太空探索、天文学与NASA最新动态"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'space-nasa';

UPDATE public.topics SET
  localized_names = '{"ar": "الصحة والعافية", "ca": "Salut i benestar", "hr": "Zdravlje i dobrobit", "ms": "Kesihatan dan Kesejahteraan", "no": "Helse og velvære", "sk": "Zdravie a pohoda", "sl": "Zdravje in dobro počutje", "sr": "Zdravlje i dobrobit", "th": "สุขภาพและความเป็นอยู่ที่ดี", "vi": "Sức khỏe và đời sống", "zh": "健康与养生"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "نصائح صحية وأخبار طبية واتجاهات العافية", "ca": "Consells de salut, notícies mèdiques i tendències de benestar", "hr": "Savjeti o zdravlju, medicinske vijesti i trendovi dobrobiti", "ms": "Petua kesihatan, berita perubatan dan trend kesejahteraan", "no": "Helsetips, medisinske nyheter og velværetrender", "sk": "Zdravotné tipy, lekárske správy a trendy v oblasti wellness", "sl": "Zdravstveni nasveti, medicinske novice in trendi dobrega počutja", "sr": "Saveti o zdravlju, medicinske vesti i trendovi dobrobiti", "th": "เคล็ดลับสุขภาพ ข่าวการแพทย์ และเทรนด์การดูแลตัวเอง", "vi": "Mẹo sức khỏe, tin y khoa và xu hướng chăm sóc bản thân", "zh": "健康小贴士、医学新闻与养生趋势"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'health-wellness';

UPDATE public.topics SET
  localized_names = '{"ar": "الأسواق والمال", "ca": "Mercats i finances", "hr": "Tržišta i financije", "ms": "Pasaran dan Kewangan", "no": "Markeder og finans", "sk": "Trhy a financie", "sl": "Trgi in finance", "sr": "Tržišta i finansije", "th": "ตลาดและการเงิน", "vi": "Thị trường và tài chính", "zh": "市场与财经"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "تحديثات سوق الأسهم والأخبار المالية", "ca": "Novetats de la borsa i notícies financeres", "hr": "Novosti s burze i financijske vijesti", "ms": "Kemas kini pasaran saham dan berita kewangan", "no": "Oppdateringer fra aksjemarkedet og finansnyheter", "sk": "Novinky z akciových trhov a finančné správy", "sl": "Novice z borze in finančne novice", "sr": "Novosti sa berze i finansijske vesti", "th": "อัปเดตตลาดหุ้นและข่าวการเงิน", "vi": "Cập nhật thị trường chứng khoán và tin tài chính", "zh": "股市动态与财经新闻"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'markets-finance';

UPDATE public.topics SET
  localized_names = '{"ar": "ملخص الرياضة", "ca": "Resum esportiu", "hr": "Sportski pregled", "ms": "Rumusan Sukan", "no": "Sportsoppsummering", "sk": "Športový prehľad", "sl": "Športni pregled", "sr": "Sportski pregled", "th": "สรุปข่าวกีฬา", "vi": "Điểm tin thể thao", "zh": "体育综述"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "النتائج وأبرز اللقطات والأخبار الرياضية", "ca": "Resultats, millors moments i notícies esportives", "hr": "Rezultati, najzanimljiviji trenuci i sportske vijesti", "ms": "Keputusan, sorotan dan berita sukan", "no": "Resultater, høydepunkter og sportsnyheter", "sk": "Výsledky, najlepšie momenty a športové správy", "sl": "Rezultati, poudarki in športne novice", "sr": "Rezultati, najzanimljiviji trenuci i sportske vesti", "th": "ผลการแข่งขัน ไฮไลต์ และข่าวกีฬา", "vi": "Kết quả, những pha nổi bật và tin thể thao", "zh": "比分、精彩瞬间与体育新闻"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'sports-roundup';

UPDATE public.topics SET
  localized_names = '{"ar": "أخبار الألعاب", "ca": "Notícies de videojocs", "hr": "Gaming novosti", "ms": "Berita Permainan", "no": "Spillnyheter", "sk": "Herné správy", "sl": "Igričarske novice", "sr": "Gejming vesti", "th": "ข่าวเกม", "vi": "Tin game", "zh": "游戏资讯"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "أخبار ألعاب الفيديو والإصدارات الجديدة وتطورات القطاع", "ca": "Notícies de videojocs, llançaments i novetats del sector", "hr": "Vijesti o videoigrama, izdanja i novosti iz industrije", "ms": "Berita permainan video, keluaran baharu dan perkembangan industri", "no": "Nyheter om dataspill, utgivelser og bransjen", "sk": "Správy o videohrách, novinkách a dianí v hernom priemysle", "sl": "Novice o video igrah, izidih in dogajanju v industriji", "sr": "Vesti o video igrama, izdanjima i novostima iz industrije", "th": "ข่าววิดีโอเกม เกมใหม่ และความเคลื่อนไหวของวงการ", "vi": "Tin tức trò chơi điện tử, game mới và ngành công nghiệp game", "zh": "电子游戏新闻、新作发布与行业动态"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'gaming';

UPDATE public.topics SET
  localized_names = '{"ar": "الذكاء الاصطناعي وتعلم الآلة", "ca": "IA i aprenentatge automàtic", "hr": "Umjetna inteligencija i strojno učenje", "ms": "AI dan Pembelajaran Mesin", "no": "KI og maskinlæring", "sk": "AI a strojové učenie", "sl": "UI in strojno učenje", "sr": "Veštačka inteligencija i mašinsko učenje", "th": "เอไอและแมชชีนเลิร์นนิง", "vi": "AI và học máy", "zh": "人工智能与机器学习"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "أحدث ما في الذكاء الاصطناعي وإنجازات تعلم الآلة", "ca": "Les últimes novetats en intel·ligència artificial i aprenentatge automàtic", "hr": "Najnovije o umjetnoj inteligenciji i strojnom učenju", "ms": "Perkembangan terkini dalam kecerdasan buatan dan pembelajaran mesin", "no": "Det siste innen kunstig intelligens og maskinlæring", "sk": "Najnovšie z umelej inteligencie a strojového učenia", "sl": "Najnovejše o umetni inteligenci in strojnem učenju", "sr": "Najnovije o veštačkoj inteligenciji i mašinskom učenju", "th": "ความก้าวหน้าล่าสุดด้านปัญญาประดิษฐ์และแมชชีนเลิร์นนิง", "vi": "Những tiến bộ mới nhất về trí tuệ nhân tạo và học máy", "zh": "人工智能与机器学习的最新突破"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'ai-ml';

UPDATE public.topics SET
  localized_names = '{"ar": "اشرحها ببساطة", "ca": "Explica-m''ho fàcil", "hr": "Objasni jednostavno", "ms": "Terangkan Dengan Mudah", "no": "Forklar det enkelt", "sk": "Vysvetli jednoducho", "sl": "Razloži preprosto", "sr": "Objasni jednostavno", "th": "อธิบายให้เข้าใจง่าย", "vi": "Giải thích đơn giản", "zh": "通俗易懂"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "مواضيع معقدة مبسطة", "ca": "Temes complexos explicats de manera senzilla", "hr": "Složene teme objašnjene jednostavno", "ms": "Topik rumit dipermudahkan", "no": "Kompliserte temaer gjort enkle", "sk": "Zložité témy jednoducho vysvetlené", "sl": "Zapletene teme, razložene preprosto", "sr": "Složene teme objašnjene jednostavno", "th": "เรื่องซับซ้อนที่อธิบายให้เข้าใจง่าย", "vi": "Những chủ đề phức tạp được giải thích đơn giản", "zh": "把复杂的话题讲简单"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'eli5';

UPDATE public.topics SET
  localized_names = '{"ar": "حاكِ هذا", "ca": "Simula-ho", "hr": "Simuliraj ovo", "ms": "Simulasikan Ini", "no": "Simuler dette", "sk": "Simuluj toto", "sl": "Simuliraj to", "sr": "Simuliraj ovo", "th": "จำลองเหตุการณ์นี้", "vi": "Mô phỏng điều này", "zh": "情景模拟"}'::jsonb || COALESCE(localized_names, '{}'::jsonb),
  localized_descriptions = '{"ar": "شخصيات تاريخية تتفاعل مع الأحداث", "ca": "Personatges històrics hi reaccionen", "hr": "Povijesne ličnosti reagiraju", "ms": "Tokoh sejarah memberi reaksi", "no": "Historiske personer reagerer", "sk": "Historické osobnosti reagujú", "sl": "Zgodovinske osebnosti se odzovejo", "sr": "Istorijske ličnosti reaguju", "th": "บุคคลในประวัติศาสตร์ร่วมแสดงความคิดเห็น", "vi": "Các nhân vật lịch sử phản ứng", "zh": "历史人物的反应"}'::jsonb || COALESCE(localized_descriptions, '{}'::jsonb)
WHERE id = 'simulate-this';

COMMIT;
