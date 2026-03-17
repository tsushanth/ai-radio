/**
 * Topic Routes
 * API endpoints for topic-based podcasts
 */

import { Router, Request, Response } from 'express';
import { topicPodcastGenerator } from '../services/content/topic.generator';
import { adService } from '../services/ads/ad.service';

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
    const language = (req.query.lang as string) || 'en';

    const topic = topicPodcastGenerator.getTopic(topicId);
    if (!topic) {
      res.status(404).json({ success: false, error: 'Topic not found' });
      return;
    }

    // Fetch-only: return existing episode, never trigger generation
    const today = new Date().toISOString().split('T')[0];
    const episode = await topicPodcastGenerator.getExistingEpisode(topicId, today, language);

    if (!episode) {
      // No episode generated yet for today
      res.json({
        success: true,
        data: {
          episode: {
            id: `${topicId}-${today}-${language}`,
            topicId,
            date: today,
            status: 'not_generated',
            title: `${topic.name} - Episode Coming Soon`,
            description: topic.description,
            language,
            playCount: 0,
            stories: [],
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          isNew: false,
          message: 'Today\'s episode has not been generated yet. It will be available shortly.',
          ads: [],
        },
      });
      return;
    }

    // Increment play count for completed episodes
    if (episode.status === 'completed') {
      await topicPodcastGenerator.incrementPlayCountPublic(episode.id);
    }

    // Select ads for completed episodes
    const ads = episode.status === 'completed'
      ? await adService.selectAdsForEpisode(topicId, language, 2)
      : [];

    res.json({
      success: true,
      data: {
        episode,
        isNew: false,
        message: episode.status === 'completed'
          ? 'Today\'s episode is ready!'
          : episode.status === 'generating'
            ? 'Episode is currently being generated. Please check back in 30-60 seconds.'
            : `Generation failed: ${episode.error || 'Unknown error'}. Tap regenerate to try again.`,
        ads,
      },
    });
  } catch (error) {
    console.error('Error getting episode:', error);
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
