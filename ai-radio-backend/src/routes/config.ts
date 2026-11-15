/**
 * App Config Routes
 * Returns client configuration that may change without app updates
 */

import { Router, Request, Response } from 'express';
import { env } from '../config/environment';
import { languageControls } from '../services/languages/controls';

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

/**
 * GET /api/config/languages
 * The additional podcast languages that are switched on right now (server-driven: no app release to add or remove one).
 * Only enabled languages are listed. status is "beta" (shown with a Beta label), "on", or "paused" (new episodes are stopped, episodes
 * that already exist still play). Empty list while every language is off, or when the controls cannot be read.
 */
router.get('/languages', async (_req: Request, res: Response) => {
  try {
    const languages = await languageControls.publicList();
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ success: true, data: { languages } });
  } catch (error) {
    console.error('Error listing languages:', error);
    res.json({ success: true, data: { languages: [] } });
  }
});

export default router;
