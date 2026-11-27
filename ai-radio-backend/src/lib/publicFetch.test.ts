import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import type { AddressInfo } from 'node:net';
import { BlockedAddressError, guardedLookup, isPrivateOrLocalIp, publicFetch, validateUrlShape } from './publicFetch';

test('non-public addresses are told apart from public ones', () => {
  for (const ip of ['0.0.0.0', '127.0.0.1', '10.0.0.1', '172.16.0.1', '172.31.255.255', '192.168.1.1', '169.254.169.254', '100.64.0.1',
    '198.18.0.1', '224.0.0.1', '255.255.255.255', '::', '::1', '::ffff:127.0.0.1', '::ffff:a00:1', 'fc00::1', 'fdaa:0:1::3', 'fe80::1',
    'fec0::1', 'ff02::1', '64:ff9b::7f00:1', '2002:7f00:1::', 'example.com', '']) {
    assert.equal(isPrivateOrLocalIp(ip), true, ip);
  }
  for (const ip of ['8.8.8.8', '1.1.1.1', '172.32.0.1', '100.128.0.1', '2606:4700:4700::1111', '::ffff:8.8.8.8']) {
    assert.equal(isPrivateOrLocalIp(ip), false, ip);
  }
});

test('only plain public http(s) addresses are accepted', () => {
  for (const u of ['file:///etc/hosts', 'ftp://example.com/', 'data:text/plain,hi', 'not a url', 'http://user:pw@example.com/', 'http://localhost/',
    'http://svc.internal:8080/', 'http://metadata.google.internal/', 'http://127.1/', 'http://2130706433/', 'http://0x7f.0.0.1/', 'http://[::1]/',
    'http://[fdaa:0:1::3]/', 'http://169.254.169.254/latest/', 'http://10.0.0.5/', 'http://localhost./']) {
    assert.throws(() => validateUrlShape(u), BlockedAddressError, u);
  }
  for (const u of ['https://example.com/feed.xml', 'http://example.com:8080/x', 'https://8.8.8.8/']) assert.doesNotThrow(() => validateUrlShape(u), u);
});

test('a name is checked against the addresses it resolves to, on every connection', async () => {
  const ask = (answers: string[][]) => {
    let n = 0;
    const lookup = guardedLookup({ lookup: async () => answers[Math.min(n++, answers.length - 1)].map((address) => ({ address, family: 4 })) });
    return () => new Promise<Error | null>((resolve) => lookup('name.test', { all: true }, (err) => resolve(err)));
  };
  assert.ok((await ask([['8.8.8.8', '10.0.0.7']])()) instanceof BlockedAddressError, 'one non-public answer is enough');
  assert.ok((await ask([[]])()) instanceof BlockedAddressError, 'empty answer');
  const changing = ask([['93.184.216.34'], ['127.0.0.1']]);
  assert.equal(await changing(), null);
  assert.ok((await changing()) instanceof BlockedAddressError);
});

// A local server stands in for a public host: the test rule allows *.ok.test only.
const deps = { lookup: async () => [{ address: '127.0.0.1', family: 4 }], isAllowedIp: (_ip: string, host: string) => host.endsWith('.ok.test') };
async function serve(t: { after(fn: () => void): void }, handler: http.RequestListener): Promise<number> {
  const server = http.createServer(handler);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()));
  t.after(() => { server.closeAllConnections(); server.close(); });
  return (server.address() as AddressInfo).port;
}

test('requests and redirects to non-public destinations never connect', async (t) => {
  let hits = 0;
  const target = await serve(t, (_req, res) => { hits++; res.end('private'); });
  await assert.rejects(publicFetch(`http://127.0.0.1:${target}/`), BlockedAddressError);
  await assert.rejects(publicFetch(`http://other.bad.test:${target}/`, {}, deps), BlockedAddressError);
  for (const location of [`http://other.bad.test:${target}/`, 'http://169.254.169.254/latest/', 'file:///etc/hosts']) {
    const from = await serve(t, (_req, res) => { res.statusCode = 302; res.setHeader('location', location); res.end(); });
    await assert.rejects(publicFetch(`http://a.ok.test:${from}/`, {}, deps), BlockedAddressError, location);
  }
  assert.equal(hits, 0);
});

test('an allowed destination answers; redirects, size and time are limited', async (t) => {
  const port = await serve(t, (req, res) => {
    if (req.url === '/moved') { res.statusCode = 301; res.setHeader('location', '/'); return res.end(); }
    if (req.url === '/loop') { res.statusCode = 302; res.setHeader('location', '/loop'); return res.end(); }
    if (req.url === '/big') return res.end('x'.repeat(5000));
    if (req.url === '/slow') return;
    res.end('feed');
  });
  const base = `http://a.ok.test:${port}`;
  assert.equal(await (await publicFetch(`${base}/moved`, {}, deps)).text(), 'feed');
  await assert.rejects(publicFetch(`${base}/loop`, {}, deps), /Too many redirects/);
  await assert.rejects(publicFetch(`${base}/big`, { maxBytes: 1000 }, deps), /too large/);
  await assert.rejects(publicFetch(`${base}/slow`, { timeoutMs: 200 }, deps), /timed out/);
});
