/**
 * OAuth Token Manager
 * Handles token storage, retrieval, and automatic refresh
 * Uses Supabase database with in-memory fallback
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import type { StoredOAuthToken } from '../../types/oauth';
import { gmailAuthService } from './gmail.auth';
import { outlookAuthService } from './outlook.auth';
import { env } from '../../config/environment';

// In-memory token storage (fallback when Supabase unavailable)
interface TokenRecord {
  userId: string;
  provider: string;
  accessToken: string;
  refreshToken: string | null;
  email: string;
  expiresAt: Date;
  scopes: string[];
  createdAt: Date;
}

// In-memory store - maps "userId:provider" to token record
const tokenStore: Map<string, TokenRecord> = new Map();

export class TokenManager {
  private providers: Map<string, any>;
  private supabase: SupabaseClient | null = null;

  constructor() {
    this.providers = new Map([
      ['google', gmailAuthService],
      ['microsoft', outlookAuthService],
    ] as any);

    // Initialize Supabase client
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      console.log('✅ TokenManager: Supabase client initialized');
    } else {
      console.warn('⚠️ TokenManager: Supabase not configured, using in-memory storage only');
    }
  }

  /**
   * Store token from linked-accounts route
   * Stores in both database and memory for immediate use
   */
  async storeTokenFromLinkedAccount(
    userId: string,
    provider: string,
    email: string,
    accessToken: string,
    refreshToken: string | null
  ): Promise<void> {
    const expiresAt = new Date(Date.now() + 3600 * 1000); // 1 hour from now
    const scopes = provider === 'google'
      ? ['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly']
      : ['Mail.Read', 'Calendars.Read'];

    // Always store in memory for immediate access
    const key = `${userId}:${provider}`;
    const record: TokenRecord = {
      userId,
      provider,
      email,
      accessToken,
      refreshToken,
      expiresAt,
      scopes,
      createdAt: new Date(),
    };
    tokenStore.set(key, record);
    console.log(`✅ Token stored in memory: ${key} (${email})`);

    // Also store in Supabase if available
    if (this.supabase) {
      try {
        const { error } = await this.supabase
          .from('linked_accounts')
          .upsert({
            user_email: userId,
            provider,
            oauth_email: email,
            access_token: accessToken,
            refresh_token: refreshToken,
            expires_at: expiresAt.toISOString(),
            scopes,
            email_enabled: true,
            calendar_enabled: true,
            updated_at: new Date().toISOString(),
          }, {
            onConflict: 'user_email,provider',
          });

        if (error) {
          console.error('❌ Failed to store token in database:', error.message);
        } else {
          console.log(`✅ Token stored in database: ${userId} / ${provider}`);
        }
      } catch (dbError) {
        console.error('❌ Database error storing token:', dbError);
      }
    }

    console.log(`   Total tokens in memory: ${tokenStore.size}`);
  }

  /**
   * Get stored token count (for debugging)
   */
  getStoredTokenCount(): number {
    return tokenStore.size;
  }

  /**
   * List all stored tokens (for debugging)
   */
  listStoredTokens(): string[] {
    return Array.from(tokenStore.keys());
  }

  /**
   * Retrieve OAuth token - checks memory first, then database
   */
  async getToken(userId: string, provider: 'google' | 'microsoft'): Promise<StoredOAuthToken | null> {
    try {
      const key = `${userId}:${provider}`;

      console.log(`Retrieving token for user ${userId} provider ${provider}`);
      console.log(`   Memory store has ${tokenStore.size} tokens: [${Array.from(tokenStore.keys()).join(', ')}]`);

      // First check in-memory cache
      let record = tokenStore.get(key);

      // If not in memory, check database
      if (!record && this.supabase) {
        console.log(`   Not in memory, checking database...`);

        const { data, error } = await this.supabase
          .from('linked_accounts')
          .select('*')
          .eq('user_email', userId)
          .eq('provider', provider)
          .single();

        if (error) {
          if (error.code !== 'PGRST116') { // PGRST116 = no rows returned
            console.error(`   Database error: ${error.message}`);
          } else {
            console.log(`   No token found in database`);
          }
        } else if (data) {
          console.log(`   Found token in database for ${data.oauth_email}`);

          // Convert database record to TokenRecord
          record = {
            userId: data.user_email,
            provider: data.provider,
            email: data.oauth_email,
            accessToken: data.access_token,
            refreshToken: data.refresh_token,
            expiresAt: new Date(data.expires_at),
            scopes: data.scopes || [],
            createdAt: new Date(data.created_at),
          };

          // Cache in memory for future requests
          tokenStore.set(key, record);
        }
      }

      if (!record) {
        console.log(`   No token found for key: ${key}`);
        return null;
      }

      console.log(`   Found token for ${record.email}, expires: ${record.expiresAt.toISOString()}`);

      // Convert to StoredOAuthToken format
      const token: StoredOAuthToken = {
        accessToken: record.accessToken,
        refreshToken: record.refreshToken,
        expiresAt: record.expiresAt,
        scopes: record.scopes,
        provider: provider,
      };

      // Check if token needs refresh
      if (this.isTokenExpired(token.expiresAt) && token.refreshToken) {
        console.log(`   Token expired, attempting refresh...`);
        try {
          return await this.refreshToken(userId, provider, token.refreshToken);
        } catch (refreshError) {
          console.warn(`   Failed to refresh token: ${refreshError}`);
          // Return the expired token anyway - let the caller handle the error
          return token;
        }
      }

      return token;
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
   * Store OAuth token (internal method)
   */
  async storeToken(userId: string, token: StoredOAuthToken): Promise<void> {
    try {
      // Update memory cache
      const key = `${userId}:${token.provider}`;
      const existingRecord = tokenStore.get(key);

      if (existingRecord) {
        existingRecord.accessToken = token.accessToken;
        existingRecord.refreshToken = token.refreshToken;
        existingRecord.expiresAt = token.expiresAt;
        existingRecord.scopes = token.scopes;
      }

      // Update database if available
      if (this.supabase) {
        const { error } = await this.supabase
          .from('linked_accounts')
          .update({
            access_token: token.accessToken,
            refresh_token: token.refreshToken,
            expires_at: token.expiresAt.toISOString(),
            scopes: token.scopes,
            updated_at: new Date().toISOString(),
          })
          .eq('user_email', userId)
          .eq('provider', token.provider);

        if (error) {
          console.error('Failed to update token in database:', error.message);
        }
      }

      console.log(`Token stored for user ${userId} provider ${token.provider}`);
    } catch (error) {
      console.error('Failed to store token:', error);
      throw new Error(`Failed to store OAuth token: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Revoke OAuth token and remove from storage
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
          // Continue to delete from storage even if revocation fails
        }
      }

      // Delete from memory
      const key = `${userId}:${provider}`;
      tokenStore.delete(key);

      // Delete from database
      if (this.supabase) {
        const { error } = await this.supabase
          .from('linked_accounts')
          .delete()
          .eq('user_email', userId)
          .eq('provider', provider);

        if (error) {
          console.error('Failed to delete token from database:', error.message);
        }
      }

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
    email: string;
    scopes: string[];
    expiresAt: Date;
  }>> {
    try {
      const results: Array<{
        provider: 'google' | 'microsoft';
        email: string;
        scopes: string[];
        expiresAt: Date;
      }> = [];

      // Check database first
      if (this.supabase) {
        const { data, error } = await this.supabase
          .from('linked_accounts')
          .select('provider, oauth_email, scopes, expires_at')
          .eq('user_email', userId);

        if (!error && data) {
          for (const row of data) {
            results.push({
              provider: row.provider as 'google' | 'microsoft',
              email: row.oauth_email,
              scopes: row.scopes || [],
              expiresAt: new Date(row.expires_at),
            });
          }
          return results;
        }
      }

      // Fallback to memory
      for (const [key, record] of tokenStore.entries()) {
        if (record.userId === userId) {
          results.push({
            provider: record.provider as 'google' | 'microsoft',
            email: record.email,
            scopes: record.scopes,
            expiresAt: record.expiresAt,
          });
        }
      }

      return results;
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
