/**
 * Gmail OAuth2 Authentication Service
 * Handles Google OAuth2 flow for Gmail and Calendar access
 */

import { google } from 'googleapis';
import type { OAuth2Client } from 'google-auth-library';
import type {
  OAuthProvider,
  OAuthConfig,
  OAuthAuthorizationParams,
  StoredOAuthToken,
  OAuthError,
} from '../../types/oauth';
import { env } from '../../config/environment';

export class GmailAuthService implements OAuthProvider {
  private oauth2Client: OAuth2Client;
  private config: OAuthConfig;

  constructor(config?: Partial<OAuthConfig>) {
    this.config = {
      clientId: config?.clientId || env.GOOGLE_CLIENT_ID,
      clientSecret: config?.clientSecret || env.GOOGLE_CLIENT_SECRET,
      redirectUri: config?.redirectUri || env.GOOGLE_REDIRECT_URI,
      scopes: config?.scopes || [
        'https://www.googleapis.com/auth/gmail.readonly',
        'https://www.googleapis.com/auth/calendar.readonly',
        'https://www.googleapis.com/auth/userinfo.email',
        'https://www.googleapis.com/auth/userinfo.profile',
      ],
    };

    this.oauth2Client = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri
    );
  }

  /**
   * Generate authorization URL for OAuth flow
   * User will be redirected to this URL to grant permissions
   */
  async getAuthorizationUrl(state: string): Promise<{
    url: string;
    params: OAuthAuthorizationParams;
  }> {
    try {
      const authUrl = this.oauth2Client.generateAuthUrl({
        access_type: 'offline', // Request refresh token
        scope: this.config.scopes,
        state: state,
        prompt: 'consent', // Force consent screen to ensure refresh token
        // Enable incremental authorization
        include_granted_scopes: true,
      });

      return {
        url: authUrl,
        params: {
          state,
          // PKCE will be added in future enhancement
        },
      };
    } catch (error) {
      throw this.createOAuthError('Failed to generate authorization URL', error);
    }
  }

  /**
   * Exchange authorization code for access and refresh tokens
   */
  async exchangeCodeForTokens(code: string, state: string): Promise<StoredOAuthToken> {
    try {
      // Exchange code for tokens
      const { tokens } = await this.oauth2Client.getToken(code);

      if (!tokens.access_token) {
        throw this.createOAuthError('No access token received from Google');
      }

      if (!tokens.refresh_token) {
        // This can happen if user already authorized and didn't see consent screen
        throw this.createOAuthError(
          'No refresh token received. User may need to revoke access and re-authorize.'
        );
      }

      // Calculate expiration time
      const expiresAt = new Date();
      if (tokens.expiry_date) {
        expiresAt.setTime(tokens.expiry_date);
      } else if ((tokens as any).expires_in) {
        expiresAt.setSeconds(expiresAt.getSeconds() + (tokens as any).expires_in);
      } else {
        // Default to 1 hour if not specified
        expiresAt.setHours(expiresAt.getHours() + 1);
      }

      // Parse scopes from token
      const scopes = tokens.scope ? tokens.scope.split(' ') : this.config.scopes;

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scopes,
        provider: 'google',
      };
    } catch (error) {
      throw this.createOAuthError('Failed to exchange code for tokens', error);
    }
  }

  /**
   * Refresh an expired access token using the refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<StoredOAuthToken> {
    try {
      // Set the refresh token
      this.oauth2Client.setCredentials({
        refresh_token: refreshToken,
      });

      // Request new access token
      const { credentials } = await this.oauth2Client.refreshAccessToken();

      if (!credentials.access_token) {
        throw this.createOAuthError('No access token received during refresh');
      }

      // Calculate expiration time
      const expiresAt = new Date();
      if (credentials.expiry_date) {
        expiresAt.setTime(credentials.expiry_date);
      } else if ((credentials as any).expires_in) {
        expiresAt.setSeconds(expiresAt.getSeconds() + (credentials as any).expires_in);
      } else {
        expiresAt.setHours(expiresAt.getHours() + 1);
      }

      // Parse scopes
      const scopes = credentials.scope ? credentials.scope.split(' ') : this.config.scopes;

      return {
        accessToken: credentials.access_token,
        refreshToken: credentials.refresh_token || refreshToken, // Use new if provided, else keep old
        expiresAt,
        scopes,
        provider: 'google',
      };
    } catch (error) {
      throw this.createOAuthError('Failed to refresh access token', error);
    }
  }

  /**
   * Revoke access token (logout)
   */
  async revokeToken(token: string): Promise<void> {
    try {
      await this.oauth2Client.revokeToken(token);
    } catch (error) {
      throw this.createOAuthError('Failed to revoke token', error);
    }
  }

  /**
   * Validate if an access token is still valid
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      // Set credentials and get token info
      this.oauth2Client.setCredentials({ access_token: accessToken });
      const tokenInfo = await this.oauth2Client.getTokenInfo(accessToken);

      // Check if token has required scopes
      const hasRequiredScopes = this.config.scopes.every(requiredScope => {
        return tokenInfo.scopes?.includes(requiredScope);
      });

      // Check if token is expired
      const isExpired = tokenInfo.expiry_date ? tokenInfo.expiry_date < Date.now() : false;

      return hasRequiredScopes && !isExpired;
    } catch (error) {
      // Token is invalid if we can't get info
      return false;
    }
  }

  /**
   * Get an authenticated OAuth2Client for making API calls
   * Useful for passing to Gmail/Calendar API clients
   */
  getAuthenticatedClient(accessToken: string, refreshToken?: string): OAuth2Client {
    const client = new google.auth.OAuth2(
      this.config.clientId,
      this.config.clientSecret,
      this.config.redirectUri
    );

    client.setCredentials({
      access_token: accessToken,
      refresh_token: refreshToken,
    });

    return client;
  }

  /**
   * Get user info from Google (email, name, etc.)
   */
  async getUserInfo(accessToken: string): Promise<{
    email: string;
    name: string;
    picture?: string;
    emailVerified: boolean;
  }> {
    try {
      const oauth2 = google.oauth2({
        version: 'v2',
        auth: this.getAuthenticatedClient(accessToken),
      });

      const { data } = await oauth2.userinfo.get();

      return {
        email: data.email || '',
        name: data.name || '',
        picture: data.picture,
        emailVerified: data.verified_email || false,
      };
    } catch (error) {
      throw this.createOAuthError('Failed to get user info', error);
    }
  }

  /**
   * Create a standardized OAuth error
   */
  private createOAuthError(message: string, originalError?: unknown): OAuthError {
    const error = new Error(message) as OAuthError;
    error.code = 'GOOGLE_OAUTH_ERROR';
    error.provider = 'google';

    if (originalError instanceof Error) {
      error.message = `${message}: ${originalError.message}`;
      error.stack = originalError.stack;
    }

    // Extract status code if available
    if (typeof originalError === 'object' && originalError !== null) {
      const err = originalError as any;
      if (err.code) error.code = err.code;
      if (err.status) error.statusCode = err.status;
    }

    return error;
  }
}

// Export singleton instance
export const gmailAuthService = new GmailAuthService();

// Export class for testing
export default GmailAuthService;
