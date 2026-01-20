/**
 * Daily Brief Scheduler
 * Proactively generates daily briefs for users based on their preferred briefing time
 * Sends push notifications when ready
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';
import { podcastGenerator } from '../podcast/podcast.generator';
import { pushNotificationService } from '../notifications/push.service';
import type { UserPreferences } from '../../types/database';

interface ScheduledUser {
  user_id: string;
  briefing_time: string; // HH:MM format
  timezone: string;
  preferences: UserPreferences;
  device_tokens: string[];
  last_generated_date: string | null;
}

interface GenerationResult {
  userId: string;
  success: boolean;
  episodeId?: string;
  audioUrl?: string;
  error?: string;
}

export class DailyBriefScheduler {
  private supabase: SupabaseClient | null = null;
  private isRunning = false;
  private checkIntervalMs = 60 * 1000; // Check every minute
  private intervalId: NodeJS.Timeout | null = null;

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    }
  }

  /**
   * Start the scheduler
   */
  start(): void {
    if (this.isRunning) {
      console.log('[Scheduler] Already running');
      return;
    }

    console.log('[Scheduler] Starting daily brief scheduler...');
    this.isRunning = true;

    // Run immediately on start
    this.checkAndGenerateBriefs();

    // Then check every minute
    this.intervalId = setInterval(() => {
      this.checkAndGenerateBriefs();
    }, this.checkIntervalMs);
  }

  /**
   * Stop the scheduler
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    this.isRunning = false;
    console.log('[Scheduler] Stopped');
  }

  /**
   * Check for users who need their daily brief generated
   */
  private async checkAndGenerateBriefs(): Promise<void> {
    if (!this.supabase) {
      console.warn('[Scheduler] Supabase not configured');
      return;
    }

    try {
      // Get users whose briefing time is now (within 5 minutes)
      const usersToGenerate = await this.getUsersForGeneration();

      if (usersToGenerate.length === 0) {
        return; // No users need generation right now
      }

      console.log(`[Scheduler] Found ${usersToGenerate.length} users for generation`);

      // Generate briefs in parallel (with concurrency limit)
      const concurrencyLimit = 3;
      const results: GenerationResult[] = [];

      for (let i = 0; i < usersToGenerate.length; i += concurrencyLimit) {
        const batch = usersToGenerate.slice(i, i + concurrencyLimit);
        const batchResults = await Promise.all(
          batch.map(user => this.generateForUser(user))
        );
        results.push(...batchResults);
      }

      // Log results
      const successful = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      console.log(`[Scheduler] Generation complete: ${successful} successful, ${failed} failed`);

    } catch (error) {
      console.error('[Scheduler] Error in checkAndGenerateBriefs:', error);
    }
  }

  /**
   * Get users whose briefing time is now
   */
  private async getUsersForGeneration(): Promise<ScheduledUser[]> {
    if (!this.supabase) return [];

    const now = new Date();
    const currentHour = now.getUTCHours();
    const currentMinute = now.getUTCMinutes();
    const today = now.toISOString().split('T')[0];

    // Query users with matching briefing time who haven't been generated today
    // Note: In production, you'd want to handle timezones properly
    const { data, error } = await this.supabase
      .from('user_settings')
      .select(`
        user_id,
        briefing_time,
        timezone,
        preferences,
        last_generated_date,
        device_tokens
      `)
      .neq('last_generated_date', today)
      .not('device_tokens', 'is', null);

    if (error) {
      console.error('[Scheduler] Error fetching users:', error);
      return [];
    }

    if (!data) return [];

    // Filter users whose briefing time matches current time (within 5-minute window)
    return data.filter(user => {
      if (!user.briefing_time) return false;

      const [briefHour, briefMinute] = user.briefing_time.split(':').map(Number);

      // Convert user's briefing time to UTC based on their timezone
      // For simplicity, we'll assume briefing_time is already in UTC or handle timezone offset
      const timezoneOffset = this.getTimezoneOffset(user.timezone || 'America/Los_Angeles');
      const userHourUtc = (briefHour + timezoneOffset + 24) % 24;

      // Check if within 5-minute window
      const isTimeMatch = userHourUtc === currentHour &&
        Math.abs(briefMinute - currentMinute) <= 5;

      return isTimeMatch;
    }).map(user => ({
      user_id: user.user_id,
      briefing_time: user.briefing_time,
      timezone: user.timezone || 'America/Los_Angeles',
      preferences: user.preferences || this.getDefaultPreferences(),
      device_tokens: user.device_tokens || [],
      last_generated_date: user.last_generated_date,
    }));
  }

  /**
   * Generate daily brief for a single user
   */
  private async generateForUser(user: ScheduledUser): Promise<GenerationResult> {
    const today = new Date().toISOString().split('T')[0];

    console.log(`[Scheduler] Generating brief for user: ${user.user_id}`);

    try {
      // Delete previous day's audio to save storage
      await this.cleanupPreviousEpisode(user.user_id);

      // Generate the episode
      const result = await podcastGenerator.generateEpisode(
        user.user_id,
        user.preferences,
        {
          date: today,
          onProgress: (progress) => {
            console.log(`[Scheduler] ${user.user_id}: ${progress.progress_percent}% - ${progress.message}`);
          },
        }
      );

      // Update last_generated_date
      await this.updateLastGeneratedDate(user.user_id, today);

      // Send push notification
      if (user.device_tokens.length > 0) {
        await this.sendReadyNotification(user, result.duration_seconds);
      }

      console.log(`[Scheduler] ✅ Generated brief for ${user.user_id}`);

      return {
        userId: user.user_id,
        success: true,
        episodeId: result.episode_id,
        audioUrl: result.audio_url,
      };

    } catch (error) {
      console.error(`[Scheduler] ❌ Failed for ${user.user_id}:`, error);

      // Send failure notification
      if (user.device_tokens.length > 0) {
        await this.sendFailureNotification(user);
      }

      return {
        userId: user.user_id,
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Clean up previous day's episode to save storage
   */
  private async cleanupPreviousEpisode(userId: string): Promise<void> {
    if (!this.supabase) return;

    try {
      // Find previous episodes (keep only today's)
      const today = new Date().toISOString().split('T')[0];

      const { data: oldEpisodes } = await this.supabase
        .from('podcast_episodes')
        .select('id, audio_url')
        .eq('user_id', userId)
        .neq('date', today);

      if (!oldEpisodes || oldEpisodes.length === 0) return;

      console.log(`[Scheduler] Cleaning up ${oldEpisodes.length} old episodes for ${userId}`);

      for (const episode of oldEpisodes) {
        // Delete audio from storage
        if (episode.audio_url) {
          try {
            const audioPath = this.extractPathFromUrl(episode.audio_url);
            if (audioPath) {
              await this.supabase.storage
                .from('podcast-audio')
                .remove([audioPath]);
            }
          } catch (err) {
            console.warn(`[Scheduler] Failed to delete audio for episode ${episode.id}:`, err);
          }
        }

        // Delete episode record
        await this.supabase
          .from('podcast_episodes')
          .delete()
          .eq('id', episode.id);
      }

    } catch (error) {
      console.error('[Scheduler] Cleanup error:', error);
    }
  }

  /**
   * Extract storage path from public URL
   */
  private extractPathFromUrl(url: string): string | null {
    try {
      const match = url.match(/podcast-audio\/(.+)$/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  /**
   * Update last_generated_date for user
   */
  private async updateLastGeneratedDate(userId: string, date: string): Promise<void> {
    if (!this.supabase) return;

    await this.supabase
      .from('user_settings')
      .update({ last_generated_date: date })
      .eq('user_id', userId);
  }

  /**
   * Send push notification when brief is ready
   */
  private async sendReadyNotification(user: ScheduledUser, durationSeconds: number): Promise<void> {
    const minutes = Math.round(durationSeconds / 60);

    await pushNotificationService.sendToUser(user.device_tokens, {
      title: '☀️ Your Daily Brief is Ready',
      body: `Your ${minutes}-minute personalized briefing is ready to play.`,
      data: {
        type: 'daily_brief_ready',
        action: 'open_player',
      },
      sound: 'default',
      badge: 1,
    });
  }

  /**
   * Send push notification on generation failure
   */
  private async sendFailureNotification(user: ScheduledUser): Promise<void> {
    await pushNotificationService.sendToUser(user.device_tokens, {
      title: 'Daily Brief Update',
      body: 'We couldn\'t generate your brief today. Tap to try manually.',
      data: {
        type: 'daily_brief_failed',
        action: 'open_home',
      },
    });
  }

  /**
   * Get timezone offset in hours (simplified)
   */
  private getTimezoneOffset(timezone: string): number {
    const offsets: Record<string, number> = {
      'America/Los_Angeles': 8,
      'America/Denver': 7,
      'America/Chicago': 6,
      'America/New_York': 5,
      'Europe/London': 0,
      'Europe/Paris': -1,
      'Asia/Tokyo': -9,
      'Asia/Shanghai': -8,
      'Australia/Sydney': -11,
    };
    return offsets[timezone] || 0;
  }

  /**
   * Get default preferences
   */
  private getDefaultPreferences(): UserPreferences {
    return {
      briefing_time: '07:00',
      topics: [],
      voice_host1: 'nova',
      voice_host2: 'onyx',
      include_weather: true,
      include_calendar: true,
      include_email: true,
      language: 'en',
    };
  }

  /**
   * Manually trigger generation for a user (for testing or retry)
   */
  async triggerForUser(userId: string): Promise<GenerationResult> {
    if (!this.supabase) {
      return { userId, success: false, error: 'Database not configured' };
    }

    // Fetch user settings
    const { data } = await this.supabase
      .from('user_settings')
      .select('*')
      .eq('user_id', userId)
      .single();

    if (!data) {
      return { userId, success: false, error: 'User settings not found' };
    }

    const user: ScheduledUser = {
      user_id: userId,
      briefing_time: data.briefing_time || '07:00',
      timezone: data.timezone || 'America/Los_Angeles',
      preferences: data.preferences || this.getDefaultPreferences(),
      device_tokens: data.device_tokens || [],
      last_generated_date: data.last_generated_date,
    };

    return this.generateForUser(user);
  }
}

// Export singleton
export const dailyBriefScheduler = new DailyBriefScheduler();
