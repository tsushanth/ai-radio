import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { bearerToken, requireOperatorSecret, secretMatches } from './shared-secret.ts';

function run(header: string | undefined, secret: string | undefined) {
  const req: any = { headers: header === undefined ? {} : { authorization: header } };
  let status = 0;
  let body: any;
  const res: any = { status(c: number) { status = c; return res; }, json(b: unknown) { body = b; return res; } };
  let nextCalled = false;
  requireOperatorSecret(() => secret)(req, res, () => { nextCalled = true; });
  return { status, body, nextCalled };
}

test('secretMatches: equal non-empty strings only', () => {
  assert.equal(secretMatches('abc', 'abc'), true);
  assert.equal(secretMatches('abc', 'abd'), false);
  assert.equal(secretMatches('abc', 'abcd'), false);
  assert.equal(secretMatches('', ''), false);
  assert.equal(secretMatches('x', ''), false);
  assert.equal(secretMatches('x', undefined), false);
  assert.equal(secretMatches(undefined, 'x'), false);
  assert.equal(secretMatches(['x'], 'x'), false);
});

test('bearerToken parses only a Bearer header', () => {
  assert.equal(bearerToken('Bearer tok'), 'tok');
  assert.equal(bearerToken('bearer tok'), '');
  assert.equal(bearerToken('Basic tok'), '');
  assert.equal(bearerToken(undefined), '');
  assert.equal(bearerToken(['Bearer tok']), '');
});

test('middleware: missing, wrong or malformed credentials get 401 and never reach the handler', () => {
  for (const h of [undefined, '', 'Bearer', 'Bearer wrong', 'Basic s3cret', 's3cret']) {
    const r = run(h, 's3cret');
    assert.equal(r.status, 401, String(h));
    assert.equal(r.nextCalled, false, String(h));
    assert.equal(r.body.success, false);
  }
});

test('middleware: fails closed when the secret is unset or empty, even with an empty bearer', () => {
  for (const secret of [undefined, '']) {
    for (const h of [undefined, 'Bearer ', 'Bearer undefined', 'Bearer ']) {
      const r = run(h, secret);
      assert.equal(r.status, 401);
      assert.equal(r.nextCalled, false);
    }
  }
});

test('middleware: the right bearer token passes', () => {
  const r = run('Bearer s3cret', 's3cret');
  assert.equal(r.nextCalled, true);
  assert.equal(r.status, 0);
});

test('the three operator suggestion routes are all behind requireOperatorSecret (guards future edits)', () => {
  const src = fs.readFileSync(path.join(__dirname, '../routes/topics.ts'), 'utf8');
  for (const route of ["'/suggest/pending'", "'/suggest/:requestId/complete'", "'/suggest/:requestId/fail'"]) {
    assert.match(src, new RegExp(`router\\.(get|post)\\(${route.replace(/[/:]/g, (c) => `\\${c}`)}, requireOperatorSecret\\(\\),`), route);
  }
  // and the public submit route is rate limited
  assert.match(src, /router\.post\('\/suggest', suggestIpLimiter,/);
});
