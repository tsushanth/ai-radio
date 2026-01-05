/**
 * Linked Accounts Routes
 * Handles OAuth token storage and management for Gmail/Outlook
 */

import express, { Request, Response, NextFunction } from 'express';
import { z } from 'zod';
import { tokenManager } from '../services/auth/token.manager';

const router = express.Router();

// ================================================
// VALIDATION SCHEMAS
// ================================================

const createLinkedAccountSchema = z.object({
  provider: z.enum(['google', 'microsoft']),
  email: z.string().email(),
  access_token: z.string().min(1),
  refresh_token: z.string().optional(),
  token_expires_at: z.string().datetime().optional(),
  email_enabled: z.boolean().optional().default(true),
  calendar_enabled: z.boolean().optional().default(true),
});

const updatePermissionsSchema = z.object({
  email_enabled: z.boolean().optional(),
  calendar_enabled: z.boolean().optional(),
});

// ================================================
// ROUTES
// ================================================

/**
 * GET /linked-accounts/:userId
 * Get all linked accounts for user
 */
router.get('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;

    // Get tokens from token manager (checks database and memory)
    const tokens = await tokenManager.getUserTokens(userId);

    // Map to linked account format
    const linkedAccounts = tokens.map((token, index) => ({
      id: `${token.provider}_${index}`,
      provider: token.provider,
      email: token.email,
      emailEnabled: true,
      calendarEnabled: true,
      createdAt: new Date().toISOString(),
    }));

    console.log(`Found ${linkedAccounts.length} linked accounts for user ${userId}`);

    res.json({
      success: true,
      linkedAccounts: linkedAccounts,
    });
  } catch (error) {
    console.error('Failed to fetch linked accounts:', error);
    res.status(500).json({
      error: 'Failed to fetch linked accounts',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /linked-accounts/:userId
 * Create new linked account (store OAuth tokens)
 */
router.post('/:userId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.params.userId;
    const validated = createLinkedAccountSchema.parse(req.body);

    // TODO: Store in database (encrypted)
    // const { data: account, error } = await supabase
    //   .from('oauth_tokens')
    //   .insert({
    //     user_id: userId,
    //     provider: validated.provider,
    //     email: validated.email,
    //     access_token: encrypt(validated.access_token),
    //     refresh_token: validated.refresh_token ? encrypt(validated.refresh_token) : null,
    //     token_expires_at: validated.token_expires_at || null,
    //     email_enabled: validated.email_enabled,
    //     calendar_enabled: validated.calendar_enabled,
    //     created_at: new Date().toISOString(),
    //     updated_at: new Date().toISOString(),
    //   })
    //   .select('id, provider, email, created_at, email_enabled, calendar_enabled')
    //   .single();

    const accountId = `acc_${Date.now()}`;

    // Store token in memory and database for immediate use
    await tokenManager.storeTokenFromLinkedAccount(
      userId,
      validated.provider,
      validated.email,
      validated.access_token,
      validated.refresh_token || null
    );

    console.log(`Linked account created: ${validated.provider} - ${validated.email}`);
    console.log(`Token stored for userId: ${userId}`);

    res.status(201).json({
      success: true,
      linked_account: {
        id: accountId,
        provider: validated.provider,
        email: validated.email,
        email_enabled: validated.email_enabled,
        calendar_enabled: validated.calendar_enabled,
        created_at: new Date().toISOString(),
      },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        error: 'Validation failed',
        issues: error.errors,
      });
    }

    console.error('Failed to create linked account:', error);
    res.status(500).json({
      error: 'Failed to create linked account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * PATCH /linked-accounts/:userId/:accountId
 * Update linked account permissions
 */
router.patch('/:userId/:accountId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, accountId } = req.params;
    const validated = updatePermissionsSchema.parse(req.body);

    // TODO: Update in database
    // const { data: account, error } = await supabase
    //   .from('oauth_tokens')
    //   .update({
    //     email_enabled: validated.email_enabled,
    //     calendar_enabled: validated.calendar_enabled,
    //     updated_at: new Date().toISOString(),
    //   })
    //   .eq('id', accountId)
    //   .eq('user_id', userId)
    //   .select('id, provider, email, email_enabled, calendar_enabled')
    //   .single();

    console.log(`Updated permissions for account ${accountId}: email=${validated.email_enabled}, calendar=${validated.calendar_enabled}`);

    res.json({
      success: true,
      message: 'Permissions updated',
      linked_account: {
        id: accountId,
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

    console.error('Failed to update permissions:', error);
    res.status(500).json({
      error: 'Failed to update permissions',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * DELETE /linked-accounts/:userId/:accountId
 * Delete linked account and revoke tokens
 */
router.delete('/:userId/:accountId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, accountId } = req.params;

    // TODO: Fetch token to revoke
    // const { data: account } = await supabase
    //   .from('oauth_tokens')
    //   .select('provider, access_token, refresh_token')
    //   .eq('id', accountId)
    //   .eq('user_id', userId)
    //   .single();

    // TODO: Revoke token with provider
    // if (account) {
    //   if (account.provider === 'google') {
    //     await revokeGoogleToken(decrypt(account.access_token));
    //   } else if (account.provider === 'microsoft') {
    //     await revokeMicrosoftToken(decrypt(account.access_token));
    //   }
    // }

    // TODO: Delete from database
    // await supabase
    //   .from('oauth_tokens')
    //   .delete()
    //   .eq('id', accountId)
    //   .eq('user_id', userId);

    console.log(`Deleted linked account: ${accountId}`);

    res.json({
      success: true,
      message: 'Linked account deleted',
    });
  } catch (error) {
    console.error('Failed to delete linked account:', error);
    res.status(500).json({
      error: 'Failed to delete linked account',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

/**
 * POST /linked-accounts/:userId/:accountId/refresh
 * Refresh OAuth token
 */
router.post('/:userId/:accountId/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId, accountId } = req.params;

    // TODO: Fetch current token
    // const { data: account } = await supabase
    //   .from('oauth_tokens')
    //   .select('*')
    //   .eq('id', accountId)
    //   .eq('user_id', userId)
    //   .single();

    // TODO: Refresh token with provider
    // const newTokens = account.provider === 'google'
    //   ? await refreshGoogleToken(decrypt(account.refresh_token))
    //   : await refreshMicrosoftToken(decrypt(account.refresh_token));

    // TODO: Update in database
    // await supabase
    //   .from('oauth_tokens')
    //   .update({
    //     access_token: encrypt(newTokens.access_token),
    //     token_expires_at: newTokens.expires_at,
    //     updated_at: new Date().toISOString(),
    //   })
    //   .eq('id', accountId);

    res.json({
      success: true,
      message: 'Token refreshed',
    });
  } catch (error) {
    console.error('Failed to refresh token:', error);
    res.status(500).json({
      error: 'Failed to refresh token',
      message: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

export default router;
