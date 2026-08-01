/**
 * Deep Dive Routes
 * API endpoints for on-demand research podcasts
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { deepDiveGenerator } from '../services/content/deepdive.generator';
import { podcastLimiter } from '../middleware/rateLimiter';
import { env } from '../config/environment';

const router = Router();

// Direct Supabase client for the in-flight pre-check (read-only).
const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

// Process-wide semaphore cap. Each in-flight generation peaks at 100-300 MB
// (Anthropic + OpenAI TTS chunk buffers + concat). At 2 GB machine memory with
// ~200 MB baseline overhead, MAX_CONCURRENT=3 leaves >1 GB headroom. Tune via env.
const MAX_CONCURRENT_DEEPDIVES = Number(process.env.MAX_CONCURRENT_DEEPDIVES) || 3;
let inFlightDeepDives = 0;

/**
 * POST /deepdive/generate
 * Generate a new deep dive podcast
 * Body:
 *   - query: string (required) - The topic to research
 *   - language: string (optional) - Language code (default: 'en')
 *   - targetDurationMinutes: number (optional) - Target duration (default: 10)
 *   - userId: string (required) - User ID
 */
router.post('/generate', podcastLimiter, async (req: Request, res: Response) => {
  try {
    const { query, language, targetDurationMinutes, userId, format } = req.body;
    const outputFormat: 'audio' | 'script' = format === 'script' ? 'script' : 'audio';

    // Validate required fields
    if (!query || typeof query !== 'string') {
      res.status(400).json({
        success: false,
        error: 'Query is required and must be a string',
      });
      return;
    }

    if (!userId || typeof userId !== 'string') {
      res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
      return;
    }

    // Validate query length
    if (query.trim().length === 0) {
      res.status(400).json({
        success: false,
        error: 'Query cannot be empty',
      });
      return;
    }

    if (query.length > 500) {
      res.status(400).json({
        success: false,
        error: 'Query must be 500 characters or less',
      });
      return;
    }

    // Validate duration if provided
    const duration = targetDurationMinutes || 10;
    if (duration < 5 || duration > 15) {
      res.status(400).json({
        success: false,
        error: 'Target duration must be between 5 and 15 minutes',
      });
      return;
    }

    // (1) Per-user in-flight check: hard-block duplicate submits from the same user.
    // Returns 409 if the user already has a dive in researching/generating state.
    const { data: inflightRows, error: inflightErr } = await supabase
      .from('deep_dive_episodes')
      .select('id, status, created_at')
      .eq('user_id', userId)
      .in('status', ['researching', 'generating'])
      .limit(1);

    if (inflightErr) {
      console.warn('[DeepDive] in-flight check failed (continuing):', inflightErr.message);
    } else if (inflightRows && inflightRows.length > 0) {
      const existing = inflightRows[0];
      console.log(`[DeepDive] Reject duplicate: user ${userId} already has ${existing.id} in ${existing.status}`);
      res.status(409).json({
        success: false,
        error: 'You already have a deep dive in progress. Please wait for it to finish.',
        existingEpisodeId: existing.id,
        existingStatus: existing.status,
      });
      return;
    }

    // (2) Process-wide semaphore: cap concurrent generations to protect memory.
    // When at cap, return 429 with Retry-After so the client can back off.
    if (inFlightDeepDives >= MAX_CONCURRENT_DEEPDIVES) {
      console.log(`[DeepDive] Reject: at concurrency cap (${inFlightDeepDives}/${MAX_CONCURRENT_DEEPDIVES})`);
      res.status(429)
        .set('Retry-After', '120')
        .json({
          success: false,
          error: 'Server is generating other deep dives right now. Please try again in a couple of minutes.',
          retryAfterSeconds: 120,
        });
      return;
    }

    console.log(`[DeepDive] Generate request: "${query.substring(0, 50)}..." (user: ${userId}, slot ${inFlightDeepDives + 1}/${MAX_CONCURRENT_DEEPDIVES})`);

    // Fire-and-forget: generation takes 5-10 min which exceeds Fly's HTTP edge
    // idle timeout. Return immediately with a pending stub; frontend polls
    // /deepdive/history (or /deepdive/:id) to pick up the completed episode.
    const pendingEpisodeId = `dd-${userId.substring(0, 8)}-${Date.now()}`;

    inFlightDeepDives += 1;
    deepDiveGenerator
      .generateDeepDive({
        query: query.trim(),
        language: language || 'en',
        targetDurationMinutes: duration,
        userId,
        format: outputFormat,
      })
      .then(() => {
        console.log(`[DeepDive] Background generation complete for "${query.substring(0, 50)}..."`);
      })
      .catch(error => {
        console.error('[DeepDive] Background generation error:', error);
      })
      .finally(() => {
        inFlightDeepDives = Math.max(0, inFlightDeepDives - 1);
      });

    res.status(202).json({
      success: true,
      data: {
        episode: {
          id: pendingEpisodeId,
          userId,
          query: query.trim(),
          status: 'researching',
          language: language || 'en',
          createdAt: new Date(),
        },
        pending: true,
        message: 'Deep dive generation started. Poll /deepdive/history to see when ready (5-10 min).',
      },
    });
  } catch (error) {
    console.error('[DeepDive] Request error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to start deep dive',
    });
  }
});

/**
 * GET /deepdive/history
 * Get user's deep dive history
 * Query params:
 *   - userId: string (required) - User ID
 *   - limit: number (optional) - Max results (default: 20)
 *   - offset: number (optional) - Pagination offset (default: 0)
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
      return;
    }

    // Validate limit
    if (limit < 1 || limit > 50) {
      res.status(400).json({
        success: false,
        error: 'Limit must be between 1 and 50',
      });
      return;
    }

    const result = await deepDiveGenerator.getHistory(userId, limit, offset);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[DeepDive] History error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch deep dive history',
    });
  }
});

/**
 * GET /deepdive/:episodeId
 * Get a specific deep dive episode
 * Query params:
 *   - userId: string (required) - User ID for authorization
 */
router.get('/:episodeId', async (req: Request, res: Response) => {
  try {
    const { episodeId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
      return;
    }

    const episode = await deepDiveGenerator.getEpisode(episodeId, userId);

    if (!episode) {
      res.status(404).json({
        success: false,
        error: 'Deep dive not found',
      });
      return;
    }

    res.json({
      success: true,
      data: { episode },
    });
  } catch (error) {
    console.error('[DeepDive] Get episode error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch deep dive',
    });
  }
});

/**
 * DELETE /deepdive/:episodeId
 * Delete a deep dive episode
 * Query params:
 *   - userId: string (required) - User ID for authorization
 */
router.delete('/:episodeId', async (req: Request, res: Response) => {
  try {
    const { episodeId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
      return;
    }

    const deleted = await deepDiveGenerator.deleteEpisode(episodeId, userId);

    if (!deleted) {
      res.status(404).json({
        success: false,
        error: 'Deep dive not found or already deleted',
      });
      return;
    }

    res.json({
      success: true,
      message: 'Deep dive deleted successfully',
    });
  } catch (error) {
    console.error('[DeepDive] Delete error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to delete deep dive',
    });
  }
});

export default router;
