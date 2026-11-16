/** Supabase implementation of the retention store (service role). Used only by the retention CLI. */
import type { SupabaseClient } from '@supabase/supabase-js';
import type { EpisodeRow, RetentionStore } from './retention';

export const TOPIC_BUCKET = 'topic-podcasts';

export class SupabaseRetentionStore implements RetentionStore {
  constructor(private readonly db: SupabaseClient, private readonly bucket = TOPIC_BUCKET) {}

  async listEpisodes(beforeDate: string, afterId: string | null, limit: number): Promise<EpisodeRow[]> {
    let q = this.db.from('topic_episodes')
      .select('id,topic_id,date,language,audio_path,audio_url')
      .eq('status', 'completed').not('audio_path', 'is', null).not('audio_url', 'is', null)
      .lt('date', beforeDate).order('id', { ascending: true }).limit(limit);
    if (afterId) q = q.gt('id', afterId);
    const { data, error } = await q;
    if (error) throw new Error(`retention: listing episodes failed: ${error.message}`);
    return (data ?? []) as EpisodeRow[];
  }

  async objectSizes(paths: string[]): Promise<Map<string, number | null>> {
    const out = new Map<string, number | null>(paths.map((p) => [p, null]));
    const wanted = new Set(paths);
    const folders = [...new Set(paths.map((p) => p.split('/')[0]))];
    for (const folder of folders) {
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await this.db.storage.from(this.bucket).list(folder, { limit: 1000, offset });
        if (error || !data) break; // sizes are informational: unknown stays null
        for (const o of data) {
          const full = `${folder}/${o.name}`;
          const size = (o as { metadata?: { size?: number } }).metadata?.size;
          if (wanted.has(full) && typeof size === 'number') out.set(full, size);
        }
        if (data.length < 1000) break;
      }
    }
    return out;
  }

  async deleteObjects(paths: string[]): Promise<{ deleted: string[]; failed: string[] }> {
    const { data, error } = await this.db.storage.from(this.bucket).remove(paths);
    if (error) return { deleted: [], failed: paths };
    const gone = new Set((data ?? []).map((o) => o.name));
    return { deleted: paths.filter((p) => gone.has(p)), failed: paths.filter((p) => !gone.has(p)) };
  }

  async markExpired(ids: string[]): Promise<void> {
    const { error } = await this.db.from('topic_episodes').update({ audio_url: null, updated_at: new Date().toISOString() }).in('id', ids);
    if (error) throw new Error(`retention: clearing audio_url failed: ${error.message}`);
  }
}
