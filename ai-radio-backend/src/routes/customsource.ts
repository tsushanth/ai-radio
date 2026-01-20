/**
 * Custom Source Routes
 * API endpoints for user-added RSS feeds, newsletters, and websites
 */

import { Router, Request, Response } from 'express';
import { customSourceService } from '../services/content/customsource.service';

const router = Router();

/**
 * POST /api/sources/validate
 * Validate a source URL before adding
 */
router.post('/validate', async (req: Request, res: Response) => {
  try {
    const { url, sourceType } = req.body;

    if (!url || !sourceType) {
      return res.status(400).json({
        success: false,
        error: 'URL and source type are required',
      });
    }

    const result = await customSourceService.validateSource(url, sourceType);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[CustomSource] Validation failed:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Validation failed',
    });
  }
});

/**
 * POST /api/sources
 * Add a new custom source
 */
router.post('/', async (req: Request, res: Response) => {
  try {
    const { url, sourceType, name, userId } = req.body;

    if (!url || !sourceType || !userId) {
      return res.status(400).json({
        success: false,
        error: 'URL, source type, and user ID are required',
      });
    }

    console.log(`[CustomSource] Adding source for user ${userId.substring(0, 8)}...`);

    const result = await customSourceService.addSource({
      url,
      sourceType,
      name,
      userId,
    });

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[CustomSource] Failed to add source:', error);
    res.status(400).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to add source',
    });
  }
});

/**
 * GET /api/sources
 * Get all sources for a user
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const result = await customSourceService.getSources(userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[CustomSource] Failed to get sources:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get sources',
    });
  }
});

/**
 * GET /api/sources/:sourceId
 * Get source detail with items
 */
router.get('/:sourceId', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const userId = req.query.userId as string;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = parseInt(req.query.offset as string) || 0;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const result = await customSourceService.getSourceDetail(sourceId, userId, limit, offset);

    if (!result) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[CustomSource] Failed to get source detail:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get source',
    });
  }
});

/**
 * POST /api/sources/:sourceId/refresh
 * Refresh a source (fetch new items)
 */
router.post('/:sourceId/refresh', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    console.log(`[CustomSource] Refreshing source ${sourceId}...`);

    const result = await customSourceService.refreshSource(sourceId, userId);

    res.json({
      success: true,
      data: result,
    });
  } catch (error) {
    console.error('[CustomSource] Failed to refresh source:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to refresh source',
    });
  }
});

/**
 * PATCH /api/sources/:sourceId/toggle
 * Toggle source active state
 */
router.patch('/:sourceId/toggle', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const { userId, isActive } = req.body;

    if (!userId || isActive === undefined) {
      return res.status(400).json({
        success: false,
        error: 'User ID and isActive are required',
      });
    }

    const source = await customSourceService.toggleSource(sourceId, userId, isActive);

    if (!source) {
      return res.status(404).json({
        success: false,
        error: 'Source not found',
      });
    }

    res.json({
      success: true,
      data: { source },
    });
  } catch (error) {
    console.error('[CustomSource] Failed to toggle source:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to toggle source',
    });
  }
});

/**
 * DELETE /api/sources/:sourceId
 * Delete a custom source
 */
router.delete('/:sourceId', async (req: Request, res: Response) => {
  try {
    const { sourceId } = req.params;
    const userId = req.query.userId as string;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const success = await customSourceService.deleteSource(sourceId, userId);

    if (!success) {
      return res.status(404).json({
        success: false,
        error: 'Source not found or could not be deleted',
      });
    }

    res.json({
      success: true,
      message: 'Source deleted successfully',
    });
  } catch (error) {
    console.error('[CustomSource] Failed to delete source:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to delete source',
    });
  }
});

/**
 * POST /api/sources/:sourceId/items/:itemId/read
 * Mark an item as read
 */
router.post('/:sourceId/items/:itemId/read', async (req: Request, res: Response) => {
  try {
    const { sourceId, itemId } = req.params;

    const success = await customSourceService.markItemRead(itemId, sourceId);

    res.json({
      success,
      message: success ? 'Item marked as read' : 'Failed to mark item',
    });
  } catch (error) {
    console.error('[CustomSource] Failed to mark item:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to mark item',
    });
  }
});

/**
 * PATCH /api/sources/:sourceId/items/:itemId/brief
 * Toggle item inclusion in daily brief
 */
router.patch('/:sourceId/items/:itemId/brief', async (req: Request, res: Response) => {
  try {
    const { sourceId, itemId } = req.params;
    const { include } = req.body;

    if (include === undefined) {
      return res.status(400).json({
        success: false,
        error: 'Include parameter is required',
      });
    }

    const success = await customSourceService.toggleItemInBrief(itemId, sourceId, include);

    res.json({
      success,
      message: success ? 'Item updated' : 'Failed to update item',
    });
  } catch (error) {
    console.error('[CustomSource] Failed to toggle item brief:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to update item',
    });
  }
});

/**
 * GET /api/sources/brief/items
 * Get items to include in daily brief
 */
router.get('/brief/items', async (req: Request, res: Response) => {
  try {
    const userId = req.query.userId as string;
    const limit = parseInt(req.query.limit as string) || 10;

    if (!userId) {
      return res.status(400).json({
        success: false,
        error: 'User ID is required',
      });
    }

    const items = await customSourceService.getItemsForBrief(userId, limit);

    res.json({
      success: true,
      data: { items },
    });
  } catch (error) {
    console.error('[CustomSource] Failed to get brief items:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get items',
    });
  }
});

export default router;
