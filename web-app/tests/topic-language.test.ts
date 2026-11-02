import test from 'node:test';
import assert from 'node:assert/strict';
import {
  PODCAST_LANGUAGES, isPodcastLanguage, podcastLanguageFor, apiLang, topicMatchesLanguage, localizeTopic, topicsForLanguage,
} from '../src/lib/topic-language.ts';
import { getTopics, getTopicEpisode, getTopicEpisodes, generateTopicEpisode, fetchTopicEpisode } from '../src/lib/api/episodes.ts';

// Fixtures shaped like the live GET /api/topics?lang=ja answer (trimmed).
const universal = { id: 'ai-ml', name: 'AI & Machine Learning', description: 'Latest in AI', category: 'technology', languages: ['all'] };
const jaOnly = {
  id: 'nihon-news', name: '日本ニュース', description: '日本の最新ニュース', category: 'news', languages: ['ja'],
  localizedNames: { ja: '日本ニュース' }, localizedDescriptions: { ja: '日本の最新ニュース' },
};
const esPt = {
  id: 'futbol', name: 'Fútbol Mundial', description: 'Fútbol', category: 'sports', languages: ['es', 'pt'],
  localizedNames: { es: 'Fútbol Mundial', pt: 'Futebol Mundial' }, localizedDescriptions: { pt: 'Futebol' },
};
const cricket = {
  id: 'cricket-updates', name: 'क्रिकेट अपडेट', description: 'hi desc', category: 'sports', languages: ['all'],
  localizedNames: { en: 'Cricket Updates' },
};

test('podcast languages are exactly Android PODCAST_LANGUAGES', () => {
  assert.deepEqual(PODCAST_LANGUAGES.map((l) => l.code), ['en', 'es', 'fr', 'de', 'pt', 'it']);
  assert.equal(isPodcastLanguage('fr'), true);
  for (const bad of ['ja', 'hi', 'tl', 'EN', '', null, undefined, 5]) assert.equal(isPodcastLanguage(bad), false, String(bad));
});

test('episode language starts from the preference when supported, else English', () => {
  assert.equal(podcastLanguageFor('de'), 'de');
  assert.equal(podcastLanguageFor('ja'), 'en');
  assert.equal(podcastLanguageFor(undefined), 'en');
});

test('apiLang only lets two-letter lowercase codes through', () => {
  assert.equal(apiLang('ja'), 'ja');
  for (const bad of ['', 'english', 'EN', 'en&x=1', 'e', null, undefined, 3]) assert.equal(apiLang(bad), 'en', String(bad));
});

test('topicMatchesLanguage: all / missing / listed match, other locales do not', () => {
  assert.equal(topicMatchesLanguage(universal, 'ja'), true);
  assert.equal(topicMatchesLanguage({}, 'ja'), true);
  assert.equal(topicMatchesLanguage({ languages: [] }, 'ja'), true);
  assert.equal(topicMatchesLanguage(jaOnly, 'ja'), true);
  assert.equal(topicMatchesLanguage(jaOnly, 'en'), false);
  assert.equal(topicMatchesLanguage(esPt, 'pt'), true);
  assert.equal(topicMatchesLanguage(esPt, 'fr'), false);
});

test('localizeTopic uses localized name/description when present, otherwise leaves the topic alone', () => {
  assert.equal(localizeTopic(esPt, 'pt').name, 'Futebol Mundial');
  assert.equal(localizeTopic(esPt, 'pt').description, 'Futebol');
  assert.equal(localizeTopic(esPt, 'es').description, 'Fútbol'); // no es description -> keeps base
  assert.equal(localizeTopic(cricket, 'en').name, 'Cricket Updates');
  assert.equal(localizeTopic(universal, 'ja'), universal);
  assert.equal(localizeTopic(esPt, 'it'), esPt);
});

test('topicsForLanguage filters, localizes and keeps order', () => {
  const all = [jaOnly, universal, esPt, cricket];
  assert.deepEqual(topicsForLanguage(all, 'en').map((t) => [t.id, t.name]), [['ai-ml', 'AI & Machine Learning'], ['cricket-updates', 'Cricket Updates']]);
  assert.deepEqual(topicsForLanguage(all, 'ja').map((t) => t.id), ['nihon-news', 'ai-ml', 'cricket-updates']);
  assert.deepEqual(topicsForLanguage(all, 'pt').map((t) => t.name), ['AI & Machine Learning', 'Futebol Mundial', 'क्रिकेट अपडेट']);
});

