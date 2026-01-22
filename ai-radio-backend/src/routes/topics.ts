/**
 * Topic Routes
 * API endpoints for topic-based podcasts
 */

import { Router, Request, Response } from 'express';
import { topicPodcastGenerator } from '../services/content/topic.generator';

const router = Router();

/**
 * GET /topics
 * List all available topics
 */
router.get('/', async (_req: Request, res: Response) => {
  try {
    const result = topicPodcastGenerator.getTopicsList();

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error listing topics:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to list topics',
    });
  }
});

/**
 * GET /topics/:topicId
 * Get a specific topic
 */
router.get('/:topicId', async (req: Request, res: Response) => {
  try {
    const { topicId } = req.params;
    const topic = topicPodcastGenerator.getTopic(topicId);

    if (!topic) {
      res.status(404).json({
        success: false,
        error: 'Topic not found',
      });
      return;
    }

    // Get recent episodes for this topic
    const recentEpisodes = await topicPodcastGenerator.getRecentEpisodes(topicId, 7);

    res.json({
      success: true,
      data: {
        topic,
        recentEpisodes,
      },
    });
  } catch (error) {
    console.error('Error getting topic:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get topic',
    });
  }
});

/**
 * GET /topics/:topicId/episode
 * Get or generate today's episode for a topic
 * Query params:
 *   - lang: Language code (default: 'en')
 *   - regenerate: Force regeneration (default: false)
 */
router.get('/:topicId/episode', async (req: Request, res: Response) => {
  try {
    const { topicId } = req.params;
    const userId = req.query.userId as string | undefined;
    const language = (req.query.lang as string) || 'en';
    const forceRegenerate = req.query.regenerate === 'true';

    const result = await topicPodcastGenerator.getOrGenerateEpisode(
      topicId,
      userId,
      forceRegenerate,
      language
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error getting/generating episode:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get episode',
    });
  }
});

/**
 * POST /topics/:topicId/generate
 * Force generate a new episode for a topic (admin/testing)
 * Body params:
 *   - language: Language code (default: 'en')
 *   - forceRegenerate: Force regeneration (default: false)
 */
router.post('/:topicId/generate', async (req: Request, res: Response) => {
  try {
    const { topicId } = req.params;
    const userId = req.body.userId as string | undefined;
    // Accept both camelCase and snake_case for compatibility with iOS/Android clients
    const forceRegenerate = req.body.forceRegenerate === true || req.body.force_regenerate === true;
    const language = (req.body.language as string) || 'en';

    console.log(`📡 Generate request for topic: ${topicId} (force: ${forceRegenerate}, lang: ${language})`);

    const result = await topicPodcastGenerator.getOrGenerateEpisode(
      topicId,
      userId,
      forceRegenerate,
      language
    );

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error generating episode:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate episode',
    });
  }
});

/**
 * GET /topics/:topicId/episodes
 * Get recent episodes for a topic
 * Query params:
 *   - lang: Language code (default: 'en')
 *   - limit: Number of episodes (default: 7)
 */
router.get('/:topicId/episodes', async (req: Request, res: Response) => {
  try {
    const { topicId } = req.params;
    const limit = parseInt(req.query.limit as string) || 7;
    const language = (req.query.lang as string) || 'en';

    const topic = topicPodcastGenerator.getTopic(topicId);
    if (!topic) {
      res.status(404).json({
        success: false,
        error: 'Topic not found',
      });
      return;
    }

    const episodes = await topicPodcastGenerator.getRecentEpisodes(topicId, limit, language);

    res.json({
      success: true,
      data: {
        topicId,
        language,
        episodes,
      },
    });
  } catch (error) {
    console.error('Error getting episodes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get episodes',
    });
  }
});

/**
 * GET /topics/today/all
 * Get all episodes available today
 */
router.get('/today/all', async (_req: Request, res: Response) => {
  try {
    const episodes = await topicPodcastGenerator.getTodaysEpisodes();

    res.json({
      success: true,
      data: {
        date: new Date().toISOString().split('T')[0],
        episodes,
        count: episodes.length,
      },
    });
  } catch (error) {
    console.error('Error getting today\'s episodes:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get today\'s episodes',
    });
  }
});

export default router;
