/**
 * Topic Podcast Generator Service
 * Generates daily podcasts for topics with caching
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import OpenAI from 'openai';
import { env } from '../../config/environment';
import { getTopicById, getActiveTopics, getCategoriesWithCounts } from '../../config/topics';
import { contentAggregator } from './aggregator.service';
import { openaiTTS, type VoiceConfig } from '../tts/openai.tts';
import { concatenateBuffers } from '../tts/audio.utils';
import type {
  TopicDefinition,
  TopicEpisode,
  TopicEpisodeResponse,
  TopicContent,
  AggregatedStory,
  TopicListResponse,
} from '../../types/topics';
import type { PodcastScript, ScriptSegment } from '../../types/database';

export class TopicPodcastGenerator {
  private supabase: SupabaseClient | null = null;
  private openai: OpenAI;
  private readonly BUCKET = 'topic-podcasts'; // Public bucket for topic podcasts
  private readonly TABLE = 'topic_episodes';

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      this.initializeBucket();
    }
    this.openai = new OpenAI({ apiKey: env.OPENAI_API_KEY });
  }

  /**
   * Initialize public bucket for topic podcasts
   */
  private async initializeBucket(): Promise<void> {
    if (!this.supabase) return;

    try {
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const bucketExists = buckets?.some(b => b.name === this.BUCKET);

      if (!bucketExists) {
        console.log(`📦 Creating public bucket '${this.BUCKET}'...`);
        await this.supabase.storage.createBucket(this.BUCKET, {
          public: true, // Public bucket for topic podcasts
          fileSizeLimit: 52428800,
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3'],
        });
        console.log(`✅ Bucket '${this.BUCKET}' created`);
      }
    } catch (error) {
      console.error('Failed to initialize topic bucket:', error);
    }
  }

  /**
   * Get or generate today's episode for a topic
   * @param topicId - Topic identifier
   * @param userId - Optional user identifier
   * @param forceRegenerate - Force regeneration even if episode exists
   * @param language - Language code (default: 'en')
   */
  async getOrGenerateEpisode(
    topicId: string,
    userId?: string,
    forceRegenerate: boolean = false,
    language: string = 'en'
  ): Promise<TopicEpisodeResponse> {
    const topic = getTopicById(topicId);
    if (!topic) {
      throw new Error(`Topic not found: ${topicId}`);
    }

    const today = this.getTodayDate();

    // Check if episode already exists for this language
    const existing = await this.getEpisode(topicId, today, language);

    if (existing && !forceRegenerate) {
      // If generating, tell user to wait
      if (existing.status === 'generating') {
        return {
          episode: existing,
          isNew: false,
          message: 'Episode is currently being generated. Please check back in 30-60 seconds.',
        };
      }

      // If completed, return it
      if (existing.status === 'completed') {
        // Increment play count
        await this.incrementPlayCount(existing.id);
        return {
          episode: existing,
          isNew: false,
          message: 'Today\'s episode is ready!',
        };
      }

      // If failed, allow retry
      if (existing.status === 'failed' && !forceRegenerate) {
        return {
          episode: existing,
          isNew: false,
          message: `Generation failed: ${existing.error}. Tap to retry.`,
        };
      }
    }

    // Generate new episode
    console.log(`🎙️ Generating new episode for ${topic.name} (${today}, lang: ${language})`);

    // Create placeholder episode - include language in ID for uniqueness
    const episodeId = `${topicId}-${today}-${language}`;
    const episode: TopicEpisode = {
      id: episodeId,
      topicId,
      date: today,
      status: 'generating',
      title: `${topic.name} - ${this.formatDate(today)}`,
      description: topic.description,
      stories: [],
      createdAt: new Date(),
      updatedAt: new Date(),
      playCount: 0,
      generatedBy: userId,
      language,
    };

    // Save generating status
    await this.saveEpisode(episode);

    try {
      // Generate the episode
      const generatedEpisode = await this.generateEpisode(topic, episode, language);

      return {
        episode: generatedEpisode,
        isNew: true,
        message: 'Episode generated successfully!',
      };
    } catch (error) {
      // Update with error status
      episode.status = 'failed';
      episode.error = error instanceof Error ? error.message : 'Unknown error';
      episode.updatedAt = new Date();
      await this.saveEpisode(episode);

      throw error;
    }
  }

  /**
   * Generate episode content and audio
   */
  private async generateEpisode(
    topic: TopicDefinition,
    episode: TopicEpisode,
    language: string = 'en'
  ): Promise<TopicEpisode> {
    // Step 1: Aggregate content
    console.log(`  [1/4] Fetching content...`);
    const content = await contentAggregator.aggregateTopicContent(topic);
    episode.stories = content.stories;

    if (content.stories.length === 0) {
      throw new Error('No content found for this topic');
    }

    // Step 2: Generate script (with language)
    console.log(`  [2/4] Generating script in ${language}...`);
    const script = await this.generateScript(topic, content, language);

    episode.script = JSON.stringify(script);

    // Step 3: Generate audio
    console.log(`  [3/4] Generating audio...`);
    const voiceConfig: VoiceConfig = {
      host1: 'nova',
      host2: 'onyx',
      model: 'tts-1-hd',
      speed: 1.0,
    };

    const audioSegments = await openaiTTS.synthesizeScript(script, voiceConfig);

    // Concatenate audio
    const audioBuffer = concatenateBuffers(audioSegments.map(s => s.buffer));
    const totalDuration = openaiTTS.calculateTotalDuration(audioSegments);

    // Step 4: Upload to storage - include language in path
    console.log(`  [4/4] Uploading audio...`);
    const audioPath = `${topic.id}/${episode.date}-${language}.mp3`;
    const audioUrl = await this.uploadAudio(audioBuffer, audioPath);

    // Update episode
    episode.status = 'completed';
    episode.audioUrl = audioUrl;
    episode.audioPath = audioPath;
    episode.durationSeconds = totalDuration;
    episode.generatedAt = new Date();
    episode.updatedAt = new Date();
    episode.language = language;

    await this.saveEpisode(episode);

    console.log(`✅ Episode generated: ${episode.title} (${totalDuration}s, lang: ${language})`);

    return episode;
  }

  /**
   * Generate podcast script from content
   */
  private async generateScript(
    topic: TopicDefinition,
    content: TopicContent,
    language: string = 'en'
  ): Promise<PodcastScript> {
    const systemPrompt = this.buildSystemPrompt(topic, language);
    const userPrompt = this.buildUserPrompt(topic, content, language);

    const response = await this.openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 3000,
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
        type: seg.type,
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
   * Build system prompt for topic podcasts
   */
  private buildSystemPrompt(topic: TopicDefinition, language: string = 'en'): string {
    const languageInstruction = language !== 'en'
      ? `\n\nIMPORTANT: Generate the ENTIRE script in ${this.getLanguageName(language)}. All dialogue must be in ${this.getLanguageName(language)}, not English.`
      : '';

    return `You are a professional podcast script writer creating a short daily briefing about ${topic.name}.

HOST PERSONALITIES:
- Host 1 (Alex): Upbeat, energetic, conversational. Drives the discussion.
- Host 2 (Jordan): Thoughtful, adds context and insight. Balances Alex's energy.

GUIDELINES:
1. Create natural, engaging dialogue between the two hosts
2. Cover 4-6 of the most important stories
3. Keep total runtime to ${topic.targetDurationMinutes} minutes (~${topic.targetDurationMinutes * 150} words)
4. Use conversational language, not formal news reading
5. Add smooth transitions between stories
6. ${topic.promptContext}${languageInstruction}

FORMAT: Return ONLY a JSON array of segments:
[
  {"speaker": "host1", "text": "Welcome to today's ${topic.name}...", "type": "intro"},
  {"speaker": "host2", "text": "Great to be here...", "type": "intro"},
  ...
]

VALID TYPES: intro, news, outro (use "news" for all content segments)`;
  }

  /**
   * Build user prompt with content
   */
  private buildUserPrompt(topic: TopicDefinition, content: TopicContent, language: string = 'en'): string {
    const storySummaries = content.stories
      .slice(0, 10)
      .map((s, i) => `${i + 1}. ${s.title}${s.summary ? ` - ${s.summary.substring(0, 150)}` : ''} (${s.source})`)
      .join('\n');

    const languageInstruction = language !== 'en'
      ? ` Write the ENTIRE script in ${this.getLanguageName(language)}.`
      : '';

    return `Create today's ${topic.name} podcast for ${this.formatDate(content.date)}.${languageInstruction}

TOP STORIES:
${storySummaries}

Create an engaging ${topic.targetDurationMinutes}-minute podcast covering the most important 4-6 stories. Return ONLY valid JSON.`;
  }

  /**
   * Get human-readable language name from code
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

  /**
   * Upload audio to public bucket
   */
  private async uploadAudio(buffer: Buffer, path: string): Promise<string> {
    if (!this.supabase) {
      throw new Error('Supabase not configured');
    }

    const { error } = await this.supabase.storage
      .from(this.BUCKET)
      .upload(path, buffer, {
        contentType: 'audio/mpeg',
        cacheControl: '86400', // 24 hour cache
        upsert: true,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    // Get public URL (bucket is public)
    const { data } = this.supabase.storage
      .from(this.BUCKET)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  /**
   * Get existing episode from database
   */
  private async getEpisode(topicId: string, date: string, language: string = 'en'): Promise<TopicEpisode | null> {
    if (!this.supabase) return null;

    // Episode ID format: {topicId}-{date}-{language}
    const episodeId = `${topicId}-${date}-${language}`;

    const { data, error } = await this.supabase
      .from(this.TABLE)
      .select('*')
      .eq('id', episodeId)
      .single();

    if (error || !data) return null;

    return this.mapDbToEpisode(data);
  }

  /**
   * Save episode to database
   */
  private async saveEpisode(episode: TopicEpisode): Promise<void> {
    if (!this.supabase) {
      console.log('Mock save episode:', episode.id);
      return;
    }

    const dbRecord = {
      id: episode.id,
      topic_id: episode.topicId,
      date: episode.date,
      status: episode.status,
      title: episode.title,
      description: episode.description,
      audio_url: episode.audioUrl,
      audio_path: episode.audioPath,
      duration_seconds: episode.durationSeconds,
      script: episode.script,
      stories: JSON.stringify(episode.stories),
      generated_at: episode.generatedAt?.toISOString(),
      generated_by: episode.generatedBy,
      play_count: episode.playCount,
      error: episode.error,
      language: episode.language || 'en',
      created_at: episode.createdAt.toISOString(),
      updated_at: episode.updatedAt.toISOString(),
    };

    const { error } = await this.supabase
      .from(this.TABLE)
      .upsert(dbRecord, { onConflict: 'id' });

    if (error) {
      console.error('Failed to save episode:', error);
    }
  }

  /**
   * Increment play count
   */
  private async incrementPlayCount(episodeId: string): Promise<void> {
    if (!this.supabase) return;

    await this.supabase.rpc('increment_play_count', { episode_id: episodeId });
  }

  /**
   * Map database record to episode
   */
  private mapDbToEpisode(data: Record<string, unknown>): TopicEpisode {
    return {
      id: data.id as string,
      topicId: data.topic_id as string,
      date: data.date as string,
      status: data.status as TopicEpisode['status'],
      title: data.title as string,
      description: data.description as string,
      audioUrl: data.audio_url as string | undefined,
      audioPath: data.audio_path as string | undefined,
      durationSeconds: data.duration_seconds as number | undefined,
      script: data.script as string | undefined,
      stories: JSON.parse((data.stories as string) || '[]'),
      generatedAt: data.generated_at ? new Date(data.generated_at as string) : undefined,
      generatedBy: data.generated_by as string | undefined,
      createdAt: new Date(data.created_at as string),
      updatedAt: new Date(data.updated_at as string),
      playCount: (data.play_count as number) || 0,
      error: data.error as string | undefined,
      language: (data.language as string) || 'en',
    };
  }

  /**
   * Get all topics list
   */
  getTopicsList(): TopicListResponse {
    return {
      topics: getActiveTopics(),
      categories: getCategoriesWithCounts(),
    };
  }

  /**
   * Get topic by ID
   */
  getTopic(topicId: string): TopicDefinition | undefined {
    return getTopicById(topicId);
  }

  /**
   * Get recent episodes for a topic
   */
  async getRecentEpisodes(topicId: string, limit: number = 7, language: string = 'en'): Promise<TopicEpisode[]> {
    if (!this.supabase) return [];

    const { data, error } = await this.supabase
      .from(this.TABLE)
      .select('*')
      .eq('topic_id', topicId)
      .eq('status', 'completed')
      .eq('language', language)
      .order('date', { ascending: false })
      .limit(limit);

    if (error || !data) return [];

    return data.map(d => this.mapDbToEpisode(d));
  }

  /**
   * Get today's available episodes across all topics
   */
  async getTodaysEpisodes(): Promise<TopicEpisode[]> {
    if (!this.supabase) return [];

    const today = this.getTodayDate();

    const { data, error } = await this.supabase
      .from(this.TABLE)
      .select('*')
      .eq('date', today)
      .eq('status', 'completed');

    if (error || !data) return [];

    return data.map(d => this.mapDbToEpisode(d));
  }

  /**
   * Estimate duration from segments
   */
  private estimateDuration(segments: ScriptSegment[]): number {
    const totalWords = segments.reduce(
      (sum, seg) => sum + seg.text.split(/\s+/).length,
      0
    );
    const wpm = 150; // Words per minute
    return Math.ceil((totalWords / wpm) * 60);
  }

  /**
   * Get today's date
   */
  private getTodayDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Format date for display
   */
  private formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
    });
  }
}

// Export singleton
export const topicPodcastGenerator = new TopicPodcastGenerator();
