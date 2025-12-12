/**
 * Podcast Generator
 * Orchestrates the full pipeline: fetch data → generate script → create audio → upload → save
 */

import { gmailService } from '../email/gmail.service';
import { googleCalendarService } from '../calendar/calendar.service';
import { scriptGenerator } from '../ai/script.generator';
import { openaiTTS } from '../tts/openai.tts';
import { storageService } from '../storage/storage.service';
import type {
  PodcastGenerationInput,
  PodcastGenerationResult,
  AudioSegment,
} from '../../types/podcast';
import type {
  PodcastEpisode,
  PodcastEpisodeInsert,
  PodcastScript as DBPodcastScript,
  UserPreferences,
} from '../../types/database';
import type { PodcastScript } from '../../types/database';
import {
  calculateTotalDuration,
  calculateTotalSize,
  concatenateBuffers,
  validateAllSegments,
  getAudioStatistics,
} from '../tts/audio.utils';
import { validateScriptStructure } from '../ai/script.utils';

/**
 * Job progress callback
 */
export type ProgressCallback = (progress: {
  step: string;
  progress_percent: number;
  message: string;
}) => void | Promise<void>;

/**
 * Generation options
 */
export interface GenerationOptions {
  skip_email?: boolean;
  skip_calendar?: boolean;
  skip_upload?: boolean;
  voice_speed?: number;
  parallel_tts?: boolean;
  tts_concurrency?: number;
  onProgress?: ProgressCallback;
}

/**
 * Generation statistics
 */
export interface GenerationStats {
  start_time: Date;
  end_time: Date;
  duration_ms: number;
  email_count: number;
  calendar_event_count: number;
  script_segments: number;
  script_words: number;
  audio_segments: number;
  audio_duration_seconds: number;
  audio_size_mb: number;
  script_cost_usd: number;
  tts_cost_usd: number;
  total_cost_usd: number;
}

export class PodcastGeneratorService {
  /**
   * Generate complete podcast episode
   */
  async generateEpisode(
    userId: string,
    preferences: UserPreferences,
    options: GenerationOptions = {}
  ): Promise<PodcastGenerationResult> {
    const startTime = new Date();
    let stats: Partial<GenerationStats> = {
      start_time: startTime,
      email_count: 0,
      calendar_event_count: 0,
    };

    try {
      await this.reportProgress(options.onProgress, {
        step: 'initialize',
        progress_percent: 0,
        message: 'Starting podcast generation...',
      });

      // Step 1: Fetch data
      const { emails, calendarEvents } = await this.fetchData(
        userId,
        preferences,
        options
      );
      stats.email_count = emails.length;
      stats.calendar_event_count = calendarEvents.length;

      await this.reportProgress(options.onProgress, {
        step: 'data_fetched',
        progress_percent: 20,
        message: `Fetched ${emails.length} emails and ${calendarEvents.length} events`,
      });

      // Step 2: Generate script
      const script = await this.generateScript(
        userId,
        emails,
        calendarEvents,
        preferences,
        options
      );
      stats.script_segments = script.total_segments;
      stats.script_words = script.metadata?.total_words || 0;

      // Estimate script cost
      const scriptCostEstimate = scriptGenerator.estimateTokenUsage({
        user_id: userId,
        emails,
        calendar_events: calendarEvents,
        date: new Date().toISOString().split('T')[0],
        preferences,
      });
      stats.script_cost_usd = scriptCostEstimate.estimated_cost_usd;

      await this.reportProgress(options.onProgress, {
        step: 'script_generated',
        progress_percent: 40,
        message: `Generated script with ${script.total_segments} segments`,
      });

      // Step 3: Generate audio
      const audioSegments = await this.generateAudio(
        script,
        preferences,
        options
      );
      stats.audio_segments = audioSegments.length;
      stats.audio_duration_seconds = calculateTotalDuration(audioSegments);
      stats.audio_size_mb = calculateTotalSize(audioSegments).megabytes;

      // Estimate TTS cost
      const ttsCostEstimate = openaiTTS.estimateCost(script);
      stats.tts_cost_usd = ttsCostEstimate.estimated_cost_usd;
      stats.total_cost_usd = (stats.script_cost_usd || 0) + (stats.tts_cost_usd || 0);

      await this.reportProgress(options.onProgress, {
        step: 'audio_generated',
        progress_percent: 70,
        message: `Generated ${audioSegments.length} audio segments`,
      });

      // Step 4: Upload audio
      let audioUrl: string;
      if (options.skip_upload) {
        audioUrl = 'file:///tmp/podcast.mp3'; // Local file for testing
        console.log('Skipping upload (test mode)');
      } else {
        audioUrl = await this.uploadAudio(audioSegments, userId, options);
      }

      await this.reportProgress(options.onProgress, {
        step: 'audio_uploaded',
        progress_percent: 90,
        message: 'Audio uploaded to storage',
      });

      // Step 5: Save episode to database
      const episodeId = await this.saveEpisode(
        userId,
        script,
        audioUrl,
        stats.audio_duration_seconds || 0,
        options
      );

      await this.reportProgress(options.onProgress, {
        step: 'completed',
        progress_percent: 100,
        message: 'Podcast generation completed',
      });

      const endTime = new Date();
      stats.end_time = endTime;
      stats.duration_ms = endTime.getTime() - startTime.getTime();

      console.log('Generation completed:', stats);

      return {
        episode_id: episodeId,
        audio_url: audioUrl,
        duration_seconds: stats.audio_duration_seconds || 0,
        script: this.convertScriptToDBFormat(script),
      };
    } catch (error) {
      console.error('Podcast generation failed:', error);

      await this.reportProgress(options.onProgress, {
        step: 'failed',
        progress_percent: -1,
        message: `Generation failed: ${error instanceof Error ? error.message : 'Unknown error'}`,
      });

      throw this.createError('Failed to generate podcast episode', error);
    }
  }

