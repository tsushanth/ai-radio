/**
 * Live Station Generator Service
 * Generates continuously updating news streams
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/environment';
import { openaiTTS, type VoiceConfig } from '../tts/openai.tts';
import { concatenateBuffers } from '../tts/audio.utils';
import type {
  LiveStation,
  LiveStationEpisode,
  LiveStationsResponse,
  LiveStationDetailResponse,
  LiveStationTuneInResponse,
  LiveStationDbRecord,
  LiveStationEpisodeDbRecord,
  LiveStationCategory,
} from '../../types/livestation';
import type { PodcastScript, ScriptSegment } from '../../types/database';

// Predefined live stations
const DEFAULT_STATIONS: Omit<LiveStation, 'currentEpisode' | 'createdAt' | 'updatedAt'>[] = [
  {
    id: 'live-breaking-news',
    name: 'Breaking News',
    description: '24/7 coverage of breaking news and developing stories worldwide',
    icon: 'newspaper',
    color: '#EF4444',
    category: 'news',
    refreshIntervalMinutes: 15,
    isActive: true,
    listenerCount: 0,
  },
  {
    id: 'live-tech-pulse',
    name: 'Tech Pulse',
    description: 'Latest technology news, AI updates, and startup coverage',
    icon: 'cpu',
    color: '#3B82F6',
    category: 'technology',
    refreshIntervalMinutes: 30,
    isActive: true,
    listenerCount: 0,
  },
  {
    id: 'live-market-watch',
    name: 'Market Watch',
    description: 'Real-time financial news, market movements, and business updates',
    icon: 'chart.line',
    color: '#10B981',
    category: 'business',
    refreshIntervalMinutes: 20,
    isActive: true,
    listenerCount: 0,
  },
  {
    id: 'live-world-report',
    name: 'World Report',
    description: 'International news coverage from around the globe',
    icon: 'globe',
    color: '#8B5CF6',
    category: 'world',
    refreshIntervalMinutes: 30,
    isActive: true,
    listenerCount: 0,
  },
  {
    id: 'live-sports-center',
    name: 'Sports Center',
    description: 'Live sports updates, scores, and breaking sports news',
    icon: 'sportscourt',
    color: '#F59E0B',
    category: 'sports',
    refreshIntervalMinutes: 15,
    isActive: true,
    listenerCount: 0,
  },
  {
    id: 'live-entertainment-buzz',
    name: 'Entertainment Buzz',
    description: 'Celebrity news, entertainment updates, and pop culture',
    icon: 'film',
    color: '#EC4899',
    category: 'entertainment',
    refreshIntervalMinutes: 45,
    isActive: true,
    listenerCount: 0,
  },
];

export class LiveStationGenerator {
  private supabase: SupabaseClient | null = null;
  private anthropic: Anthropic;
  private readonly BUCKET = 'live-station-audio';
  private readonly STATIONS_TABLE = 'live_stations';
  private readonly EPISODES_TABLE = 'live_station_episodes';

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      this.initializeBucket();
      this.initializeStations();
    }
    this.anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  /**
   * Initialize storage bucket for live station audio
   */
  private async initializeBucket(): Promise<void> {
    if (!this.supabase) return;

    try {
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const bucketExists = buckets?.some(b => b.name === this.BUCKET);

      if (!bucketExists) {
        console.log(`Creating bucket '${this.BUCKET}'...`);
        await this.supabase.storage.createBucket(this.BUCKET, {
          public: true,
          fileSizeLimit: 52428800, // 50MB for shorter live segments
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3'],
        });
        console.log(`Bucket '${this.BUCKET}' created`);
      }
    } catch (error) {
      console.error('Failed to initialize live station bucket:', error);
    }
  }

  /**
   * Initialize default stations in database
   */
  private async initializeStations(): Promise<void> {
    if (!this.supabase) return;

    try {
      for (const station of DEFAULT_STATIONS) {
        const { error } = await this.supabase
          .from(this.STATIONS_TABLE)
          .upsert({
            id: station.id,
            name: station.name,
            description: station.description,
            icon: station.icon,
            color: station.color,
            category: station.category,
            refresh_interval_minutes: station.refreshIntervalMinutes,
            is_active: station.isActive,
            listener_count: 0,
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          }, { onConflict: 'id' });

        if (error) {
          console.error(`Failed to upsert station ${station.id}:`, error);
        }
      }
      console.log('[LiveStation] Default stations initialized');
    } catch (error) {
      console.error('Failed to initialize stations:', error);
    }
  }

  /**
   * Get all available live stations
   */
  async getStations(): Promise<LiveStationsResponse> {
    if (!this.supabase) {
      // Return mock data when database not available
      const mockStations = DEFAULT_STATIONS.map(s => ({
        ...s,
        currentEpisode: undefined,
        createdAt: new Date(),
        updatedAt: new Date(),
      }));
      return {
        stations: mockStations,
        categories: this.getCategoryInfo(mockStations),
      };
    }

    const { data, error } = await this.supabase
      .from(this.STATIONS_TABLE)
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Failed to fetch live stations:', error);
      return { stations: [], categories: [] };
    }

    // Map to LiveStation and get current episodes
    const stations: LiveStation[] = await Promise.all(
      (data || []).map(async (record) => {
        const station = this.mapDbToStation(record);
        station.currentEpisode = await this.getCurrentEpisode(station.id);
        return station;
      })
    );

    return {
      stations,
      categories: this.getCategoryInfo(stations),
    };
  }

  /**
   * Get station detail with recent episodes
   */
  async getStationDetail(stationId: string): Promise<LiveStationDetailResponse | null> {
    if (!this.supabase) return null;

    const { data: stationData, error: stationError } = await this.supabase
      .from(this.STATIONS_TABLE)
      .select('*')
      .eq('id', stationId)
      .single();

    if (stationError || !stationData) return null;

    const station = this.mapDbToStation(stationData);
    station.currentEpisode = await this.getCurrentEpisode(stationId);

    // Get recent episodes
    const { data: episodesData } = await this.supabase
      .from(this.EPISODES_TABLE)
      .select('*')
      .eq('station_id', stationId)
      .order('created_at', { ascending: false })
      .limit(10);

    const recentEpisodes = (episodesData || []).map(this.mapDbToEpisode);

    return { station, recentEpisodes };
  }

  /**
   * Tune into a live station - returns current content or generates new
   */
  async tuneIn(stationId: string): Promise<LiveStationTuneInResponse> {
    // Get station
    const detail = await this.getStationDetail(stationId);
    if (!detail) {
      throw new Error('Station not found');
    }

    const { station } = detail;

    // Check if current episode is still valid
    let episode = station.currentEpisode;
    if (!episode || this.isEpisodeExpired(episode, station.refreshIntervalMinutes)) {
      // Generate new episode
      console.log(`[LiveStation] Generating new episode for ${station.name}`);
      episode = await this.generateEpisode(station);
    }

    // Increment listener count
    await this.incrementListenerCount(stationId);

    // Calculate next update time
    const nextUpdateAt = this.calculateNextUpdate(episode, station.refreshIntervalMinutes);

    return {
      station: { ...station, currentEpisode: episode },
      episode,
      nextUpdateAt,
    };
  }

  /**
   * Generate a new episode for a station
   */
  async generateEpisode(station: LiveStation): Promise<LiveStationEpisode> {
    const episodeId = `${station.id}-${Date.now()}`;

    console.log(`[LiveStation] Starting generation for ${station.name}`);

    try {
      // Step 1: Get latest news for category
      console.log(`  [1/3] Fetching news for ${station.category}...`);
      const news = await this.fetchCategoryNews(station.category, station.name);

      // Step 2: Generate script
      console.log(`  [2/3] Generating script...`);
      const script = await this.generateScript(station, news);

      // Step 3: Generate audio
      console.log(`  [3/3] Generating audio...`);
      const voiceConfig: VoiceConfig = {
        host1: 'alloy',
        host2: 'echo',
        model: 'tts-1',
        speed: 1.05,
      };

      const audioSegments = await openaiTTS.synthesizeScript(script, voiceConfig);
      const audioBuffer = concatenateBuffers(audioSegments.map(s => s.buffer));
      const totalDuration = openaiTTS.calculateTotalDuration(audioSegments);

      // Upload audio
      const audioPath = `${station.id}/${episodeId}.mp3`;
      const audioUrl = await this.uploadAudio(audioBuffer, audioPath);

      // Create episode
      const episode: LiveStationEpisode = {
        id: episodeId,
        stationId: station.id,
        title: `${station.name} Update`,
        description: `Latest updates from ${station.name}`,
        audioUrl,
        audioPath,
        durationSeconds: totalDuration,
        headlines: news.headlines,
        generatedAt: new Date(),
        expiresAt: new Date(Date.now() + station.refreshIntervalMinutes * 60 * 1000),
        createdAt: new Date(),
      };

      // Save to database
      await this.saveEpisode(episode);

      console.log(`[LiveStation] Episode generated: ${episode.title} (${totalDuration}s)`);

      return episode;
    } catch (error) {
      console.error(`[LiveStation] Failed to generate episode for ${station.name}:`, error);
      throw error;
    }
  }

  /**
   * Fetch news for a category using GPT-4
   */
  private async fetchCategoryNews(
    category: LiveStationCategory,
    stationName: string
  ): Promise<{ headlines: string[]; content: string }> {
    const categoryTopics: Record<LiveStationCategory, string> = {
      news: 'breaking news, current events, major headlines',
      technology: 'tech news, AI developments, startup funding, product launches',
      business: 'financial markets, earnings reports, business news, economic indicators',
      sports: 'sports scores, game results, player news, upcoming matches',
      entertainment: 'celebrity news, movie releases, music, TV shows, pop culture',
      world: 'international news, global events, foreign policy, world affairs',
    };

    const systemPrompt = `You are a news researcher for a live radio station called "${stationName}".
Generate current news content for the ${category} category.

IMPORTANT: Generate realistic, timely-sounding news content as if it were happening today.
Focus on: ${categoryTopics[category]}

Return a JSON object with:
{
  "headlines": ["Headline 1", "Headline 2", "Headline 3", "Headline 4", "Headline 5"],
  "content": "Detailed news content (3-4 paragraphs) covering these stories..."
}

Return ONLY valid JSON, no markdown.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      system: systemPrompt + '\n\nReturn ONLY valid JSON.',
      messages: [
        { role: 'user', content: `Generate the latest ${category} news update for ${stationName}. Current time context: ${new Date().toISOString()}` },
      ],
      temperature: 0.8,
      max_tokens: 1500,
    });

    const responseText = (response.content[0]?.type === 'text' ? response.content[0].text : '') || '{}';
    const parsed = JSON.parse(responseText);

    return {
      headlines: parsed.headlines || [],
      content: parsed.content || '',
    };
  }

  /**
   * Generate script for live station episode
   */
  private async generateScript(
    station: LiveStation,
    news: { headlines: string[]; content: string }
  ): Promise<PodcastScript> {
    const systemPrompt = `You are a professional radio script writer for "${station.name}".
Write a brief, punchy news update script (2-3 minutes).

STYLE:
- Conversational but professional
- Quick pacing, energy
- Two hosts trading off headlines
- Keep each segment 1-2 sentences
- Total script should be ~300-400 words

HOST VOICES:
- Host 1 (anchor): Delivers main headlines, authoritative
- Host 2 (reporter): Adds context, details

FORMAT: Return ONLY a JSON array:
[
  {"speaker": "host1", "text": "Good [time of day], this is ${station.name}...", "type": "intro"},
  {"speaker": "host2", "text": "Let's get right to it...", "type": "intro"},
  {"speaker": "host1", "text": "Breaking now...", "type": "news"},
  ...
  {"speaker": "host1", "text": "We'll be back with more...", "type": "outro"}
]`;

    const userPrompt = `Create a live radio script for these headlines:

${news.headlines.map((h, i) => `${i + 1}. ${h}`).join('\n')}

CONTENT:
${news.content}

Return ONLY valid JSON array.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      system: systemPrompt,
      messages: [
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
    });

    const responseText = (response.content[0]?.type === 'text' ? response.content[0].text : '') || '';
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse live station script');
    }

    const segments: ScriptSegment[] = JSON.parse(jsonMatch[0]).map(
      (seg: { speaker: string; text: string; type: string }, index: number) => ({
        sequence: index + 1,
        speaker: seg.speaker as 'host1' | 'host2',
        text: seg.text,
        type: seg.type || 'news',
      })
    );

    return {
      segments,
      total_segments: segments.length,
      estimated_duration_seconds: this.estimateDuration(segments),
      generated_at: new Date().toISOString(),
    };
  }

  /**
   * Upload audio to storage
   */
  private async uploadAudio(buffer: Buffer, path: string): Promise<string> {
    if (!this.supabase) {
      throw new Error('Supabase not configured');
    }

    const { error } = await this.supabase.storage
      .from(this.BUCKET)
      .upload(path, buffer, {
        contentType: 'audio/mpeg',
        cacheControl: '3600',
        upsert: true,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    const { data } = this.supabase.storage
      .from(this.BUCKET)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  /**
   * Get current episode for a station
   */
  private async getCurrentEpisode(stationId: string): Promise<LiveStationEpisode | undefined> {
    if (!this.supabase) return undefined;

    const { data, error } = await this.supabase
      .from(this.EPISODES_TABLE)
      .select('*')
      .eq('station_id', stationId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (error || !data) return undefined;

    return this.mapDbToEpisode(data);
  }

  /**
   * Save episode to database
   */
  private async saveEpisode(episode: LiveStationEpisode): Promise<void> {
    if (!this.supabase) return;

    const dbRecord: LiveStationEpisodeDbRecord = {
      id: episode.id,
      station_id: episode.stationId,
      title: episode.title,
      description: episode.description,
      audio_url: episode.audioUrl,
      audio_path: episode.audioPath,
      duration_seconds: episode.durationSeconds,
      headlines: JSON.stringify(episode.headlines),
      generated_at: episode.generatedAt?.toISOString(),
      expires_at: episode.expiresAt?.toISOString(),
      created_at: episode.createdAt.toISOString(),
    };

    const { error } = await this.supabase
      .from(this.EPISODES_TABLE)
      .upsert(dbRecord, { onConflict: 'id' });

    if (error) {
      console.error('[LiveStation] Failed to save episode:', error);
    }
  }

  /**
   * Increment listener count for a station
   */
  private async incrementListenerCount(stationId: string): Promise<void> {
    if (!this.supabase) return;

    await this.supabase.rpc('increment_listener_count', { station_id: stationId });
  }

  /**
   * Check if episode is expired
   */
  private isEpisodeExpired(episode: LiveStationEpisode, refreshIntervalMinutes: number): boolean {
    if (!episode.generatedAt) return true;

    const generatedAt = typeof episode.generatedAt === 'string'
      ? new Date(episode.generatedAt)
      : episode.generatedAt;

    const expiresAt = new Date(generatedAt.getTime() + refreshIntervalMinutes * 60 * 1000);
    return new Date() > expiresAt;
  }

  /**
   * Calculate next update time
   */
  private calculateNextUpdate(episode: LiveStationEpisode, refreshIntervalMinutes: number): Date {
    const generatedAt = typeof episode.generatedAt === 'string'
      ? new Date(episode.generatedAt)
      : episode.generatedAt || new Date();

    return new Date(generatedAt.getTime() + refreshIntervalMinutes * 60 * 1000);
  }

  /**
   * Map database record to station
   */
  private mapDbToStation(data: Record<string, unknown>): LiveStation {
    return {
      id: data.id as string,
      name: data.name as string,
      description: data.description as string,
      icon: data.icon as string,
      color: data.color as string,
      category: data.category as LiveStationCategory,
      refreshIntervalMinutes: data.refresh_interval_minutes as number,
      isActive: data.is_active as boolean,
      listenerCount: data.listener_count as number,
      currentEpisode: undefined,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
    };
  }

  /**
   * Map database record to episode
   */
  private mapDbToEpisode(data: Record<string, unknown>): LiveStationEpisode {
    return {
      id: data.id as string,
      stationId: data.station_id as string,
      title: data.title as string,
      description: data.description as string,
      audioUrl: data.audio_url as string | undefined,
      audioPath: data.audio_path as string | undefined,
      durationSeconds: data.duration_seconds as number | undefined,
      headlines: JSON.parse((data.headlines as string) || '[]'),
      generatedAt: data.generated_at ? new Date(data.generated_at as string) : undefined,
      expiresAt: data.expires_at ? new Date(data.expires_at as string) : undefined,
      createdAt: new Date(data.created_at as string),
    };
  }

  /**
   * Get category info
   */
  private getCategoryInfo(stations: LiveStation[]): { id: LiveStationCategory; name: string; count: number }[] {
    const categoryNames: Record<LiveStationCategory, string> = {
      news: 'Breaking News',
      technology: 'Technology',
      business: 'Business',
      sports: 'Sports',
      entertainment: 'Entertainment',
      world: 'World',
    };

    const categoryCounts = new Map<LiveStationCategory, number>();
    for (const station of stations) {
      categoryCounts.set(station.category, (categoryCounts.get(station.category) || 0) + 1);
    }

    return Array.from(categoryCounts.entries()).map(([id, count]) => ({
      id,
      name: categoryNames[id],
      count,
    }));
  }

  /**
   * Estimate duration from segments
   */
  private estimateDuration(segments: ScriptSegment[]): number {
    const totalWords = segments.reduce(
      (sum, seg) => sum + seg.text.split(/\s+/).length,
      0
    );
    const wpm = 160; // Slightly faster for news
    return Math.ceil((totalWords / wpm) * 60);
  }
}

// Export singleton
export const liveStationGenerator = new LiveStationGenerator();
