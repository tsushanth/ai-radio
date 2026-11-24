import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, { NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_KEY: 'test-service-key', GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', ANTHROPIC_API_KEY: 'x' });

import {
  normalizeLanguage, dateLocaleFor, formatEpisodeDate, categoryName, hasCategoryNames, localizeTopic, dailyBriefPush,
  languageFromBody, withLanguage, PUSH_LANGUAGES, contentLanguage,
} from './localized.ts';
import { CATEGORY_ORDER, CATEGORY_NAMES_I18N, CATEGORY_LANGUAGES } from '../../config/i18n/category-names.ts';
import { TOPIC_I18N } from '../../config/i18n/topic-names.ts';
import { TOPICS, CATEGORY_NAMES } from '../../config/topics.ts';
import { NEW_LANGUAGES } from './registry.ts';
import { PodcastErrorCode, createPodcastError } from '../../types/podcast-errors.ts';

/** Every language the backend can be asked for: English, the five Piper languages, Korean and Filipino (Android pickers), and the 25 additional ones. */
const ALL_LANGS = ['en', 'es', 'fr', 'de', 'pt', 'it', 'ko', 'fil', ...NEW_LANGUAGES.map((l) => l.code), 'zh-TW', 'zh-HK'];
const topic = (id: string) => TOPICS.find((t) => t.id === id)!;

test('normalizeLanguage maps regional and legacy tags to the table codes', () => {
  assert.equal(normalizeLanguage('pt-BR'), 'pt');
  assert.equal(normalizeLanguage('tl'), 'fil');
  assert.equal(normalizeLanguage('fil'), 'fil'); // must not become fi (Finnish)
  assert.equal(normalizeLanguage('zh-Hans'), 'zh');
  assert.equal(normalizeLanguage('zh'), 'zh'); // old clients: Simplified, exactly as before
  assert.equal(normalizeLanguage('zh-CN'), 'zh');
  assert.equal(normalizeLanguage('zh_SG'), 'zh');
  assert.equal(normalizeLanguage('zh-Hans-HK'), 'zh');
  assert.equal(normalizeLanguage('zh-TW'), 'zh-TW');
  assert.equal(normalizeLanguage('zh_tw'), 'zh-TW');
  assert.equal(normalizeLanguage('zh-Hant'), 'zh-TW');
  assert.equal(normalizeLanguage('zh-Hant-TW'), 'zh-TW');
  assert.equal(normalizeLanguage('zh-MO'), 'zh-TW');
  assert.equal(normalizeLanguage('zh-HK'), 'zh-HK');
  assert.equal(normalizeLanguage('zh-Hant-HK'), 'zh-HK');
  assert.equal(contentLanguage('zh-TW'), 'zh');
  assert.equal(contentLanguage('zh-HK'), 'zh');
  assert.equal(contentLanguage('pt-BR'), 'pt');
  assert.equal(normalizeLanguage('nb'), 'no');
  assert.equal(normalizeLanguage('in'), 'id');
  assert.equal(normalizeLanguage(''), 'en');
  assert.equal(normalizeLanguage(undefined), 'en');
  assert.equal(normalizeLanguage('<script>'), 'en');
});

test('episode-title dates: each language uses its own locale, English only for en or an unknown language', () => {
  assert.equal(formatEpisodeDate('2026-11-15', 'en'), 'Sunday, November 15');
  assert.match(formatEpisodeDate('2026-11-15', 'es'), /domingo/);
  assert.match(formatEpisodeDate('2026-11-15', 'fr'), /dimanche/);
  assert.match(formatEpisodeDate('2026-11-15', 'de'), /Sonntag/);
  assert.match(formatEpisodeDate('2026-11-15', 'pt-BR'), /domingo/);
  assert.match(formatEpisodeDate('2026-11-15', 'it'), /domenica/);
  assert.match(formatEpisodeDate('2026-11-15', 'ko'), /일요일/);
  assert.match(formatEpisodeDate('2026-11-15', 'tl'), /Linggo/i);
  assert.match(formatEpisodeDate('2026-11-15', 'ja'), /日曜日/);
  assert.match(formatEpisodeDate('2026-11-15', 'ru'), /воскресенье/);
  assert.match(formatEpisodeDate('2026-11-15', 'ar'), /الأحد/);
  assert.equal(formatEpisodeDate('2026-11-15', 'xx'), 'Sunday, November 15');
  assert.equal(dateLocaleFor('xx'), 'en-US');
  assert.match(formatEpisodeDate('2026-11-15', 'de', true), /2026/);
});

test('episode-title date does not depend on the server time zone (the day is read as UTC)', () => {
  assert.equal(formatEpisodeDate('2026-01-01', 'en'), 'Thursday, January 1');
  assert.equal(formatEpisodeDate('2026-12-31', 'en'), 'Thursday, December 31');
});

test('every supported language has a complete set of category names, and none is the English word unless it really is', () => {
  for (const lang of ALL_LANGS) {
    assert.ok(hasCategoryNames(lang), `${lang} has no complete category names`);
    for (const c of CATEGORY_ORDER) assert.ok(CATEGORY_NAMES_I18N[c][lang].trim(), `${lang}/${c} empty`);
  }
  assert.deepEqual([...CATEGORY_LANGUAGES].sort(), [...ALL_LANGS].sort());
  // English values equal the legacy English table, so English clients see no change.
  for (const c of CATEGORY_ORDER) assert.equal(categoryName(c, 'en'), CATEGORY_NAMES[c]);
});

test('a row of category chips never mixes languages', () => {
  for (const lang of ALL_LANGS.filter((l) => l !== 'en')) {
    const row = CATEGORY_ORDER.map((c) => categoryName(c, lang));
    const english = CATEGORY_ORDER.map((c) => categoryName(c, 'en'));
    const sameAsEnglish = row.filter((n, i) => n === english[i]).length;
    // A few words are genuinely shared (Sport, Technologie); a row that is mostly English means a missing translation.
    assert.ok(sameAsEnglish <= 3, `${lang}: ${row.join(', ')} looks mostly English`);
  }
  // An unsupported language falls back as a whole row, never a mix.
  assert.deepEqual(CATEGORY_ORDER.map((c) => categoryName(c, 'xx')), CATEGORY_ORDER.map((c) => categoryName(c, 'en')));
  assert.deepEqual(CATEGORY_ORDER.map((c) => categoryName(c, 'es-MX')), CATEGORY_ORDER.map((c) => categoryName(c, 'es')));
});

test('topic names: every catalog topic shown in a language resolves a name in that language', () => {
  const missing: string[] = [];
  for (const t of TOPICS) {
    for (const lang of ALL_LANGS) {
      const shown = t.languages.includes('all') ? true : t.languages.includes(contentLanguage(lang));
      if (!shown || lang === 'en') continue;
      const { name, description } = localizeTopic(t, lang);
      // The 12 launch topics are the only ones offered in the additional languages; coding-dev and startups-vc only in the built-in ones.
      const additional = NEW_LANGUAGES.some((l) => l.code === contentLanguage(lang));
      if (additional && ['coding-dev', 'startups-vc'].includes(t.id)) continue;
      if (name === t.name && !t.localizedNames?.[lang]) missing.push(`${t.id}/${lang}`);
      assert.ok(description);
    }
  }
  assert.deepEqual(missing, []);
});

test('topic names: the database row wins, then the built-in table, then the English base text', () => {
  const t = topic('daily-news');
  assert.equal(localizeTopic(t, 'en').name, 'Daily News Brief');
  assert.equal(localizeTopic(t, 'es').name, TOPIC_I18N['daily-news'].es[0]);
  assert.equal(localizeTopic({ ...t, localizedNames: { es: 'Desde la base de datos' } }, 'es').name, 'Desde la base de datos');
  assert.equal(localizeTopic(t, 'xx').name, 'Daily News Brief');
  assert.equal(localizeTopic(t, 'tl').name, TOPIC_I18N['daily-news'].fil[0]);
  assert.equal(localizeTopic(topic('cricket-updates'), 'en').name, 'Cricket Updates');
  assert.equal(localizeTopic(topic('cricket-updates'), 'hi').name, 'क्रिकेट अपडेट');
});

test('the built-in topic table has a name and description for every language of every topic it lists', () => {
  for (const [id, byLang] of Object.entries(TOPIC_I18N)) {
    for (const [lang, [name, description]] of Object.entries(byLang)) {
      assert.ok(name.trim() && description.trim(), `${id}/${lang}`);
      assert.ok(ALL_LANGS.includes(lang), `${id}: unknown language ${lang}`);
    }
  }
  // 14 topics + the Chinese-only topic (Traditional wording only); 7 built-in languages have all 14, the 25 additional languages have the 12 launch topics.
  assert.equal(Object.keys(TOPIC_I18N).length, 15);
  for (const lang of ['es', 'fr', 'de', 'pt', 'it', 'ko', 'fil']) for (const id of Object.keys(TOPIC_I18N).filter((i) => i !== 'zhongguo-xinwen')) assert.ok(TOPIC_I18N[id][lang], `${id}/${lang}`);
});

test('topics service: the list endpoint returns names and categories in the requested language, English fallback', async () => {
  const { topicsService } = await import('../supabase/topics.service');
  (topicsService as any).getAllActiveTopics = async () => TOPICS.filter((t) => t.isActive); // no database in tests
  const es = await topicsService.getTopicsList('es');
  assert.ok(es.topics.length > 5);
  for (const c of es.categories) assert.equal(c.name, CATEGORY_NAMES_I18N[c.id].es);
  const dailyNews = es.topics.find((t) => t.id === 'daily-news')!;
  assert.equal(dailyNews.name, TOPIC_I18N['daily-news'].es[0]);
  // The row of chips (categories) and the topic names are all Spanish: no English catalog name survives.
  const englishNames = new Set(TOPICS.filter((t) => !t.localizedNames).map((t) => t.name));
  for (const t of es.topics) assert.ok(!englishNames.has(t.name), `${t.id} still English in es: ${t.name}`);
  const en = await topicsService.getTopicsList('en');
  assert.deepEqual(en.categories.map((c) => c.name).slice(0, 2), ['News', 'Technology']);
  const xx = await topicsService.getTopicsList('xx');
  assert.ok(xx.categories.every((c) => c.name === CATEGORY_NAMES[c.id]));
});

test('daily brief push copy: every supported language has all four texts, {n} is filled, unknown languages get English', () => {
  for (const lang of ALL_LANGS) {
    assert.ok(PUSH_LANGUAGES.includes(lang), `push copy missing for ${lang}`);
    const c = dailyBriefPush(lang, 7);
    for (const v of [c.readyTitle, c.readyBody, c.failTitle, c.failBody]) assert.ok(v.trim());
    assert.ok(c.readyBody.includes('7'), `${lang}: minutes not filled in: ${c.readyBody}`);
    assert.ok(!c.readyBody.includes('{n}'));
  }
  const en = dailyBriefPush('en', 5);
  assert.equal(en.readyTitle, '☀️ Your Daily Brief is Ready');
  assert.equal(en.readyBody, 'Your 5-minute personalized briefing is ready to play.');
  assert.equal(en.failTitle, 'Daily Brief Update');
  assert.deepEqual(dailyBriefPush('xx', 5), en);
  assert.deepEqual(dailyBriefPush(undefined, 5), en);
  assert.notEqual(dailyBriefPush('es', 5).readyTitle, en.readyTitle);
  assert.match(dailyBriefPush('ja', 3).readyBody, /3分/);
});

test('the scheduler sends the stored language', async () => {
  const { dailyBriefScheduler } = await import('../scheduler/daily-brief.scheduler');
  const { pushNotificationService } = await import('../notifications/push.service');
  const sent: any[] = [];
  const original = pushNotificationService.sendToUser;
  (pushNotificationService as any).sendToUser = async (_tokens: string[], payload: any) => { sent.push(payload); };
  try {
    const s = dailyBriefScheduler as any;
    await s.sendReadyNotification({ user_id: 'u', device_tokens: ['t'], preferences: { language: 'de' } }, 360);
    await s.sendFailureNotification({ user_id: 'u', device_tokens: ['t'], preferences: { language: 'fr' } });
    await s.sendReadyNotification({ user_id: 'u', device_tokens: ['t'], preferences: {} }, 120);
  } finally {
    (pushNotificationService as any).sendToUser = original;
  }
  assert.equal(sent[0].title, dailyBriefPush('de', 6).readyTitle);
  assert.equal(sent[0].body, dailyBriefPush('de', 6).readyBody);
  assert.equal(sent[1].title, dailyBriefPush('fr').failTitle);
  assert.equal(sent[2].title, '☀️ Your Daily Brief is Ready'); // no language stored: English
});

test('device registration stores the language inside preferences without dropping other keys', () => {
  assert.equal(languageFromBody('pt-BR'), 'pt');
  assert.equal(languageFromBody('tl'), 'fil');
  assert.equal(languageFromBody(''), undefined);
  assert.equal(languageFromBody(undefined), undefined);
  assert.equal(languageFromBody(42), undefined);
  assert.deepEqual(withLanguage({ topics: ['ai-ml'], language: 'en' }, 'es'), { topics: ['ai-ml'], language: 'es' });
  assert.deepEqual(withLanguage(null, 'es'), { language: 'es' });
  assert.deepEqual(withLanguage(['x'], 'es'), { language: 'es' });
  assert.equal(withLanguage({ a: 1 }, undefined), undefined);
});

test('job errors carry a stable code next to the English message, for every code', () => {
  for (const code of Object.values(PodcastErrorCode)) {
    const e = createPodcastError(code);
    assert.equal(e.code, code);
    assert.ok(e.userMessage.trim(), `${code} has no message`);
    assert.match(code, /^[A-Z_]+$/);
  }
});

test('topic names: a language like __proto__ or constructor (straight from a query string) falls back to English text', () => {
  const t = topic('daily-news');
  for (const lang of ['__proto__', 'constructor', 'toString', 'hasOwnProperty']) {
    const r = localizeTopic(t, lang);
    assert.equal(typeof r.name, 'string');
    assert.equal(typeof r.description, 'string');
    assert.equal(r.name, 'Daily News Brief');
  }
});

test('Traditional Chinese: Taiwan and Hong Kong have their own category names, topic names, push copy and date locale', () => {
  assert.equal(categoryName('news', 'zh'), '新闻');
  assert.equal(categoryName('news', 'zh-TW'), '新聞');
  assert.equal(categoryName('sports', 'zh-Hant-HK'), '體育');
  assert.equal(categoryName('technology', 'zh-CN'), '科技');
  assert.equal(localizeTopic(topic('world-update'), 'zh').name, '世界动态');
  assert.equal(localizeTopic(topic('world-update'), 'zh-TW').name, '世界動態');
  assert.equal(localizeTopic(topic('ai-ml'), 'zh-TW').name, '人工智慧與機器學習'); // Taiwan wording
  assert.equal(localizeTopic(topic('ai-ml'), 'zh-HK').name, '人工智能與機器學習'); // Hong Kong wording
  assert.equal(dailyBriefPush('zh', 3).readyTitle, '☀️ 你的每日简报已就绪');
  assert.equal(dailyBriefPush('zh-TW', 3).readyTitle, '☀️ 你的每日簡報已就緒');
  assert.match(dailyBriefPush('zh-HK', 3).readyBody, /3分鐘/);
  assert.equal(dateLocaleFor('zh'), 'zh-CN');
  assert.equal(dateLocaleFor('zh-TW'), 'zh-TW');
  assert.equal(dateLocaleFor('zh-HK'), 'zh-HK');
  assert.match(formatEpisodeDate('2026-11-15', 'zh-TW'), /11月15日/);
  assert.match(formatEpisodeDate('2026-11-15', 'zh-HK'), /11月15日/);
  assert.equal(languageFromBody('zh-TW'), 'zh-TW');
  assert.equal(languageFromBody('zh-Hant-HK'), 'zh-HK');
  assert.equal(languageFromBody('zh'), 'zh');
  assert.deepEqual(withLanguage({ topics: ['ai-ml'] }, languageFromBody('zh-HK')), { topics: ['ai-ml'], language: 'zh-HK' });
  // No Simplified-only character leaks into the Traditional tables.
  const simplifiedOnly = /[闻术简报业务乐体动态艺级为这个们来说时开发网络软件户员设计]/;
  for (const lang of ['zh-TW', 'zh-HK']) {
    for (const c of CATEGORY_ORDER) assert.ok(!simplifiedOnly.test(CATEGORY_NAMES_I18N[c][lang]), `${lang}/${c}`);
    for (const [id, byLang] of Object.entries(TOPIC_I18N)) if (byLang[lang]) assert.ok(!simplifiedOnly.test(byLang[lang].join('')), `${id}/${lang}`);
    const p = dailyBriefPush(lang, 3);
    assert.ok(!simplifiedOnly.test([p.readyTitle, p.readyBody, p.failTitle, p.failBody].join('')), lang);
  }
});

test('Traditional Chinese: the topic list uses the Chinese gate and topics, in Traditional wording', async () => {
  const { topicsService } = await import('../supabase/topics.service');
  (topicsService as any).getAllActiveTopics = async () => TOPICS.filter((t) => t.isActive);
  const zh = await topicsService.getTopics('zh');
  const tw = await topicsService.getTopics('zh-TW');
  const hk = await topicsService.getTopics('zh-HK');
  assert.ok(zh.some((t) => t.languages.includes('zh') && !t.languages.includes('all')), 'a Chinese-only topic exists in the catalog');
  assert.deepEqual(tw.map((t) => t.id), zh.map((t) => t.id));
  assert.deepEqual(hk.map((t) => t.id), zh.map((t) => t.id));
  const list = await topicsService.getTopicsList('zh-TW');
  assert.deepEqual(list.categories.map((c) => c.name).slice(0, 2), ['新聞', '科技']);
  assert.equal(list.topics.find((t) => t.id === 'daily-news')!.name, '每日新聞簡報');
  const simplified = await topicsService.getTopicsList('zh');
  assert.equal(simplified.categories[0].name, '新闻');
});

test('LLM output-language names: Simplified, Traditional (Taiwan) and Traditional (Hong Kong) are named apart; junk never reaches the prompt', async () => {
  const { generatePodcastPrompt } = await import('../ai/prompts');
  const { topicPodcastGenerator } = await import('../content/topic.generator');
  const { deepDiveGenerator } = await import('../content/deepdive.generator');
  const ctx = (language: string): any => ({
    user_name: 'T', date: '2026-11-15', time_of_day: 'morning', content: { emails: { total_count: 0 }, calendar: { total_events: 0 } },
    preferences: { language, briefing_time: '5-minute', include_email: false, include_calendar: false, include_weather: false },
  });
  assert.match(generatePodcastPrompt(ctx('zh')), /ENTIRE script in Simplified Chinese\./);
  assert.match(generatePodcastPrompt(ctx('zh-TW')), /ENTIRE script in Traditional Chinese \(Taiwan\)\./);
  assert.match(generatePodcastPrompt(ctx('zh-HK')), /ENTIRE script in Traditional Chinese \(Hong Kong\)\./);
  for (const gen of [topicPodcastGenerator as any, deepDiveGenerator as any]) {
    assert.match(gen.getLanguageName('zh'), /^Simplified Chinese/);
    assert.match(gen.getLanguageName('zh-TW'), /^Traditional Chinese \(Taiwan/);
    assert.equal(gen.getLanguageName('zh-HK'), 'Traditional Chinese (Hong Kong)');
    assert.equal(gen.getLanguageName('ja'), 'Japanese');
    for (const junk of ['constructor', '__proto__', 'toString', 'zh-Hant', 'xx']) assert.equal(gen.getLanguageName(junk), 'English', junk);
  }
  for (const junk of ['constructor', '__proto__', 'toString']) {
    const p = generatePodcastPrompt(ctx(junk));
    assert.ok(!p.includes('function') && !p.includes('[object'), junk);
    assert.match(p, /ENTIRE script in English\./);
  }
});
