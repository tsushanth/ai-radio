import test from 'node:test';
import assert from 'node:assert/strict';
import { runCommand } from './language-flags.ts';
import { LanguageControls } from '../services/languages/controls.ts';
import { MemoryControlStore } from '../services/languages/controls.store.ts';
import { NEW_LANGUAGES } from '../services/languages/registry.ts';

const make = () => { const store = new MemoryControlStore(NEW_LANGUAGES.map((l) => l.code)); return { store, c: new LanguageControls({ store, env: {}, log: () => {} }) }; };

test('status lists all 14 languages, all off, with caps and today usage', async () => {
  const { c } = make();
  const out = await runCommand(['status'], c);
  assert.equal(out.split('\n').filter((l) => /^[a-z]{2}  /.test(l)).length, 14);
  assert.match(out, /cs  off  beta  cap 8  voices aria\/kai/);
  assert.match(out, /Global cap 35 episodes, TTS 150000 characters/);
});

test('enable / disable / set change the flag row and record who did it', async () => {
  const { c, store } = make();
  assert.match(await runCommand(['enable', 'cs'], c, 'cli:me'), /cs: enabled \(beta\)/);
  assert.equal(store.flags.get('cs')!.enabled, true); assert.equal(store.flags.get('cs')!.updatedBy, 'cli:me');
  assert.match(await runCommand(['enable', 'cs', '--no-beta'], c), /stable/);
  assert.match(await runCommand(['set', 'cs', '--cap', '12', '--voice', 'cora', '--voice2', 'hugo'], c), /cap 12, voices cora\/hugo/);
  assert.match(await runCommand(['disable', 'cs'], c), /disabled/);
  assert.equal(store.flags.get('cs')!.enabled, false);
});

test('pause and resume flip the kill switch; clear-breaker clears the TTS breaker', async () => {
  const { c, store } = make();
  await runCommand(['pause', 'owner', 'asked'], c);
  assert.equal(store.breaker.globalPaused, true); assert.equal(store.breaker.globalReason, 'owner asked');
  await runCommand(['resume'], c);
  assert.equal(store.breaker.globalPaused, false);
  store.breaker.ttsTrippedDay = '2026-11-15';
  await runCommand(['clear-breaker'], c);
  assert.equal(store.breaker.ttsTrippedDay, null);
});

test('bad input is refused: unknown language (including de), no patch, bad cap, unknown command', async () => {
  const { c } = make();
  await assert.rejects(runCommand(['enable', 'de'], c), /unknown language/);
  await assert.rejects(runCommand(['enable'], c), /unknown language/);
  await assert.rejects(runCommand(['set', 'cs'], c), /nothing to set/);
  await assert.rejects(runCommand(['set', 'cs', '--cap', '-3'], c), /dailyCap/);
  await assert.rejects(runCommand(['nope'], c), /usage/);
});
