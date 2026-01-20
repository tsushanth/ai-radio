/**
 * Context Routes
 * Routes for weather and traffic data
 */

import express from 'express';
import { contextService } from '../services/content/context.service';
import type { TrafficRequest } from '../types/context';

const router = express.Router();

/**
 * GET /context/weather
 * Get weather data for a location
 * Query params: lat, lon, address
 */
router.get('/weather', async (req, res) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lon = req.query.lon ? parseFloat(req.query.lon as string) : undefined;
    const address = req.query.address as string | undefined;

    const result = await contextService.getWeather(lat, lon, address);
    res.json(result);
  } catch (error) {
    console.error('Error fetching weather:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch weather',
    });
  }
});

/**
 * POST /context/traffic
 * Get traffic data for a route
 * Body: { origin, destination }
 */
router.post('/traffic', async (req, res) => {
  try {
    const request: TrafficRequest = req.body;

    if (!request.origin || !request.destination) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: origin, destination',
      });
    }

    const result = await contextService.getTraffic(request);
    res.json(result);
  } catch (error) {
    console.error('Error fetching traffic:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch traffic',
    });
  }
});

/**
 * GET /context/summary
 * Get combined context summary for podcast generation
 * Query params: lat, lon, home_address, work_address
 */
router.get('/summary', async (req, res) => {
  try {
    const lat = req.query.lat ? parseFloat(req.query.lat as string) : undefined;
    const lon = req.query.lon ? parseFloat(req.query.lon as string) : undefined;
    const homeAddress = req.query.home_address as string | undefined;
    const workAddress = req.query.work_address as string | undefined;

    const result = await contextService.getContextSummary(lat, lon, homeAddress, workAddress);
    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error fetching context summary:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch context summary',
    });
  }
});

export default router;
