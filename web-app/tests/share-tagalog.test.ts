import test from 'node:test';
import assert from 'node:assert/strict';
import { buildShareText, buildShareUrl, cleanTopic, shareOrCopy, parseLang, readUtm } from '../src/lib/share.ts';
import { pickActiveStations, playbackUrl, upstreamStreamUrl } from '../src/lib/api/stations.ts';
import { LIVE_STATIONS } from '../src/lib/api/episodes.ts';

test('share url: audexa_web utm, language kept when known, English otherwise', () => {
  assert.equal(
    buildShareUrl('fr'),
    'https://audexa.app/live?lang=fr&utm_source=audexa_web&utm_medium=share&utm_campaign=live_share&utm_content=fr'
  );
  for (const bad of ['xx', '', 'EN', '../x', 'es&utm_source=evil']) assert.ok(buildShareUrl(bad).startsWith('https://audexa.app/live?lang=en&utm_source=audexa_web'), bad);
  // the /live page must accept the utm values we generate
  const u = new URL(buildShareUrl('de'));
  assert.deepEqual(readUtm(Object.fromEntries(u.searchParams)), {
    utm_source: 'audexa_web', utm_medium: 'share', utm_campaign: 'live_share', utm_content: 'de',
  });
});

test('share text: topic only when the radio reported one, AI-generated stated, no listener counts', () => {
  const withTopic = buildShareText('Audexa Radio', '[en] US Politics');
  assert.equal(withTopic, 'Audexa Radio is on air right now with: US Politics. It is an AI-generated news and talk station. Tune in live:');
  const generic = buildShareText('Audexa Radio', null);
  assert.equal(generic, "I'm listening to Audexa Radio, an AI-generated news and talk station. Tune in live:");
  for (const t of [undefined, '', '   ', '[en]   ', 42, 'x'.repeat(121)]) assert.equal(buildShareText('Audexa Radio', t), generic, String(t));
  for (const text of [withTopic, generic]) assert.ok(!/listener|people are|offline/i.test(text));
  assert.equal(cleanTopic('  World Update '), 'World Update');
});

test('shareOrCopy: uses the share sheet when there is one', async () => {
  const calls: unknown[] = [];
  const nav = { share: async (d: unknown) => { calls.push(d); } };
  const payload = { title: 'Audexa Radio', text: 'hello', url: 'https://audexa.app/live' };
  assert.equal(await shareOrCopy(nav, payload), 'shared');
  assert.deepEqual(calls, [payload]);
});

test('shareOrCopy: closing the sheet is "cancelled" and does not copy', async () => {
  let copied = false;
  const nav = {
    share: async () => { throw Object.assign(new Error('closed'), { name: 'AbortError' }); },
    clipboard: { writeText: async () => { copied = true; } },
  };
  assert.equal(await shareOrCopy(nav, { title: 't', text: 'x', url: 'u' }), 'cancelled');
  assert.equal(copied, false);
});

test('shareOrCopy: no share API -> copies "text link"; a failing share also falls back to copying', async () => {
  const copies: string[] = [];
  const clipboard = { writeText: async (s: string) => { copies.push(s); } };
  assert.equal(await shareOrCopy({ clipboard }, { title: 't', text: 'Tune in live:', url: 'https://audexa.app/live' }), 'copied');
  assert.equal(await shareOrCopy({ share: async () => { throw new Error('NotAllowedError'); }, clipboard }, { title: 't', text: 'A', url: 'B' }), 'copied');
  assert.deepEqual(copies, ['Tune in live: https://audexa.app/live', 'A B']);
});

test('shareOrCopy: nothing available or clipboard blocked -> failed, never throws', async () => {
  assert.equal(await shareOrCopy(undefined, { title: 't', text: 'x', url: 'u' }), 'failed');
  assert.equal(await shareOrCopy({}, { title: 't', text: 'x', url: 'u' }), 'failed');
  assert.equal(await shareOrCopy({ clipboard: { writeText: async () => { throw new Error('denied'); } } }, { title: 't', text: 'x', url: 'u' }), 'failed');
});

test('Tagalog: known to the share link, the stream proxy and the station catalogue', () => {
  assert.equal(parseLang('tl'), 'tl');
  assert.equal(upstreamStreamUrl('tl'), 'https://radio.audexa.app/stream-tl');
  assert.equal(playbackUrl('tl'), '/api/stream/tl');
  const tl = LIVE_STATIONS.find((s) => s.language === 'tl');
  assert.ok(tl);
  assert.equal(tl!.streamUrl, 'https://radio.audexa.app/stream-tl');
  assert.equal(new Set(LIVE_STATIONS.map((s) => s.id)).size, LIVE_STATIONS.length);
});

test('Tagalog shows nothing until the server reports it', () => {
  assert.deepEqual(pickActiveStations(LIVE_STATIONS, ['en']).map((s) => s.language), ['en']);
  assert.deepEqual(pickActiveStations(LIVE_STATIONS, ['en', 'tl']).map((s) => s.language), ['en', 'tl']);
  assert.deepEqual(pickActiveStations(LIVE_STATIONS, ['tl']).map((s) => s.language), ['tl']);
});
