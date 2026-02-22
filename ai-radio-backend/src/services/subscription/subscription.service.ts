/**
 * Subscription Service
 * Handles subscription verification and status management
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';

export class SubscriptionService {
  private supabase: SupabaseClient | null = null;

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    }
  }

  /**
   * Check if a user has an active subscription
   */
  async isSubscriber(userId: string): Promise<boolean> {
    if (!this.supabase || !userId) return false;

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('subscription_status, subscription_expires_at')
        .eq('id', userId)
        .single();

      if (error || !data) return false;

      if (data.subscription_status !== 'premium') return false;

      // Check expiration if set
      if (data.subscription_expires_at) {
        const expiresAt = new Date(data.subscription_expires_at);
        if (expiresAt < new Date()) {
          // Subscription expired — update status
          await this.updateSubscriptionStatus(userId, 'free');
          return false;
        }
      }

      return true;
    } catch (error) {
      console.error('[SubscriptionService] Error checking subscription:', error);
      return false;
    }
  }

  /**
   * Get subscription status for a user
   */
  async getSubscriptionStatus(userId: string): Promise<{
    status: 'free' | 'premium';
    platform?: string;
    productId?: string;
    expiresAt?: string;
  }> {
    if (!this.supabase || !userId) {
      return { status: 'free' };
    }

    try {
      const { data, error } = await this.supabase
        .from('users')
        .select('subscription_status, subscription_platform, subscription_product_id, subscription_expires_at')
        .eq('id', userId)
        .single();

      if (error || !data) return { status: 'free' };

      return {
        status: data.subscription_status || 'free',
        platform: data.subscription_platform || undefined,
        productId: data.subscription_product_id || undefined,
        expiresAt: data.subscription_expires_at || undefined,
      };
    } catch (error) {
      console.error('[SubscriptionService] Error getting status:', error);
      return { status: 'free' };
    }
  }

  /**
   * Update subscription status in database
   */
  async updateSubscriptionStatus(
    userId: string,
    status: 'free' | 'premium',
    platform?: 'ios' | 'android',
    productId?: string,
    expiresAt?: string,
    originalTransactionId?: string
  ): Promise<boolean> {
    if (!this.supabase || !userId) return false;

    try {
      const { error } = await this.supabase
        .from('users')
        .update({
          subscription_status: status,
          subscription_platform: platform || null,
          subscription_product_id: productId || null,
          subscription_expires_at: expiresAt || null,
          subscription_original_transaction_id: originalTransactionId || null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', userId);

      if (error) {
        console.error('[SubscriptionService] Error updating status:', error);
        return false;
      }

      console.log(`[SubscriptionService] Updated ${userId} to ${status}`);
      return true;
    } catch (error) {
      console.error('[SubscriptionService] Error updating status:', error);
      return false;
    }
  }

  /**
   * Verify iOS receipt via App Store Server API
   * For now, trusts client-reported receipt and stores it.
   * TODO: Implement full server-to-server verification with Apple when APPLE_SHARED_SECRET is configured.
   */
  async verifyAppleReceipt(
    userId: string,
    receiptData: string,
    productId: string
  ): Promise<{ valid: boolean; expiresAt?: string }> {
    // When APPLE_SHARED_SECRET is set, do full verification
    if (env.APPLE_SHARED_SECRET) {
      // TODO: Call Apple's verifyReceipt endpoint
      // For now, trust and store
    }

    // Calculate expiry based on product
    const expiresAt = this.calculateExpiry(productId);

    const updated = await this.updateSubscriptionStatus(
      userId,
      'premium',
      'ios',
      productId,
      expiresAt,
      receiptData.substring(0, 100) // Store partial receipt as transaction ref
    );

    return { valid: updated, expiresAt };
  }

  /**
   * Verify Android purchase via Google Play Developer API
   * For now, trusts client-reported purchase and stores it.
   * TODO: Implement full server-to-server verification with Google when GOOGLE_PLAY_SERVICE_ACCOUNT_KEY is configured.
   */
  async verifyGooglePurchase(
    userId: string,
    purchaseToken: string,
    productId: string
  ): Promise<{ valid: boolean; expiresAt?: string }> {
    // When GOOGLE_PLAY_SERVICE_ACCOUNT_KEY is set, do full verification
    if (env.GOOGLE_PLAY_SERVICE_ACCOUNT_KEY) {
      // TODO: Call Google Play Developer API
      // For now, trust and store
    }

    const expiresAt = this.calculateExpiry(productId);

    const updated = await this.updateSubscriptionStatus(
      userId,
      'premium',
      'android',
      productId,
      expiresAt,
      purchaseToken.substring(0, 100)
    );

    return { valid: updated, expiresAt };
  }

  /**
   * Calculate subscription expiry from product ID
   */
  private calculateExpiry(productId: string): string {
    const now = new Date();
    if (productId.includes('yearly')) {
      now.setFullYear(now.getFullYear() + 1);
    } else {
      now.setMonth(now.getMonth() + 1);
    }
    return now.toISOString();
  }
}

// Singleton instance
export const subscriptionService = new SubscriptionService();
