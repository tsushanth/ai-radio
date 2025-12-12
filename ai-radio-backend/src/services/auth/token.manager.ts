/**
 * OAuth Token Manager
 * Handles token storage, retrieval, and automatic refresh
 */

import type { StoredOAuthToken, OAuthProvider } from '../../types/oauth';
import type { OAuthToken, OAuthTokenInsert, OAuthTokenUpdate } from '../../types/database';
import { gmailAuthService } from './gmail.auth';
import { outlookAuthService } from './outlook.auth';

// TODO: Import actual Supabase client when implemented
// import { supabase } from '../supabase';

export class TokenManager {
  private providers: Map<string, any>;

  constructor() {
    this.providers = new Map([
      ['google', gmailAuthService],
      ['microsoft', outlookAuthService],
    ] as any);
  }

  /**
   * Store OAuth token in database
   */
  async storeToken(userId: string, token: StoredOAuthToken): Promise<void> {
    try {
      const tokenData: OAuthTokenInsert = {
        user_id: userId,
        provider: token.provider,
        access_token: token.accessToken,
        refresh_token: token.refreshToken,
        expires_at: token.expiresAt.toISOString(),
        scopes: token.scopes,
      };

      // TODO: Implement actual database storage
      // await supabase
      //   .from('oauth_tokens')
      //   .upsert(tokenData, {
      //     onConflict: 'user_id,provider',
      //   });

      console.log(`Token stored for user ${userId} provider ${token.provider}`);
    } catch (error) {
      console.error('Failed to store token:', error);
      throw new Error(`Failed to store OAuth token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Retrieve OAuth token from database
   * Automatically refreshes if token is expired or near expiry
   */
  async getToken(userId: string, provider: 'google' | 'microsoft'): Promise<StoredOAuthToken | null> {
    try {
      // TODO: Implement actual database retrieval
      // const { data, error } = await supabase
      //   .from('oauth_tokens')
      //   .select('*')
      //   .eq('user_id', userId)
      //   .eq('provider', provider)
      //   .single();

      // if (error || !data) {
      //   return null;
      // }

      // For now, return null (no token found)
      // Replace with actual implementation
      console.log(`Retrieving token for user ${userId} provider ${provider}`);
      return null;

      // Convert database token to StoredOAuthToken
      // const token: StoredOAuthToken = {
      //   accessToken: data.access_token,
      //   refreshToken: data.refresh_token,
      //   expiresAt: new Date(data.expires_at),
      //   scopes: data.scopes,
      //   provider: data.provider,
      // };

      // Check if token needs refresh
      // if (this.isTokenExpired(token.expiresAt) || this.shouldRefreshToken(token.expiresAt)) {
      //   return await this.refreshToken(userId, provider, token.refreshToken);
      // }

      // return token;
    } catch (error) {
      console.error('Failed to get token:', error);
      throw new Error(`Failed to retrieve OAuth token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Refresh an OAuth token
   */
  async refreshToken(
    userId: string,
    provider: 'google' | 'microsoft',
    refreshToken: string
  ): Promise<StoredOAuthToken> {
    try {
      const authProvider = this.providers.get(provider);
      if (!authProvider) {
        throw new Error(`Unknown provider: ${provider}`);
      }

      // Refresh the token
      const newToken = await authProvider.refreshAccessToken(refreshToken);

      // Store the new token
      await this.storeToken(userId, newToken);

      return newToken;
    } catch (error) {
      console.error('Failed to refresh token:', error);
      throw new Error(`Failed to refresh OAuth token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Revoke OAuth token and remove from database
   */
  async revokeToken(userId: string, provider: 'google' | 'microsoft'): Promise<void> {
    try {
      // Get the token first
      const token = await this.getToken(userId, provider);
      if (!token) {
        console.warn(`No token found for user ${userId} provider ${provider}`);
        return;
      }

      // Revoke with provider
      const authProvider = this.providers.get(provider);
      if (authProvider) {
        try {
          await authProvider.revokeToken(token.accessToken);
        } catch (error) {
          console.warn('Failed to revoke token with provider:', error);
          // Continue to delete from database even if revocation fails
        }
      }

      // Delete from database
      // TODO: Implement actual database deletion
      // await supabase
      //   .from('oauth_tokens')
      //   .delete()
      //   .eq('user_id', userId)
      //   .eq('provider', provider);

      console.log(`Token revoked for user ${userId} provider ${provider}`);
    } catch (error) {
      console.error('Failed to revoke token:', error);
      throw new Error(`Failed to revoke OAuth token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Validate if a token is still valid
   */
  async validateToken(
    userId: string,
    provider: 'google' | 'microsoft'
  ): Promise<boolean> {
    try {
      const token = await this.getToken(userId, provider);
      if (!token) {
        return false;
      }

      // Check expiration
      if (this.isTokenExpired(token.expiresAt)) {
        return false;
      }

      // Optionally validate with provider
      const authProvider = this.providers.get(provider);
      if (authProvider) {
        return await authProvider.validateToken(token.accessToken);
      }

      return true;
    } catch (error) {
      console.error('Failed to validate token:', error);
      return false;
    }
  }

  /**
   * Get a valid access token, refreshing if necessary
   * This is the main method to use when making API calls
   */
  async getValidAccessToken(
    userId: string,
    provider: 'google' | 'microsoft'
  ): Promise<string | null> {
    try {
      const token = await this.getToken(userId, provider);
      if (!token) {
        return null;
      }

      // Token will be automatically refreshed by getToken if needed
      return token.accessToken;
    } catch (error) {
      console.error('Failed to get valid access token:', error);
      return null;
    }
  }

  /**
   * Check if token is expired
   */
  private isTokenExpired(expiresAt: Date): boolean {
    return new Date() >= expiresAt;
  }

  /**
   * Check if token should be refreshed (within 5 minutes of expiry)
   */
  private shouldRefreshToken(expiresAt: Date): boolean {
    const now = new Date();
    const fiveMinutesFromNow = new Date(now.getTime() + 5 * 60 * 1000);
    return expiresAt <= fiveMinutesFromNow;
  }

  /**
   * Get all tokens for a user
   */
  async getUserTokens(userId: string): Promise<Array<{
    provider: 'google' | 'microsoft';
    scopes: string[];
    expiresAt: Date;
  }>> {
    try {
      // TODO: Implement actual database query
      // const { data, error } = await supabase
      //   .from('oauth_tokens')
      //   .select('provider, scopes, expires_at')
      //   .eq('user_id', userId);

      // if (error || !data) {
      //   return [];
      // }

      // return data.map(token => ({
      //   provider: token.provider,
      //   scopes: token.scopes,
      //   expiresAt: new Date(token.expires_at),
      // }));

      console.log(`Getting tokens for user ${userId}`);
      return [];
    } catch (error) {
      console.error('Failed to get user tokens:', error);
      return [];
    }
  }

  /**
   * Check if user has connected a specific provider
   */
  async hasProvider(userId: string, provider: 'google' | 'microsoft'): Promise<boolean> {
    try {
      const token = await this.getToken(userId, provider);
      return token !== null;
    } catch (error) {
      return false;
    }
  }
}

// Export singleton instance
export const tokenManager = new TokenManager();

// Export class for testing
export default TokenManager;
