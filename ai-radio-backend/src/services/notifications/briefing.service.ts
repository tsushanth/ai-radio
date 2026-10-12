/**
 * Briefing Service
 * Read-only summary of the latest completed topic podcasts, used by the
 * Android "morning briefing" local notification to write honest copy
 * ("3 new topic podcasts: AI, Space, Cricket"). No writes, no push, no
 * per-user data. Cached in memory so a 7am wave of devices does not turn
 * into a wave of Supabase reads.
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';
import { topicsService } from '../supabase/topics.service';

export interface BriefingSummary {
  date: string | null; // YYYY-MM-DD of the newest completed batch, null when none is fresh
  count: number; // completed topic podcasts for that date
  headlines: { topic_id: string; name: string }[]; // up to MAX_HEADLINES
}

const MAX_HEADLINES = 3;
const MAX_AGE_DAYS = 2; // older than this is not "new", so report count 0
const CACHE_TTL_MS = 10 * 60 * 1000;

export class BriefingService {
  private supabase: SupabaseClient | null = null;
  private cache = new Map<string, { at: number; value: BriefingSummary }>();

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    }
  }

  async getSummary(language: string = 'en'): Promise<BriefingSummary> {
    const hit = this.cache.get(language);
    if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.value;

    const value = await this.compute(language);
    this.cache.set(language, { at: Date.now(), value });
    return value;
  }

  private async compute(language: string): Promise<BriefingSummary> {
    const empty: BriefingSummary = { date: null, count: 0, headlines: [] };
    if (!this.supabase) return empty;

    // Newest completed rows first; keep only the newest date's rows.
    const { data, error } = await this.supabase
      .from('topic_episodes')
      .select('topic_id, date, language, play_count')
      .eq('status', 'completed')
      .eq('language', language)
      .order('date', { ascending: false })
      .limit(60);

    if (error || !data || data.length === 0) return empty;

    const newest = data[0].date as string;
    const ageMs = Date.now() - new Date(`${newest}T00:00:00Z`).getTime();
    if (!Number.isFinite(ageMs) || ageMs > MAX_AGE_DAYS * 24 * 60 * 60 * 1000) {
      return empty;
    }

    const rows = data.filter(r => r.date === newest);
    // Most-played first so the headline topics are the ones people open.
    rows.sort((a, b) => ((b.play_count as number) || 0) - ((a.play_count as number) || 0));

    const topics = await topicsService.getTopics(language);
    const nameById = new Map(topics.map(t => [t.id, t.name]));

    const headlines: BriefingSummary['headlines'] = [];
    for (const r of rows) {
      const name = nameById.get(r.topic_id as string);
      if (!name) continue;
      headlines.push({ topic_id: r.topic_id as string, name });
      if (headlines.length >= MAX_HEADLINES) break;
    }

    return { date: newest, count: rows.length, headlines };
  }
}

export const briefingService = new BriefingService();
