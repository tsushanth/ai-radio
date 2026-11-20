/**
 * Operator CLI for the additional podcast languages (flags, caps, voices, pause, usage). Talks to Supabase with the service key.
 *
 *   node dist/scripts/language-flags.js status
 *   node dist/scripts/language-flags.js add ar --cap 2 --voice mira --voice2 remy   create the OFF flag row of a registered language (same as the migration INSERT; existing rows untouched)
 *   node dist/scripts/language-flags.js enable cs             turn a language on (Beta label stays on)
 *   node dist/scripts/language-flags.js enable cs --no-beta   turn on without the Beta label
 *   node dist/scripts/language-flags.js disable cs
 *   node dist/scripts/language-flags.js set cs --cap 12 --voice aria --voice2 kai
 *   node dist/scripts/language-flags.js pause "reason"        kill switch: stop ALL new-language generation (existing episodes still play)
 *   node dist/scripts/language-flags.js resume                end the kill switch
 *   node dist/scripts/language-flags.js clear-breaker         clear today's TTS character breaker (only after checking the spend)
 *
 * On Fly: fly ssh console -a ai-radio-backend -C "node dist/scripts/language-flags.js status". Nothing here is run by any job.
 */
import { LanguageControls, languageControls } from '../services/languages/controls';
import { getLanguageSpec } from '../services/languages/registry';
import type { FlagPatch } from '../services/languages/controls.store';

const USAGE = 'usage: language-flags status | add <lang> [--cap N] [--voice ID] [--voice2 ID] | enable <lang> [--no-beta] | disable <lang> | set <lang> [--cap N] [--voice ID] [--voice2 ID] [--beta|--no-beta] | pause [reason] | resume | clear-breaker';

function opt(args: string[], name: string): string | undefined {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : undefined;
}

export async function runCommand(argv: string[], controls: LanguageControls, by = 'cli'): Promise<string> {
  const [cmd, ...rest] = argv;
  const lang = rest[0] && !rest[0].startsWith('--') ? rest[0].toLowerCase() : undefined;
  const needLang = () => {
    if (!lang || !getLanguageSpec(lang)) throw new Error(`unknown language "${lang ?? ''}". ${USAGE}`);
    return lang;
  };
  switch (cmd) {
    case 'status': {
      const r = await controls.report();
      const lines = [`Day ${r.day} (UTC). Global cap ${r.config.globalDailyCap} episodes, TTS ${r.config.ttsDailyChars} characters, env kill switch ${r.config.killSwitch ? 'ON' : 'off'}`,
        `Breakers: global pause ${r.breakers.globalPaused ? `ON (${r.breakers.globalReason ?? 'no reason'})` : 'off'}; TTS breaker ${r.breakers.ttsTrippedDay === r.day ? `TRIPPED (${r.breakers.ttsReason})` : 'ok'}`,
        `Today: ${r.usage.episodesTotal} episodes, ${r.usage.charsTotal} characters`, ''];
      for (const f of r.flags) {
        const u = r.usage.languages[f.language];
        lines.push(`${f.language}  ${f.enabled ? 'ON ' : 'off'}  ${f.beta ? 'beta' : 'stable'}  cap ${f.dailyCap}  voices ${f.voice}/${f.voiceHost2}  today ${u?.episodes ?? 0} episodes ${u?.ttsChars ?? 0} chars ${u?.capHits ?? 0} cap hits`);
      }
      return lines.join('\n');
    }
    case 'add': {
      const l = needLang();
      const row: Parameters<LanguageControls['addFlag']>[1] = {};
      const cap = opt(rest, '--cap'); if (cap !== undefined) row.dailyCap = Number(cap);
      const v1 = opt(rest, '--voice'); if (v1 !== undefined) row.voice = v1;
      const v2 = opt(rest, '--voice2'); if (v2 !== undefined) row.voiceHost2 = v2;
      const made = await controls.addFlag(l, row, by);
      return made ? `${l}: flag row created (OFF, beta). Turn it on with: enable ${l}` : `${l}: a flag row already exists, nothing changed.`;
    }
    case 'enable': {
      const patch: FlagPatch = { enabled: true, ...(rest.includes('--no-beta') ? { beta: false } : {}) };
      const f = await controls.setFlag(needLang(), patch, by);
      return `${f.language}: enabled (${f.beta ? 'beta' : 'stable'}), cap ${f.dailyCap}, voices ${f.voice}/${f.voiceHost2}. The app sees it within about a minute.`;
    }
    case 'disable': {
      const f = await controls.setFlag(needLang(), { enabled: false }, by);
      return `${f.language}: disabled. It disappears from the language list; no new episodes; stored episodes are no longer listed.`;
    }
    case 'set': {
      const patch: FlagPatch = {};
      const cap = opt(rest, '--cap'); if (cap !== undefined) patch.dailyCap = Number(cap);
      const v1 = opt(rest, '--voice'); if (v1 !== undefined) patch.voice = v1;
      const v2 = opt(rest, '--voice2'); if (v2 !== undefined) patch.voiceHost2 = v2;
      if (rest.includes('--beta')) patch.beta = true;
      if (rest.includes('--no-beta')) patch.beta = false;
      if (Object.keys(patch).length === 0) throw new Error(`nothing to set. ${USAGE}`);
      const f = await controls.setFlag(needLang(), patch, by);
      return `${f.language}: ${f.enabled ? 'ON' : 'off'}, ${f.beta ? 'beta' : 'stable'}, cap ${f.dailyCap}, voices ${f.voice}/${f.voiceHost2}`;
    }
    case 'pause':
      await controls.setGlobalPause(true, rest.join(' ').trim() || 'operator pause');
      return 'All new-language generation is paused. Existing episodes still play. Run "resume" to end it.';
    case 'resume':
      await controls.setGlobalPause(false, null);
      return 'New-language generation resumed (flags and caps unchanged).';
    case 'clear-breaker':
      await controls.clearTtsBreaker();
      return "Today's TTS character breaker is cleared. The character counter is NOT reset: raise LANG_TTS_DAILY_CHARS if you want more room today.";
    default:
      throw new Error(USAGE);
  }
}

async function main() {
  if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) { console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required'); process.exit(1); }
  console.log(await runCommand(process.argv.slice(2), languageControls, `cli:${process.env.USER || 'operator'}`));
}

if (require.main === module) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
