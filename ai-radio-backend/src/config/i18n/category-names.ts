/**
 * Category display names in every language the topics endpoint can be asked for (the Android interface languages, the five Piper
 * languages and the 25 additional podcast languages). Order of each tuple: news, technology, business, science, lifestyle,
 * entertainment, sports.
 *
 * Machine-written, not reviewed by native speakers. A row of category chips must never mix languages, so every language listed
 * here has all seven names; a language that is not listed falls back to English as a whole row (see categoryName).
 */
import type { TopicCategory } from '../../types/topics';

export const CATEGORY_ORDER: readonly TopicCategory[] = ['news', 'technology', 'business', 'science', 'lifestyle', 'entertainment', 'sports'];

const N = (...names: [string, string, string, string, string, string, string]) => names;

const TUPLES: Record<string, [string, string, string, string, string, string, string]> = {
  en: N('News', 'Technology', 'Business', 'Science', 'Lifestyle', 'Entertainment', 'Sports'),
  es: N('Noticias', 'Tecnología', 'Negocios', 'Ciencia', 'Estilo de vida', 'Entretenimiento', 'Deportes'),
  fr: N('Actualités', 'Technologie', 'Affaires', 'Science', 'Style de vie', 'Divertissement', 'Sport'),
  de: N('Nachrichten', 'Technologie', 'Wirtschaft', 'Wissenschaft', 'Lifestyle', 'Unterhaltung', 'Sport'),
  pt: N('Notícias', 'Tecnologia', 'Negócios', 'Ciência', 'Estilo de vida', 'Entretenimento', 'Esportes'),
  it: N('Notizie', 'Tecnologia', 'Economia', 'Scienza', 'Stile di vita', 'Intrattenimento', 'Sport'),
  ja: N('ニュース', 'テクノロジー', 'ビジネス', 'サイエンス', 'ライフスタイル', 'エンタメ', 'スポーツ'),
  zh: N('新闻', '科技', '商业', '科学', '生活方式', '娱乐', '体育'),
  hi: N('समाचार', 'प्रौद्योगिकी', 'व्यापार', 'विज्ञान', 'जीवनशैली', 'मनोरंजन', 'खेल'),
  ko: N('뉴스', '기술', '비즈니스', '과학', '라이프스타일', '엔터테인먼트', '스포츠'),
  fil: N('Balita', 'Teknolohiya', 'Negosyo', 'Agham', 'Pamumuhay', 'Libangan', 'Palakasan'),
  cs: N('Zprávy', 'Technologie', 'Byznys', 'Věda', 'Životní styl', 'Zábava', 'Sport'),
  ro: N('Știri', 'Tehnologie', 'Afaceri', 'Știință', 'Stil de viață', 'Divertisment', 'Sport'),
  sv: N('Nyheter', 'Teknik', 'Affärer', 'Vetenskap', 'Livsstil', 'Underhållning', 'Sport'),
  nl: N('Nieuws', 'Technologie', 'Zakelijk', 'Wetenschap', 'Lifestyle', 'Entertainment', 'Sport'),
  pl: N('Wiadomości', 'Technologia', 'Biznes', 'Nauka', 'Styl życia', 'Rozrywka', 'Sport'),
  ru: N('Новости', 'Технологии', 'Бизнес', 'Наука', 'Образ жизни', 'Развлечения', 'Спорт'),
  uk: N('Новини', 'Технології', 'Бізнес', 'Наука', 'Стиль життя', 'Розваги', 'Спорт'),
  hu: N('Hírek', 'Technológia', 'Üzlet', 'Tudomány', 'Életmód', 'Szórakozás', 'Sport'),
  fi: N('Uutiset', 'Teknologia', 'Liiketoiminta', 'Tiede', 'Elämäntapa', 'Viihde', 'Urheilu'),
  tr: N('Haberler', 'Teknoloji', 'İş Dünyası', 'Bilim', 'Yaşam', 'Eğlence', 'Spor'),
  id: N('Berita', 'Teknologi', 'Bisnis', 'Sains', 'Gaya Hidup', 'Hiburan', 'Olahraga'),
  el: N('Ειδήσεις', 'Τεχνολογία', 'Επιχειρήσεις', 'Επιστήμη', 'Τρόπος ζωής', 'Ψυχαγωγία', 'Αθλητισμός'),
  ar: N('الأخبار', 'التقنية', 'الأعمال', 'العلوم', 'نمط الحياة', 'الترفيه', 'الرياضة'),
  ca: N('Notícies', 'Tecnologia', 'Negocis', 'Ciència', 'Estil de vida', 'Entreteniment', 'Esports'),
  hr: N('Vijesti', 'Tehnologija', 'Poslovanje', 'Znanost', 'Način života', 'Zabava', 'Sport'),
  ms: N('Berita', 'Teknologi', 'Perniagaan', 'Sains', 'Gaya Hidup', 'Hiburan', 'Sukan'),
  no: N('Nyheter', 'Teknologi', 'Næringsliv', 'Vitenskap', 'Livsstil', 'Underholdning', 'Sport'),
  sk: N('Správy', 'Technológie', 'Biznis', 'Veda', 'Životný štýl', 'Zábava', 'Šport'),
  sl: N('Novice', 'Tehnologija', 'Posel', 'Znanost', 'Življenjski slog', 'Zabava', 'Šport'),
  sr: N('Vesti', 'Tehnologija', 'Biznis', 'Nauka', 'Način života', 'Zabava', 'Sport'),
  th: N('ข่าว', 'เทคโนโลยี', 'ธุรกิจ', 'วิทยาศาสตร์', 'ไลฟ์สไตล์', 'บันเทิง', 'กีฬา'),
  vi: N('Tin tức', 'Công nghệ', 'Kinh doanh', 'Khoa học', 'Phong cách sống', 'Giải trí', 'Thể thao'),
};

/** category id -> language code -> name, built from the tuples above. */
export const CATEGORY_NAMES_I18N: Record<TopicCategory, Record<string, string>> = Object.fromEntries(
  CATEGORY_ORDER.map((cat, i) => [cat, Object.fromEntries(Object.entries(TUPLES).map(([lang, names]) => [lang, names[i]]))]),
) as Record<TopicCategory, Record<string, string>>;

/** Language codes that have a complete set of category names. */
export const CATEGORY_LANGUAGES: readonly string[] = Object.keys(TUPLES);
