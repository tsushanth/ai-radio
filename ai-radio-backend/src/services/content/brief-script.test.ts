// Daily brief script parsing (services/ai/script.generator.ts). The model may wrap its JSON in a ```json fence; a plain
// JSON.parse refuses that on every attempt and the listener gets the short fallback script.
import test from 'node:test';
import assert from 'node:assert/strict';
import { format } from 'node:util';

process.env.NODE_ENV = 'test';
process.env.JWT_SECRET = 'x'.repeat(40);
process.env.SUPABASE_URL = 'https://example.supabase.co';
process.env.SUPABASE_SERVICE_KEY = 'svc';
process.env.GOOGLE_CLIENT_ID = 'g';
process.env.GOOGLE_CLIENT_SECRET = 'g';
process.env.ANTHROPIC_API_KEY = 'sk-ant-test';

const segments = Array.from({ length: 6 }, (_, i) => ({
  speaker: i % 2 ? 'host2' : 'host1',
  text: `PRIVATE-MARKER line ${i} with a "quote" and a ] bracket`,
  type: i === 0 ? 'intro' : i === 5 ? 'outro' : 'email',
}));
const input = {
  user_id: 'private.person@example.com',
  date: '2026-01-01',
  emails: [],
  calendar_events: [],
  preferences: { include_email: true, include_calendar: false, include_weather: false, topics: [], language: 'en' },
} as any;

async function run(reply: string, stopReason = 'end_turn') {
  const { ScriptGeneratorService } = await import('../ai/script.generator');
  const gen = new ScriptGeneratorService('sk-ant-test');
  let calls = 0;
  (gen as any).anthropic = {
    messages: { create: async () => { calls++; return { content: [{ type: 'text', text: reply }], stop_reason: stopReason }; } },
  };
  (gen as any).delay = async () => {};
  const lines: string[] = [];
  const levels = ['log', 'info', 'warn', 'error', 'debug'] as const;
  const original = levels.map((l) => console[l]);
  for (const l of levels) console[l] = (...a: unknown[]) => { lines.push(format(...a)); };
  try {
    const script = await gen.generateScriptWithRetry(input, 3);
    return { script, calls, logs: lines.join('\n') };
  } finally {
    levels.forEach((l, i) => { console[l] = original[i]; });
  }
}

const json = JSON.stringify(segments, null, 2);

for (const [name, reply] of [
  ['bare JSON', json],
  ['a ```json fence', `\`\`\`json\n${json}\n\`\`\``],
  ['a fenced object with a segments key', `\`\`\`json\n${JSON.stringify({ segments })}\n\`\`\``],
] as const) {
  test(`a reply as ${name} gives the model script at the first attempt`, async () => {
    const { script, calls, logs } = await run(reply);
    assert.equal(calls, 1);
    assert.notEqual(script.metadata?.model, 'fallback');
    assert.equal(script.segments.length, 6);
    assert.equal(script.segments[5].type, 'outro');
    assert.ok(!logs.includes('PRIVATE-MARKER'), logs);
  });
}

for (const [name, reply, stop] of [
  ['cut off by max_tokens', `\`\`\`json\n${json.slice(0, json.length - 120)}`, 'max_tokens'],
  ['not JSON', 'PRIVATE-MARKER I cannot do that', 'end_turn'],
  ['JSON without any segment', '{"PRIVATE-MARKER": "x"}', 'end_turn'],
] as const) {
  test(`a reply ${name} is retried, ends in the fallback and is never logged`, async () => {
    const { script, calls, logs } = await run(reply, stop);
    assert.equal(calls, 3);
    assert.equal(script.metadata?.model, 'fallback');
    assert.ok(!/PRIVATE-MARKER|private\.person/.test(logs), logs);
  });
}