  /**
   * Step 1: Fetch emails and calendar events
   */
  private async fetchData(
    userId: string,
    preferences: UserPreferences,
    options: GenerationOptions
  ) {
    const emails = options.skip_email || !preferences.include_email
      ? []
      : await gmailService.fetchEmails(userId, {
          max_results: 50,
          since_hours: 24,
          exclude_categories: ['promotions', 'social', 'updates'],
        });

    const calendarEvents = options.skip_calendar || !preferences.include_calendar
      ? []
      : await googleCalendarService.fetchTodayAndTomorrowEvents(userId);

    return { emails, calendarEvents };
  }

  /**
   * Step 2: Generate script using GPT-4
   */
  private async generateScript(
    userId: string,
    emails: any[],
    calendarEvents: any[],
    preferences: UserPreferences,
    options: GenerationOptions
  ) {
    const input: PodcastGenerationInput = {
      user_id: userId,
      emails,
      calendar_events: calendarEvents,
      date: new Date().toISOString().split('T')[0],
      preferences,
    };

    // Generate with retry
    const script = await scriptGenerator.generateScriptWithRetry(input, 3);

    // Validate script quality
    const validation = scriptGenerator.validateScript(script);
    if (!validation.valid) {
      console.warn('Script quality issues:', validation.issues);
      // Continue anyway, but log for monitoring
    }

    // Validate structure
    const structureValidation = validateScriptStructure(script);
    if (!structureValidation.valid) {
      console.warn('Script structure issues:', structureValidation.errors);
    }

    return script;
  }

  /**
   * Step 3: Generate audio using OpenAI TTS
   */
  private async generateAudio(
    script: PodcastScript,
    preferences: UserPreferences,
    options: GenerationOptions
  ) {
    // Configure voices from preferences
    const voiceConfig = openaiTTS.getVoiceConfigFromPreferences({
      voice_host1: preferences.voice_host1,
      voice_host2: preferences.voice_host2,
    });

    // Apply speed override if provided
    if (options.voice_speed) {
      voiceConfig.speed = options.voice_speed;
    }

    // Generate audio (parallel or sequential)
    let audioSegments: AudioSegment[];
    if (options.parallel_tts !== false) {
      const concurrency = options.tts_concurrency || 5;
      audioSegments = await openaiTTS.synthesizeScriptParallel(
        script,
        voiceConfig,
        concurrency
      );
    } else {
      audioSegments = await openaiTTS.synthesizeScript(script, voiceConfig);
    }

    // Validate all audio segments
    const validation = validateAllSegments(audioSegments);
    if (!validation.all_valid) {
      console.error('Audio validation failed:', validation.issues);
      throw new Error(`Audio validation failed: ${validation.invalid_count} invalid segments`);
    }

    return audioSegments;
  }

