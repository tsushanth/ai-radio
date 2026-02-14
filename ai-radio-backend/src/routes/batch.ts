/**
 * Batch Generation Routes
 * Endpoints for triggering batch pre-generation of topic episodes
 * Protected by BATCH_SECRET for Cloud Scheduler access
 */

import { Router, Request, Response } from 'express';
import { env } from '../config/environment';
import { topicBatchScheduler } from '../services/scheduler/topic-batch.scheduler';

const router = Router();

/**
 * POST /batch/generate-topics
 * Trigger batch generation of all active topic episodes (English)
 * Protected by BATCH_SECRET in Authorization header
 *
 * Called by Cloud Scheduler daily at 5 AM UTC
 * Can also be triggered manually for testing
 */
router.post('/generate-topics', async (req: Request, res: Response) => {
  // Verify batch secret
  const authHeader = req.headers.authorization;
  const expectedToken = env.BATCH_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
    return;
  }

  const triggerSource = (req.body.source as string) || 'api';
  const batchId = `batch-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`;

  console.log(`[Batch] Triggered topic generation: ${batchId} (source: ${triggerSource})`);

  // Start generation in background -- return immediately
  topicBatchScheduler
    .generateAllTopics(batchId, triggerSource)
    .then(result => {
      console.log(
        `[Batch] ${batchId} finished: ${result.successful}/${result.totalTopics} success`
      );
    })
    .catch(error => {
      console.error(`[Batch] ${batchId} failed:`, error);
    });

  res.status(202).json({
    success: true,
    data: {
      batchId,
      message: 'Batch generation started',
      triggerSource,
    },
  });
});

/**
 * GET /batch/status/:batchId
 * Check the status of a batch generation run
 */
router.get('/status/:batchId', async (req: Request, res: Response) => {
  // Verify batch secret
  const authHeader = req.headers.authorization;
  const expectedToken = env.BATCH_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
    return;
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

    const { data, error } = await supabase
      .from('batch_generation_runs')
      .select('*')
      .eq('id', req.params.batchId)
      .single();

    if (error || !data) {
      res.status(404).json({
        success: false,
        error: 'Batch run not found',
      });
      return;
    }

    res.json({
      success: true,
      data,
    });
  } catch (error) {
    console.error('Error fetching batch status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch batch status',
    });
  }
});

/**
 * GET /batch/recent
 * Get recent batch generation runs
 */
router.get('/recent', async (req: Request, res: Response) => {
  const authHeader = req.headers.authorization;
  const expectedToken = env.BATCH_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
    });
    return;
  }

  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);

    const limit = parseInt(req.query.limit as string) || 10;

    const { data, error } = await supabase
      .from('batch_generation_runs')
      .select('*')
      .order('started_at', { ascending: false })
      .limit(limit);

    if (error) {
      throw error;
    }

    res.json({
      success: true,
      data: {
        runs: data || [],
        count: data?.length || 0,
      },
    });
  } catch (error) {
    console.error('Error fetching recent batches:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch recent batches',
    });
  }
});

export default router;
