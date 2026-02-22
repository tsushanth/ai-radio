/**
 * Subscription Routes
 * Handles subscription verification and status
 */

import { Router, Request, Response } from 'express';
import { subscriptionService } from '../services/subscription/subscription.service';

const router = Router();

/**
 * GET /subscription/status/:userId
 * Get current subscription status
 */
router.get('/status/:userId', async (req: Request, res: Response) => {
  try {
    const { userId } = req.params;

    if (!userId) {
      res.status(400).json({ success: false, error: 'userId is required' });
      return;
    }

    const status = await subscriptionService.getSubscriptionStatus(userId);

    res.json({
      success: true,
      data: status,
    });
  } catch (error) {
    console.error('Error getting subscription status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get subscription status',
    });
  }
});

/**
 * POST /subscription/verify-ios
 * Verify an iOS App Store receipt and activate subscription
 */
router.post('/verify-ios', async (req: Request, res: Response) => {
  try {
    const { userId, receiptData, productId } = req.body;

    if (!userId || !receiptData || !productId) {
      res.status(400).json({
        success: false,
        error: 'userId, receiptData, and productId are required',
      });
      return;
    }

    const result = await subscriptionService.verifyAppleReceipt(userId, receiptData, productId);

    res.json({
      success: result.valid,
      data: {
        status: result.valid ? 'premium' : 'free',
        expiresAt: result.expiresAt,
      },
    });
  } catch (error) {
    console.error('Error verifying iOS receipt:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify receipt',
    });
  }
});

/**
 * POST /subscription/verify-android
 * Verify a Google Play purchase and activate subscription
 */
router.post('/verify-android', async (req: Request, res: Response) => {
  try {
    const { userId, purchaseToken, productId } = req.body;

    if (!userId || !purchaseToken || !productId) {
      res.status(400).json({
        success: false,
        error: 'userId, purchaseToken, and productId are required',
      });
      return;
    }

    const result = await subscriptionService.verifyGooglePurchase(userId, purchaseToken, productId);

    res.json({
      success: result.valid,
      data: {
        status: result.valid ? 'premium' : 'free',
        expiresAt: result.expiresAt,
      },
    });
  } catch (error) {
    console.error('Error verifying Android purchase:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to verify purchase',
    });
  }
});

export default router;
