/**
 * Interactions Routes
 * Routes for skip/tell-me-more and adaptive learning
 */

import express from 'express';
import { interactionsService } from '../services/content/interactions.service';
import type { RecordInteractionRequest, TellMeMoreRequest } from '../types/interactions';

const router = express.Router();

/**
 * POST /interactions/record
 * Record a playback interaction (skip, tell me more, completed, etc.)
 */
router.post('/record', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    const request: RecordInteractionRequest = req.body;

    // Validate required fields
    if (!request.context_type || !request.context_id || !request.interaction_type) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: context_type, context_id, interaction_type',
      });
    }

    const result = await interactionsService.recordInteraction(userId, request);
    res.json(result);
  } catch (error) {
    console.error('Error recording interaction:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to record interaction',
    });
  }
});

/**
 * POST /interactions/tell-me-more
 * Generate expanded content for "Tell Me More" feature
 */
router.post('/tell-me-more', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string || 'anonymous';
    const request: TellMeMoreRequest = req.body;

    // Validate required fields
    if (!request.context_type || !request.context_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: context_type, context_id',
      });
    }

    const result = await interactionsService.generateExpansion(userId, request);
    res.json(result);
  } catch (error) {
    console.error('Error generating expansion:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to generate expansion',
    });
  }
});

/**
 * GET /interactions/preferences
 * Get user's adaptive learning preferences
 */
router.get('/preferences', async (req, res) => {
  try {
    const userId = req.headers['x-user-id'] as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID required',
      });
    }

    const result = await interactionsService.getUserPreferences(userId);
    res.json(result);
  } catch (error) {
    console.error('Error fetching preferences:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to fetch preferences',
    });
  }
});

export default router;