  /**
   * Step 4: Upload audio to storage
   */
  private async uploadAudio(
    audioSegments: AudioSegment[],
    userId: string,
    options: GenerationOptions
  ): Promise<string> {
    // Upload using storage service
    const result = await storageService.uploadPodcast(
      audioSegments,
      userId,
      undefined, // Let storage service generate episode ID
      {
        content_type: 'audio/mpeg',
        cache_control: '3600', // 1 hour cache
        upsert: false,
      }
    );

    console.log(`Audio uploaded: ${result.url} (${(result.size_bytes / 1024 / 1024).toFixed(2)} MB)`);

    return result.url;
  }

  /**
   * Step 5: Save episode to database
   */
  private async saveEpisode(
    userId: string,
    script: PodcastScript,
    audioUrl: string,
    duration: number,
    options: GenerationOptions
  ): Promise<string> {
    // Generate title and description
    const date = new Date().toLocaleDateString('en-US', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
    const title = `Daily Briefing - ${date}`;
    const description = this.generateDescription(script);

    const episode: PodcastEpisodeInsert = {
      user_id: userId,
      title,
      description,
      script: this.convertScriptToDBFormat(script),
      audio_url: audioUrl,
      duration_seconds: duration,
      status: 'completed',
      error_message: null,
      generated_at: new Date().toISOString(),
    };

    // TODO: Save to Supabase
    // const { data, error } = await supabase
    //   .from('podcast_episodes')
    //   .insert(episode)
    //   .select()
    //   .single();

    // Return placeholder ID
    const episodeId = `ep_${Date.now()}_${userId.split('@')[0]}`;

    console.log('Episode saved:', { episodeId, title, duration });

    return episodeId;
  }

  /**
   * Generate episode description from script
   */
  private generateDescription(script: PodcastScript): string {
    const emailSegments = script.segments.filter(s => s.type === 'email').length;
    const calendarSegments = script.segments.filter(s => s.type === 'calendar').length;

    let description = 'Your personalized daily briefing with ';
    const parts: string[] = [];

    if (emailSegments > 0) {
      parts.push('email highlights');
    }
    if (calendarSegments > 0) {
      parts.push('calendar overview');
    }

    description += parts.join(' and ');
    description += '. Generated with AI-powered two-host conversation.';

    return description;
  }

  /**
   * Convert script to database format
   */
  private convertScriptToDBFormat(script: PodcastScript): DBPodcastScript {
    return {
      segments: script.segments.map(segment => ({
        speaker: segment.speaker,
        text: segment.text,
        type: segment.type as 'intro' | 'calendar' | 'email' | 'news' | 'weather' | 'outro',
        duration_estimate: segment.sequence, // Using sequence as estimate for now
      })),
      total_duration_estimate: script.estimated_duration_seconds,
    };
  }

  /**
   * Report progress to callback
   */
  private async reportProgress(
    callback: ProgressCallback | undefined,
    progress: { step: string; progress_percent: number; message: string }
  ): Promise<void> {
    if (callback) {
      await callback(progress);
    }
    console.log(`[${progress.progress_percent}%] ${progress.step}: ${progress.message}`);
  }

  /**
   * Generate podcast for scheduled time
   */
  async generateScheduledPodcast(userId: string): Promise<PodcastGenerationResult> {
    // TODO: Fetch user and preferences from database
    // const { data: user } = await supabase
    //   .from('users')
    //   .select('*, preferences')
    //   .eq('id', userId)
    //   .single();

    // Placeholder preferences
    const preferences: UserPreferences = {
      briefing_time: '07:00',
      topics: ['work', 'meetings'],
      voice_host1: 'nova',
      voice_host2: 'onyx',
      include_weather: false,
      include_calendar: true,
      include_email: true,
    };

    return this.generateEpisode(userId, preferences);
  }

  /**
   * Regenerate failed episode
   */
  async regenerateEpisode(episodeId: string): Promise<PodcastGenerationResult> {
    // TODO: Fetch episode from database
    // const { data: episode } = await supabase
    //   .from('podcast_episodes')
    //   .select('*')
    //   .eq('id', episodeId)
    //   .single();

    // TODO: Mark as regenerating
    // await supabase
    //   .from('podcast_episodes')
    //   .update({ status: 'generating' })
    //   .eq('id', episodeId);

    throw new Error('Regeneration not implemented yet');
  }

  /**
   * Get generation statistics for monitoring
   */
  async getGenerationStats(
    startDate: Date,
    endDate: Date
  ): Promise<{
    total_episodes: number;
    successful: number;
    failed: number;
    average_duration_seconds: number;
    total_cost_usd: number;
  }> {
    // TODO: Query database for statistics
    // const { data: episodes } = await supabase
    //   .from('podcast_episodes')
    //   .select('*')
    //   .gte('created_at', startDate.toISOString())
    //   .lte('created_at', endDate.toISOString());

    return {
      total_episodes: 0,
      successful: 0,
      failed: 0,
      average_duration_seconds: 0,
      total_cost_usd: 0,
    };
  }

  /**
   * Validate prerequisites for generation
   */
  async validatePrerequisites(userId: string): Promise<{
    valid: boolean;
    issues: string[];
  }> {
    const issues: string[] = [];

    // Check OAuth tokens
    // TODO: Check if user has valid Gmail/Calendar tokens
    // const { data: tokens } = await supabase
    //   .from('oauth_tokens')
    //   .select('*')
    //   .eq('user_id', userId);

    // if (!tokens || tokens.length === 0) {
    //   issues.push('No OAuth tokens found - user needs to authenticate');
    // }

    // Check API keys
    if (!process.env.OPENAI_API_KEY) {
      issues.push('OpenAI API key not configured');
    }

    if (!process.env.GOOGLE_CLIENT_ID) {
      issues.push('Google OAuth not configured');
    }

    return {
      valid: issues.length === 0,
      issues,
    };
  }

  /**
   * Estimate generation cost before running
   */
  async estimateGenerationCost(
    userId: string,
    preferences: UserPreferences
  ): Promise<{
    script_cost_usd: number;
    tts_cost_usd: number;
    total_cost_usd: number;
    estimated_duration_seconds: number;
  }> {
    // Rough estimation based on typical usage
    const avgEmailChars = 100;
    const avgCalendarChars = 80;
    const avgEmails = preferences.include_email ? 10 : 0;
    const avgEvents = preferences.include_calendar ? 5 : 0;

    const estimatedScriptChars = 2500; // Typical 5-minute script
    const estimatedScriptTokens = Math.ceil(estimatedScriptChars / 4);

    // GPT-4 Turbo pricing
    const scriptCost = (estimatedScriptTokens / 1000) * 0.01; // Input tokens
    const scriptOutputCost = (3000 / 1000) * 0.03; // Output tokens
    const totalScriptCost = scriptCost + scriptOutputCost;

    // TTS pricing
    const ttsCost = (estimatedScriptChars / 1_000_000) * 30; // $30 per 1M chars for HD

    return {
      script_cost_usd: parseFloat(totalScriptCost.toFixed(4)),
      tts_cost_usd: parseFloat(ttsCost.toFixed(4)),
      total_cost_usd: parseFloat((totalScriptCost + ttsCost).toFixed(4)),
      estimated_duration_seconds: 300, // 5 minutes typical
    };
  }

  /**
   * Create standardized error
   */
  private createError(message: string, originalError?: unknown): Error {
    const error = new Error(message);

    if (originalError instanceof Error) {
      error.message = `${message}: ${originalError.message}`;
      error.stack = originalError.stack;
    }

    return error;
  }
}

// Export singleton instance
export const podcastGenerator = new PodcastGeneratorService();

// Export class for testing
export default PodcastGeneratorService;
