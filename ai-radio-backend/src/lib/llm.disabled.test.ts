// Claude spend accounting without LLM_USAGE_KEY: the code must be inert (nothing recorded, no timer, no network).
import test from 'node:test';
import assert from 'node:assert/strict';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.GOOGLE_CLIENT_ID = 'g';
process.env.GOOGLE_CLIENT_SECRET = 'g';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';
delete process.env.LLM_USAGE_KEY;
delete process.env.FAILURE_REPORTER_KEY;

const urls: string[] = [];
globalThis.fetch = (async (input: any) => {
  const url = String(typeof input === 'string' ? input : input.url);
  urls.push(url);
  if (url.includes('api.anthropic.com')) {
    return new Response(JSON.stringify({
      id: 'm', type: 'message', role: 'assistant', model: 'claude-sonnet-4-6', stop_reason: 'end_turn', stop_sequence: null,
      content: [{ type: 'text', text: JSON.stringify({ answer: 'ok' }) }], usage: { input_tokens: 10, output_tokens: 5 },
    }), { status: 200, headers: { 'content-type': 'application/json' } });
  }
  throw new Error('unexpected fetch ' + url);
}) as typeof fetch;

test('without a key the client is disabled, generation still works, and nothing is recorded or sent', async () => {
  const { llm, flushLlmUsage } = await import('./llm.ts');
  const { QAGenerator } = await import('../services/content/qa.generator.ts');
  assert.equal(llm.enabled, false);
  const res = await (new QAGenerator() as any).generateAnswer('q', { type: 'episode', title: 't' }, []);
  assert.equal(res.answer, 'ok');
  assert.equal(llm.pending(), 0);
  await flushLlmUsage(100);
  assert.deepEqual(urls.filter((u) => u.includes('/v1/llm') || u.includes('workers.dev')), []);
});

