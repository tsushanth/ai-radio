/**
 * Ad Routes
 * Endpoints for ad impression tracking, click tracking, and campaign management
 */

import { Router, Request, Response } from 'express';
import { adService } from '../services/ads/ad.service';
import { env } from '../config/environment';

const router = Router();

// ==========================================
// Client-facing endpoints (mobile apps)
// ==========================================

/**
 * POST /ads/impression
 * Record an ad impression from mobile client
 */
router.post('/impression', async (req: Request, res: Response) => {
  try {
    const {
      creativeId,
      campaignId,
      episodeId,
      topicId,
      userId,
      devicePlatform,
      language,
      durationListenedSeconds,
      wasSkipped,
    } = req.body;

    if (!creativeId || !campaignId) {
      res.status(400).json({
        success: false,
        error: 'creativeId and campaignId are required',
      });
      return;
    }

    await adService.trackImpression({
      creativeId,
      campaignId,
      episodeId: episodeId || '',
      topicId: topicId || '',
      userId,
      devicePlatform: devicePlatform || 'ios',
      language: language || 'en',
      durationListenedSeconds: durationListenedSeconds || 0,
      wasSkipped: wasSkipped || false,
    });

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking impression:', error);
    res.status(500).json({ success: false, error: 'Failed to track impression' });
  }
});

/**
 * POST /ads/click
 * Record an ad click from mobile client
 */
router.post('/click', async (req: Request, res: Response) => {
  try {
    const { creativeId, campaignId, userId } = req.body;

    if (!creativeId || !campaignId) {
      res.status(400).json({
        success: false,
        error: 'creativeId and campaignId are required',
      });
      return;
    }

    await adService.trackClick({ creativeId, campaignId, userId });

    res.json({ success: true });
  } catch (error) {
    console.error('Error tracking click:', error);
    res.status(500).json({ success: false, error: 'Failed to track click' });
  }
});

// ==========================================
// Admin endpoints (campaign management)
// Protected by BATCH_SECRET for now
// ==========================================

/**
 * Middleware to verify admin auth for campaign management
 */
function requireAdminAuth(req: Request, res: Response, next: () => void): void {
  const authHeader = req.headers.authorization;
  const expectedToken = env.BATCH_SECRET;

  if (!expectedToken || authHeader !== `Bearer ${expectedToken}`) {
    res.status(401).json({ success: false, error: 'Unauthorized' });
    return;
  }
  next();
}

/**
 * GET /ads/campaigns
 * List all campaigns (admin)
 */
router.get('/campaigns', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const status = req.query.status as string | undefined;
    const campaigns = await adService.getCampaigns(status);

    res.json({
      success: true,
      data: { campaigns, count: campaigns.length },
    });
  } catch (error) {
    console.error('Error listing campaigns:', error);
    res.status(500).json({ success: false, error: 'Failed to list campaigns' });
  }
});

/**
 * POST /ads/campaigns
 * Create a new campaign (admin)
 */
router.post('/campaigns', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const { name, advertiser, startDate, endDate, dailyImpressionCap, totalImpressionCap, targetTopics, priority } = req.body;

    if (!name || !advertiser || !startDate) {
      res.status(400).json({
        success: false,
        error: 'name, advertiser, and startDate are required',
      });
      return;
    }

    const result = await adService.createCampaign({
      name,
      advertiser,
      startDate,
      endDate,
      dailyImpressionCap,
      totalImpressionCap,
      targetTopics,
      priority,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error creating campaign:', error);
    res.status(500).json({ success: false, error: 'Failed to create campaign' });
  }
});

/**
 * POST /ads/creatives
 * Create a new ad creative (admin)
 */
router.post('/creatives', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const {
      campaignId,
      name,
      audioUrl,
      audioPath,
      audioDurationSeconds,
      companionImageUrl,
      companionImagePath,
      clickThroughUrl,
      ctaText,
    } = req.body;

    if (!campaignId || !name || !audioUrl || !audioDurationSeconds) {
      res.status(400).json({
        success: false,
        error: 'campaignId, name, audioUrl, and audioDurationSeconds are required',
      });
      return;
    }

    const result = await adService.createCreative({
      campaignId,
      name,
      audioUrl,
      audioPath,
      audioDurationSeconds,
      companionImageUrl,
      companionImagePath,
      clickThroughUrl,
      ctaText,
    });

    res.status(201).json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('Error creating creative:', error);
    res.status(500).json({ success: false, error: 'Failed to create creative' });
  }
});

/**
 * GET /ads/reporting/:campaignId
 * Get impression/click stats for a campaign (admin)
 */
router.get('/reporting/:campaignId', requireAdminAuth, async (req: Request, res: Response) => {
  try {
    const stats = await adService.getCampaignStats(req.params.campaignId);

    res.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('Error getting campaign stats:', error);
    res.status(500).json({ success: false, error: 'Failed to get campaign stats' });
  }
});

export default router;
