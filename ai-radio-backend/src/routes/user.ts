/**
 * User Routes
 * Handles user profile and preferences management
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import type { UserPreferences } from '../types/database';

const router = express.Router();

// ================================================
// VALIDATION SCHEMAS
// ================================================

const updatePreferencesSchema = z.object({
  briefing_time: z.string().regex(/^\d{2}:\d{2}$/, 'Time must be in HH:MM format').optional(),
  topics: z.array(z.string()).optional(),
  voice_host1: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
  voice_host2: z.enum(['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer']).optional(),
  include_weather: z.boolean().optional(),
  include_calendar: z.boolean().optional(),
  include_email: z.boolean().optional(),
});

const updateProfileSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  timezone: z.string().optional(),
});

// ================================================
// ROUTES
// ================================================

/**
 * GET /user/:userId
 * Get user profile
 */
router.get('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;

    // TODO: Fetch from database
    // const { data: user, error } = await supabase
    //   .from('users')
    //   .select('*')
    //   .eq('id', userId)
    //   .single();

    // if (error) {
    //   return res.status(404).json({
    //     error: 'User not found',
    //   });
    // }

    // Mock response
    res.json({
      success: true,
      user: {
        id: userId,
        email: userId,
        name: null,
        timezone: 'UTC',
        preferences: {
          briefing_time: '07:00',
          topics: [],
          voice_host1: 'nova',
          voice_host2: 'onyx',
          include_weather: false,
          include_calendar: true,
          include_email: true,
        },
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    console.error('Failed to fetch user:', error);
    res.status(500).json({
      error: 'Failed to fetch user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /user/:userId
 * Update user profile
 */
router.put('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;
    const validated = updateProfileSchema.parse(req.body);

    // TODO: Update in database
    // const { data, error } = await supabase
    //   .from('users')
    //   .update({
    //     name: validated.name,
    //     timezone: validated.timezone,
    //     updated_at: new Date().toISOString(),
    //   })
    //   .eq('id', userId)
    //   .select()
    //   .single();

    res.json({
      success: true,
      message: 'Profile updated',
      user: {
        id: userId,
        ...validated,
        updated_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: error.errors,
      });
    }

    console.error('Failed to update user:', error);
    res.status(500).json({
      error: 'Failed to update user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /user/:userId/preferences
 * Get user preferences
 */
router.get('/:userId/preferences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;

    // TODO: Fetch from database
    // const { data: user } = await supabase
    //   .from('users')
    //   .select('preferences')
    //   .eq('id', userId)
    //   .single();

    res.json({
      success: true,
      preferences: {
        briefing_time: '07:00',
        topics: [],
        voice_host1: 'nova',
        voice_host2: 'onyx',
        include_weather: false,
        include_calendar: true,
        include_email: true,
      },
    });
  } catch (error) {
    console.error('Failed to fetch preferences:', error);
    res.status(500).json({
      error: 'Failed to fetch preferences',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PUT /user/:userId/preferences
 * Update user preferences
 */
router.put('/:userId/preferences', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;
    const validated = updatePreferencesSchema.parse(req.body);

    // TODO: Update in database
    // const { data: user } = await supabase
    //   .from('users')
    //   .select('preferences')
    //   .eq('id', userId)
    //   .single();

    // const updatedPreferences = {
    //   ...user.preferences,
    //   ...validated,
    // };

    // await supabase
    //   .from('users')
    //   .update({
    //     preferences: updatedPreferences,
    //     updated_at: new Date().toISOString(),
    //   })
    //   .eq('id', userId);

    res.json({
      success: true,
      message: 'Preferences updated',
      preferences: validated,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: error.errors,
      });
    }

    console.error('Failed to update preferences:', error);
    res.status(500).json({
      error: 'Failed to update preferences',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /user/:userId
 * Delete user account
 */
router.delete('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;

    // TODO: Delete from database
    // Also delete all related data: oauth_tokens, podcast_episodes, etc.
    // await supabase
    //   .from('users')
    //   .delete()
    //   .eq('id', userId);

    res.json({
      success: true,
      message: 'User deleted',
    });
  } catch (error) {
    console.error('Failed to delete user:', error);
    res.status(500).json({
      error: 'Failed to delete user',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * GET /user/:userId/stats
 * Get user statistics
 */
router.get('/:userId/stats', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;

    // TODO: Fetch from database
    // const { data: episodes } = await supabase
    //   .from('podcast_episodes')
    //   .select('*')
    //   .eq('user_id', userId);

    // const totalEpisodes = episodes?.length || 0;
    // const totalDuration = episodes?.reduce((sum, ep) => sum + (ep.duration_seconds || 0), 0) || 0;

    res.json({
      success: true,
      stats: {
        total_episodes: 0,
        total_duration_minutes: 0,
        last_generated: null,
        connected_services: {
          google: false,
          microsoft: false,
        },
      },
    });
  } catch (error) {
    console.error('Failed to fetch stats:', error);
    res.status(500).json({
      error: 'Failed to fetch stats',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
