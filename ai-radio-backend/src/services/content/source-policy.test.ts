import test from 'node:test';
import assert from 'node:assert/strict';
import { TOPIC_SOURCE_POLICY, getSourcePolicy, getExaConfig, disabledReason } from './source-policy.ts';
import { exaSourceEnabled, redditSourceEnabled, redditArchiveEnabled, sourceCacheEnabled, exaDailyCap } from './source-flags.ts';

/** The 54 English topics of the live catalog on 2026-11-12 (GET /api/topics?lang=en). */
const LIVE_IDS = `us-politics sports-roundup cricket-updates anime-manga world-update ai-ml coding-dev startups-vc markets-finance space-nasa science-discoveries
simulate-this future-shock health-wellness gaming crypto-blockchain daily-news trolley-problem dead-founders-club now-streaming side-hustle-hour startup-autopsy
crypto-corner eli5 conspiracy-or-fact unpopular-opinions life-hacks landlord-vs-tenant am-i-overthinking whats-trending open-source-spotlight ai-research-frontier
food-for-thought climate-watch money-matters heart-to-heart career-crossroads parenting-unfiltered health-check-show roast-my-resume tifu-radio would-you-rather
shower-thoughts tech-support-theater dating-app-diaries plot-twist ai-or-human tech-news f1-racing nba-basketball european-news a24-studio urban-beekeeping-for-beginners
ai-artificial-intelligence`.split(/\s+/);

test('every one of the 54 live topics has a decision with a reason', () => {
  assert.equal(LIVE_IDS.length, 54);
  assert.equal(new Set(LIVE_IDS).size, 54);
  for (const id of LIVE_IDS) {
    const p = TOPIC_SOURCE_POLICY[id];
    assert.ok(p, `missing policy for ${id}`);
    assert.ok(p.reason.length > 20, `reason for ${id}`);
  }
  assert.deepEqual(Object.keys(TOPIC_SOURCE_POLICY).filter(id => !LIVE_IDS.includes(id)), []);
});

test('46 topics are Reddit-fed in the catalog: 15 with a valid subreddit name and 31 with an invalid one', () => {
  const entries = Object.values(TOPIC_SOURCE_POLICY);
  assert.equal(entries.filter(p => p.reddit === 'ok').length, 15);
  assert.equal(entries.filter(p => p.reddit === 'invalid').length, 31);
});

test('Exa topics match the radio (us-politics, world-update first; ai-ml, coding-dev, startups-vc, markets-finance fallback) plus cricket-updates', () => {
  const exaIds = Object.keys(TOPIC_SOURCE_POLICY).filter(id => TOPIC_SOURCE_POLICY[id].exa);
  assert.deepEqual(exaIds.sort(), ['ai-ml', 'coding-dev', 'cricket-updates', 'markets-finance', 'startups-vc', 'us-politics', 'world-update']);
  for (const id of exaIds) assert.ok(getExaConfig(id)!.query.split(' ').length >= 5);
  assert.deepEqual(['us-politics', 'world-update', 'cricket-updates'].map(id => getExaConfig(id)!.position), ['first', 'first', 'first']);
  assert.deepEqual(['ai-ml', 'coding-dev', 'startups-vc', 'markets-finance'].map(id => getExaConfig(id)!.position), ['fallback', 'fallback', 'fallback', 'fallback']);
  assert.equal(getExaConfig('eli5'), undefined);
  assert.equal(getSourcePolicy('some-user-suggested-topic'), undefined);
});

test('every Exa topic that still has a Reddit source is a fallback, never "first" (Reddit stays ahead of Exa)', () => {
  for (const [id, p] of Object.entries(TOPIC_SOURCE_POLICY)) {
    const redditRemoved = (p.removeSources ?? []).some(r => r.name.startsWith('r/'));
    if (p.exa && p.reddit === 'ok' && !redditRemoved) assert.equal(p.exa.position, 'fallback', id);
  }
});

test('disabled topics: 19 show topics with no usable community, each with a reason; none of them has an archive override', () => {
  const disabled = Object.entries(TOPIC_SOURCE_POLICY).filter(([, p]) => p.disabled);
  assert.equal(disabled.length, 19);
  for (const [id, p] of disabled) { assert.ok(p.disabled!.length > 30, id); assert.equal(p.archive, undefined, id); assert.equal(p.reddit, 'invalid', id); }
  assert.ok(disabledReason('shower-thoughts'));
  assert.equal(disabledReason('eli5'), undefined);
  assert.equal(disabledReason('shower-thoughts', { SOURCE_POLICY_DISABLE: '0' } as any), undefined, 'switch to turn the mechanism off');
  assert.equal(disabledReason('unknown-topic'), undefined);
});

test('the 32 show topics split into 13 that read a real subreddit and 19 disabled', () => {
  const shows = Object.entries(TOPIC_SOURCE_POLICY).filter(([, p]) => p.group === 'show' || p.group === 'disabled');
  assert.equal(shows.length, 32);
  assert.equal(shows.filter(([, p]) => p.archive).length, 13);
  assert.equal(shows.filter(([, p]) => p.disabled).length, 19);
});

test('dead catalog sources are listed for removal', () => {
  const removed = (id: string) => (TOPIC_SOURCE_POLICY[id].removeSources ?? []).map(r => r.name);
  assert.deepEqual(removed('nba-basketball'), ['NBA Twitter Official']);
  assert.deepEqual(removed('cricket-updates'), ['Cricbuzz']);
  assert.deepEqual(removed('us-politics').sort(), ['Aaj Tak', 'BBC Hindi', 'NDTV India Hindi', 'r/IndianPolitics']);
  assert.equal(TOPIC_SOURCE_POLICY['us-politics'].replaceUrls!.Politico, 'https://rss.politico.com/politics-news.xml');
});

test('archive overrides name real subreddits (letters, digits, underscore only)', () => {
  const overrides = Object.entries(TOPIC_SOURCE_POLICY).filter(([, p]) => p.archive);
  assert.ok(overrides.length >= 8);
  for (const [id, p] of overrides) assert.match(p.archive!.subreddit!, /^[A-Za-z0-9_]{3,21}$/, id);
  assert.equal(TOPIC_SOURCE_POLICY['eli5'].archive!.subreddit, 'explainlikeimfive');
  assert.equal(TOPIC_SOURCE_POLICY['eli5'].archive!.comments, true);
});

test('flag defaults: Exa OFF, cache OFF, Reddit and archive ON, cap 80', () => {
  const none = {} as NodeJS.ProcessEnv;
  assert.equal(exaSourceEnabled(none), false);
  assert.equal(sourceCacheEnabled(none), false);
  assert.equal(redditSourceEnabled(none), true);
  assert.equal(redditArchiveEnabled(none), true);
  assert.equal(exaDailyCap(none), 80);
  assert.equal(exaSourceEnabled({ SOURCE_EXA_ENABLED: 'true' } as any), true);
  assert.equal(redditSourceEnabled({ SOURCE_REDDIT_ENABLED: '0' } as any), false);
  assert.equal(redditArchiveEnabled({ SOURCE_REDDIT_ARCHIVE_ENABLED: 'off' } as any), false);
  assert.equal(exaDailyCap({ EXA_DAILY_CAP: '25' } as any), 25);
  assert.equal(exaDailyCap({ EXA_DAILY_CAP: 'abc' } as any), 80);
});
