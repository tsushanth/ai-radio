/**
 * Topic Routes
 * API endpoints for topic-based podcasts
 */

import { onDemandLanguages, DailyCap } from '../services/tts/piper-languages';
import { Router, Request, Response } from 'express';
import rateLimit from 'express-rate-limit';
import { createClient } from '@supabase/supabase-js';
import { topicPodcastGenerator } from '../services/content/topic.generator';
import { adService } from '../services/ads/ad.service';
import { briefingService } from '../services/notifications/briefing.service';
import { env } from '../config/environment';
import { requireOperatorSecret } from '../lib/shared-secret';

const router = Router();

// Supabase client for topic_requests operations
const supabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
  : null;

// ─── Topic Suggestion Routes ───────────────────────────────────────────────────
//
// POST /topics/suggest stores a request; the topic-suggest scheduler (services/scheduler/topic-suggest.scheduler.ts, behind
// TOPIC_SUGGEST_PROCESSING=on) turns pending requests into topics. The pending / complete / fail endpoints below are operator-only
// (Authorization: Bearer BATCH_SECRET) and exist for manual review and override.

/** Honest copy for every client: a suggestion is reviewed, it is not promised. */
export const SUGGEST_THANKS = 'Thanks, we review suggestions and add the good ones.';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SUGGEST_NAME_MAX = 80;
const SUGGEST_DESC_MAX = 300;

const intFromEnv = (v: string | undefined, dflt: number) => {
  const n = Number(v);
  return v !== undefined && v.trim() !== '' && Number.isFinite(n) && n >= 0 ? Math.floor(n) : dflt;
};

/** Per-IP cap: suggestions per rolling 24 h (in memory, per machine). Default 5, the same number the web form shows. */
const suggestIpLimiter = rateLimit({
  windowMs: 24 * 60 * 60 * 1000,
  limit: () => intFromEnv(process.env.TOPIC_SUGGEST_IP_DAILY_LIMIT, 5),
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, res) => {
    res.status(429).json({ success: false, error: 'You have sent enough suggestions today. Please try again tomorrow.' });
  },
});

/**
 * GET /topics/suggest/pending   (operator only)
 * Returns pending suggestion requests, oldest first.
 */
