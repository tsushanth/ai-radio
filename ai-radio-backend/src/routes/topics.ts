/**
 * Topic Routes
 * API endpoints for topic-based podcasts
 */

import { Router, Request, Response } from 'express';
import { createClient } from '@supabase/supabase-js';
import { topicPodcastGenerator } from '../services/content/topic.generator';
import { adService } from '../services/ads/ad.service';
import { env } from '../config/environment';

const router = Router();

// Supabase client for topic_requests operations
const supabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
  : null;

// ─── Topic Suggestion Routes ───────────────────────────────────────────────────

/**
 * GET /topics/suggest/pending
 * Returns all pending suggestion requests (for the worker to poll)
 */
router.get('/suggest/pending', async (_req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.status(503).json({ success: false, error: 'Supabase not configured' });
      return;
    }

    const { data, error } = await supabase
      .from('topic_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true });

    if (error) {
      console.error('Error fetching pending topic requests:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch pending requests' });
      return;
    }

    res.json({
      success: true,
      data: data || [],
    });
  } catch (error) {
    console.error('Error fetching pending topic requests:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch pending requests',
    });
  }
});

/**
 * POST /topics/suggest
 * Submit a topic suggestion
 * Body: { topicName: string, language?: string, description?: string }
 */
router.post('/suggest', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.status(503).json({ success: false, error: 'Supabase not configured' });
      return;
    }

    const { topicName, language, description } = req.body;

    if (!topicName || typeof topicName !== 'string' || topicName.trim().length === 0) {
      res.status(400).json({ success: false, error: 'topicName is required' });
      return;
    }

    const { data, error } = await supabase
      .from('topic_requests')
      .insert({
        topic_name: topicName.trim(),
        language: language || 'en',
        description: description || null,
        user_id: req.body.userId || null,
      })
      .select('id, status, created_at')
      .single();

    if (error) {
      console.error('Error inserting topic request:', error);
      res.status(500).json({ success: false, error: 'Failed to submit suggestion' });
      return;
    }

    // Fire webhook to worker VM (fire-and-forget)
    const webhookUrl = process.env.WORKER_WEBHOOK_URL;
    const webhookSecret = process.env.WORKER_WEBHOOK_SECRET;
    if (webhookUrl && webhookSecret) {
      fetch(`${webhookUrl}/webhook/topic-suggest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-webhook-secret': webhookSecret,
        },
        body: JSON.stringify({ requestId: data.id }),
      }).catch((err: unknown) => {
        console.error('Failed to fire topic-suggest webhook:', err);
      });
    } else {
      console.warn('WORKER_WEBHOOK_URL or WORKER_WEBHOOK_SECRET not set; skipping webhook');
    }

    res.status(201).json({
      success: true,
      data: {
        requestId: data.id,
        status: data.status,
        createdAt: data.created_at,
      },
    });
  } catch (error) {
    console.error('Error submitting topic suggestion:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to submit suggestion',
    });
  }
});

/**
 * GET /topics/suggest/:requestId
 * Get the status of a topic suggestion request
 */
router.get('/suggest/:requestId', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.status(503).json({ success: false, error: 'Supabase not configured' });
      return;
    }

    const { requestId } = req.params;

    const { data, error } = await supabase
      .from('topic_requests')
      .select('*')
      .eq('id', requestId)
      .single();

    if (error || !data) {
      res.status(404).json({ success: false, error: 'Request not found' });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching topic request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch request status',
    });
  }
});

/**
 * POST /topics/suggest/:requestId/complete
 * Worker marks a suggestion as completed with the new topic ID
 * Body: { topicId: string }
 */
router.post('/suggest/:requestId/complete', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.status(503).json({ success: false, error: 'Supabase not configured' });
      return;
    }

    const { requestId } = req.params;
    const { topicId } = req.body;

    if (!topicId || typeof topicId !== 'string') {
      res.status(400).json({ success: false, error: 'topicId is required' });
      return;
    }

    const { data, error } = await supabase
      .from('topic_requests')
      .update({
        status: 'completed',
        result_topic_id: topicId,
      })
      .eq('id', requestId)
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error completing topic request:', error);
      res.status(404).json({ success: false, error: 'Request not found or update failed' });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error completing topic request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to complete request',
    });
  }
});

/**
 * POST /topics/suggest/:requestId/fail
 * Worker marks a suggestion as failed with an error message
 * Body: { error: string }
 */
router.post('/suggest/:requestId/fail', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.status(503).json({ success: false, error: 'Supabase not configured' });
      return;
    }

    const { requestId } = req.params;
    const { error: errorMessage } = req.body;

    const { data, error } = await supabase
      .from('topic_requests')
      .update({
        status: 'failed',
        error: errorMessage || 'Unknown error',
      })
      .eq('id', requestId)
      .select('*')
      .single();

    if (error || !data) {
      console.error('Error failing topic request:', error);
      res.status(404).json({ success: false, error: 'Request not found or update failed' });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error failing topic request:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to update request',
    });
  }
});

// ─── Existing Topic Routes ─────────────────────────────────────────────────────

/**
 * GET /topics
 * List all available topics
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const language = (req.query.lang as string) || 'en';
    const result = await topicPodcastGenerator.getTopicsList(language);

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
    const topic = await topicPodcastGenerator.getTopic(topicId);

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

    const topic = await topicPodcastGenerator.getTopic(topicId);
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

    const topic = await topicPodcastGenerator.getTopic(topicId);
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
