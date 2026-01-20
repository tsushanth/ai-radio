/**
 * Deep Dive Routes
 * API endpoints for on-demand research podcasts
 */

import { Router, Request, Response } from 'express';
import { deepDiveGenerator } from '../services/content/deepdive.generator';

const router = Router();

/**
 * POST /deepdive/generate
 * Generate a new deep dive podcast
 * Body:
 *   - query: string (required) - The topic to research
 *   - language: string (optional) - Language code (default: 'en')
 *   - targetDurationMinutes: number (optional) - Target duration (default: 10)
 *   - userId: string (required) - User ID
 */
router.post('/generate', async (req: Request, res: Response) => {
  try {
    const { query, language, targetDurationMinutes, userId } = req.body;

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

    console.log(`[DeepDive] Generate request: "${query.substring(0, 50)}..." (user: ${userId})`);

    const result = await deepDiveGenerator.generateDeepDive({
      query: query.trim(),
      language: language || 'en',
      targetDurationMinutes: duration,
      userId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[DeepDive] Generation error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate deep dive',
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
