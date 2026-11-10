/**
 * Account deletion: removes everything the backend stores for one signed-in user.
 *
 * Every piece of per-user data is keyed by the user's email address (the app uses the email as its user id), except rows that
 * hang off a row we delete first (users -> podcast_episodes by uuid, qa_sessions -> qa_messages, custom_sources -> items).
 *
 * Pure module: all I/O goes through the injected `db` (a Supabase client) and callbacks, so it is unit-tested with a fake.
 *
 * Safe to retry: every step deletes by key and a second run finds nothing. A step that fails (anything other than "table or
 * bucket does not exist") makes the whole call report failure, and the sign-in identity is only removed when every other step
 * succeeded, so the same caller can try again.
 */

export interface DeletionDeps {
  /** Supabase client (service role). */
  db: any;
  /** Revoke the user's Google/Microsoft grants at the provider, then drop the stored tokens. Best effort; may throw. */
  revokeProviderTokens: (email: string) => Promise<void>;
  /** Forget in-memory state for the user (generation jobs, cached tokens). */
  purgeMemory: (email: string) => void;
  /** Delete the sign-in identity (Supabase auth user). Only called after everything else succeeded. */
  deleteAuthUser: (authUserId: string) => Promise<void>;
}

export interface DeletionResult {
  ok: boolean;
  /** Rows removed per table (absent tables are omitted). */
  deleted: Record<string, number>;
  /** Files removed per storage bucket. */
  files: Record<string, number>;
  /** Steps that failed; empty when ok. */
  failed: string[];
  /** Non-fatal problems (for example the provider refused the revoke). */
  warnings: string[];
}

/** Things this backend deliberately does not (or cannot) remove; returned to the caller and documented in the privacy policy. */
export const RETAINED_NOTES: readonly string[] = [
  'Anonymous usage statistics keyed only by a random install id (not linked to the account) are deleted on their own 180-day schedule.',
  'Shared topic episodes are not personal data and stay.',
  'Server logs and database backups age out on the hosting providers\' own schedule.',
];

const MISSING_CODES = new Set(['42P01', 'PGRST205']);
const isMissing = (e: any): boolean =>
  !!e && (MISSING_CODES.has(e.code) || /does not exist|could not find the table|bucket not found|not_found/i.test(String(e.message ?? e)));

/** The email spellings stored rows may use: as given, as verified, lower-cased. No wildcard matching, so one address never matches another. */
export function emailVariants(...emails: string[]): string[] {
  const set = new Set<string>();
  for (const e of emails) {
    const t = (e ?? '').trim();
    if (!t) continue;
    set.add(t);
    set.add(t.toLowerCase());
  }
  return [...set];
}

