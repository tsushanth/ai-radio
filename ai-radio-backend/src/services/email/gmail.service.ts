/**
 * Gmail Service
 * Fetches and parses emails from Gmail using the Gmail API
 */

import { google, gmail_v1 } from 'googleapis';
import type { GaxiosResponse } from 'gaxios';
import { gmailAuthService } from '../auth/gmail.auth';
import { tokenManager } from '../auth/token.manager';
import type { EmailMessage, EmailFetchOptions } from '../../types/email';

export class GmailService {
  private readonly BATCH_SIZE = 50; // Gmail API allows max 500, but we'll batch smaller
  private readonly MAX_RESULTS = 100; // Maximum emails to fetch in one request
  private readonly RATE_LIMIT_DELAY = 100; // ms between API calls to respect rate limits

  /**
   * Fetch recent emails for a user
   */
  async fetchEmails(userId: string, options: EmailFetchOptions): Promise<EmailMessage[]> {
    try {
      // Get valid access token (auto-refreshes if needed)
      const token = await tokenManager.getToken(userId, 'google');
      if (!token) {
        throw new Error('No Gmail authentication found for user');
      }

      // Create authenticated Gmail client
      const auth = gmailAuthService.getAuthenticatedClient(
        token.accessToken,
        token.refreshToken
      );
      const gmail = google.gmail({ version: 'v1', auth });

      // Build query parameters
      const query = this.buildQuery(options);

      // Fetch message IDs
      const messageIds = await this.fetchMessageIds(gmail, query, options.max_results);

      if (messageIds.length === 0) {
        return [];
      }

      // Fetch full message details in batches
      const messages = await this.fetchMessageDetails(gmail, messageIds);

      // Parse messages to our standard format
      const parsedMessages = messages
        .map(msg => this.parseGmailMessage(msg))
        .filter((msg): msg is EmailMessage => msg !== null);

      // Filter out unimportant messages if needed
      const filteredMessages = this.filterMessages(parsedMessages, options);

      // Sort by received date (newest first)
      filteredMessages.sort((a, b) =>
        new Date(b.received_at).getTime() - new Date(a.received_at).getTime()
      );

      return filteredMessages;
    } catch (error) {
      console.error('Failed to fetch Gmail emails:', error);
      throw this.createError('Failed to fetch emails from Gmail', error);
    }
  }

  /**
   * Build Gmail query string from options
   */
  private buildQuery(options: EmailFetchOptions): string {
    const queryParts: string[] = [];

    // Time range filter
    if (options.since_hours) {
      const sinceDate = new Date();
      sinceDate.setHours(sinceDate.getHours() - options.since_hours);
      const timestamp = Math.floor(sinceDate.getTime() / 1000);
      queryParts.push(`after:${timestamp}`);
    }

    // Label filters (include)
    if (options.labels && options.labels.length > 0) {
      const labelQueries = options.labels.map(label => {
        // Handle special Gmail labels
        const labelMap: Record<string, string> = {
          'inbox': 'in:inbox',
          'important': 'is:important',
          'starred': 'is:starred',
          'unread': 'is:unread',
        };
        return labelMap[label.toLowerCase()] || `label:${label}`;
      });
      queryParts.push(`(${labelQueries.join(' OR ')})`);
    } else {
      // Default to inbox
      queryParts.push('in:inbox');
    }

    // Exclude categories (Gmail's automatic categorization)
    if (options.exclude_categories && options.exclude_categories.length > 0) {
      options.exclude_categories.forEach(category => {
        queryParts.push(`-category:${category}`);
      });
    } else {
      // Default exclusions
      queryParts.push('-category:promotions');
      queryParts.push('-category:social');
      queryParts.push('-category:updates');
    }

    // Exclude spam and trash
    queryParts.push('-in:spam');
    queryParts.push('-in:trash');

    return queryParts.join(' ');
  }

  /**
   * Fetch message IDs from Gmail
   */
  private async fetchMessageIds(
    gmail: gmail_v1.Gmail,
    query: string,
    maxResults: number
  ): Promise<string[]> {
    try {
      const response = await gmail.users.messages.list({
        userId: 'me',
        q: query,
        maxResults: Math.min(maxResults, this.MAX_RESULTS),
      });

      return response.data.messages?.map(msg => msg.id!).filter(Boolean) || [];
    } catch (error) {
      throw this.createError('Failed to fetch message IDs', error);
    }
  }