// --- API calls: every one carries lang; fetch is mocked, nothing leaves the machine ---
function mockFetch(body: unknown, status = 200) {
  const calls: { url: URL; method: string; body?: Record<string, unknown> }[] = [];
  const original = globalThis.fetch;
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    calls.push({ url: new URL(String(url)), method: init?.method ?? 'GET', body: init?.body ? JSON.parse(String(init.body)) : undefined });
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  }) as typeof fetch;
  return { calls, restore: () => { globalThis.fetch = original; } };
}

test('getTopics sends lang and applies the same rules to the answer', async () => {
  const m = mockFetch({ success: true, data: { topics: [jaOnly, universal], categories: [{ id: 'news', name: 'News', count: 1 }, { id: 'technology', name: 'Technology', count: 1 }] } });
  try {
    const en = await getTopics('en');
    assert.equal(m.calls[0].url.pathname.endsWith('/topics'), true);
    assert.equal(m.calls[0].url.searchParams.get('lang'), 'en');
    assert.deepEqual(en.topics.map((t) => t.id), ['ai-ml']); // ja-only topic dropped even if a stale answer carried it
    const ja = await getTopics('ja');
    assert.equal(m.calls[1].url.searchParams.get('lang'), 'ja');
    assert.deepEqual(ja.topics.map((t) => t.id), ['nihon-news', 'ai-ml']);
    assert.deepEqual(ja.categories, ['News', 'Technology']);
    await getTopics('not a language');
    assert.equal(m.calls[2].url.searchParams.get('lang'), 'en');
  } finally { m.restore(); }
});

test('episode reads send lang (and limit) and unwrap data.episode', async () => {
  const ep = { id: 'ai-ml-2026-11-01-es', status: 'completed', audioUrl: 'https://x/a.mp3', title: 't', createdAt: 'c' };
  const m = mockFetch({ success: true, data: { episode: ep, isNew: false, ads: [] } });
  try {
    assert.deepEqual(await getTopicEpisode('ai-ml', 'es'), ep);
    assert.equal(m.calls[0].url.searchParams.get('lang'), 'es');
    assert.deepEqual(await fetchTopicEpisode('ai-ml', 'fr'), ep);
    assert.equal(m.calls[1].url.searchParams.get('lang'), 'fr');
  } finally { m.restore(); }
  const m2 = mockFetch({ success: true, data: { topicId: 'ai-ml', language: 'de', episodes: [] } });
  try {
    await getTopicEpisodes('ai-ml', 10, 'de');
    assert.equal(m2.calls[0].url.searchParams.get('lang'), 'de');
    assert.equal(m2.calls[0].url.searchParams.get('limit'), '10');
  } finally { m2.restore(); }
});

test('getTopicEpisode defaults to English and swallows errors as null', async () => {
  const m = mockFetch({ success: false, error: 'Topic not found' }, 404);
  try {
    assert.equal(await getTopicEpisode('nope'), null);
    assert.equal(m.calls[0].url.searchParams.get('lang'), 'en');
    await assert.rejects(() => fetchTopicEpisode('nope'), /Topic not found/);
  } finally { m.restore(); }
});

test('generateTopicEpisode posts the language and the force flag, and unwraps the episode', async () => {
  const placeholder = { id: 'ai-ml-2026-11-02-es', status: 'generating', title: 'Regenerating…', createdAt: 'c' };
  const m = mockFetch({ success: true, data: { episode: placeholder, isNew: false, message: 'Regeneration started.' } });
  try {
    const ep = await generateTopicEpisode('ai-ml', 'es', false);
    assert.equal(ep.status, 'generating');
    assert.equal(m.calls[0].method, 'POST');
    assert.deepEqual(m.calls[0].body, { forceRegenerate: false, language: 'es' });
    await generateTopicEpisode('ai-ml', 'en', true);
    assert.deepEqual(m.calls[1].body, { forceRegenerate: true, language: 'en' });
    await generateTopicEpisode('ai-ml');
    assert.deepEqual(m.calls[2].body, { forceRegenerate: false, language: 'en' });
  } finally { m.restore(); }
});

test('generateTopicEpisode surfaces the server body on language_unavailable / daily_limit', async () => {
  const m = mockFetch({ success: false, error: 'language_unavailable', message: 'This language is not available yet.' }, 400);
  try {
    await assert.rejects(() => generateTopicEpisode('ai-ml', 'fr'), (e: Error & { status?: number; body?: { message?: string } }) => {
      assert.equal(e.status, 400);
      assert.equal(e.body?.message, 'This language is not available yet.');
      return true;
    });
  } finally { m.restore(); }
});