const STORAGE_URL = /\/object\/(?:sign|public|authenticated)\/([^/]+)\/([^?#]+)/;

/** Extracts {bucket, path} from a Supabase storage URL, or null. */
export function parseStorageUrl(url: unknown): { bucket: string; path: string } | null {
  if (typeof url !== 'string') return null;
  const m = STORAGE_URL.exec(url);
  if (!m) return null;
  try {
    return { bucket: m[1], path: decodeURIComponent(m[2]) };
  } catch {
    return null;
  }
}

const PAGE = 1000;

export async function deleteUserData(
  deps: DeletionDeps,
  who: { email: string; authUserId: string; pathEmail?: string }
): Promise<DeletionResult> {
  const { db } = deps;
  const result: DeletionResult = { ok: true, deleted: {}, files: {}, failed: [], warnings: [] };
  const emails = emailVariants(who.email, who.pathEmail ?? '');
  const fail = (step: string) => {
    result.ok = false;
    result.failed.push(step);
  };

  // ---- helpers --------------------------------------------------------------------------------------------------------------
  const selectIn = async (table: string, cols: string, col: string, vals: string[]): Promise<any[] | null> => {
    if (vals.length === 0) return [];
    const { data, error } = await db.from(table).select(cols).in(col, vals);
    if (error) {
      if (isMissing(error)) return [];
      fail(`${table}.select`);
      return null;
    }
    return data ?? [];
  };

  const deleteIn = async (table: string, col: string, vals: string[]): Promise<void> => {
    if (vals.length === 0) return;
    const { error, count } = await db.from(table).delete({ count: 'exact' }).in(col, vals);
    if (error) {
      if (isMissing(error)) return;
      fail(`${table}.delete`);
      return;
    }
    result.deleted[table] = (result.deleted[table] ?? 0) + (count ?? 0);
  };

  const removeFiles = async (bucket: string, paths: string[]): Promise<void> => {
    const unique = [...new Set(paths.filter(Boolean))];
    for (let i = 0; i < unique.length; i += 100) {
      const chunk = unique.slice(i, i + 100);
      const { data, error } = await db.storage.from(bucket).remove(chunk);
      if (error) {
        if (isMissing(error)) return;
        fail(`storage.${bucket}.remove`);
        return;
      }
      result.files[bucket] = (result.files[bucket] ?? 0) + (Array.isArray(data) ? data.length : chunk.length);
    }
  };

  /** Lists every object under `prefix/` in a bucket and removes it. */
  const removeFolder = async (bucket: string, prefix: string): Promise<void> => {
    const found: string[] = [];
    for (let offset = 0; ; offset += PAGE) {
      const { data, error } = await db.storage.from(bucket).list(prefix, { limit: PAGE, offset });
      if (error) {
        if (isMissing(error)) return;
        fail(`storage.${bucket}.list`);
        return;
      }
      const rows: any[] = data ?? [];
      for (const f of rows) if (f?.name) found.push(`${prefix}/${f.name}`);
      if (rows.length < PAGE) break;
    }
    await removeFiles(bucket, found);
  };

  // ---- 1. provider grants (before the token rows are deleted, otherwise there is nothing left to revoke) --------------------
  for (const e of emails.slice(0, 1)) {
    try {
      await deps.revokeProviderTokens(e);
    } catch (err) {
      result.warnings.push('provider_revoke_failed');
    }
  }

  // ---- 2. identify the account rows ------------------------------------------------------------------------------------------
  const userRows = await selectIn('users', 'id', 'email', emails);
  const userUuids = (userRows ?? []).map((r: any) => String(r.id)).filter(Boolean);
  const idKeys = [...emails, ...userUuids];

  // ---- 3. briefing episodes: audio first, then the rows -----------------------------------------------------------------------
  const episodes = await selectIn('podcast_episodes', 'id, audio_url', 'user_id', idKeys);
  for (const ep of episodes ?? []) {
    const loc = parseStorageUrl(ep.audio_url);
    if (loc) await removeFiles(loc.bucket, [loc.path]);
  }
  for (const e of emails) {
    await removeFolder('podcasts', e); // briefing audio is stored as <email>/<timestamp>.mp3, with or without an episode row
    await removeFolder('deep-dive-podcasts', e); // deep dives: <email>/<episode>.mp3
  }
  await deleteIn('podcast_episodes', 'user_id', idKeys);

  // ---- 4. deep dives -----------------------------------------------------------------------------------------------------------
  const deepDives = await selectIn('deep_dive_episodes', 'id, audio_path', 'user_id', emails);
  await removeFiles('deep-dive-podcasts', (deepDives ?? []).map((d: any) => d.audio_path).filter(Boolean));
  await deleteIn('deep_dive_episodes', 'user_id', emails);

  // ---- 5. Q&A sessions, their messages and spoken answers -----------------------------------------------------------------------
  const sessions = await selectIn('qa_sessions', 'id', 'user_id', emails);
  const sessionIds = (sessions ?? []).map((s: any) => String(s.id));
  if (sessionIds.length > 0) {
    const messages = await selectIn('qa_messages', 'audio_path', 'session_id', sessionIds);
    await removeFiles('qa-audio', (messages ?? []).map((m: any) => m.audio_path).filter(Boolean));
    await deleteIn('qa_messages', 'session_id', sessionIds);
  }
  await deleteIn('qa_sessions', 'user_id', emails);

  // ---- 6. custom sources and their items -----------------------------------------------------------------------------------------
  const sources = await selectIn('custom_sources', 'id', 'user_id', emails);
  const sourceIds = (sources ?? []).map((s: any) => String(s.id));
  if (sourceIds.length > 0) await deleteIn('custom_source_items', 'source_id', sourceIds);
  await deleteIn('custom_sources', 'user_id', emails);

  // ---- 7. the remaining tables keyed by the email -------------------------------------------------------------------------------
  await deleteIn('topic_requests', 'user_id', emails);
  await deleteIn('playback_interactions', 'user_id', emails);
  await deleteIn('user_preferences', 'user_id', emails);
  await deleteIn('user_settings', 'user_id', emails); // briefing schedule, timezone, push device tokens
  await deleteIn('ad_impressions', 'user_id', emails);
  await deleteIn('linked_accounts', 'user_email', emails); // stored Google / Microsoft tokens (also removed by the revoke above)
  await deleteIn('oauth_tokens', 'user_id', emails);

  // ---- 8. the account row itself, last of the database steps -------------------------------------------------------------------
  await deleteIn('users', 'email', emails);
  if (userUuids.length > 0) await deleteIn('users', 'id', userUuids);

  // ---- 9. memory -------------------------------------------------------------------------------------------------------------------
  try {
    for (const e of emails) deps.purgeMemory(e);
  } catch {
    result.warnings.push('memory_purge_failed');
  }

  // ---- 10. the sign-in identity, only when nothing above failed so the caller can retry with the same session ------------------
  if (result.ok) {
    try {
      await deps.deleteAuthUser(who.authUserId);
    } catch (err) {
      const msg = String((err as any)?.message ?? err);
      if (!/not found|user_not_found/i.test(msg)) fail('auth.deleteUser');
    }
  }

  return result;
}
