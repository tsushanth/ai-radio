import test from 'node:test';
import assert from 'node:assert/strict';
import { fetchLanguageStories, googleNewsSectionUrl, splitGoogleTitle, dedupeAndRank, PUBLISHER_FEEDS } from './sources.ts';
import { requireLanguageSpec, LAUNCH_TOPICS, NEW_LANGUAGES } from './registry.ts';

const NOW = Date.parse('2026-11-15T12:00:00Z');
const rss = (items: Array<{ title: string; date?: string }>) => `<?xml version="1.0"?><rss version="2.0"><channel><title>t</title>${items.map((i) => `<item><title><![CDATA[${i.title}]]></title><link>https://x.test/${encodeURIComponent(i.title)}</link>${i.date ? `<pubDate>${i.date}</pubDate>` : ''}<description>d</description></item>`).join('')}</channel></rss>`;
const topic = (id: string) => ({ id, name: id, description: 'd', icon: '', color: '', category: 'news', sources: [], promptContext: '', targetDurationMinutes: 4, isActive: true, languages: ['all'] }) as any;
const fresh = 'Sat, 14 Nov 2026 10:00:00 GMT';

function deps(feeds: Record<string, string | Error>, english: any[] = []) {
  const fetched: string[] = [];
  return {
    fetched,
    fetchXml: async (url: string) => { fetched.push(url); const k = Object.keys(feeds).find((f) => url.includes(f)); const v = k ? feeds[k] : new Error('404'); if (v instanceof Error) throw v; return v; },
    englishStories: async () => ({ topicId: 't', date: '2026-11-15', stories: english, fetchedAt: new Date(), totalSources: 2, successfulSources: english.length ? 2 : 0 }),
    now: () => NOW,
  };
}

