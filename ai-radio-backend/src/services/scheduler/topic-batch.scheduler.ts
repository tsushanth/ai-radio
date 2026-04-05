/**
 * Topic Batch Scheduler
 * Pre-generates daily episodes for all active topics
 * Triggered by Cloud Scheduler or manual API call
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';
import { topicsService } from '../supabase/topics.service';
import { topicPodcastGenerator } from '../content/topic.generator';
import type { TopicDefinition } from '../../types/topics';

interface TopicResult {
  topicId: string;
  topicName: string;
  success: boolean;
  isNew: boolean;
  skipped: boolean;
  durationSeconds?: number;
  error?: string;
}

interface BatchResult {
  batchId: string;
  status: 'completed' | 'failed';
  startedAt: Date;
  completedAt: Date;
  totalTopics: number;
  successful: number;
  failed: number;
  skipped: number;
  results: TopicResult[];
  triggerSource: string;
}

export class TopicBatchScheduler {
  private supabase: SupabaseClient | null = null;
  private readonly CONCURRENCY = 3;
  private readonly MAX_RETRIES = 2;
  private readonly TABLE = 'batch_generation_runs';

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    }
  }

  /**
   * Generate episodes for all active topics
   */
  async generateAllTopics(
    batchId: string,
    triggerSource: string = 'scheduler'
  ): Promise<BatchResult> {
    const startedAt = new Date();
    const topics = await topicsService.getTopics();
    const results: TopicResult[] = [];

    console.log(`[BatchScheduler] Starting batch ${batchId}: ${topics.length} topics`);

    // Save initial batch record
    await this.saveBatchRun({
      id: batchId,
      status: 'running',
      startedAt,
      totalTopics: topics.length,
      triggerSource,
    });

    // Process topics in batches of CONCURRENCY
    for (let i = 0; i < topics.length; i += this.CONCURRENCY) {
      const batch = topics.slice(i, i + this.CONCURRENCY);
      console.log(
        `[BatchScheduler] Processing batch ${Math.floor(i / this.CONCURRENCY) + 1}: ${batch.map(t => t.id).join(', ')}`
      );

      const batchResults = await Promise.allSettled(
        batch.map(topic => this.generateForTopic(topic))
      );

      for (let j = 0; j < batchResults.length; j++) {
        const result = batchResults[j];
        if (result.status === 'fulfilled') {
          results.push(result.value);
        } else {
          results.push({
            topicId: batch[j].id,
            topicName: batch[j].name,
            success: false,
            isNew: false,
            skipped: false,
            error: result.reason?.message || 'Unknown error',
          });
        }
      }
    }

    // Retry failed topics
    const failed = results.filter(r => !r.success && !r.skipped);
    if (failed.length > 0) {
      console.log(`[BatchScheduler] Retrying ${failed.length} failed topics...`);
      await this.retryFailed(failed, results, topics);
    }

    const completedAt = new Date();
    const successful = results.filter(r => r.success).length;
    const finalFailed = results.filter(r => !r.success && !r.skipped).length;
    const skipped = results.filter(r => r.skipped).length;

    const batchResult: BatchResult = {
      batchId,
      status: finalFailed === results.length ? 'failed' : 'completed',
      startedAt,
      completedAt,
      totalTopics: topics.length,
      successful,
      failed: finalFailed,
      skipped,
      results,
      triggerSource,
    };

    // Update batch record
    await this.saveBatchRun({
      id: batchId,
      status: batchResult.status,
      startedAt,
      completedAt,
      totalTopics: topics.length,
      successful,
      failed: finalFailed,
      skipped,
      results: JSON.stringify(results),
      triggerSource,
    });

    const durationMs = completedAt.getTime() - startedAt.getTime();
    console.log(
      `[BatchScheduler] Batch ${batchId} complete in ${(durationMs / 1000).toFixed(1)}s: ` +
      `${successful} success, ${finalFailed} failed, ${skipped} skipped`
    );

    return batchResult;
  }

  /**
   * Generate a single topic's episode
   */
  private async generateForTopic(topic: TopicDefinition): Promise<TopicResult> {
    try {
      // Determine which languages to generate for this topic
      const languages = topic.languages?.includes('all')
        ? ['en'] // Universal topics generate in English
        : (topic.languages || ['en']); // Locale topics generate in their specific languages

      let lastResult: any;
      for (const lang of languages) {
        lastResult = await topicPodcastGenerator.getOrGenerateEpisode(
          topic.id,
          'batch-scheduler',
          false, // Don't force regenerate -- skip if already exists
          lang
        );
      }

      const result = lastResult;
      const isNew = result.isNew;
      const skipped = !isNew && result.episode.status === 'completed';

      if (skipped) {
        console.log(`[BatchScheduler] Skipped ${topic.name} (already generated today)`);
      } else {
        console.log(`[BatchScheduler] Generated ${topic.name} (${result.episode.durationSeconds}s, langs: ${languages.join(',')})`);
      }

      return {
        topicId: topic.id,
        topicName: topic.name,
        success: true,
        isNew,
        skipped,
        durationSeconds: result.episode.durationSeconds,
      };
    } catch (error) {
      console.error(`[BatchScheduler] Failed ${topic.name}:`, error);
      return {
        topicId: topic.id,
        topicName: topic.name,
        success: false,
        isNew: false,
        skipped: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Retry failed topics with exponential backoff
   */
  private async retryFailed(
    failed: TopicResult[],
    allResults: TopicResult[],
    topics: TopicDefinition[]
  ): Promise<void> {
    for (let attempt = 1; attempt <= this.MAX_RETRIES; attempt++) {
      const stillFailed = allResults.filter(r => !r.success && !r.skipped);
      if (stillFailed.length === 0) break;

      const backoffMs = attempt * 5000; // 5s, 10s
      console.log(
        `[BatchScheduler] Retry attempt ${attempt}/${this.MAX_RETRIES} ` +
        `for ${stillFailed.length} topics (backoff: ${backoffMs}ms)`
      );
      await this.sleep(backoffMs);

      for (const failedResult of stillFailed) {
        const topic = topics.find(t => t.id === failedResult.topicId);
        if (!topic) continue;

        const retryResult = await this.generateForTopic(topic);

        // Update the result in the array
        const idx = allResults.findIndex(r => r.topicId === failedResult.topicId);
        if (idx !== -1) {
          allResults[idx] = retryResult;
        }
      }
    }
  }

  /**
   * Save batch run record to database
   */
  private async saveBatchRun(record: {
    id: string;
    status: string;
    startedAt: Date;
    completedAt?: Date;
    totalTopics: number;
    successful?: number;
    failed?: number;
    skipped?: number;
    results?: string;
    triggerSource: string;
  }): Promise<void> {
    if (!this.supabase) return;

    try {
      await this.supabase.from(this.TABLE).upsert(
        {
          id: record.id,
          status: record.status,
          started_at: record.startedAt.toISOString(),
          completed_at: record.completedAt?.toISOString(),
          total_topics: record.totalTopics,
          successful: record.successful ?? 0,
          failed: record.failed ?? 0,
          skipped: record.skipped ?? 0,
          results: record.results ? JSON.parse(record.results) : null,
          trigger_source: record.triggerSource,
        },
        { onConflict: 'id' }
      );
    } catch (error) {
      console.error('[BatchScheduler] Failed to save batch run:', error);
    }
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton
export const topicBatchScheduler = new TopicBatchScheduler();