router.get('/suggest/pending', requireOperatorSecret(), async (_req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.status(503).json({ success: false, error: 'Supabase not configured' });
      return;
    }

    const { data, error } = await supabase
      .from('topic_requests')
      .select('*')
      .eq('status', 'pending')
      .order('created_at', { ascending: true })
      .limit(200);

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
 * Body: { topicName: string, language?: string, description?: string, userId?: string }
 * Caps: per IP per day (TOPIC_SUGGEST_IP_DAILY_LIMIT, default 5), per userId per day (TOPIC_SUGGEST_USER_DAILY_LIMIT, default 5),
 * and a ceiling on the pending backlog (TOPIC_SUGGEST_MAX_PENDING, default 500).
 */
router.post('/suggest', suggestIpLimiter, async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.status(503).json({ success: false, error: 'Supabase not configured' });
      return;
    }

    const { topicName, language, description } = req.body ?? {};

    if (!topicName || typeof topicName !== 'string' || topicName.trim().length === 0) {
      res.status(400).json({ success: false, error: 'topicName is required' });
      return;
    }
    const name = topicName.replace(/\s+/g, ' ').trim();
    if (name.length < 3 || name.length > SUGGEST_NAME_MAX) {
      res.status(400).json({ success: false, error: `topicName must be 3 to ${SUGGEST_NAME_MAX} characters` });
      return;
    }
    if (description !== undefined && description !== null && (typeof description !== 'string' || description.trim().length > SUGGEST_DESC_MAX)) {
      res.status(400).json({ success: false, error: `description must be ${SUGGEST_DESC_MAX} characters or fewer` });
      return;
    }
    const lang = typeof language === 'string' && /^[a-z]{2}/i.test(language) ? language.slice(0, 2).toLowerCase() : 'en';
    const userId = typeof req.body.userId === 'string' && req.body.userId.length > 0 && req.body.userId.length <= 128 ? req.body.userId : null;

    // Per-user cap (durable, from the table). Only meaningful for clients that send a userId.
    if (userId) {
      const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count } = await supabase
        .from('topic_requests')
        .select('id', { count: 'exact', head: true })
        .eq('user_id', userId)
        .gte('created_at', since);
      if ((count ?? 0) >= intFromEnv(process.env.TOPIC_SUGGEST_USER_DAILY_LIMIT, 5)) {
        res.status(429).json({ success: false, error: 'You have sent enough suggestions today. Please try again tomorrow.' });
        return;
      }
    }

    // Backlog ceiling: if nothing is being processed, do not let the table grow without bound.
    const { count: pendingCount } = await supabase
      .from('topic_requests')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'pending');
    if ((pendingCount ?? 0) >= intFromEnv(process.env.TOPIC_SUGGEST_MAX_PENDING, 500)) {
      res.status(429).json({ success: false, error: 'We have a lot of suggestions waiting right now. Please try again later.' });
      return;
    }

    const { data, error } = await supabase
      .from('topic_requests')
      .insert({
        topic_name: name,
        language: lang,
        description: typeof description === 'string' && description.trim() ? description.trim() : null,
        user_id: userId,
      })
      .select('id, status, created_at')
      .single();

    if (error) {
      console.error('Error inserting topic request:', error);
      res.status(500).json({ success: false, error: 'Failed to submit suggestion' });
      return;
    }

    res.status(201).json({
      success: true,
      message: SUGGEST_THANKS,
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
 * Public status of one suggestion. Returns only the status, the resulting topic id and the creation time
 * (never the submitter's id, the free text or internal error notes).
 */
router.get('/suggest/:requestId', async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.status(503).json({ success: false, error: 'Supabase not configured' });
      return;
    }

    const { requestId } = req.params;
    if (!UUID_RE.test(requestId)) {
      res.status(404).json({ success: false, error: 'Request not found' });
      return;
    }

    const { data, error } = await supabase
      .from('topic_requests')
      .select('id, status, result_topic_id, created_at')
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
 * POST /topics/suggest/:requestId/complete   (operator only)
 * Marks a suggestion as completed with an existing topic ID.
 * Body: { topicId: string }
 */
router.post('/suggest/:requestId/complete', requireOperatorSecret(), async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.status(503).json({ success: false, error: 'Supabase not configured' });
      return;
    }

    const { requestId } = req.params;
    const { topicId } = req.body ?? {};

    if (!UUID_RE.test(requestId)) {
      res.status(404).json({ success: false, error: 'Request not found or update failed' });
      return;
    }
    if (!topicId || typeof topicId !== 'string') {
      res.status(400).json({ success: false, error: 'topicId is required' });
      return;
    }

    const { data, error } = await supabase
      .from('topic_requests')
      .update({
        status: 'completed',
        result_topic_id: topicId,
        error: null,
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
 * POST /topics/suggest/:requestId/fail   (operator only)
 * Marks a suggestion as failed with an error message.
 * Body: { error: string }
 */
router.post('/suggest/:requestId/fail', requireOperatorSecret(), async (req: Request, res: Response) => {
  try {
    if (!supabase) {
      res.status(503).json({ success: false, error: 'Supabase not configured' });
      return;
    }

    const { requestId } = req.params;
    const errorMessage = typeof req.body?.error === 'string' ? req.body.error.slice(0, 500) : null;

    if (!UUID_RE.test(requestId)) {
      res.status(404).json({ success: false, error: 'Request not found or update failed' });
      return;
    }

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
 * GET /topics/briefing
 * Compact, read-only summary of the newest completed topic podcasts
 * (count + up to 3 topic names). Used by the Android morning-briefing
 * notification to write honest copy. Must be registered before /:topicId.
 */
router.get('/briefing', async (req: Request, res: Response) => {
  try {
    const language = typeof req.query.lang === 'string' && /^[a-z]{2}$/.test(req.query.lang)
      ? req.query.lang
      : 'en';
    const summary = await briefingService.getSummary(language);
    res.set('Cache-Control', 'public, max-age=300');
    res.json({ success: true, data: summary });
  } catch (error) {
    console.error('Error getting briefing summary:', error);
    res.status(500).json({ success: false, error: 'Failed to get briefing summary' });
  }
});

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
/**
 * POST /topics/:topicId/regenerate-audio
 *
 * Admin-only: re-run TTS on an existing episode's stored script and
 * overwrite the Supabase audio file at the same path. Used to backfill
 * episodes generated before the concatenateBuffers WAV-merge fix
 * (May/Jun 2026) — those files only had ~25s of playable audio.
 *
 * Auth: same BATCH_SECRET pattern as /batch/* — Bearer token in
 * Authorization header.
 *
 * Body: { date?: string (YYYY-MM-DD, default today), language?: string }
 */
router.post('/:topicId/regenerate-audio', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const expectedToken = env.BATCH_SECRET;
  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  try {
    const { topicId } = req.params;
    const date = (req.body.date as string) || new Date().toISOString().slice(0, 10);
    const language = (req.body.language as string) || 'en';
    const result = await topicPodcastGenerator.regenerateAudioFromScript(topicId, date, language);
    res.json({ success: true, data: { topicId, date, language, ...result } });
  } catch (error) {
    console.error('Error regenerating audio:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

const inFlight = new Set<string>();
const nonEnglishDailyCap = new DailyCap(Number(process.env.ON_DEMAND_DAILY_LIMIT) || 30);

router.post('/:topicId/generate', async (req: Request, res: Response) => {
  try {
    const { topicId } = req.params;
    const userId = req.body.userId as string | undefined;
    // Accept both camelCase and snake_case for compatibility with iOS/Android clients
    const forceRegenerate = req.body.forceRegenerate === true || req.body.force_regenerate === true;
    const language = (req.body.language as string) || 'en';

    console.log(`📡 Generate request for topic: ${topicId} (force: ${forceRegenerate}, lang: ${language})`);

    let nonEnglishReady = false;
    // Non-English episodes are generated on demand, only for languages that have a Piper voice, and capped per day
    // (each one costs an LLM script plus TTS). An episode that already exists is served without counting against the cap.
    if (language !== 'en') {
      if (!/^[a-z]{2}$/.test(language) || !onDemandLanguages().includes(language)) {
        return res.status(400).json({ success: false, error: 'language_unavailable', message: 'This language is not available yet.' });
      }
      const today = new Date().toISOString().split('T')[0];
      const have = await topicPodcastGenerator.getExistingEpisode(topicId, today, language);
      nonEnglishReady = !!have && have.status === 'completed';
      if (!(have && (have.status === 'completed' || have.status === 'generating')) && !nonEnglishDailyCap.tryTake()) {
        return res.status(429).json({ success: false, error: 'daily_limit', message: 'Try again tomorrow.' });
      }
    }

    // Async regen: if there's already an episode for today, kick off the
    // regeneration in the background and return immediately with the
    // current episode in `generating` state. Mobile clients then poll
    // GET /topics/:id/episode for completion. Full TTS generation on
    // Kokoro/Fly takes 30-60 min for a multi-segment episode — blocking
    // the response would always time out the iOS app's URLSession.
    // A first non-English load takes minutes (script + Piper), longer than a safe HTTP wait, so it uses the same async path:
    // return the 'generating' placeholder now, the client polls GET /topics/:id/episode.
    if (forceRegenerate || (language !== 'en' && !nonEnglishReady)) {
      const today = new Date().toISOString().split('T')[0];
      const existing = await topicPodcastGenerator.getExistingEpisode(topicId, today, language);

      // Fire-and-forget the actual regeneration. Errors are logged but the
      // HTTP response has already been sent. One in-flight run per episode.
      const flightKey = `${topicId}-${today}-${language}`;
      if (!forceRegenerate && (existing?.status === 'generating' || inFlight.has(flightKey))) {
        // already being generated: just report it
      } else if (!inFlight.has(flightKey)) {
        inFlight.add(flightKey);
        void topicPodcastGenerator
          .getOrGenerateEpisode(topicId, userId, forceRegenerate, language)
          .catch(err => {
            console.error(`Background generation failed for ${topicId}:`, err);
          })
          .finally(() => inFlight.delete(flightKey));
      }

      // Return whatever exists right now, or a synthetic "generating"
      // placeholder if there's nothing yet. Either way the client will
      // poll the GET endpoint until status=completed.
      const stubMessage = 'Regeneration started. Poll GET /topics/:topicId/episode for status.';
      res.json({
        success: true,
        data: {
          episode: existing ?? {
            id: `${topicId}-${today}-${language}`,
            topicId,
            date: today,
            status: 'generating',
            title: `Regenerating…`,
            description: '',
            stories: [],
            playCount: 0,
            language,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          },
          isNew: false,
          message: stubMessage,
        },
      });
      return;
    }

    // Non-force path: keep the existing blocking behavior. This is the
    // first-load case (no episode exists yet for today), which on a cold
    // start typically completes in well under iOS's default timeout.
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
