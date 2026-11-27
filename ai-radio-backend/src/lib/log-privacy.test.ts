// Logs must not carry personal data: no email addresses, no daily brief script, no text a user typed.
// The source scan guards future log statements; the behaviour tests cover the console masking and token lookup.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { format } from 'node:util';
import ts from 'typescript';
import { installLogRedaction, redact, userRef } from './log-privacy';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.GOOGLE_CLIENT_ID = 'g';
process.env.GOOGLE_CLIENT_SECRET = 'g';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

// No network: the database answers every request with an error that quotes an address, as a constraint error does.
globalThis.fetch = (async () => new Response(JSON.stringify({ code: 'XX000', message: 'boom for first.person@example.com' }), {
  status: 500, headers: { 'content-type': 'application/json' },
})) as typeof fetch;

const SRC = path.join(__dirname, '..');

// ---- source scan -----------------------------------------------------------------------------------------------------------------

/** Names whose value is personal data (or can contain it) in this backend. */
const SENSITIVE = new Set([
  'userId', 'user_id', 'user_email', 'userEmail', 'email', 'oauth_email', 'tokenStore', 'preferences', 'body',
  'response', 'parsed', 'segments', 'scriptSegments', 'script', 'scriptText', 'transcript', 'query', 'question', 'answer', 'text',
  'snippet', 'subject', 'title', 'origin', 'destination', 'url', 'audioUrl', 'audioPath', 'path', 'results',
  'accessToken', 'refreshToken',
]);
/** Wrappers and members that turn a sensitive value into something safe to print. */
const SAFE_CALLS = new Set(['userRef', 'redact', 'Boolean']);
const SAFE_MEMBERS = new Set(['length', 'size', 'status']);
/** Reviewed uses of a listed name that is not personal. Keep this short. */
const REVIEWED = new Set([
  'middleware/errorHandler.ts path', // development only, masked by the console layer
  'services/content/topic.generator.ts title', // public catalogue episode titles
  'services/content/livestation.generator.ts title', // public station episode titles
]);

function sensitiveNames(node: ts.Expression): string[] {
  const walk = (n: ts.Node): string[] => {
    if (ts.isIdentifier(n)) return SENSITIVE.has(n.text) ? [n.text] : [];
    if (ts.isPropertyAccessExpression(n)) {
      const name = n.name.text;
      if (SAFE_MEMBERS.has(name)) return [];
      return SENSITIVE.has(name) ? [name] : [];
    }
    if (ts.isElementAccessExpression(n)) return walk(n.expression);
    if (ts.isCallExpression(n)) {
      const callee = n.expression;
      if (ts.isIdentifier(callee) && SAFE_CALLS.has(callee.text)) return [];
      // x.substring(0, 5), x.join(), x.split('@')[0] print (part of) x; JSON.stringify(x) and String(x) print their argument
      const own = ts.isPropertyAccessExpression(callee) ? walk(callee.expression) : [];
      return [...own, ...n.arguments.flatMap(walk)];
    }
    if (ts.isTemplateExpression(n)) return n.templateSpans.flatMap((s) => walk(s.expression));
    if (ts.isConditionalExpression(n)) return [...walk(n.whenTrue), ...walk(n.whenFalse)];
    if (ts.isBinaryExpression(n)) {
      const op = n.operatorToken.kind;
      const passes = op === ts.SyntaxKind.PlusToken || op === ts.SyntaxKind.BarBarToken || op === ts.SyntaxKind.QuestionQuestionToken
        || op === ts.SyntaxKind.AmpersandAmpersandToken;
      return passes ? [...walk(n.left), ...walk(n.right)] : [];
    }
    if (ts.isObjectLiteralExpression(n)) {
      return n.properties.flatMap((p) => ts.isShorthandPropertyAssignment(p) ? walk(p.name)
        : ts.isPropertyAssignment(p) ? walk(p.initializer) : ts.isSpreadAssignment(p) ? walk(p.expression) : []);
    }
    if (ts.isArrayLiteralExpression(n)) return n.elements.flatMap(walk);
    if (ts.isParenthesizedExpression(n) || ts.isAsExpression(n) || ts.isNonNullExpression(n) || ts.isAwaitExpression(n)) return walk(n.expression);
    return [];
  };
  return walk(node);
}

const isLogCall = (callee: string) => /^console\.\w+$|(^|\.)log$|^process\.std(out|err)\.write$/.test(callee);

