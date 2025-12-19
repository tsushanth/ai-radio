/**
 * Email Type Definitions
 * Types for email integration (Gmail & Outlook)
 */

export interface EmailMessage {
  id: string;
  from: string;
  subject: string;
  snippet: string;
  body_preview: string;
  received_at: string;
  is_important: boolean;
  is_unread: boolean;
  labels: string[];
  source: 'gmail' | 'outlook';
}

export interface EmailFetchOptions {
  max_results: number;
  since_hours: number;
  labels?: string[];
  exclude_categories?: string[];
  include_read?: boolean; // Include read emails (default: true for fallback scenarios)
}

// Gmail-specific types
export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  snippet: string;
  payload: GmailPayload;
  internalDate: string;
}

export interface GmailPayload {
  headers: GmailHeader[];
  body: {
    data?: string;
    size: number;
  };
  parts?: GmailPart[];
}

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPart {
  mimeType: string;
  body: {
    data?: string;
    size: number;
  };
}

// Outlook-specific types
export interface OutlookMessage {
  id: string;
  subject: string;
  from: {
    emailAddress: {
      name: string;
      address: string;
    };
  };
  receivedDateTime: string;
  bodyPreview: string;
  importance: 'low' | 'normal' | 'high';
  categories: string[];
  isRead: boolean;
}

// Email processing types
export interface ProcessedEmail {
  summary: string;
  priority: 'low' | 'medium' | 'high';
  category: string;
  action_required: boolean;
}

// TODO: Implement rate limiting for Gmail API (250 quota units/second)
// TODO: Implement throttling handling for Microsoft Graph API
// TODO: Add retry logic with exponential backoff for all API calls
// TODO: Implement token refresh logic when access tokens expire
