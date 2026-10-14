/**
 * Notification Routes
 * Handle device registration and push notification management
 */

import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/environment';
import { dailyBriefScheduler } from '../services/scheduler/daily-brief.scheduler';

const router = express.Router();

// Initialize Supabase
const supabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
  : null;

/**
 * POST /notifications/register
 * Register device token for push notifications
 */
router.post('/register', async (req, res) => {
  try {
    const { user_id, device_token, platform } = req.body;

    if (!user_id || !device_token || !platform) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, device_token, platform',
      });
    }

    if (!['ios', 'android'].includes(platform)) {
      return res.status(400).json({
        success: false,
        error: 'Platform must be "ios" or "android"',
      });
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured',
      });
    }

    // Get existing tokens for user
    const { data: existing } = await supabase
      .from('user_settings')
      .select('device_tokens')
      .eq('user_id', user_id)
      .single();

    let deviceTokens: string[] = existing?.device_tokens || [];

    // Add new token if not already present
    if (!deviceTokens.includes(device_token)) {
      deviceTokens.push(device_token);
    }

    // Upsert user settings with device token
    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id,
        device_tokens: deviceTokens,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('Failed to register device:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to register device',
      });
    }

    console.log(`[Notifications] Registered ${platform} device for user ${user_id}`);

    res.json({
      success: true,
      message: 'Device registered successfully',
    });

  } catch (error) {
    console.error('Device registration error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Registration failed',
    });
  }
});

/**
 * DELETE /notifications/unregister
 * Unregister device token
 */
router.delete('/unregister', async (req, res) => {
  try {
    const { user_id, device_token } = req.body;

    if (!user_id || !device_token) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: user_id, device_token',
      });
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured',
      });
    }

    // Get existing tokens
    const { data: existing } = await supabase
      .from('user_settings')
      .select('device_tokens')
      .eq('user_id', user_id)
      .single();

    if (existing?.device_tokens) {
      const updatedTokens = existing.device_tokens.filter(
        (t: string) => t !== device_token
      );

      await supabase
        .from('user_settings')
        .update({ device_tokens: updatedTokens })
        .eq('user_id', user_id);
    }

    res.json({
      success: true,
      message: 'Device unregistered successfully',
    });

  } catch (error) {
    console.error('Device unregistration error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Unregistration failed',
    });
  }
});

/**
 * POST /notifications/settings
 * Update notification settings for user
 */
router.post('/settings', async (req, res) => {
  try {
    const {
      user_id,
      briefing_time,    // HH:MM format
      timezone,         // e.g., "America/Los_Angeles"
      notifications_enabled,
    } = req.body;

    if (!user_id) {
      return res.status(400).json({
        success: false,
        error: 'Missing required field: user_id',
      });
    }

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured',
      });
    }

    const updates: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    };

    if (briefing_time) updates.briefing_time = briefing_time;
    if (timezone) updates.timezone = timezone;
    if (typeof notifications_enabled === 'boolean') {
      updates.notifications_enabled = notifications_enabled;
    }

    const { error } = await supabase
      .from('user_settings')
      .upsert({
        user_id,
        ...updates,
      }, { onConflict: 'user_id' });

    if (error) {
      console.error('Failed to update settings:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to update settings',
      });
    }

    res.json({
      success: true,
      message: 'Settings updated successfully',
    });

  } catch (error) {
    console.error('Settings update error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Update failed',
    });
  }
});

/**
 * GET /notifications/settings/:userId
 * Get notification settings for user
 */
router.get('/settings/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    if (!supabase) {
      return res.status(500).json({
        success: false,
        error: 'Database not configured',
      });
    }

    const { data, error } = await supabase
      .from('user_settings')
      .select('briefing_time, timezone, notifications_enabled, device_tokens')
      .eq('user_id', userId)
      .single();

    if (error && error.code !== 'PGRST116') { // PGRST116 = no rows
      console.error('Failed to fetch settings:', error);
      return res.status(500).json({
        success: false,
        error: 'Failed to fetch settings',
      });
    }

    res.json({
      success: true,
      data: data || {
        briefing_time: '07:00',
        timezone: 'America/Los_Angeles',
        notifications_enabled: true,
        device_tokens: [],
      },
    });

  } catch (error) {
    console.error('Settings fetch error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Fetch failed',
    });
  }
});

/**
 * POST /notifications/trigger/:userId
 * Manually trigger daily brief generation for a user (admin/testing)
 */
router.post('/trigger/:userId', async (req, res) => {
  try {
    const userId = req.params.userId;

    console.log(`[Notifications] Manual trigger for user: ${userId}`);

    const result = await dailyBriefScheduler.triggerForUser(userId);

    if (result.success) {
      res.json({
        success: true,
        message: 'Daily brief generated successfully',
        episode_id: result.episodeId,
        audio_url: result.audioUrl,
      });
    } else {
      res.status(500).json({
        success: false,
        error: result.error || 'Generation failed',
      });
    }

  } catch (error) {
    console.error('Manual trigger error:', error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : 'Trigger failed',
    });
  }
});

/**
 * POST /notifications/event
 * Anonymous funnel events for the morning-briefing notification. Logged as
 * one JSON line (grep "[BriefingEvent]" in `fly logs`); nothing is written
 * to the database and no user identifier (email, user id) is accepted.
 */
const BRIEFING_EVENTS = new Set([
  'briefing_optin_shown',
  'briefing_optin_accepted',
  'briefing_optin_declined',
  'briefing_permission_denied',
  'briefing_shown',
  'briefing_skipped_quiet_hours',
  'briefing_opened',
  'language_picked',
]);

router.post('/event', (req, res) => {
  const { event, install_id, hour, topic_count, lang } = req.body || {};

  if (typeof event !== 'string' || !BRIEFING_EVENTS.has(event)) {
    return res.status(400).json({ success: false, error: 'Unknown event' });
  }
  if (typeof install_id !== 'string' || !/^[0-9a-f-]{8,40}$/i.test(install_id)) {
    return res.status(400).json({ success: false, error: 'Invalid install_id' });
  }

  console.log('[BriefingEvent]', JSON.stringify({
    event,
    install_id,
    hour: Number.isInteger(hour) && hour >= 0 && hour <= 23 ? hour : undefined,
    topic_count: Number.isInteger(topic_count) && topic_count >= 0 && topic_count <= 999 ? topic_count : undefined,
    // language_picked: which language the user chose (two letters only), to size demand for non-English content
    lang: typeof lang === 'string' && /^[a-z]{2}$/.test(lang) ? lang : undefined,
  }));

  res.status(204).end();
});

export default router;