export function scanSource(file: string, source: string): string[] {
  const sf = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true);
  const found: string[] = [];
  const visit = (n: ts.Node) => {
    if (ts.isCallExpression(n) && isLogCall(n.expression.getText(sf))) {
      for (const name of n.arguments.flatMap(sensitiveNames)) {
        if (!REVIEWED.has(`${file} ${name}`)) found.push(`${file}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1} logs "${name}"`);
      }
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return found;
}

test('the scan catches unsafe log statements and accepts the safe forms', () => {
  const bad = [
    'console.log(`Retrieving token for user ${userId}`)',
    "console.log(`tokens: [${Array.from(tokenStore.keys()).join(', ')}]`)",
    'console.log(`Found token for ${record.email}`)',
    "console.error('Failed to parse:', response.substring(0, 500))",
    "console.error('Invalid structure:', JSON.stringify(parsed).substring(0, 500))",
    'console.log(`user ${userId.substring(0, 8)}`)',
    "console.log('saved', { userId })",
    'this.log(`for ${validated.user_id}`)',
  ];
  for (const line of bad) assert.ok(scanSource('x.ts', line).length > 0, line);
  const good = [
    'console.log(`user ${userRef(userId)} has ${emails.length} emails`)',
    'console.log(`query ${query.length} chars, status ${response.status}`)',
    "console.error('failed', error)",
  ];
  for (const line of good) assert.deepEqual(scanSource('x.ts', line), [], line);
});

test('no backend log statement prints an address, a user id, a script or text a user typed', () => {
  const files = (d: string): string[] => fs.readdirSync(d, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(path.join(d, e.name)) : e.name.endsWith('.ts') && !/\.(test|d)\.ts$/.test(e.name) ? [path.join(d, e.name)] : []);
  const found = files(SRC).flatMap((f) => scanSource(path.relative(SRC, f), fs.readFileSync(f, 'utf8')));
  assert.deepEqual(found, []);
});

test('the server installs the console masking before anything else', () => {
  const src = fs.readFileSync(path.join(SRC, 'index.ts'), 'utf8');
  assert.equal(src.match(/^import .*$/m)?.[0].startsWith("import './lib/log-privacy-install';"), true);
});

// ---- behaviour -------------------------------------------------------------------------------------------------------------------

test('redact masks addresses (also URL encoded) and tokens, and leaves other text alone', () => {
  assert.equal(redact('for jane.doe+x@example.co.uk now'), 'for <email> now');
  assert.equal(redact('/api/podcast/episodes/jane%40example.com?limit=1'), '/api/podcast/episodes/<email>?limit=1');
  const madeUp = ['eyJhbGciOi', 'eyJ1cmwiOiJ4', 'c2ln_-'].join('.'); // assembled so secret scanners do not see a token
  assert.equal(redact(`?token=${madeUp}`), '?token=<token>');
  assert.equal(redact('Authorization: Bearer abcdefgh12345678'), 'Authorization: Bearer <token>');
  assert.equal(redact('ya29.a0AfH6SMBxxxxxxxxxxx'), '<token>');
  const plain = 'node_modules/@types/node and @anthropic-ai/sdk@0.91.1 stay';
  assert.equal(redact(plain), plain);
  const started = Date.now();
  redact('a'.repeat(200_000));
  assert.ok(Date.now() - started < 1000, 'masking must stay fast on long lines');
});

test('userRef is stable, case-insensitive and does not contain the address', () => {
  assert.equal(userRef('Jane@Example.com'), userRef('jane@example.com '));
  assert.notEqual(userRef('jane@example.com'), userRef('john@example.com'));
  assert.match(userRef('jane@example.com'), /^u_[0-9a-f]{10}$/);
  assert.equal(userRef(undefined), 'u_none');
});

test('console masking: addresses are masked and an error object loses the request it carries', () => {
  const lines: string[] = [];
  const sink = (...a: unknown[]) => { lines.push(format(...a)); };
  const fake = { log: sink, info: sink, warn: sink, error: sink, debug: sink, trace: sink } as unknown as Console;
  installLogRedaction(fake);
  installLogRedaction(fake);
  const err = Object.assign(new Error('send failed for jane@example.com'), {
    status: 429, config: { data: 'SCRIPT-MARKER', headers: { Authorization: 'Bearer secretsecret123' } },
  });
  fake.error('TTS failed:', err);
  fake.log('%s has %d', 'jane@example.com', 3);
  fake.warn('db', { details: 'Key (user_email)=(jane@example.com) exists' });
  const all = lines.join('\n');
  assert.equal(lines.length, 3);
  assert.ok(!/jane@|SCRIPT-MARKER|secretsecret/.test(all), all);
  assert.match(all, /send failed for <email>/);
  assert.match(all, /status=429/);
  assert.match(all, /<email> has 3/);
});

async function captured(fn: () => Promise<unknown>): Promise<string> {
  const lines: string[] = [];
  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const original = levels.map((l) => console[l]);
  for (const l of levels) console[l] = (...a: unknown[]) => { lines.push(format(...a)); };
  try { await fn(); } finally { levels.forEach((l, i) => { console[l] = original[i]; }); }
  return lines.join('\n');
}

test('token storage and lookup log no address, including those of other users in memory', async () => {
  const { TokenManager } = await import('../services/auth/token.manager');
  const manager = new TokenManager();
  const out = await captured(async () => {
    await manager.storeTokenFromLinkedAccount('first.person@example.com', 'google', 'first.person@example.com', 'a', null);
    await manager.getToken('second.person@example.com', 'google');
    await manager.getToken('first.person@example.com', 'google');
    await manager.revokeToken('third.person@example.com', 'google');
  });
  assert.ok(out.includes('Retrieving token'), 'the lines under test were printed');
  assert.ok(!/person|example\.com/.test(redact(out).replaceAll('<email>', '')), out);
  assert.ok(!/(second|third)\.person/.test(out), out);
});
