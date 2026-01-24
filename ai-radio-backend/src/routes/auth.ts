/**
 * Authentication Routes
 * Handles user authentication and OAuth flows
 */

import express, { Request, Response, NextFunction } from 'express';
import { gmailAuthService, GmailAuthService } from '../services/auth/gmail.auth';
import { outlookAuthService } from '../services/auth/outlook.auth';
import { tokenManager } from '../services/auth/token.manager';
import {
  generateState,
  stateManager,
  extractOAuthError,
  parseOAuthCallbackError,
  logOAuthEvent,
} from '../services/auth/oauth.utils';

const router = express.Router();

// ================================================
// GOOGLE OAUTH FLOW
// ================================================

/**
 * GET /auth/oauth/google
 * Initiate Google OAuth flow
 */
router.get('/oauth/google', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Generate secure state parameter
    const state = generateState();

    // Determine which service is being requested (gmail or calendar)
    const requestedService = req.query.scope as string;
    let scopes: string[] | undefined;

    if (requestedService === 'gmail' || requestedService === 'gmail.modify') {
      scopes = GmailAuthService.getScopesForService('gmail');
    } else if (requestedService === 'calendar') {
      scopes = GmailAuthService.getScopesForService('calendar');
    }
    // If no specific scope requested, will use default (gmail.modify)

    // Normalize service type for frontend (gmail.modify -> gmail)
    const normalizedService = requestedService === 'calendar' ? 'calendar' : 'gmail';

    // Store state with user context (if authenticated)
    // For initial auth, userId will be stored after callback
    stateManager.store(state, {
      redirectUrl: req.query.redirect_url as string,
      metadata: {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
        requestedService: normalizedService,
      },
    });

    // Get authorization URL with specific scopes
    const { url } = await gmailAuthService.getAuthorizationUrl(state, scopes);

    logOAuthEvent('auth_start', {
      provider: 'google',
      userId: req.query.user_id as string,
    });

    // Redirect user to Google authorization page
    res.redirect(url);
  } catch (error) {
    logOAuthEvent('auth_error', {
      provider: 'google',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
});

/**
 * GET /auth/oauth/google/callback
 * Google OAuth callback
 */
router.get('/oauth/google/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state, error: oauthError, error_description } = req.query;

    // Check for OAuth errors
    const errorCheck = extractOAuthError(req.query);
    if (errorCheck.hasError) {
      const error = parseOAuthCallbackError(
        errorCheck.error!,
        errorCheck.description
      );
      logOAuthEvent('auth_error', {
        provider: 'google',
        error: error.message,
      });
      return res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
      });
    }

    // Validate state
    if (!state || typeof state !== 'string') {
      return res.status(400).json({
        error: 'invalid_state',
        message: 'Missing or invalid state parameter',
      });
    }

    const stateData = stateManager.retrieve(state);
    if (!stateData) {
      return res.status(400).json({
        error: 'invalid_state',
        message: 'Invalid or expired state parameter',
      });
    }

    // Validate code
    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        error: 'invalid_code',
        message: 'Missing authorization code',
      });
    }

    // Exchange code for tokens
    const tokens = await gmailAuthService.exchangeCodeForTokens(code, state);

    // Get user info from Google
    const userInfo = await gmailAuthService.getUserInfo(tokens.accessToken);

    // TODO: Create or update user in database
    // const user = await createOrUpdateUser({
    //   email: userInfo.email,
    //   name: userInfo.name,
    //   emailVerified: userInfo.emailVerified,
    // });

    // For now, use email as userId (replace with actual user ID from DB)
    const userId = userInfo.email;

    // Store tokens
    await tokenManager.storeToken(userId, tokens);

    logOAuthEvent('auth_success', {
      provider: 'google',
      userId,
    });

    // Redirect to frontend or return success
    // Include the service type (gmail or calendar) so frontend knows what was connected
    const redirectUrl = stateData.redirectUrl || '/dashboard';
    const service = stateData.metadata?.requestedService || 'gmail';
    res.redirect(`${redirectUrl}?success=true&provider=google&email=${encodeURIComponent(userInfo.email)}&service=${service}`);
  } catch (error) {
    logOAuthEvent('auth_error', {
      provider: 'google',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
});

// ================================================
// MICROSOFT OAUTH FLOW
// ================================================

/**
 * GET /auth/oauth/microsoft
 * Initiate Microsoft OAuth flow
 */
router.get('/oauth/microsoft', async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Generate secure state parameter
    const state = generateState();

    // Store state with user context
    stateManager.store(state, {
      redirectUrl: req.query.redirect_url as string,
      metadata: {
        userAgent: req.headers['user-agent'],
        ip: req.ip,
      },
    });

    // Get authorization URL
    const { url } = await outlookAuthService.getAuthorizationUrl(state);

    logOAuthEvent('auth_start', {
      provider: 'microsoft',
      userId: req.query.user_id as string,
    });

    // Redirect user to Microsoft authorization page
    res.redirect(url);
  } catch (error) {
    logOAuthEvent('auth_error', {
      provider: 'microsoft',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
});

/**
 * GET /auth/oauth/microsoft/callback
 * Microsoft OAuth callback
 */
router.get('/oauth/microsoft/callback', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { code, state } = req.query;

    // Check for OAuth errors
    const errorCheck = extractOAuthError(req.query);
    if (errorCheck.hasError) {
      const error = parseOAuthCallbackError(
        errorCheck.error!,
        errorCheck.description
      );
      logOAuthEvent('auth_error', {
        provider: 'microsoft',
        error: error.message,
      });
      return res.status(error.statusCode).json({
        error: error.code,
        message: error.message,
      });
    }

    // Validate state
    if (!state || typeof state !== 'string') {
      return res.status(400).json({
        error: 'invalid_state',
        message: 'Missing or invalid state parameter',
      });
    }

    const stateData = stateManager.retrieve(state);
    if (!stateData) {
      return res.status(400).json({
        error: 'invalid_state',
        message: 'Invalid or expired state parameter',
      });
    }

    // Validate code
    if (!code || typeof code !== 'string') {
      return res.status(400).json({
        error: 'invalid_code',
        message: 'Missing authorization code',
      });
    }

    // Exchange code for tokens
    const tokens = await outlookAuthService.exchangeCodeForTokens(code, state);

    // Get user info from Microsoft
    const userInfo = await outlookAuthService.getUserInfo(tokens.accessToken);

    // TODO: Create or update user in database
    // const user = await createOrUpdateUser({
    //   email: userInfo.email,
    //   name: userInfo.name,
    // });

    // For now, use email as userId (replace with actual user ID from DB)
    const userId = userInfo.email;

    // Store tokens
    await tokenManager.storeToken(userId, tokens);

    logOAuthEvent('auth_success', {
      provider: 'microsoft',
      userId,
    });

    // Redirect to frontend or return success
    const redirectUrl = stateData.redirectUrl || '/dashboard';
    res.redirect(`${redirectUrl}?success=true&provider=microsoft`);
  } catch (error) {
    logOAuthEvent('auth_error', {
      provider: 'microsoft',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
});

// ================================================
// TOKEN MANAGEMENT
// ================================================

/**
 * POST /auth/refresh
 * Refresh access token
 */
router.post('/refresh', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider, userId } = req.body;

    if (!provider || !userId) {
      return res.status(400).json({
        error: 'missing_parameters',
        message: 'Provider and userId are required',
      });
    }

    if (provider !== 'google' && provider !== 'microsoft') {
      return res.status(400).json({
        error: 'invalid_provider',
        message: 'Provider must be google or microsoft',
      });
    }

    // Get current token
    const currentToken = await tokenManager.getToken(userId, provider);
    if (!currentToken) {
      return res.status(404).json({
        error: 'token_not_found',
        message: 'No token found for this user and provider',
      });
    }

    // Refresh token
    const newToken = await tokenManager.refreshToken(
      userId,
      provider,
      currentToken.refreshToken
    );

    logOAuthEvent('token_refresh', {
      provider,
      userId,
    });

    res.json({
      success: true,
      expiresAt: newToken.expiresAt,
    });
  } catch (error) {
    logOAuthEvent('auth_error', {
      provider: req.body.provider,
      userId: req.body.userId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
    next(error);
  }
});

/**
 * DELETE /auth/revoke/:provider
 * Revoke OAuth token and disconnect integration
 */
router.delete('/revoke/:provider', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { provider } = req.params;
    const { userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        error: 'missing_user_id',
        message: 'userId is required',
      });
    }

    if (provider !== 'google' && provider !== 'microsoft') {
      return res.status(400).json({
        error: 'invalid_provider',
        message: 'Provider must be google or microsoft',
      });
    }

    await tokenManager.revokeToken(userId, provider);

    logOAuthEvent('token_revoke', {
      provider: provider as 'google' | 'microsoft',
      userId,
    });

    res.json({
      success: true,
      message: `${provider} integration disconnected`,
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /auth/status
 * Check OAuth connection status
 */
router.get('/status', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { userId } = req.query;

    if (!userId || typeof userId !== 'string') {
      return res.status(400).json({
        error: 'missing_user_id',
        message: 'userId query parameter is required',
      });
    }

    const [hasGoogle, hasMicrosoft] = await Promise.all([
      tokenManager.hasProvider(userId, 'google'),
      tokenManager.hasProvider(userId, 'microsoft'),
    ]);

    res.json({
      google: {
        connected: hasGoogle,
      },
      microsoft: {
        connected: hasMicrosoft,
      },
    });
  } catch (error) {
    next(error);
  }
});

// ================================================
// TRADITIONAL AUTH (JWT)
// ================================================

/**
 * POST /auth/login
 * User login (if implementing traditional auth alongside OAuth)
 */
router.post('/login', (req: Request, res: Response) => {
  // TODO: Implement JWT-based login
  res.status(501).json({ message: 'Not implemented - Use OAuth instead' });
});

/**
 * POST /auth/signup
 * User registration
 */
router.post('/signup', (req: Request, res: Response) => {
  // TODO: Implement user registration
  res.status(501).json({ message: 'Not implemented - Use OAuth instead' });
});

/**
 * POST /auth/logout
 * User logout
 */
router.post('/logout', (req: Request, res: Response) => {
  // TODO: Implement logout (clear session/JWT)
  res.status(501).json({ message: 'Not implemented' });
});

export default router;
