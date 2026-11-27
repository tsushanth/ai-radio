import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';

Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_KEY: 'test-service-key',
  GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', GOOGLE_REDIRECT_URI: 'https://example.invalid/callback', ANTHROPIC_API_KEY: 'x',
});

const load = async () => (await import('./customsource.service')).customSourceService as any;

test('source addresses that are not public are refused without a connection, with one plain message', async (t) => {
  const service = await load();
  let hits = 0;
  const server = http.createServer((_req, res) => { hits++; res.end('<rss><item></item></rss>'); });
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  t.after(() => server.close());
  const port = (server.address() as AddressInfo).port;
  for (const type of ['rss', 'podcast', 'website']) {
    for (const url of [`http://127.0.0.1:${port}/`, `http://localhost:${port}/`, `http://[::1]:${port}/`, 'http://169.254.169.254/', 'file:///etc/hosts']) {
      const r = await service.validateSource(url, type);
      assert.equal(r.isValid, false, `${type} ${url}`);
      assert.equal(r.error, 'Could not fetch this address');
    }
  }
  await assert.rejects(service.fetchAndSaveRSSItems({ id: 's1', url: `http://127.0.0.1:${port}/` }), /Could not fetch/);
  assert.equal(hits, 0);
});

test('feed items are read as before', async () => {
  const service = await load();
  const items = service.parseRSSItems(`<rss><channel><title>Feed</title>
    <item><title><![CDATA[One & only]]></title><link>https://example.com/1</link><description>First &amp; best</description>
      <content:encoded><![CDATA[<p>Body <b>text</b></p>]]></content:encoded><dc:creator>Ann</dc:creator><pubDate>Thu, 26 Nov 2026 10:00:00 GMT</pubDate><guid isPermaLink="false">g1</guid></item>
    <entry><title type="html">Two</title><link rel="alternate" href="https://example.com/2"/><published>2026-11-26T10:00:00Z</published><id>g2</id></entry>
  </channel></rss>`);
  assert.equal(items.length, 2);
  assert.deepEqual(items[0], { title: 'One & only', link: 'https://example.com/1', description: 'First & best', content: 'Body text', author: 'Ann',
    pubDate: 'Thu, 26 Nov 2026 10:00:00 GMT', guid: 'g1' });
  assert.equal(items[1].title, 'Two');
  assert.equal(items[1].link, 'https://example.com/2');
  assert.equal(items[1].guid, 'g2');
});

test('large malformed documents are read quickly and at most 50 items are kept', async () => {
  const service = await load();
  const started = Date.now();
  service.parseRSSItems('<item>'.repeat(300_000));
  service.parseRSSItems('<item>' + '<title'.repeat(30_000) + '</item>');
  service.parseRSSItems('<item>' + '<content><![CDATA['.repeat(10_000) + '<link '.repeat(10_000) + '</item>');
  service.stripHtml('<'.repeat(200_000));
  assert.equal(service.parseRSSItems('<item><title>t</title><link>https://example.com/</link></item>'.repeat(500)).length, 50);
  assert.ok(Date.now() - started < 5000, `took ${Date.now() - started} ms`);
});

test('over the daily allowance a summary is the start of the text, with no model call', async () => {
  const service = await load();
  process.env.ALLOWANCE_SOURCE_SUMMARY_GLOBAL = '0';
  let calls = 0;
  service.anthropic = { messages: { create: async () => { calls++; return { content: [] }; } } };
  try {
    assert.equal(await service.summarizeContent('a'.repeat(500)), 'a'.repeat(200));
    assert.equal(calls, 0);
  } finally {
    delete process.env.ALLOWANCE_SOURCE_SUMMARY_GLOBAL;
  }
});
