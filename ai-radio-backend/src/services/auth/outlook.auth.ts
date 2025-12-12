/**
 * Outlook OAuth2 Authentication Service
 * Handles Microsoft OAuth2 flow for Outlook Mail and Calendar access
 */

import axios from 'axios';
import type {
  OAuthProvider,
  OAuthConfig,
  OAuthAuthorizationParams,
  StoredOAuthToken,
  OAuthError,
  OAuthTokenResponse,
} from '../../types/oauth';
import { env } from '../../config/environment';

export class OutlookAuthService implements OAuthProvider {
  private config: OAuthConfig;
  private readonly tokenEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/token';
  private readonly authEndpoint = 'https://login.microsoftonline.com/common/oauth2/v2.0/authorize';
  private readonly revokeEndpoint =
    'https://login.microsoftonline.com/common/oauth2/v2.0/logout';

  constructor(config?: Partial<OAuthConfig>) {
    this.config = {
      clientId: config?.clientId || env.MICROSOFT_CLIENT_ID,
      clientSecret: config?.clientSecret || env.MICROSOFT_CLIENT_SECRET,
      redirectUri: config?.redirectUri || env.MICROSOFT_REDIRECT_URI,
      scopes: config?.scopes || [
        'offline_access', // Required for refresh token
        'User.Read',
        'Mail.Read',
        'Calendars.Read',
      ],
    };
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
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        response_type: 'code',
        redirect_uri: this.config.redirectUri,
        scope: this.config.scopes.join(' '),
        state: state,
        response_mode: 'query',
        prompt: 'consent', // Force consent to ensure refresh token
      });

      const url = `${this.authEndpoint}?${params.toString()}`;

      return {
        url,
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
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        code: code,
        redirect_uri: this.config.redirectUri,
        grant_type: 'authorization_code',
      });

      const response = await axios.post<OAuthTokenResponse>(this.tokenEndpoint, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const tokens = response.data;

      if (!tokens.access_token) {
        throw this.createOAuthError('No access token received from Microsoft');
      }

      if (!tokens.refresh_token) {
        throw this.createOAuthError(
          'No refresh token received. Ensure "offline_access" scope is included.'
        );
      }

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in || 3600));

      // Parse scopes
      const scopes = tokens.scope ? tokens.scope.split(' ') : this.config.scopes;

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token,
        expiresAt,
        scopes,
        provider: 'microsoft',
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data as any;
        throw this.createOAuthError(
          `Failed to exchange code for tokens: ${errorData.error_description || errorData.error}`,
          error
        );
      }
      throw this.createOAuthError('Failed to exchange code for tokens', error);
    }
  }

  /**
   * Refresh an expired access token using the refresh token
   */
  async refreshAccessToken(refreshToken: string): Promise<StoredOAuthToken> {
    try {
      const params = new URLSearchParams({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        refresh_token: refreshToken,
        grant_type: 'refresh_token',
        scope: this.config.scopes.join(' '),
      });

      const response = await axios.post<OAuthTokenResponse>(this.tokenEndpoint, params.toString(), {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      });

      const tokens = response.data;

      if (!tokens.access_token) {
        throw this.createOAuthError('No access token received during refresh');
      }

      // Calculate expiration time
      const expiresAt = new Date();
      expiresAt.setSeconds(expiresAt.getSeconds() + (tokens.expires_in || 3600));

      // Parse scopes
      const scopes = tokens.scope ? tokens.scope.split(' ') : this.config.scopes;

      return {
        accessToken: tokens.access_token,
        refreshToken: tokens.refresh_token || refreshToken, // Use new if provided, else keep old
        expiresAt,
        scopes,
        provider: 'microsoft',
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        const errorData = error.response.data as any;

        // Check for specific error codes
        if (
          errorData.error === 'invalid_grant' ||
          errorData.error_description?.includes('expired')
        ) {
          throw this.createOAuthError('Refresh token expired or revoked. Re-authorization required.', error);
        }

        throw this.createOAuthError(
          `Failed to refresh token: ${errorData.error_description || errorData.error}`,
          error
        );
      }
      throw this.createOAuthError('Failed to refresh access token', error);
    }
  }

  /**
   * Revoke access token (logout)
   * Note: Microsoft doesn't have a direct token revocation endpoint
   * Instead, we redirect to logout URL which clears the session
   */
  async revokeToken(token: string): Promise<void> {
    try {
      // Microsoft Graph doesn't support programmatic token revocation
      // Users need to manually revoke access from their Microsoft account settings
      // or we can redirect them to the logout URL

      // For now, we just clear the token locally
      // The token will remain valid until it expires naturally
      // This is a limitation of Microsoft's OAuth implementation

      // Optional: Could make a request to invalidate the session
      // but this requires user interaction (redirect to logout URL)
      console.warn(
        'Microsoft OAuth does not support programmatic token revocation. Token will remain valid until expiration.'
      );
    } catch (error) {
      throw this.createOAuthError('Failed to revoke token', error);
    }
  }

  /**
   * Validate if an access token is still valid
   */
  async validateToken(accessToken: string): Promise<boolean> {
    try {
      // Make a simple API call to validate the token
      const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      return response.status === 200;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        // Token is invalid if we get 401 Unauthorized
        if (error.response?.status === 401) {
          return false;
        }
      }
      // For other errors, assume token is invalid
      return false;
    }
  }

  /**
   * Get user info from Microsoft Graph (email, name, etc.)
   */
  async getUserInfo(accessToken: string): Promise<{
    email: string;
    name: string;
    id: string;
    jobTitle?: string;
  }> {
    try {
      const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
        headers: {
          Authorization: `Bearer ${accessToken}`,
        },
      });

      const data = response.data;

      return {
        email: data.mail || data.userPrincipalName || '',
        name: data.displayName || '',
        id: data.id || '',
        jobTitle: data.jobTitle,
      };
    } catch (error) {
      if (axios.isAxiosError(error) && error.response) {
        throw this.createOAuthError(
          `Failed to get user info: ${error.response.data?.error?.message || error.message}`,
          error
        );
      }
      throw this.createOAuthError('Failed to get user info', error);
    }
  }

  /**
   * Get Microsoft Graph client headers
   * Helper method to construct authorization headers for Graph API calls
   */
  getGraphHeaders(accessToken: string): Record<string, string> {
    return {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
    };
  }

  /**
   * Check if token needs refresh (within 5 minutes of expiry)
   */
  shouldRefreshToken(expiresAt: Date): boolean {
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    return expiresAt <= fiveMinutesFromNow;
  }

  /**
   * Create a standardized OAuth error
   */
  private createOAuthError(message: string, originalError?: unknown): OAuthError {
    const error = new Error(message) as OAuthError;
    error.code = 'MICROSOFT_OAUTH_ERROR';
    error.provider = 'microsoft';

    if (originalError instanceof Error) {
      error.message = `${message}: ${originalError.message}`;
      error.stack = originalError.stack;
    }

    // Extract status code if available (from axios error)
    if (axios.isAxiosError(originalError)) {
      error.statusCode = originalError.response?.status;
      const errorData = originalError.response?.data as any;
      if (errorData?.error_codes?.[0]) {
        error.code = errorData.error_codes[0];
      }
    }

    return error;
  }
}

// Export singleton instance
export const outlookAuthService = new OutlookAuthService();

// Export class for testing
export default OutlookAuthService;
