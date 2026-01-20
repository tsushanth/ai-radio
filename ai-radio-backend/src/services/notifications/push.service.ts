/**
 * Push Notification Service
 * Sends push notifications via APNs (iOS) and FCM (Android)
 */

import { env } from '../../config/environment';

interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
  sound?: string;
  badge?: number;
  category?: string;
}

interface SendResult {
  success: boolean;
  successCount: number;
  failureCount: number;
  errors?: string[];
}

export class PushNotificationService {
  private fcmServerKey: string | null;
  private apnsKeyId: string | null;
  private apnsTeamId: string | null;
  private apnsPrivateKey: string | null;
  private apnsBundleId: string;

  constructor() {
    // Firebase Cloud Messaging (Android)
    this.fcmServerKey = env.FCM_SERVER_KEY || null;

    // Apple Push Notification service (iOS)
    this.apnsKeyId = env.APNS_KEY_ID || null;
    this.apnsTeamId = env.APNS_TEAM_ID || null;
    this.apnsPrivateKey = env.APNS_PRIVATE_KEY || null;
    this.apnsBundleId = env.APNS_BUNDLE_ID || 'com.kreativekoala.briefcast';
  }

  /**
   * Send push notification to user's devices
   */
  async sendToUser(deviceTokens: string[], payload: PushPayload): Promise<SendResult> {
    if (!deviceTokens || deviceTokens.length === 0) {
      return { success: true, successCount: 0, failureCount: 0 };
    }

    const results = await Promise.allSettled(
      deviceTokens.map(token => this.sendToDevice(token, payload))
    );

    const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;
    const failureCount = results.length - successCount;
    const errors = results
      .filter((r): r is PromiseRejectedResult => r.status === 'rejected')
      .map(r => r.reason?.message || 'Unknown error');

    return {
      success: failureCount === 0,
      successCount,
      failureCount,
      errors: errors.length > 0 ? errors : undefined,
    };
  }

  /**
   * Send to a single device
   */
  private async sendToDevice(token: string, payload: PushPayload): Promise<boolean> {
    // Detect platform by token format
    // APNs tokens are 64 hex characters, FCM tokens are longer
    const isApns = /^[a-f0-9]{64}$/i.test(token);

    if (isApns) {
      return this.sendApns(token, payload);
    } else {
      return this.sendFcm(token, payload);
    }
  }

  /**
   * Send via Apple Push Notification service
   */
  private async sendApns(deviceToken: string, payload: PushPayload): Promise<boolean> {
    if (!this.apnsKeyId || !this.apnsTeamId || !this.apnsPrivateKey) {
      console.warn('[Push] APNs not configured, skipping iOS notification');
      return false;
    }

    try {
      // Generate JWT for APNs authentication
      const jwt = await this.generateApnsJwt();

      const apnsPayload = {
        aps: {
          alert: {
            title: payload.title,
            body: payload.body,
          },
          sound: payload.sound || 'default',
          badge: payload.badge,
          category: payload.category,
          'mutable-content': 1,
          'content-available': 1,
        },
        ...payload.data,
      };

      const isProduction = env.NODE_ENV === 'production';
      const apnsHost = isProduction
        ? 'api.push.apple.com'
        : 'api.sandbox.push.apple.com';

      const response = await fetch(
        `https://${apnsHost}/3/device/${deviceToken}`,
        {
          method: 'POST',
          headers: {
            'authorization': `bearer ${jwt}`,
            'apns-topic': this.apnsBundleId,
            'apns-push-type': 'alert',
            'apns-priority': '10',
            'apns-expiration': '0',
            'content-type': 'application/json',
          },
          body: JSON.stringify(apnsPayload),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('[Push] APNs error:', response.status, error);
        return false;
      }

      console.log('[Push] APNs notification sent successfully');
      return true;

    } catch (error) {
      console.error('[Push] APNs send error:', error);
      return false;
    }
  }

  /**
   * Send via Firebase Cloud Messaging
   */
  private async sendFcm(registrationToken: string, payload: PushPayload): Promise<boolean> {
    if (!this.fcmServerKey) {
      console.warn('[Push] FCM not configured, skipping Android notification');
      return false;
    }

    try {
      const fcmPayload = {
        to: registrationToken,
        notification: {
          title: payload.title,
          body: payload.body,
          sound: payload.sound || 'default',
          badge: payload.badge?.toString(),
        },
        data: payload.data || {},
        android: {
          priority: 'high',
          notification: {
            channel_id: 'daily_brief',
            sound: payload.sound || 'default',
          },
        },
      };

      const response = await fetch(
        'https://fcm.googleapis.com/fcm/send',
        {
          method: 'POST',
          headers: {
            'Authorization': `key=${this.fcmServerKey}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(fcmPayload),
        }
      );

      if (!response.ok) {
        const error = await response.json().catch(() => ({}));
        console.error('[Push] FCM error:', response.status, error);
        return false;
      }

      const result = await response.json();
      if (result.failure > 0) {
        console.error('[Push] FCM delivery failed:', result.results);
        return false;
      }

      console.log('[Push] FCM notification sent successfully');
      return true;

    } catch (error) {
      console.error('[Push] FCM send error:', error);
      return false;
    }
  }

  /**
   * Generate JWT for APNs authentication
   */
  private async generateApnsJwt(): Promise<string> {
    // In production, use a proper JWT library (jsonwebtoken)
    // For now, implement basic JWT generation
    const header = {
      alg: 'ES256',
      kid: this.apnsKeyId,
    };

    const payload = {
      iss: this.apnsTeamId,
      iat: Math.floor(Date.now() / 1000),
    };

    // Base64url encode
    const base64Header = Buffer.from(JSON.stringify(header)).toString('base64url');
    const base64Payload = Buffer.from(JSON.stringify(payload)).toString('base64url');

    // Sign with private key (ES256)
    const crypto = await import('crypto');
    const sign = crypto.createSign('SHA256');
    sign.update(`${base64Header}.${base64Payload}`);

    // Convert PEM private key
    const privateKey = this.apnsPrivateKey!.replace(/\\n/g, '\n');
    const signature = sign.sign(privateKey, 'base64url');

    return `${base64Header}.${base64Payload}.${signature}`;
  }

  /**
   * Register device token for a user
   */
  async registerDeviceToken(
    userId: string,
    deviceToken: string,
    platform: 'ios' | 'android'
  ): Promise<boolean> {
    // This would store the token in the database
    // Implementation depends on your database schema
    console.log(`[Push] Registering ${platform} device for user ${userId}`);

    // For now, just log - actual implementation would save to Supabase
    return true;
  }

  /**
   * Unregister device token
   */
  async unregisterDeviceToken(userId: string, deviceToken: string): Promise<boolean> {
    console.log(`[Push] Unregistering device for user ${userId}`);
    return true;
  }
}

// Export singleton
export const pushNotificationService = new PushNotificationService();
