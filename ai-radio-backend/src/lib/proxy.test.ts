import test from 'node:test';
import assert from 'node:assert/strict';
import type { AddressInfo } from 'node:net';
import express from 'express';
import { trustedProxyHops } from './proxy';

test('on Fly the client address is read two from the end of X-Forwarded-For', async (t) => {
  const app = express();
  app.set('trust proxy', trustedProxyHops({ FLY_APP_NAME: 'x' }));
  app.get('/', (req, res) => { res.send(req.ip); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>((resolve) => server.on('listening', () => resolve()));
  t.after(() => server.close());
  const ip = async (xff: string) => (await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/`, { headers: { 'X-Forwarded-For': xff } })).text();
  assert.equal(await ip('203.0.113.7, 198.51.100.1'), '203.0.113.7');
  assert.equal(await ip('192.0.2.99, 203.0.113.8, 198.51.100.1'), '203.0.113.8', 'an entry the caller added is not read');
  assert.equal(trustedProxyHops({}), 1);
});
