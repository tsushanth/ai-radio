/**
 * Q&A Routes
 * API endpoints for interactive question and answer
 */

import { Router, Request, Response } from 'express';
import { qaGenerator } from '../services/content/qa.generator';

const router = Router();

/**
 * POST /api/qa/ask
 * Ask a question about content
 */
router.post('/ask', async (req: Request, res: Response) => {
  try {
    const { question, contextType, contextId, sessionId, includeAudio, userId } = req.body;

    // Validate required fields
    if (!question) {
      return res.status(400).json({
        success: false,
        error: 'Question is required',
      });
    }

    if (!contextType || !contextId) {
      return res.status(400).json({
        success: false,
        error: 'Context type and ID are required',
      });
    }

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    console.log(`[Q&A] Processing question from user ${userId.substring(0, 8)}...`);

    const result = await qaGenerator.askQuestion({
      question,
      contextType,
      contextId,
      sessionId,
      includeAudio: includeAudio || false,
      userId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Q&A] Failed to process question:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to process question',
    });
  }
});

/**
 * GET /api/qa/history
 * Get user's Q&A session history
 */
router.get('/history', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const result = await qaGenerator.getHistory(userId, limit, offset);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Q&A] Failed to get history:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get history',
    });
  }
});

/**
 * GET /api/qa/session/:sessionId
 * Get a specific Q&A session
 */
router.get('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const result = await qaGenerator.getSessionDetail(sessionId, userId);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Session not found',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[Q&A] Failed to get session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get session',
    });
  }
});

/**
 * DELETE /api/qa/session/:sessionId
 * Delete a Q&A session
 */
router.delete('/session/:sessionId', async (req: Request, res: Response) => {
  try {
    const { sessionId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const success = await qaGenerator.deleteSession(sessionId, userId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Session not found or could not be deleted',
      });
    }

    res.json({
      success: true,
      message: 'Session deleted successfully',
    });
  } catch (error) {
    console.error('[Q&A] Failed to delete session:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete session',
    });
  }
});

export default router;
