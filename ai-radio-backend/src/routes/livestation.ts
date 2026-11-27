/**
 * Live Station Routes
 * API endpoints for live streaming news stations
 */

import { Router, Request, Response } from 'express';
import { liveStationGenerator } from '../services/content/livestation.generator';
import { AllowanceReached, clientKey, dailyAllowance, refuseOverLimit } from '../lib/dailyAllowance';

const router = Router();

const mayGenerate = (req: Request) => () => dailyAllowance.take('station', clientKey(req)).allowed;

/**
 * GET /api/livestation
 * Get all available live stations
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const result = await liveStationGenerator.getStations();

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[LiveStation] Failed to get stations:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get stations',
    });
  }
});

/**
 * GET /api/livestation/:stationId
 * Get station detail with recent episodes
 */
router.get('/:stationId', async (req: Request, res: Response) => {
  try {
    const { stationId } = req.params;

    const result = await liveStationGenerator.getStationDetail(stationId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Station not found',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[LiveStation] Failed to get station detail:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get station',
    });
  }
});

/**
 * POST /api/livestation/:stationId/tune-in
 * Tune into a live station
 */
router.post('/:stationId/tune-in', async (req: Request, res: Response) => {
  try {
    const { stationId } = req.params;

    console.log(`[LiveStation] Tuning into station: ${stationId}`);

    const result = await liveStationGenerator.tuneIn(stationId, mayGenerate(req));

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    if (error instanceof AllowanceReached) return refuseOverLimit(res);
    console.error('[LiveStation] Failed to tune in:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to tune in',
    });
  }
});

/**
 * POST /api/livestation/:stationId/refresh
 * Force refresh a station's content
 */
router.post('/:stationId/refresh', async (req: Request, res: Response) => {
  try {
    const { stationId } = req.params;

    const detail = await liveStationGenerator.getStationDetail(stationId);
    if (!detail) {
      return res.status(404).json({
        success: false,
        error: 'Station not found',
      });
    }

    console.log(`[LiveStation] Force refreshing station: ${stationId}`);

    const fresh = await liveStationGenerator.generateWithin(detail.station, mayGenerate(req));
    // Over the daily allowance the latest episode is served, so the player keeps working.
    const episode = fresh ?? detail.station.currentEpisode;
    if (!episode) return refuseOverLimit(res);

    res.json({
      success: true,
      data: {
        station: { ...detail.station, currentEpisode: episode },
        episode,
        message: fresh ? 'Station refreshed successfully' : 'Showing the latest update',
      },
    });
  } catch (error) {
    console.error('[LiveStation] Failed to refresh:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh station',
    });
  }
});

export default router;
