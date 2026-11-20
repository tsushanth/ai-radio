/**
 * App Config Routes
 * Returns client configuration that may change without app updates
 */

import { Router, Request, Response } from 'express';
import { env } from '../config/environment';
import { languageControls } from '../services/languages/controls';
import { buildStations, buildPlaylist, englishStation, type Station } from '../services/languages/stations';

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
      // Unchanged for old clients (nobody reads it today). The live station list is GET /api/config/stations.
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

const STATIONS_TTL_MS = 60_000;
let stationsCache: { at: number; stations: Station[] } | null = null;
/** Test hook: forget the 60 s cache. */
export const resetStationsCache = () => { stationsCache = null; };

/**
 * GET /api/config/stations
 * Radio stations per language: [{code, name, nativeName, kind: 'live'|'playlist', streamUrl?, statusUrl?, playlistUrl?, enabled, dir}].
 * en is the live English mount; every enabled language that has playable audio is a 'playlist' station. Cached 60 s. Any error answers
 * the English station only. See docs/LANGUAGES.md.
 */
router.get('/stations', async (_req: Request, res: Response) => {
  try {
    const now = Date.now();
    if (!stationsCache || now - stationsCache.at > STATIONS_TTL_MS) stationsCache = { at: now, stations: await buildStations() };
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ success: true, data: { stations: stationsCache.stations } });
  } catch (error) {
    console.error('Error listing stations:', error);
    res.json({ success: true, data: { stations: [englishStation(env.RADIO_STREAM_BASE_URL)] } });
  }
});

/**
 * GET /api/config/stations/:code/playlist
 * The episodes of a playlist station, newest first, one per topic: [{episodeId, topicId, title, audioUrl, durationSeconds, date}].
 * 404 for a language that is not an enabled station language.
 */
router.get('/stations/:code/playlist', async (req: Request, res: Response) => {
  try {
    const items = await buildPlaylist(String(req.params.code).toLowerCase());
    if (!items) return res.status(404).json({ success: false, error: 'station_unavailable' });
    res.set('Cache-Control', 'public, max-age=60');
    res.json({ success: true, data: { code: String(req.params.code).toLowerCase(), items } });
  } catch (error) {
    console.error('Error reading playlist:', error);
    res.status(503).json({ success: false, error: 'station_unavailable' });
  }
});

export default router;
