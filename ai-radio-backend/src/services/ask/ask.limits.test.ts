import test from 'node:test';
import assert from 'node:assert/strict';
import { isAskStatusPoll } from './askPollPath.ts';

const ID = '11111111-2222-3333-4444-555555555555';

test('the global /api limiter skips only GET /ask/<uuid> status polls (path as seen under the /api mount)', () => {
  assert.equal(isAskStatusPoll('GET', `/ask/${ID}`), true);
  assert.equal(isAskStatusPoll('GET', `/ask/${ID.toUpperCase()}`), true);
  // Everything else stays under the global limiter.
  assert.equal(isAskStatusPoll('POST', '/ask'), false);
  assert.equal(isAskStatusPoll('POST', `/ask/${ID}`), false);
  assert.equal(isAskStatusPoll('GET', '/ask/config'), false);
  assert.equal(isAskStatusPoll('GET', '/ask'), false);
  assert.equal(isAskStatusPoll('GET', `/ask/${ID}/extra`), false);
  assert.equal(isAskStatusPoll('GET', '/ask/not-a-uuid'), false);
  assert.equal(isAskStatusPoll('GET', `/topics/${ID}`), false);
  assert.equal(isAskStatusPoll('GET', `/asks/${ID}`), false);
  assert.equal(isAskStatusPoll('GET', `/ask/${ID}\n`), false);
});

test('mounted at /api, a shared limiter using the skip rule leaves status polls alone and still limits everything else', async () => {
  const { default: express } = await import('express');
  const { default: rateLimit } = await import('express-rate-limit');
  const app = express();
  app.use('/api', rateLimit({ windowMs: 60_000, limit: 3, skip: (req) => isAskStatusPoll(req.method, req.path), handler: (_q, r) => { r.status(429).json({ limited: true }); } }));
  app.get('/api/ask/:id', (_q, r) => r.json({ ok: true }));
  app.get('/api/topics', (_q, r) => r.json({ ok: true }));
  const server = app.listen(0);
  try {
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}/api`;
    for (let i = 0; i < 20; i++) assert.equal((await fetch(`${base}/ask/${ID}`)).status, 200, `poll ${i}`);
    for (let i = 0; i < 3; i++) assert.equal((await fetch(`${base}/topics`)).status, 200);
    assert.equal((await fetch(`${base}/topics`)).status, 429, 'other routes are still limited');
  } finally { server.close(); }
});
