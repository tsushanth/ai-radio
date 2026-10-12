import test from 'node:test';
import assert from 'node:assert/strict';
import { androidIntentUrl, liveMeta, parseLang, playStoreUrl, readUtm, topicFromStatus } from './share.ts';

test('language: known codes pass, everything else is English', () => {
  assert.equal(parseLang('fr'), 'fr');
  for (const bad of [undefined, '', 'xx', 'EN', ['zz'], 5, '../etc']) assert.equal(parseLang(bad), 'en', JSON.stringify(bad));
  assert.equal(parseLang(['es', 'fr']), 'es');
});

test('utm: defaults when absent, passes clean values, drops anything odd', () => {
  assert.deepEqual(readUtm({}), { utm_source: 'web_live', utm_medium: 'landing', utm_campaign: 'live_share' });
  assert.deepEqual(
    readUtm({ utm_source: 'audexa_android', utm_medium: 'share', utm_campaign: 'live_share', utm_content: 'en' }),
    { utm_source: 'audexa_android', utm_medium: 'share', utm_campaign: 'live_share', utm_content: 'en' },
  );
  const odd = readUtm({ utm_source: 'a&b=c', utm_medium: '<script>', utm_campaign: 'x'.repeat(200), utm_content: 'a b' });
  assert.equal(odd.utm_source, 'web_live');
  assert.equal(odd.utm_medium, 'landing');
  assert.equal(odd.utm_campaign, 'live_share');
  assert.equal(odd.utm_content, undefined);
});

test('topic: only from real speech metadata, language prefix stripped', () => {
  assert.equal(topicFromStatus({ now_playing: { source: 'speech', topic_name: '[en] US Politics' } }), 'US Politics');
  assert.equal(topicFromStatus({ now_playing: { source: 'speech', remaining_seconds: 40 } }), null); // what the radio usually sends
  assert.equal(topicFromStatus({ now_playing: { source: 'music', topic_name: 'x' } }), null);
  assert.equal(topicFromStatus({ now_playing: { source: 'speech', topic_name: '   ' } }), null);
  assert.equal(topicFromStatus({ now_playing: { source: 'speech', topic_name: 'x'.repeat(500) } }), null);
  assert.equal(topicFromStatus(null), null);
  assert.equal(topicFromStatus('nope'), null);
});

test('meta: generic without a topic, mentions it with one, never claims listeners', () => {
  const generic = liveMeta(null);
  assert.ok(!generic.description.includes('Recently on air'));
  const withTopic = liveMeta('World Update');
  assert.ok(withTopic.description.includes('World Update'));
  for (const m of [generic, withTopic]) {
    assert.ok(!/listeners|people are/i.test(m.title + m.description));
    assert.ok(m.description.includes('AI-generated'));
  }
});

test('play store link uses the real package and carries the utm referrer', () => {
  const url = playStoreUrl({ utm_source: 'audexa_android', utm_medium: 'share', utm_campaign: 'live_share' });
  assert.ok(url.startsWith('https://play.google.com/store/apps/details?id=com.kreativekoala.audexa&referrer='));
  assert.equal(new URL(url).searchParams.get('referrer'), 'utm_source=audexa_android&utm_medium=share&utm_campaign=live_share');
});

test('android intent url targets the app and falls back to Play', () => {
  const url = androidIntentUrl('en', { utm_source: 's', utm_medium: 'm', utm_campaign: 'c' });
  assert.ok(url.startsWith('intent://audexa.app/live?lang=en&'));
  assert.ok(url.includes('package=com.kreativekoala.audexa'));
  assert.ok(url.includes('S.browser_fallback_url=https%3A%2F%2Fplay.google.com'));
});
