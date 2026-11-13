/**
 * Claude API spend accounting for the whole backend (see llmUsage.js, copied from the app-failure-reporter repo).
 *
 * One shared instance. Inert until the LLM_USAGE_KEY env var is set (no timers, no network). It records counts and dollars per
 * day / model / feature label only: never prompts, answers, topic names or user ids. Reporting never throws into a generation.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { createLlmUsage } = require('./llmUsage') as typeof import('./llmUsage');
import { AsyncLocalStorage } from 'node:async_hooks';
import { reportLlmError } from './monitoring';
import { assertLlmBudget, llmBudget } from './llmBudget';

const REPORTING = Symbol('failureReporting');

export const llm = createLlmUsage({
  app: 'audexa',
  log: (m: string) => console.warn(`[llm-usage] ${m}`),
  // Every recorded call (Anthropic through instrumentAnthropic, OpenRouter through llmText) also feeds the persisted daily budget.
  onRecord: (r) => llmBudget.record(r),
});

/** Wraps a client's messages.create / messages.stream. Idempotent. Call it on every `new Anthropic(...)`. */
export function instrumentAnthropic<T>(client: T): T {
  llm.instrument(client);
  // Provider-wide failures (key rejected, credit exhausted, quota, outage) raise one alert per class via the failure reporter.
  const messages = (client as unknown as { messages?: Record<string | symbol, unknown> }).messages;
  if (messages && typeof messages.create === 'function' && !messages[REPORTING]) {
    const inner = messages.create as (...a: unknown[]) => Promise<unknown>;
    messages.create = async (...args: unknown[]) => {
      await assertLlmBudget(); // daily cap: refuse before spending (throws LlmBudgetExceeded; not a provider failure, so not reported as one)
      try { return await inner.apply(messages, args); } catch (err) { reportLlmError(err); throw err; }
    };
    messages[REPORTING] = true;
  }
  return client;
}

const labelled = new AsyncLocalStorage<string>();

/** Runs fn with a feature label (low cardinality: a feature name, never content). Overrides any outer label. */
export function withFeature<T>(name: string, fn: () => T): T {
  return labelled.run(name, () => llm.withFeature(name, fn));
}

/** Like withFeature, but keeps an outer label if one is already set (e.g. daily_brief wrapping the shared script generator). */
export function withDefaultFeature<T>(name: string, fn: () => T): T {
  return labelled.getStore() ? fn() : withFeature(name, fn);
}

/** Sends pending rows, giving up after maxMs so a slow Worker can never hold up shutdown. */
export async function flushLlmUsage(maxMs = 2500): Promise<void> {
  let timer: NodeJS.Timeout | undefined;
  try {
    await Promise.race([
      Promise.all([llm.flush(), llmBudget.flush()]),
      new Promise<void>((resolve) => { timer = setTimeout(resolve, maxMs); }),
    ]);
  } catch {
    // reporting is best effort
  } finally {
    if (timer) clearTimeout(timer);
  }
}
