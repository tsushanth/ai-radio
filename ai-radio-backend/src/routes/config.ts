/**
 * App Config Routes
 * Returns client configuration that may change without app updates
 */

import { Router, Request, Response } from 'express';
import { env } from '../config/environment';

const router = Router();

/**
 * GET /api/config
 * Returns dynamic configuration for the client apps
 */
router.get('/', async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      radioStreamBaseURL: env.RADIO_STREAM_BASE_URL,
      radioLanguages: ['en', 'es', 'hi', 'pt', 'fr', 'de', 'ja', 'ko', 'zh', 'it'],
    },
  });
});

export default router;
