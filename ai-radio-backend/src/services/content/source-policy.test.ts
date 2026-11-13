import test from 'node:test';
import assert from 'node:assert/strict';
import { TOPIC_SOURCE_POLICY, getSourcePolicy, getExaConfig, disabledReason } from './source-policy.ts';
import { exaSourceEnabled, redditSourceEnabled, redditArchiveEnabled, redditRssEnabled, sourceCacheEnabled, exaDailyCap, policyDisablingEnabled } from './source-flags.ts';

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

test('Exa is configured only for ai-ml, startups-vc, us-politics and cricket-updates, with a query and a position', () => {
  const exaIds = Object.keys(TOPIC_SOURCE_POLICY).filter(id => TOPIC_SOURCE_POLICY[id].exa);
  assert.deepEqual(exaIds.sort(), ['ai-ml', 'cricket-updates', 'startups-vc', 'us-politics']);
  for (const id of exaIds) assert.ok(getExaConfig(id)!.query.split(' ').length >= 5);
  assert.equal(getExaConfig('us-politics')!.position, 'first');
  assert.equal(getExaConfig('startups-vc')!.position, 'fallback');
  assert.equal(getExaConfig('eli5'), undefined);
  assert.equal(getSourcePolicy('some-user-suggested-topic'), undefined);
});

test('archive overrides name real subreddits (letters, digits, underscore only)', () => {
  const overrides = Object.entries(TOPIC_SOURCE_POLICY).filter(([, p]) => p.archive);
  assert.equal(overrides.length, 9);
  for (const [id, p] of overrides) assert.match(p.archive!.subreddit!, /^[A-Za-z0-9_]{3,21}$/, id);
  assert.equal(TOPIC_SOURCE_POLICY['eli5'].archive!.subreddit, 'explainlikeimfive');
  assert.equal(TOPIC_SOURCE_POLICY['eli5'].archive!.comments, true);
});

test('disabled topics carry a reason, are never on Exa or the archive, and the news-premised shows are NOT disabled', () => {
  const disabled = Object.entries(TOPIC_SOURCE_POLICY).filter(([, p]) => p.disabled);
  assert.equal(disabled.length, 19);
  for (const [id, p] of disabled) { assert.ok(p.disabled!.startsWith('Disabled:'), id); assert.ok(!p.exa && !p.archive, id); }
  for (const id of ['simulate-this', 'dead-founders-club', 'crypto-corner', 'ai-research-frontier']) assert.equal(TOPIC_SOURCE_POLICY[id].disabled, undefined, id);
  assert.match(disabledReason('roast-my-resume', {} as any)!, /^Disabled/);
  assert.equal(disabledReason('roast-my-resume', { SOURCE_POLICY_DISABLE: '0' } as any), undefined);
  assert.equal(disabledReason('eli5', {} as any), undefined);
});

test('flag defaults: Exa OFF, cache OFF, Reddit master, archive and rss ON, disabling ON, cap 80', () => {
  const none = {} as NodeJS.ProcessEnv;
  assert.equal(exaSourceEnabled(none), false);
  assert.equal(sourceCacheEnabled(none), false);
  assert.equal(redditSourceEnabled(none), true);
  assert.equal(redditArchiveEnabled(none), true);
  assert.equal(redditRssEnabled(none), true);
  assert.equal(policyDisablingEnabled(none), true);
  assert.equal(exaDailyCap(none), 80);
  assert.equal(exaSourceEnabled({ SOURCE_EXA_ENABLED: 'true' } as any), true);
  assert.equal(redditArchiveEnabled({ SOURCE_REDDIT_ARCHIVE_ENABLED: 'off' } as any), false);
  assert.equal(redditRssEnabled({ SOURCE_REDDIT_RSS_ENABLED: '0' } as any), false);
  assert.equal(redditArchiveEnabled({ SOURCE_REDDIT_ENABLED: '0' } as any), false, 'master switch stops the archive too');
  assert.equal(redditRssEnabled({ SOURCE_REDDIT_ENABLED: '0' } as any), false);
  assert.equal(exaDailyCap({ EXA_DAILY_CAP: '25' } as any), 25);
  assert.equal(exaDailyCap({ EXA_DAILY_CAP: 'abc' } as any), 80);
});
