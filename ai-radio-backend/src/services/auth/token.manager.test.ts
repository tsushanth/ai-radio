import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_KEY: 'test-service-key',
  GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', ANTHROPIC_API_KEY: 'x',
});

test('an expired token held in memory is re-read from the database (a newer one may be linked through another machine)', async () => {
  const { TokenManager } = await import('./token.manager');
  const m = new TokenManager() as any;
  let reads = 0;
  let row: any;
  const chain: any = { select: () => chain, eq: () => chain, single: async () => { reads++; return { data: row, error: null }; } };
  const stored = (token: string, expiresAt: Date) => ({ user_id: 'u', user_email: 'owner-key', provider: 'google', oauth_email: 'linked', access_token: token, refresh_token: null, expires_at: expiresAt.toISOString(), scopes: [], created_at: new Date().toISOString() });
  m.supabase = { from: () => chain };

  row = stored('old', new Date(Date.now() - 1000));
  assert.equal((await m.getToken('owner-key', 'google')).accessToken, 'old');
  row = stored('new', new Date(Date.now() + 3_600_000));
  assert.equal((await m.getToken('owner-key', 'google')).accessToken, 'new');
  assert.equal(reads, 2);
  assert.equal((await m.getToken('owner-key', 'google')).accessToken, 'new'); // current token: served from memory
  assert.equal(reads, 2);
});
