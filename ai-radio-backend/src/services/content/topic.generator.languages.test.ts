import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_KEY: 'test-service-key',
  GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', ANTHROPIC_API_KEY: 'x',
});

import { MemoryControlStore } from '../languages/controls.store.ts';
import { NEW_LANGUAGES, LAUNCH_TOPICS } from '../languages/registry.ts';

test('topic list in a new language: empty while off; only the 12 launch topics when on; English and Piper languages unchanged', async () => {
  const { topicPodcastGenerator } = await import('./topic.generator');
  const { topicsService } = await import('../supabase/topics.service');
  const { languageControls } = await import('../languages/controls');
  const store = new MemoryControlStore(NEW_LANGUAGES.map((l) => l.code));
  languageControls.useStore(store);
  const all = [...LAUNCH_TOPICS.map((t) => t.id), 'us-politics', 'coding-dev', 'startups-vc'].map((id) => ({ id, name: id, category: id === 'us-politics' ? 'news' : 'technology', languages: ['all'] }));
  (topicsService as any).getTopicsList = async (lang: string) => ({ topics: all, categories: [{ id: 'technology', name: 'Technology', count: all.length }, { id: 'news', name: 'News', count: 1 }], _lang: lang });

  assert.deepEqual(await topicPodcastGenerator.getTopicsList('cs'), { topics: [], categories: [] });
  await languageControls.setFlag('cs', { enabled: true }, 't');
  const cs = await topicPodcastGenerator.getTopicsList('cs');
  assert.equal(cs.topics.length, 12);
  assert.ok(!cs.topics.some((t) => ['us-politics', 'coding-dev', 'startups-vc'].includes(t.id)));
  assert.equal(cs.categories.reduce((n, c) => n + c.count, 0), 12);
  assert.equal((await topicPodcastGenerator.getTopicsList('en')).topics.length, all.length);
  assert.equal((await topicPodcastGenerator.getTopicsList('de')).topics.length, all.length);
});

test('episode title date uses the language locale for new languages and stays English for the rest', async () => {
  const { TopicPodcastGenerator } = await import('./topic.generator');
  const g = new TopicPodcastGenerator() as any;
  assert.match(g.displayDate('2026-11-15', 'cs'), /neděle/);
  assert.equal(g.displayDate('2026-11-15', 'en'), g.formatDate('2026-11-15'));
  assert.equal(g.displayDate('2026-11-15', 'de'), g.formatDate('2026-11-15')); // unchanged behaviour for the Piper languages
});
