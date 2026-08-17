/**
 * Podcast Routes
 * Handles podcast generation and episode management
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { podcastGenerator } from '../services/podcast/podcast.generator';
import type { UserPreferences } from '../types/database';
import {
  PodcastErrorAction,
  classifyError,
  isAuthError,
  isContentError,
  createPodcastError,
} from '../types/podcast-errors';

const router = express.Router();

// ================================================
// IN-MEMORY JOB STORE (for async generation)
// In production, use Redis or database
// ================================================

interface ScriptSegment {
  speaker: 'host1' | 'host2';
  text: string;
  type: string;
}

interface GenerationJob {
  id: string;
  userId: string;
  status: 'queued' | 'processing' | 'completed' | 'failed';
  progress: number;
  message: string;
  result?: {
    episodeId: string;
    audioUrl: string;
    durationSeconds: number;
    scriptSegments: ScriptSegment[];
  };
  error?: {
    code: string;
    message: string;
    action: string;
    retryable: boolean;
  };
  createdAt: Date;
  updatedAt: Date;
}

const jobStore = new Map<string, GenerationJob>();

// Clean up old jobs every 10 minutes (keep jobs for 1 hour)
setInterval(() => {
  const oneHourAgo = Date.now() - 60 * 60 * 1000;
  for (const [jobId, job] of jobStore.entries()) {
    if (job.createdAt.getTime() < oneHourAgo) {
      jobStore.delete(jobId);
    }
  }
}, 10 * 60 * 1000);

function generateJobId(): string {
  return `job_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
}

// ================================================
// VALIDATION SCHEMAS
// ================================================

const generatePodcastSchema = z.object({
  user_id: z.string().email('Invalid email format'),
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be in YYYY-MM-DD format').optional(),
  preferences: z.object({
    briefing_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format'),
    topics: z.array(z.string()).optional().default([]),
    voice_host1: z.string().optional().default('nova'),
    voice_host2: z.string().optional().default('onyx'),
    include_weather: z.boolean().optional().default(false),
    include_calendar: z.boolean().optional().default(true),
    include_email: z.boolean().optional().default(true),
    include_topics: z.boolean().optional().default(true), // Include updates from bookmarked topics
    language: z.string().optional().default('en'), // Language code: en, es, fr, de, hi, etc.
  }),
  options: z.object({
    skip_email: z.boolean().optional(),
    skip_calendar: z.boolean().optional(),
    skip_upload: z.boolean().optional(),
    voice_speed: z.number().min(0.25).max(4.0).optional(),
    parallel_tts: z.boolean().optional(),
    tts_concurrency: z.number().min(1).max(10).optional(),
  }).optional(),
});

const estimateCostSchema = z.object({
  user_id: z.string().email(),
  preferences: z.object({
    include_email: z.boolean(),
    include_calendar: z.boolean(),
  }),
});

const validatePrerequisitesSchema = z.object({
  user_id: z.string().email(),
});

// ================================================
// ROUTES
// ================================================

/**
 * POST /podcast/generate-async
 * Start async podcast generation - returns job_id immediately
 * Client should poll /podcast/job/:jobId for status
 */