test('Google News section URL uses the language edition (hl, gl, ceid)', () => {
  assert.equal(googleNewsSectionUrl(requireLanguageSpec('cs'), 'WORLD'), 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=cs&gl=CZ&ceid=CZ:cs');
  assert.equal(googleNewsSectionUrl(requireLanguageSpec('uk'), 'TECHNOLOGY'), 'https://news.google.com/rss/headlines/section/topic/TECHNOLOGY?hl=uk&gl=UA&ceid=UA:uk');
  assert.match(googleNewsSectionUrl(requireLanguageSpec('hi'), 'SCIENCE'), /hl=hi&gl=IN&ceid=IN:hi/);
});

test('registry: 25 languages, 12 launch topics, every native topic has a section, every edition is well formed', () => {
  assert.equal(NEW_LANGUAGES.length, 25); assert.equal(LAUNCH_TOPICS.length, 12);
  assert.deepEqual(NEW_LANGUAGES.filter((l) => l.wave === 1).map((l) => l.code).sort(), ['cs', 'hu', 'nl', 'pl', 'ro', 'ru', 'sv', 'uk']);
  for (const t of LAUNCH_TOPICS) assert.ok(t.mode === 'translate' || (t.sections && t.sections.length > 0), t.id);
  for (const l of NEW_LANGUAGES) {
    if (l.code === 'hr') { assert.equal(l.edition, '', 'Google News has no Croatian edition (hl=hr answers the US English edition)'); continue; }
    assert.match(l.edition, /^hl=[a-z]{2}(-[A-Z]{2})?&gl=[A-Z]{2}&ceid=[A-Z]{2}:[a-z]{2}(-Hans)?$/, l.code);
  }
  for (const l of NEW_LANGUAGES) { assert.ok(['ltr', 'rtl'].includes(l.dir), l.code); assert.ok(l.flag === null || /^\p{RI}\p{RI}$/u.test(l.flag), l.code); }
  assert.deepEqual(NEW_LANGUAGES.filter((l) => l.dir === 'rtl').map((l) => l.code), ['ar']);
  assert.ok(!Object.values(PUBLISHER_FEEDS).flat().some((f) => /meduza/i.test(f.url)), 'Meduza is not a default source');
});

test('Google News titles are split into headline and outlet', () => {
  assert.deepEqual(splitGoogleTitle('Vláda schválila rozpočet - Seznam Zprávy'), { title: 'Vláda schválila rozpočet', source: 'Seznam Zprávy' });
  assert.deepEqual(splitGoogleTitle('Bez zdroje'), { title: 'Bez zdroje' });
});

test('native topic: local-language stories from Google News, outlet kept, no English involved', async () => {
  const d = deps({ 'section/topic/TECHNOLOGY': rss([{ title: 'Nový telefon - iDNES', date: fresh }, { title: 'Čip od Intelu - Lupa', date: fresh }, { title: 'Aplikace roku - Zdroják', date: fresh }]) });
  const r = await fetchLanguageStories(topic('tech-news'), requireLanguageSpec('cs'), d);
  assert.equal(r.sourceLanguage, 'native'); assert.equal(r.via, 'google');
  assert.deepEqual(r.stories.map((s) => s.source), ['iDNES', 'Lupa', 'Zdroják']);
  assert.ok(d.fetched.every((u) => u.includes('hl=cs&gl=CZ')));
});

test('general news topics read the publisher feeds first, then Google News NATION / WORLD, deduplicated', async () => {
  const d = deps({
    'ct24.ceskatelevize.cz': rss([{ title: 'Hlavní zpráva dne', date: fresh }, { title: 'Druhá zpráva', date: fresh }]),
    'irozhlas.cz': rss([{ title: 'Třetí zpráva', date: fresh }]),
    'section/topic/NATION': rss([{ title: 'Hlavní zpráva dne - Jiný web', date: fresh }, { title: 'Čtvrtá zpráva - Web', date: fresh }]),
  });
  const r = await fetchLanguageStories(topic('daily-news'), requireLanguageSpec('cs'), d);
  assert.equal(r.via, 'publisher+google');
  assert.equal(r.stories.length, 4); // the duplicate headline is dropped
  assert.ok(d.fetched.some((u) => u.includes('ct24')) && d.fetched.some((u) => u.includes('section/topic/NATION')));
});

test('stale items (older than 3 days) are dropped; undated items are kept', async () => {
  const d = deps({ 'section/topic/SCIENCE': rss([{ title: 'Stará zpráva - X', date: 'Mon, 02 Nov 2026 10:00:00 GMT' }, { title: 'Nová jedna - X', date: fresh }, { title: 'Bez data - X' }, { title: 'Nová dvě - X', date: fresh }]) });
  const r = await fetchLanguageStories(topic('science-discoveries'), requireLanguageSpec('cs'), d);
  assert.deepEqual(r.stories.map((s) => s.title), ['Nová jedna', 'Bez data', 'Nová dvě']);
});

test('preferred keywords rank first, nothing is dropped', () => {
  const out = dedupeAndRank([{ title: 'Recept na guláš', source: 'a', sourceType: 'rss' }, { title: 'NASA vypustila sondu', source: 'b', sourceType: 'rss' }] as any, ['nasa']);
  assert.deepEqual(out.map((s) => s.title), ['NASA vypustila sondu', 'Recept na guláš']);
});

test('too few local stories (feeds down or thin): the English sources are retold instead, without Exa', async () => {
  const english = [{ title: 'Story A', source: 'X', sourceType: 'rss' }, { title: 'Story B', source: 'Y', sourceType: 'rss' }, { title: 'Story C', source: 'Z', sourceType: 'rss' }];
  const d = deps({ 'section/topic/SCIENCE': rss([{ title: 'Jediná - X', date: fresh }]) }, english);
  const r = await fetchLanguageStories(topic('science-discoveries'), requireLanguageSpec('fi'), d);
  assert.equal(r.sourceLanguage, 'english'); assert.equal(r.via, 'english-fallback'); assert.equal(r.stories.length, 3);
  const down = await fetchLanguageStories(topic('science-discoveries'), requireLanguageSpec('fi'), deps({}, english));
  assert.equal(down.sourceLanguage, 'english');
});

test('format topics (gaming, eli5, simulate-this) go straight to the English sources and never call a feed', async () => {
  for (const id of ['gaming', 'eli5', 'simulate-this']) {
    const d = deps({}, [{ title: 'S', source: 'X', sourceType: 'rss' }]);
    const r = await fetchLanguageStories(topic(id), requireLanguageSpec('ro'), d);
    assert.equal(r.via, 'english-translate'); assert.equal(d.fetched.length, 0);
  }
});

test('wave 3 editions: the exact Google News parameters verified live on 2026-11-20', () => {
  const e = (c: string) => requireLanguageSpec(c).edition;
  assert.equal(e('no'), 'hl=no&gl=NO&ceid=NO:no'); // Norwegian is "no" (Bokmal), not "nb"
  assert.equal(e('zh'), 'hl=zh-CN&gl=CN&ceid=CN:zh-Hans'); // Simplified
  assert.equal(e('sr'), 'hl=sr&gl=RS&ceid=RS:sr');
  assert.equal(googleNewsSectionUrl(requireLanguageSpec('ca'), 'WORLD'), 'https://news.google.com/rss/headlines/section/topic/WORLD?hl=ca&gl=ES&ceid=ES:ca');
});

test('hr has no Google News edition: only publisher feeds are read, and topics without publisher feeds retell the English sources', async () => {
  const d = deps({ 'index.hr': rss([{ title: 'Prva vijest', date: fresh }, { title: 'Druga vijest', date: fresh }, { title: 'Treća vijest', date: fresh }]) });
  const world = await fetchLanguageStories(topic('world-update'), requireLanguageSpec('hr'), d);
  assert.equal(world.sourceLanguage, 'native'); assert.ok(d.fetched.length > 0 && d.fetched.every((u) => !u.includes('news.google.com')));
  const d2 = deps({}, [{ title: 'English story', source: 'X', sourceType: 'rss' }, { title: 'Another', source: 'Y', sourceType: 'rss' }, { title: 'Third', source: 'Z', sourceType: 'rss' }]);
  const tech = await fetchLanguageStories(topic('tech-news'), requireLanguageSpec('hr'), d2);
  assert.equal(tech.sourceLanguage, 'english'); assert.equal(d2.fetched.length, 0);
  assert.throws(() => googleNewsSectionUrl(requireLanguageSpec('hr'), 'WORLD'), /no Google News edition/);
});
