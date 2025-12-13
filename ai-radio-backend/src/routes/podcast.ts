/**
 * Podcast Routes
 * Handles podcast generation and episode management
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { podcastGenerator } from '../services/podcast/podcast.generator';
import type { UserPreferences } from '../types/database';

const router = express.Router();

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
 * POST /podcast/generate
 * Generate a new podcast episode
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
    res.status(500).json({
      error: 'Generation failed',
      message: error instanceof Error ? error.message : 'Unknown error',
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
