/**
 * Interactions Service
 * Handles skip/tell-me-more interactions and adaptive learning
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import Anthropic from '@anthropic-ai/sdk';
import { env } from '../../config/environment';
import { openaiTTS, type VoiceConfig } from '../tts/openai.tts';
import type {
  PlaybackInteraction,
  TellMeMoreRequest,
  TellMeMoreExpansion,
  TellMeMoreResponse,
  UserPreferencesData,
  UserPreferencesResponse,
  RecordInteractionRequest,
  InteractionDbRecord,
  UserPreferencesDbRecord,
} from '../../types/interactions';

export class InteractionsService {
  private supabase: SupabaseClient | null = null;
  private anthropic: Anthropic;
  private readonly INTERACTIONS_TABLE = 'playback_interactions';
  private readonly PREFERENCES_TABLE = 'user_preferences';
  private readonly AUDIO_BUCKET = 'expansion-audio';

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      this.initializeBucket();
    }
    this.anthropic = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  }

  private async initializeBucket(): Promise<void> {
    if (!this.supabase) return;

    try {
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const bucketExists = buckets?.some(b => b.name === this.AUDIO_BUCKET);

      if (!bucketExists) {
        await this.supabase.storage.createBucket(this.AUDIO_BUCKET, {
          public: true,
          fileSizeLimit: 10485760,
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3'],
        });
      }
    } catch (error) {
      console.error('Failed to initialize expansion audio bucket:', error);
    }
  }

  /**
   * Record a playback interaction
   */
  async recordInteraction(
    userId: string,
    request: RecordInteractionRequest
  ): Promise<{ success: boolean; message?: string }> {
    const interaction: PlaybackInteraction = {
      id: `int-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      user_id: userId,
      context_type: request.context_type as PlaybackInteraction['context_type'],
      context_id: request.context_id,
      segment_type: request.segment_type,
      segment_index: request.segment_index,
      interaction_type: request.interaction_type,
      timestamp: request.timestamp,
      metadata: request.metadata,
      created_at: new Date().toISOString(),
    };

    // Save to database
    if (this.supabase) {
      const dbRecord: InteractionDbRecord = {
        ...interaction,
        metadata: interaction.metadata ? JSON.stringify(interaction.metadata) : undefined,
      };

      const { error } = await this.supabase
        .from(this.INTERACTIONS_TABLE)
        .insert(dbRecord);

      if (error) {
        console.error('Failed to save interaction:', error);
      }
    }

    // Update user preferences based on interaction
    await this.updatePreferencesFromInteraction(userId, interaction);

    return { success: true, message: 'Interaction recorded' };
  }

  /**
   * Generate expanded content for "Tell Me More"
   */
  async generateExpansion(
    userId: string,
    request: TellMeMoreRequest
  ): Promise<TellMeMoreResponse> {
    try {
      console.log(`[TellMeMore] Generating expansion for segment: ${request.segment_type}`);

      // Get original context
      const originalContent = await this.getOriginalContent(
        request.context_type,
        request.context_id,
        request.segment_type,
        request.segment_index
      );

      // Generate expanded content with GPT-4
      const expansion = await this.generateExpandedContent(originalContent, request.segment_type);

      // Optionally generate audio
      let audioUrl: string | undefined;
      let durationSeconds: number | undefined;

      // Generate audio for the expansion
      try {
        const audioResult = await this.generateExpansionAudio(expansion.expanded_content, expansion.id);
        audioUrl = audioResult.audioUrl;
        durationSeconds = audioResult.durationSeconds;
      } catch (audioError) {
        console.error('Failed to generate expansion audio:', audioError);
        // Continue without audio
      }

      return {
        success: true,
        data: {
          expansion: {
            ...expansion,
            audio_url: audioUrl,
            duration_seconds: durationSeconds,
          },
        },
      };
    } catch (error) {
      console.error('Failed to generate expansion:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate expansion',
      };
    }
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(userId: string): Promise<UserPreferencesResponse> {
    let preferences = await this.loadPreferences(userId);

    if (!preferences) {
      preferences = this.getDefaultPreferences();
    }

    // Generate recommendations based on preferences
    const recommendations = this.generateRecommendations(preferences);

    return {
      success: true,
      data: {
        preferences,
        recommendations,
      },
    };
  }

  /**
   * Update preferences from interaction
   */
  private async updatePreferencesFromInteraction(
    userId: string,
    interaction: PlaybackInteraction
  ): Promise<void> {
    let preferences = await this.loadPreferences(userId) || this.getDefaultPreferences();

    const topicId = interaction.metadata?.topic_id;

    switch (interaction.interaction_type) {
      case 'skip':
        if (topicId) {
          preferences.skipped_topics[topicId] = (preferences.skipped_topics[topicId] || 0) + 1;
        }
        if (interaction.segment_type) {
          const currentScore = preferences.preferred_segment_types[interaction.segment_type] || 0.5;
          preferences.preferred_segment_types[interaction.segment_type] = Math.max(0, currentScore - 0.1);
        }
        break;

      case 'tell_me_more':
        if (topicId) {
          preferences.expanded_topics[topicId] = (preferences.expanded_topics[topicId] || 0) + 1;
        }
        if (interaction.segment_type) {
          const currentScore = preferences.preferred_segment_types[interaction.segment_type] || 0.5;
          preferences.preferred_segment_types[interaction.segment_type] = Math.min(1.0, currentScore + 0.15);
        }
        break;

      case 'completed':
        if (interaction.metadata?.total_duration) {
          const duration = parseFloat(interaction.timestamp.toString());
          if (preferences.avg_listening_duration) {
            preferences.avg_listening_duration = (preferences.avg_listening_duration + duration) / 2;
          } else {
            preferences.avg_listening_duration = duration;
          }
        }

        // Detect preferred time of day
        const hour = new Date().getHours();
        if (hour >= 5 && hour < 12) {
          preferences.preferred_time_of_day = 'morning';
        } else if (hour >= 12 && hour < 17) {
          preferences.preferred_time_of_day = 'afternoon';
        } else {
          preferences.preferred_time_of_day = 'evening';
        }
        break;
    }

    preferences.last_updated = new Date().toISOString();
    await this.savePreferences(userId, preferences);
  }

  /**
   * Get original content for expansion
   */
  private async getOriginalContent(
    contextType: string,
    contextId: string,
    segmentType?: string,
    segmentIndex?: number
  ): Promise<string> {
    if (!this.supabase) {
      return 'Content not available';
    }

    // Try to get from appropriate table based on context type
    try {
      if (contextType === 'topic') {
        const { data } = await this.supabase
          .from('topic_episodes')
          .select('script')
          .eq('id', contextId)
          .single();

        if (data?.script) {
          // Extract relevant segment from script
          return this.extractSegment(data.script, segmentIndex);
        }
      } else if (contextType === 'deep_dive') {
        const { data } = await this.supabase
          .from('deep_dive_episodes')
          .select('script')
          .eq('id', contextId)
          .single();

        if (data?.script) {
          return this.extractSegment(data.script, segmentIndex);
        }
      }
    } catch (error) {
      console.error('Failed to fetch original content:', error);
    }

    return `Content about ${segmentType || 'this topic'}`;
  }

  private extractSegment(script: string, segmentIndex?: number): string {
    // Simple extraction - take portion of script
    const segments = script.split(/\n\n+/);
    if (segmentIndex !== undefined && segments[segmentIndex]) {
      return segments[segmentIndex];
    }
    return segments[0] || script.substring(0, 500);
  }

  /**
   * Generate expanded content using GPT-4
   */
  private async generateExpandedContent(
    originalContent: string,
    segmentType?: string
  ): Promise<TellMeMoreExpansion> {
    const prompt = `The user is listening to a podcast and wants to learn more about this topic.

Original content: "${originalContent}"

Generate an expanded explanation that:
1. Provides more depth and context
2. Includes interesting facts or examples
3. Is conversational in tone (suitable for audio)
4. Is about 2-3 paragraphs long

Also provide 1-2 relevant sources if applicable.

Return JSON:
{
  "expanded_content": "Your expanded explanation...",
  "sources": [{"title": "Source name", "snippet": "Brief description"}]
}

Return ONLY valid JSON.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-6',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.7,
      max_tokens: 1000,
    });

    const responseText = (response.content[0]?.type === 'text' ? response.content[0].text : '') || '{}';
    const parsed = JSON.parse(responseText);

    return {
      id: `exp-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      original_segment: originalContent.substring(0, 200),
      expanded_content: parsed.expanded_content || 'Unable to generate expansion.',
      sources: parsed.sources?.map((s: { title: string; url?: string; snippet?: string }, i: number) => ({
        id: `src-${i}`,
        title: s.title,
        url: s.url,
        snippet: s.snippet,
      })),
    };
  }

  /**
   * Generate audio for expansion
   */
  private async generateExpansionAudio(
    content: string,
    expansionId: string
  ): Promise<{ audioUrl: string; durationSeconds: number }> {
    const voiceConfig: VoiceConfig = {
      host1: 'nova',
      host2: 'nova',
      model: 'tts-1',
      speed: 1.0,
    };

    const ttsResponse = await openaiTTS.synthesize({
      text: content,
      voice: voiceConfig.host1,
      speed: voiceConfig.speed,
    });

    // Upload to storage
    const audioPath = `expansions/${expansionId}.mp3`;

    if (!this.supabase) {
      throw new Error('Storage not configured');
    }

    const { error } = await this.supabase.storage
      .from(this.AUDIO_BUCKET)
      .upload(audioPath, ttsResponse.audio_buffer, {
        contentType: 'audio/mpeg',
        upsert: true,
      });

    if (error) {
      throw new Error(`Upload failed: ${error.message}`);
    }

    const { data: urlData } = this.supabase.storage
      .from(this.AUDIO_BUCKET)
      .getPublicUrl(audioPath);

    // Estimate duration
    const wordCount = content.split(/\s+/).length;
    const durationSeconds = Math.ceil((wordCount / 150) * 60);

    return {
      audioUrl: urlData.publicUrl,
      durationSeconds,
    };
  }

  /**
   * Generate recommendations based on preferences
   */
  private generateRecommendations(preferences: UserPreferencesData): string[] {
    const recommendations: string[] = [];

    // Find most skipped topics
    const skippedEntries = Object.entries(preferences.skipped_topics);
    if (skippedEntries.length > 0) {
      const mostSkipped = skippedEntries.sort((a, b) => b[1] - a[1])[0];
      if (mostSkipped[1] >= 3) {
        recommendations.push(`Consider hiding "${mostSkipped[0]}" from your feed`);
      }
    }

    // Find high-interest topics
    const expandedEntries = Object.entries(preferences.expanded_topics);
    if (expandedEntries.length > 0) {
      const mostExpanded = expandedEntries.sort((a, b) => b[1] - a[1])[0];
      if (mostExpanded[1] >= 2) {
        recommendations.push(`You seem interested in "${mostExpanded[0]}" - try a Deep Dive!`);
      }
    }

    // Segment type preferences
    const lowPreference = Object.entries(preferences.preferred_segment_types)
      .filter(([_, score]) => score < 0.3)
      .map(([type]) => type);

    if (lowPreference.includes('email')) {
      recommendations.push('You often skip email summaries - adjust in settings?');
    }

    return recommendations;
  }

  /**
   * Load preferences from database
   */
  private async loadPreferences(userId: string): Promise<UserPreferencesData | null> {
    if (!this.supabase) return null;

    const { data, error } = await this.supabase
      .from(this.PREFERENCES_TABLE)
      .select('*')
      .eq('user_id', userId)
      .single();

    if (error || !data) return null;

    return {
      skipped_topics: JSON.parse(data.skipped_topics || '{}'),
      expanded_topics: JSON.parse(data.expanded_topics || '{}'),
      preferred_segment_types: JSON.parse(data.preferred_segment_types || '{}'),
      avg_listening_duration: data.avg_listening_duration,
      preferred_time_of_day: data.preferred_time_of_day,
      last_updated: data.updated_at,
    };
  }

  /**
   * Save preferences to database
   */
  private async savePreferences(userId: string, preferences: UserPreferencesData): Promise<void> {
    if (!this.supabase) return;

    const dbRecord: UserPreferencesDbRecord = {
      user_id: userId,
      skipped_topics: JSON.stringify(preferences.skipped_topics),
      expanded_topics: JSON.stringify(preferences.expanded_topics),
      preferred_segment_types: JSON.stringify(preferences.preferred_segment_types),
      avg_listening_duration: preferences.avg_listening_duration,
      preferred_time_of_day: preferences.preferred_time_of_day,
      updated_at: new Date().toISOString(),
    };

    const { error } = await this.supabase
      .from(this.PREFERENCES_TABLE)
      .upsert(dbRecord, { onConflict: 'user_id' });

    if (error) {
      console.error('Failed to save preferences:', error);
    }
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(): UserPreferencesData {
    return {
      skipped_topics: {},
      expanded_topics: {},
      preferred_segment_types: {
        calendar: 0.5,
        email: 0.5,
        news: 0.5,
        weather: 0.5,
      },
      last_updated: new Date().toISOString(),
    };
  }
}

// Export singleton
export const interactionsService = new InteractionsService();
