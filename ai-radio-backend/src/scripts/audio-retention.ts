/**
 * Topic episode audio retention: DRY RUN by default.
 *
 *   node dist/scripts/audio-retention.js              report what would be deleted (counts and sizes), deletes nothing
 *   node dist/scripts/audio-retention.js --json       same, as JSON
 *   node dist/scripts/audio-retention.js --apply      delete. Needs BOTH --apply and AUDIO_RETENTION_APPLY=yes.
 *
 * Not scheduled. Reads SUPABASE_URL and SUPABASE_SERVICE_KEY from the environment (on Fly: `fly ssh console -a ai-radio-backend`).
 */
import { createClient } from '@supabase/supabase-js';
import { runRetention, formatReport, readRetentionConfig } from '../services/storage/retention';
import { SupabaseRetentionStore } from '../services/storage/retention.supabase';

export function parseArgs(argv: string[], env: NodeJS.ProcessEnv = process.env): { apply: boolean; json: boolean; refused?: string } {
  const apply = argv.includes('--apply');
  const json = argv.includes('--json');
  if (apply && (env.AUDIO_RETENTION_APPLY ?? '').trim().toLowerCase() !== 'yes') {
    return { apply: false, json, refused: '--apply needs AUDIO_RETENTION_APPLY=yes in the environment as well. Nothing was deleted.' };
  }
  return { apply, json };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.refused) { console.error(args.refused); process.exit(2); }
  const url = process.env.SUPABASE_URL; const key = process.env.SUPABASE_SERVICE_KEY;
  if (!url || !key) { console.error('SUPABASE_URL and SUPABASE_SERVICE_KEY are required'); process.exit(1); }
  const store = new SupabaseRetentionStore(createClient(url, key));
  const report = await runRetention(store, { apply: args.apply, config: readRetentionConfig() });
  console.log(args.json ? JSON.stringify(report, null, 2) : formatReport(report));
}

if (require.main === module) main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); });