  /**
   * Fetch full message details in batches
   */
  private async fetchMessageDetails(
    gmail: gmail_v1.Gmail,
    messageIds: string[]
  ): Promise<gmail_v1.Schema$Message[]> {
    const messages: gmail_v1.Schema$Message[] = [];

    // Process in batches to respect rate limits
    for (let i = 0; i < messageIds.length; i += this.BATCH_SIZE) {
      const batch = messageIds.slice(i, i + this.BATCH_SIZE);

      // Fetch messages in parallel within batch
      const batchPromises = batch.map(id =>
        this.fetchSingleMessage(gmail, id)
      );

      const batchMessages = await Promise.all(batchPromises);
      messages.push(...batchMessages.filter((msg): msg is gmail_v1.Schema$Message => msg !== null));

      // Rate limiting delay between batches
      if (i + this.BATCH_SIZE < messageIds.length) {
        await this.delay(this.RATE_LIMIT_DELAY);
      }
    }

    return messages;
  }

  /**
   * Fetch a single message with error handling
   */
  private async fetchSingleMessage(
    gmail: gmail_v1.Gmail,
    messageId: string
  ): Promise<gmail_v1.Schema$Message | null> {
    try {
      const response = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full', // Get full message including headers and body
      });

      return response.data;
    } catch (error) {
      console.error(`Failed to fetch message ${messageId}:`, error);
      return null; // Skip failed messages instead of failing entire request
    }
  }

  /**
   * Parse Gmail message to our standard EmailMessage format
   */
  private parseGmailMessage(message: gmail_v1.Schema$Message): EmailMessage | null {
    try {
      if (!message.id || !message.payload) {
        return null;
      }

      const headers = message.payload.headers || [];
      const getHeader = (name: string): string => {
        const header = headers.find(h => h.name?.toLowerCase() === name.toLowerCase());
        return header?.value || '';
      };

      // Extract basic info
      const from = getHeader('From');
      const subject = getHeader('Subject');
      const date = getHeader('Date');
      const snippet = message.snippet || '';

      // Extract body preview
      const bodyPreview = this.extractBodyPreview(message.payload);

      // Determine importance
      const isImportant = this.isMessageImportant(message, headers);

      // Extract labels
      const labels = message.labelIds || [];

      // Parse received date
      const receivedAt = date ? new Date(date).toISOString() : new Date().toISOString();

      return {
        id: message.id,
        from: this.parseEmailAddress(from),
        subject: subject || '(No Subject)',
        snippet,
        body_preview: bodyPreview,
        received_at: receivedAt,
        is_important: isImportant,
        labels,
        source: 'gmail',
      };
    } catch (error) {
      console.error('Failed to parse message:', error);
      return null;
    }
  }

  /**
   * Extract body preview from message payload
   */
  private extractBodyPreview(payload: gmail_v1.Schema$MessagePart): string {
    try {
      // Try to get plain text body
      let bodyData: string | undefined;

      if (payload.body?.data) {
        bodyData = payload.body.data;
      } else if (payload.parts) {
        // Recursively search for text/plain part
        const textPart = this.findPartByMimeType(payload.parts, 'text/plain');
        if (textPart?.body?.data) {
          bodyData = textPart.body.data;
        } else {
          // Fallback to text/html
          const htmlPart = this.findPartByMimeType(payload.parts, 'text/html');
          if (htmlPart?.body?.data) {
            bodyData = htmlPart.body.data;
          }
        }
      }

      if (!bodyData) {
        return '';
      }

      // Decode base64url
      const decodedBody = Buffer.from(bodyData, 'base64').toString('utf-8');

      // Clean up HTML if present
      const cleanedBody = this.stripHtml(decodedBody);

      // Limit to first 500 characters
      return cleanedBody.substring(0, 500).trim();
    } catch (error) {
      console.error('Failed to extract body preview:', error);
      return '';
    }
  }

  /**
   * Find message part by MIME type
   */
  private findPartByMimeType(
    parts: gmail_v1.Schema$MessagePart[],
    mimeType: string
  ): gmail_v1.Schema$MessagePart | undefined {
    for (const part of parts) {
      if (part.mimeType === mimeType) {
        return part;
      }
      if (part.parts) {
        const found = this.findPartByMimeType(part.parts, mimeType);
        if (found) return found;
      }
    }
    return undefined;
  }

  /**
   * Strip HTML tags from text
   */
  private stripHtml(html: string): string {
    return html
      .replace(/<style[^>]*>.*?<\/style>/gi, '')
      .replace(/<script[^>]*>.*?<\/script>/gi, '')
      .replace(/<[^>]+>/g, '')
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, ' ')
      .trim();
  }

  /**
   * Parse email address to extract just the address
   */
  private parseEmailAddress(from: string): string {
    // Extract email from formats like "Name <email@example.com>"
    const match = from.match(/<(.+?)>/);
    if (match) {
      return match[1];
    }
    return from.trim();
  }

  /**
   * Determine if a message is important
   */
  private isMessageImportant(
    message: gmail_v1.Schema$Message,
    headers: gmail_v1.Schema$MessagePartHeader[]
  ): boolean {
    const labels = message.labelIds || [];

    // Check Gmail's important label
    if (labels.includes('IMPORTANT')) {
      return true;
    }

    // Check if starred
    if (labels.includes('STARRED')) {
      return true;
    }

    // Check if in priority inbox
    if (labels.includes('CATEGORY_PERSONAL')) {
      return true;
    }

    // Check importance header
    const importance = headers.find(h =>
      h.name?.toLowerCase() === 'importance' ||
      h.name?.toLowerCase() === 'x-priority'
    );
    if (importance?.value?.toLowerCase() === 'high') {
      return true;
    }

    return false;
  }

  /**
   * Filter messages based on options
   */
  private filterMessages(
    messages: EmailMessage[],
    options: EmailFetchOptions
  ): EmailMessage[] {
    return messages.filter(msg => {
      // Filter by importance if needed
      // For now, we keep all messages but mark importance

      // Could add additional filters here:
      // - Exclude automated emails
      // - Exclude newsletters
      // - Only include from specific domains

      return true;
    });
  }

  /**
   * Get unread count
   */
  async getUnreadCount(userId: string): Promise<number> {
    try {
      const token = await tokenManager.getToken(userId, 'google');
      if (!token) {
        return 0;
      }

      const auth = gmailAuthService.getAuthenticatedClient(
        token.accessToken,
        token.refreshToken
      );
      const gmail = google.gmail({ version: 'v1', auth });

      const response = await gmail.users.messages.list({
        userId: 'me',
        q: 'is:unread in:inbox -category:promotions -category:social',
        maxResults: 1,
      });

      return response.data.resultSizeEstimate || 0;
    } catch (error) {
      console.error('Failed to get unread count:', error);
      return 0;
    }
  }

  /**
   * Mark message as read
   */
  async markAsRead(userId: string, messageId: string): Promise<void> {
    try {
      const token = await tokenManager.getToken(userId, 'google');
      if (!token) {
        throw new Error('No Gmail authentication found');
      }

      const auth = gmailAuthService.getAuthenticatedClient(
        token.accessToken,
        token.refreshToken
      );
      const gmail = google.gmail({ version: 'v1', auth });

      await gmail.users.messages.modify({
        userId: 'me',
        id: messageId,
        requestBody: {
          removeLabelIds: ['UNREAD'],
        },
      });
    } catch (error) {
      throw this.createError('Failed to mark message as read', error);
    }
  }

  /**
   * Get user's Gmail labels
   */
  async getLabels(userId: string): Promise<Array<{ id: string; name: string }>> {
    try {
      const token = await tokenManager.getToken(userId, 'google');
      if (!token) {
        return [];
      }

      const auth = gmailAuthService.getAuthenticatedClient(
        token.accessToken,
        token.refreshToken
      );
      const gmail = google.gmail({ version: 'v1', auth });

      const response = await gmail.users.labels.list({
        userId: 'me',
      });

      return response.data.labels?.map(label => ({
        id: label.id || '',
        name: label.name || '',
      })) || [];
    } catch (error) {
      console.error('Failed to get labels:', error);
      return [];
    }
  }

  /**
   * Search emails with custom query
   */
  async searchEmails(
    userId: string,
    query: string,
    maxResults: number = 50
  ): Promise<EmailMessage[]> {
    try {
      const token = await tokenManager.getToken(userId, 'google');
      if (!token) {
        return [];
      }

      const auth = gmailAuthService.getAuthenticatedClient(
        token.accessToken,
        token.refreshToken
      );
      const gmail = google.gmail({ version: 'v1', auth });

      const messageIds = await this.fetchMessageIds(gmail, query, maxResults);
      const messages = await this.fetchMessageDetails(gmail, messageIds);

      return messages
        .map(msg => this.parseGmailMessage(msg))
        .filter((msg): msg is EmailMessage => msg !== null);
    } catch (error) {
      throw this.createError('Failed to search emails', error);
    }
  }

  /**
   * Delay helper for rate limiting
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create standardized error
   */
  private createError(message: string, originalError?: unknown): Error {
    const error = new Error(message);

    if (originalError instanceof Error) {
      error.message = `${message}: ${originalError.message}`;
      error.stack = originalError.stack;
    }

    return error;
  }
}

// Export singleton instance
export const gmailService = new GmailService();

// Export class for testing
export default GmailService;
