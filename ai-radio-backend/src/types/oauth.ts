/**
 * OAuth Type Definitions
 * Types for OAuth2 authentication flows
 */

export interface OAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
  scopes: string[];
}

export interface OAuthAuthorizationParams {
  state: string;
  codeVerifier?: string; // For PKCE (future enhancement)
}

export interface OAuthTokenResponse {
  access_token: string;
  refresh_token?: string;
  expires_in: number;
  token_type: string;
  scope?: string;
}

export interface StoredOAuthToken {
  accessToken: string;
  refreshToken: string;
  expiresAt: Date;
  scopes: string[];
  provider: 'google' | 'microsoft';
}

export interface OAuthCallbackParams {
  code: string;
  state: string;
  error?: string;
  error_description?: string;
}

export interface OAuthError extends Error {
  code: string;
  statusCode?: number;
  provider?: string;
}

export interface TokenRefreshResult {
  success: boolean;
  token?: StoredOAuthToken;
  error?: OAuthError;
}

export interface OAuthProvider {
  /**
   * Generate authorization URL for OAuth flow
   */
  getAuthorizationUrl(state: string): Promise<{ url: string; params: OAuthAuthorizationParams }>;

  /**
   * Exchange authorization code for tokens
   */
  exchangeCodeForTokens(code: string, state: string): Promise<StoredOAuthToken>;

  /**
   * Refresh an expired access token
   */
  refreshAccessToken(refreshToken: string): Promise<StoredOAuthToken>;

  /**
   * Revoke tokens (logout)
   */
  revokeToken(token: string): Promise<void>;

  /**
   * Validate token (check if still valid)
   */
  validateToken(accessToken: string): Promise<boolean>;
}
