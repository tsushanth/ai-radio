/**
 * Deep Dive Generator Service
 * Generates on-demand research podcasts from user queries
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { env } from '../../config/environment';
import { openaiTTS, type VoiceConfig } from '../tts/openai.tts';
import { concatenateBuffers } from '../tts/audio.utils';
import type {
  DeepDiveEpisode,
  DeepDiveGenerateRequest,
  DeepDiveGenerateResponse,
  DeepDiveHistoryResponse,
  DeepDiveSource,
  DeepDiveDbRecord,
  ResearchResult,
} from '../../types/deepdive';
import type { PodcastScript, ScriptSegment } from '../../types/database';

export class DeepDiveGenerator {
  private supabase: SupabaseClient | null = null;
  private openai: OpenAI;
  private readonly BUCKET = 'deep-dive-podcasts';
  private readonly TABLE = 'deep_dive_episodes';

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      this.initializeBucket();
    }
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  /**
   * Initialize storage bucket for deep dive audio
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
          fileSizeLimit: 104857600, // 100MB for longer deep dives
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3'],
        });
        console.log(`Bucket '${this.BUCKET}' created`);
      }
    } catch (error) {
      console.error('Failed to initialize deep dive bucket:', error);
    }
  }

  /**
   * Generate a deep dive podcast from a user query
   */
  async generateDeepDive(request: DeepDiveGenerateRequest): Promise<DeepDiveGenerateResponse> {
    const { query, userId, language = 'en', targetDurationMinutes = 10 } = request;

    // Validate query
    if (!query || query.trim().length === 0) {
      throw new Error('Query cannot be empty');
    }

    if (query.length > 500) {
      throw new Error('Query must be 500 characters or less');
    }

    // Create episode ID
    const episodeId = `dd-${userId.substring(0, 8)}-${Date.now()}`;

    console.log(`[DeepDive] Starting generation for query: "${query.substring(0, 50)}..." (${language})`);

    // Create initial episode record
    const episode: DeepDiveEpisode = {
      id: episodeId,
      userId,
      query: query.trim(),
      title: this.generateTitle(query),
      description: '',
      status: 'researching',
      language,
      sources: [],
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    // Save initial status
    await this.saveEpisode(episode);

    try {
      // Step 1: Research the topic
      console.log(`  [1/4] Researching topic...`);
      const research = await this.researchTopic(query, language);
      episode.sources = research.sources;
      episode.status = 'generating';
      episode.updatedAt = new Date();
      await this.saveEpisode(episode);

      // Step 2: Generate script
      console.log(`  [2/4] Generating script...`);
      const script = await this.generateScript(query, research, language, targetDurationMinutes);
      episode.script = JSON.stringify(script);
      episode.description = this.generateDescription(query, research);

      // Step 3: Generate audio
      console.log(`  [3/4] Generating audio...`);
      const voiceConfig: VoiceConfig = {
        host1: 'nova',
        host2: 'onyx',
        model: 'tts-1-hd',
        speed: 1.0,
      };

      const audioSegments = await openaiTTS.synthesizeScript(script, voiceConfig);
      const audioBuffer = concatenateBuffers(audioSegments.map(s => s.buffer));
      const totalDuration = openaiTTS.calculateTotalDuration(audioSegments);

      // Step 4: Upload audio
      console.log(`  [4/4] Uploading audio...`);
      const audioPath = `${userId}/${episodeId}.mp3`;
      const audioUrl = await this.uploadAudio(audioBuffer, audioPath);

      // Update episode with final data
      episode.status = 'completed';
      episode.audioUrl = audioUrl;
      episode.audioPath = audioPath;
      episode.durationSeconds = totalDuration;
      episode.generatedAt = new Date();
      episode.updatedAt = new Date();

      await this.saveEpisode(episode);

      console.log(`[DeepDive] Generation complete: ${episode.title} (${totalDuration}s)`);

      return {
        episode,
        isNew: true,
        message: 'Deep Dive generated successfully!',
      };
    } catch (error) {
      // Update with error status
      episode.status = 'failed';
      episode.error = error instanceof Error ? error.message : 'Unknown error';
      episode.updatedAt = new Date();
      await this.saveEpisode(episode);

      console.error('[DeepDive] Generation failed:', error);
      throw error;
    }
  }

  /**
   * Research a topic using GPT-4 with web search simulation
   * In production, this would use a real web search API (Bing, Google, Perplexity)
   */
  private async researchTopic(query: string, language: string): Promise<ResearchResult> {
    const systemPrompt = `You are a research assistant that gathers information on any topic.
Your task is to simulate web research results for the given query.

IMPORTANT: Generate realistic research results that would come from searching the web.
Include a mix of:
- News articles from major outlets
- Academic or educational sources
- Industry publications
- Wikipedia or encyclopedia entries

For each source, provide:
- A realistic URL (use real domains like wikipedia.org, nytimes.com, bbc.com, nature.com, etc.)
- A descriptive title
- A brief snippet (1-2 sentences) summarizing the relevant content

Generate 5-8 diverse sources that would provide comprehensive coverage of the topic.`;

    const userPrompt = `Research the following topic and provide sources:

TOPIC: ${query}

Return a JSON object with this structure:
{
  "sources": [
    {
      "url": "https://example.com/article",
      "title": "Article Title",
      "domain": "example.com",
      "snippet": "Brief description of content..."
    }
  ],
  "summary": "A 2-3 sentence overview of the topic based on the sources",
  "keyPoints": ["Key point 1", "Key point 2", "Key point 3"]
}

Return ONLY valid JSON, no markdown or additional text.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    const responseText = response.choices[0]?.message?.content || '{}';
    const parsed = JSON.parse(responseText);

    return {
      query,
      sources: parsed.sources || [],
      summary: parsed.summary || '',
      keyPoints: parsed.keyPoints || [],
      fetchedAt: new Date(),
    };
  }

  /**
   * Generate podcast script from research
   */
  private async generateScript(
    query: string,
    research: ResearchResult,
    language: string,
    targetDurationMinutes: number
  ): Promise<PodcastScript> {
    const languageInstruction = language !== 'en'
      ? `\n\nIMPORTANT: Generate the ENTIRE script in ${this.getLanguageName(language)}. All dialogue must be in ${this.getLanguageName(language)}, not English.`
      : '';

    const systemPrompt = `You are a professional podcast script writer creating an in-depth research podcast.
This is a "Deep Dive" episode where two hosts explore a topic thoroughly, educating the listener.

HOST PERSONALITIES:
- Host 1 (Alex): Curious, asks good questions, drives the narrative forward
- Host 2 (Jordan): The expert/researcher, provides depth and context

GUIDELINES:
1. Create natural, engaging dialogue between the two hosts
2. Cover the topic comprehensively using the provided research
3. Target runtime: ${targetDurationMinutes} minutes (~${targetDurationMinutes * 150} words)
4. Structure: Hook intro → Main exploration → Key insights → Thoughtful conclusion
5. Reference sources naturally ("According to recent research..." "A study from...")
6. Make complex topics accessible to general audience
7. Include surprising facts or lesser-known aspects${languageInstruction}

FORMAT: Return ONLY a JSON array of segments:
[
  {"speaker": "host1", "text": "Welcome to Deep Dive...", "type": "intro"},
  {"speaker": "host2", "text": "Today we're exploring...", "type": "intro"},
  {"speaker": "host1", "text": "So let's start with...", "type": "news"},
  ...
  {"speaker": "host2", "text": "Thanks for listening...", "type": "outro"}
]

VALID TYPES: intro, news, outro (use "news" for all content segments)`;

    const sourceSummaries = research.sources
      .map((s, i) => `${i + 1}. ${s.title} (${s.domain}): ${s.snippet}`)
      .join('\n');

    const userPrompt = `Create a Deep Dive podcast episode about:

TOPIC: ${query}

RESEARCH SUMMARY:
${research.summary}

KEY POINTS TO COVER:
${research.keyPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

SOURCES:
${sourceSummaries}

Create an engaging ${targetDurationMinutes}-minute research podcast. Return ONLY valid JSON array.`;

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000,
    });

    const responseText = response.choices[0]?.message?.content || '';

    // Parse JSON from response
    const jsonMatch = responseText.match(/\[[\s\S]*\]/);
    if (!jsonMatch) {
      throw new Error('Failed to parse script JSON');
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
        cacheControl: '86400',
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
   * Get user's deep dive history
   */
  async getHistory(userId: string, limit: number = 20, offset: number = 0): Promise<DeepDiveHistoryResponse> {
    if (!this.supabase) {
      return { episodes: [], total: 0, hasMore: false };
    }

    // Get total count
    const { count } = await this.supabase
      .from(this.TABLE)
      .select('*', { count: 'exact', head: true })
      .eq('user_id', userId);

    // Get episodes
    const { data, error } = await this.supabase
      .from(this.TABLE)
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('Failed to fetch deep dive history:', error);
      return { episodes: [], total: 0, hasMore: false };
    }

    const episodes = (data || []).map(this.mapDbToEpisode);

    return {
      episodes,
      total: count || 0,
      hasMore: (count || 0) > offset + limit,
    };
  }

  /**
   * Get a single deep dive episode by ID
   */
  async getEpisode(episodeId: string, userId: string): Promise<DeepDiveEpisode | null> {
    if (!this.supabase) return null;

    const { data, error } = await this.supabase
      .from(this.TABLE)
      .select('*')
      .eq('id', episodeId)
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;

    return this.mapDbToEpisode(data);
  }

  /**
   * Delete a deep dive episode
   */
  async deleteEpisode(episodeId: string, userId: string): Promise<boolean> {
    if (!this.supabase) return false;

    // Get episode to find audio path
    const episode = await this.getEpisode(episodeId, userId);
    if (!episode) return false;

    // Delete audio file if exists
    if (episode.audioPath) {
      await this.supabase.storage
        .from(this.BUCKET)
        .remove([episode.audioPath]);
    }

    // Delete database record
    const { error } = await this.supabase
      .from(this.TABLE)
      .delete()
      .eq('id', episodeId)
      .eq('user_id', userId);

    return !error;
  }

  /**
   * Save episode to database
   */
  private async saveEpisode(episode: DeepDiveEpisode): Promise<void> {
    if (!this.supabase) {
      console.log('[DeepDive] Mock save episode:', episode.id);
      return;
    }

    const dbRecord: DeepDiveDbRecord = {
      id: episode.id,
      user_id: episode.userId,
      query: episode.query,
      title: episode.title,
      description: episode.description,
      audio_url: episode.audioUrl,
      audio_path: episode.audioPath,
      duration_seconds: episode.durationSeconds,
      status: episode.status,
      language: episode.language,
      sources: JSON.stringify(episode.sources),
      script: episode.script,
      generated_at: episode.generatedAt?.toISOString(),
      created_at: episode.createdAt.toISOString(),
      updated_at: episode.updatedAt.toISOString(),
      error: episode.error,
    };

    const { error } = await this.supabase
      .from(this.TABLE)
      .upsert(dbRecord, { onConflict: 'id' });

    if (error) {
      console.error('[DeepDive] Failed to save episode:', error);
    }
  }

  /**
   * Map database record to episode object
   */
  private mapDbToEpisode(data: Record<string, unknown>): DeepDiveEpisode {
    return {
      id: data.id as string,
      userId: data.user_id as string,
      query: data.query as string,
      title: data.title as string,
      description: data.description as string,
      audioUrl: data.audio_url as string | undefined,
      audioPath: data.audio_path as string | undefined,
      durationSeconds: data.duration_seconds as number | undefined,
      status: data.status as DeepDiveEpisode['status'],
      language: data.language as string,
      sources: JSON.parse((data.sources as string) || '[]'),
      script: data.script as string | undefined,
      generatedAt: data.generated_at ? new Date(data.generated_at as string) : undefined,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
      error: data.error as string | undefined,
    };
  }

  /**
   * Generate a title from the query
   */
  private generateTitle(query: string): string {
    // Capitalize first letter and truncate if needed
    const cleaned = query.trim();
    const title = cleaned.charAt(0).toUpperCase() + cleaned.slice(1);
    return title.length > 100 ? title.substring(0, 97) + '...' : title;
  }

  /**
   * Generate a description from research
   */
  private generateDescription(query: string, research: ResearchResult): string {
    if (research.summary) {
      return research.summary;
    }
    return `An in-depth exploration of: ${query}`;
  }

  /**
   * Estimate duration from segments
   */
  private estimateDuration(segments: ScriptSegment[]): number {
    const totalWords = segments.reduce(
      (sum, seg) => sum + seg.text.split(/\s+/).length,
      0
    );
    const wpm = 150;
    return Math.ceil((totalWords / wpm) * 60);
  }

  /**
   * Get human-readable language name
   */
  private getLanguageName(code: string): string {
    const languages: Record<string, string> = {
      en: 'English',
      es: 'Spanish',
      fr: 'French',
      de: 'German',
      pt: 'Portuguese',
      ja: 'Japanese',
      zh: 'Chinese (Mandarin)',
      hi: 'Hindi',
      ko: 'Korean',
      it: 'Italian',
    };
    return languages[code] || 'English';
  }
}

// Export singleton
export const deepDiveGenerator = new DeepDiveGenerator();