router.post('/generate-async', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const validated = generatePodcastSchema.parse(req.body);

    console.log(`[POST /podcast/generate-async] Starting async generation for: ${validated.user_id}`);

    // Check prerequisites first (this is fast)
    const prereqs = await podcastGenerator.validatePrerequisites(validated.user_id);
    if (!prereqs.valid) {
      return res.status(400).json({
        error: 'Prerequisites not met',
        issues: prereqs.issues,
      });
    }

    // Create job with initial progress of 5% (job accepted)
    const jobId = generateJobId();
    const job: GenerationJob = {
      id: jobId,
      userId: validated.user_id,
      status: 'processing',
      progress: 5,
      message: 'Starting generation...',
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    jobStore.set(jobId, job);

    // Return immediately with job ID
    res.status(202).json({
      success: true,
      jobId,
      status: 'processing',
      message: 'Generation started. Poll /podcast/job/:jobId for status.',
    });

    // Start generation in background (don't await)
    const clientDate = validated.date || new Date().toISOString().split('T')[0];

    podcastGenerator.generateEpisode(
      validated.user_id,
      validated.preferences,
      {
        ...validated.options,
        date: clientDate,
        // Pass include_topics preference to options as include_topic_teasers
        include_topic_teasers: validated.preferences.include_topics,
        onProgress: async (progress) => {
          // Update job progress
          job.progress = progress.progress_percent;
          job.message = progress.message;
          job.updatedAt = new Date();
          console.log(`[Job ${jobId}] ${progress.progress_percent}%: ${progress.message}`);
        },
      }
    ).then((result) => {
      // Success - update job with result
      job.status = 'completed';
      job.progress = 100;
      job.message = 'Generation complete';

      const scriptSegments = result.script.segments.map((seg: any) => ({
        speaker: seg.speaker,
        text: seg.text,
        type: seg.type,
      }));

      console.log(`[Job ${jobId}] Script has ${result.script.segments.length} segments, mapped ${scriptSegments.length} segments`);

      job.result = {
        episodeId: result.episode_id,
        audioUrl: result.audio_url,
        durationSeconds: result.duration_seconds,
        scriptSegments,
      };
      job.updatedAt = new Date();
      console.log(`[Job ${jobId}] Completed successfully`);
    }).catch((error) => {
      // Failed - update job with error
      const errorInstance = error instanceof Error ? error : new Error(String(error));
      const errorCode = classifyError(errorInstance);
      const podcastError = createPodcastError(errorCode, errorInstance);

      job.status = 'failed';
      job.message = podcastError.userMessage;
      job.error = {
        code: podcastError.code,
        message: podcastError.userMessage,
        action: podcastError.action,
        retryable: podcastError.retryable,
      };
      job.updatedAt = new Date();
      console.error(`[Job ${jobId}] Failed:`, error);
    });

  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: error.errors,
      });
    }

    console.error('Async generation setup failed:', error);
    res.status(500).json({
      error: 'Failed to start generation',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /podcast/job/:jobId
 * Get job status and result
 */
router.get('/job/:jobId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const jobId = req.params.jobId;
    const job = jobStore.get(jobId);

    if (!job) {
      return res.status(404).json({
        error: 'Job not found',
        message: 'Job may have expired or does not exist',
      });
    }

    // Return job status
    const response: any = {
      success: true,
      jobId: job.id,
      status: job.status,
      progress: job.progress,
      message: job.message,
      createdAt: job.createdAt.toISOString(),
      updatedAt: job.updatedAt.toISOString(),
    };

    // Include result if completed
    if (job.status === 'completed' && job.result) {
      console.log(`[Job ${jobId}] Returning ${job.result.scriptSegments.length} script segments`);
      response.episode = {
        id: job.result.episodeId,
        audioUrl: job.result.audioUrl,
        durationSeconds: job.result.durationSeconds,
        title: 'Daily Brief',
        status: 'completed',
        script: {
          segments: job.result.scriptSegments,
          totalSegments: job.result.scriptSegments.length,
          estimatedDurationSeconds: job.result.durationSeconds,
        },
      };
    }

    // Include error if failed
    if (job.status === 'failed' && job.error) {
      response.error = job.error;
    }

    res.json(response);
  } catch (error) {
    console.error('Job status retrieval failed:', error);
    res.status(500).json({
      error: 'Failed to get job status',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /podcast/script
 * Script-only generation for clients that synthesize audio on-device (Kokoro).
 * Runs prerequisites + data fetch + GPT script, skips TTS and upload.
 * Synchronous: typical latency ~5-15s, no polling needed.
 */
router.post('/script', async (req: Request, res: Response, _next: NextFunction) => {
  try {
    const validated = generatePodcastSchema.parse(req.body);

    console.log(`[POST /podcast/script] Script-only generation for: ${validated.user_id}`);

    const prereqs = await podcastGenerator.validatePrerequisites(validated.user_id);
    if (!prereqs.valid) {
      return res.status(400).json({
        error: 'Prerequisites not met',
        issues: prereqs.issues,
      });
    }

    const clientDate = validated.date || new Date().toISOString().split('T')[0];

    const script = await podcastGenerator.generateScriptOnly(
      validated.user_id,
      validated.preferences,
      {
        ...validated.options,
        date: clientDate,
        include_topic_teasers: validated.preferences.include_topics,
      }
    );

    const segments = script.segments.map((seg: any) => ({
      speaker: seg.speaker,
      text: seg.text,
      type: seg.type,
    }));

    return res.status(200).json({
      success: true,
      script: {
        segments,
        totalSegments: segments.length,
        language: validated.preferences.language || 'en',
      },
      title: 'Daily Brief',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: error.errors,
      });
    }

    const errorInstance = error instanceof Error ? error : new Error(String(error));
    const errorCode = classifyError(errorInstance);
    const podcastError = createPodcastError(errorCode, errorInstance);

    if (isAuthError(errorInstance)) {
      return res.status(401).json({
        success: false,
        error: {
          code: podcastError.code,
          message: podcastError.userMessage,
          action: podcastError.action,
          retryable: podcastError.retryable,
        },
      });
    }

    if (isContentError(errorInstance)) {
      return res.status(200).json({
        success: false,
        error: {
          code: podcastError.code,
          message: podcastError.userMessage,
          action: PodcastErrorAction.NONE,
          retryable: false,
        },
        noContent: true,
      });
    }

    console.error('Script-only generation failed:', error);
    return res.status(podcastError.statusCode).json({
      success: false,
      error: {
        code: podcastError.code,
        message: podcastError.userMessage,
        action: podcastError.action,
        retryable: podcastError.retryable,
      },
    });
  }
});

/**
 * POST /podcast/generate
 * Generate a new podcast episode (synchronous - kept for backwards compatibility)
 */
router.post('/generate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Validate request body
    const validated = generatePodcastSchema.parse(req.body);

    console.log(`[POST /podcast/generate] Raw request preferences:`, JSON.stringify(req.body.preferences));
    console.log(`[POST /podcast/generate] Validated language: ${validated.preferences.language || 'NOT SET - will default to en'}`);

    // Check prerequisites
    const prereqs = await podcastGenerator.validatePrerequisites(validated.user_id);
    if (!prereqs.valid) {
      return res.status(400).json({
        error: 'Prerequisites not met',
        issues: prereqs.issues,
      });
    }

    // Estimate cost
    const estimate = await podcastGenerator.estimateGenerationCost(
      validated.user_id,
      validated.preferences
    );

    // Generate episode - use client date if provided, otherwise server date
    const clientDate = validated.date || new Date().toISOString().split('T')[0];

    const result = await podcastGenerator.generateEpisode(
      validated.user_id,
      validated.preferences,
      {
        ...validated.options,
        date: clientDate,
        // Pass include_topics preference to options as include_topic_teasers
        include_topic_teasers: validated.preferences.include_topics,
        onProgress: async (progress) => {
          // TODO: Send progress via WebSocket or SSE
          console.log(`[${validated.user_id}] ${progress.progress_percent}%: ${progress.message}`);
        },
      }
    );

    res.status(201).json({
      success: true,
      episode: {
        id: result.episode_id,
        audio_url: result.audio_url,
        duration_seconds: result.duration_seconds,
        script_segments: result.script.segments.length,
      },
      cost_estimate: estimate,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: error.errors,
      });
    }

    console.error('Podcast generation failed:', error);

    // Classify the error and provide actionable response to the UI
    const errorInstance = error instanceof Error ? error : new Error(String(error));
    const errorCode = classifyError(errorInstance);
    const podcastError = createPodcastError(errorCode, errorInstance);

    // For auth errors, return 401 with relink action
    if (isAuthError(errorInstance)) {
      return res.status(401).json({
        success: false,
        error: {
          code: podcastError.code,
          message: podcastError.userMessage,
          action: podcastError.action,
          retryable: podcastError.retryable,
        },
      });
    }

    // For content errors (no emails), return success with empty state
    if (isContentError(errorInstance)) {
      return res.status(200).json({
        success: false,
        error: {
          code: podcastError.code,
          message: podcastError.userMessage,
          action: PodcastErrorAction.NONE,
          retryable: false,
        },
        // Provide a hint that there's no content
        noContent: true,
      });
    }

    // For all other errors, return with appropriate status and retry info
    res.status(podcastError.statusCode).json({
      success: false,
      error: {
        code: podcastError.code,
        message: podcastError.userMessage,
        action: podcastError.action,
        retryable: podcastError.retryable,
        details: podcastError.details?.originalMessage,
      },
    });
  }
});

/**
 * POST /podcast/estimate
 * Estimate generation cost
 */
router.post('/estimate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = estimateCostSchema.parse(req.body);

    const estimate = await podcastGenerator.estimateGenerationCost(
      validated.user_id,
      validated.preferences as UserPreferences
    );

    res.json({
      success: true,
      estimate: {
        script_cost_usd: estimate.script_cost_usd,
        tts_cost_usd: estimate.tts_cost_usd,
        total_cost_usd: estimate.total_cost_usd,
        estimated_duration_seconds: estimate.estimated_duration_seconds,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: error.errors,
      });
    }

    console.error('Cost estimation failed:', error);
    res.status(500).json({
      error: 'Estimation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /podcast/validate
 * Validate prerequisites for generation
 */
router.post('/validate', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const validated = validatePrerequisitesSchema.parse(req.body);

    const result = await podcastGenerator.validatePrerequisites(validated.user_id);

    res.json({
      success: true,
      valid: result.valid,
      issues: result.issues,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: error.errors,
      });
    }

    console.error('Prerequisites validation failed:', error);
    res.status(500).json({
      error: 'Validation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /podcast/scheduled/:userId
 * Generate scheduled podcast for user
 */
router.post('/scheduled/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;

    // Validate email format
    z.string().email().parse(userId);

    const result = await podcastGenerator.generateScheduledPodcast(userId);

    res.status(201).json({
      success: true,
      episode: {
        id: result.episode_id,
        audio_url: result.audio_url,
        duration_seconds: result.duration_seconds,
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Invalid user ID format',
        issues: error.errors,
      });
    }

    console.error('Scheduled generation failed:', error);
    res.status(500).json({
      error: 'Generation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /podcast/stats
 * Get generation statistics
 */
router.get('/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const startDate = req.query.start_date
      ? new Date(req.query.start_date as string)
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days

    const endDate = req.query.end_date
      ? new Date(req.query.end_date as string)
      : new Date();

    const stats = await podcastGenerator.getGenerationStats(startDate, endDate);

    res.json({
      success: true,
      stats: {
        period: {
          start: startDate.toISOString(),
          end: endDate.toISOString(),
        },
        ...stats,
        success_rate: stats.total_episodes > 0
          ? ((stats.successful / stats.total_episodes) * 100).toFixed(1) + '%'
          : 'N/A',
      },
    });
  } catch (error) {
    console.error('Stats retrieval failed:', error);
    res.status(500).json({
      error: 'Failed to retrieve stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /podcast/episodes/:userId
 * Get episodes for user
 */
router.get('/episodes/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;
    const limit = parseInt(req.query.limit as string) || 10;
    const offset = parseInt(req.query.offset as string) || 0;

    // TODO: Fetch from database
    // const episodes = await supabase
    //   .from('podcast_episodes')
    //   .select('*')
    //   .eq('user_id', userId)
    //   .order('created_at', { ascending: false })
    //   .range(offset, offset + limit - 1);

    res.json({
      success: true,
      episodes: [],
      pagination: {
        limit,
        offset,
        total: 0,
      },
    });
  } catch (error) {
    console.error('Episode retrieval failed:', error);
    res.status(500).json({
      error: 'Failed to retrieve episodes',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /podcast/episode/:episodeId
 * Get specific episode
 */
router.get('/episode/:episodeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const episodeId = req.params.episodeId;

    // TODO: Fetch from database
    // const { data: episode } = await supabase
    //   .from('podcast_episodes')
    //   .select('*')
    //   .eq('id', episodeId)
    //   .single();

    res.json({
      success: true,
      episode: null,
    });
  } catch (error) {
    console.error('Episode retrieval failed:', error);
    res.status(500).json({
      error: 'Failed to retrieve episode',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /podcast/episode/:episodeId
 * Delete episode
 */
router.delete('/episode/:episodeId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const episodeId = req.params.episodeId;

    // TODO: Delete from database and storage
    // const { data: episode } = await supabase
    //   .from('podcast_episodes')
    //   .select('audio_url')
    //   .eq('id', episodeId)
    //   .single();

    // if (episode?.audio_url) {
    //   await storageService.deleteFile(episode.audio_url);
    // }

    // await supabase
    //   .from('podcast_episodes')
    //   .delete()
    //   .eq('id', episodeId);

    res.json({
      success: true,
      message: 'Episode deleted',
    });
  } catch (error) {
    console.error('Episode deletion failed:', error);
    res.status(500).json({
      error: 'Failed to delete episode',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
