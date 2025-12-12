/**
 * OAuth Utilities
 * Helper functions for OAuth flow security and state management
 */

import crypto from 'crypto';

/**
 * Generate a cryptographically secure random state parameter
 * Used to prevent CSRF attacks in OAuth flow
 */
export function generateState(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Generate code verifier for PKCE (Proof Key for Code Exchange)
 * Future enhancement for additional security
 */
export function generateCodeVerifier(): string {
  return crypto
    .randomBytes(32)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Generate code challenge from verifier for PKCE
 */
export function generateCodeChallenge(verifier: string): string {
  return crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * State storage interface
 * For production, use Redis or database
 */
interface StateData {
  userId?: string;
  redirectUrl?: string;
  metadata?: Record<string, any>;
  createdAt: number;
}

class StateManager {
  private states: Map<string, StateData>;
  private readonly TTL = 10 * 60 * 1000; // 10 minutes

  constructor() {
    this.states = new Map();

    // Clean up expired states every minute
    setInterval(() => this.cleanupExpiredStates(), 60 * 1000);
  }

  /**
   * Store state with associated data
   */
  store(state: string, data: Omit<StateData, 'createdAt'>): void {
    this.states.set(state, {
      ...data,
      createdAt: Date.now(),
    });
  }

  /**
   * Retrieve and remove state
   * State can only be used once
   */
  retrieve(state: string): StateData | null {
    const data = this.states.get(state);
    if (!data) {
      return null;
    }

    // Check if expired
    if (Date.now() - data.createdAt > this.TTL) {
      this.states.delete(state);
      return null;
    }

    // Remove state (one-time use)
    this.states.delete(state);
    return data;
  }

  /**
   * Validate state exists and is not expired
   */
  validate(state: string): boolean {
    const data = this.states.get(state);
    if (!data) {
      return false;
    }

    if (Date.now() - data.createdAt > this.TTL) {
      this.states.delete(state);
      return false;
    }

    return true;
  }

  /**
   * Clean up expired states
   */
  private cleanupExpiredStates(): void {
    const now = Date.now();
    for (const [state, data] of this.states.entries()) {
      if (now - data.createdAt > this.TTL) {
        this.states.delete(state);
      }
    }
  }

  /**
   * Get number of stored states (for monitoring)
   */
  size(): number {
    return this.states.size;
  }
}

// Export singleton instance
export const stateManager = new StateManager();

/**
 * OAuth error codes and descriptions
 */
export const OAuthErrorCodes = {
  INVALID_STATE: {
    code: 'invalid_state',
    message: 'Invalid or expired state parameter',
    statusCode: 400,
  },
  AUTHORIZATION_DENIED: {
    code: 'access_denied',
    message: 'User denied authorization',
    statusCode: 403,
  },
  INVALID_CODE: {
    code: 'invalid_code',
    message: 'Invalid authorization code',
    statusCode: 400,
  },
  TOKEN_EXPIRED: {
    code: 'token_expired',
    message: 'OAuth token has expired',
    statusCode: 401,
  },
  TOKEN_REVOKED: {
    code: 'token_revoked',
    message: 'OAuth token has been revoked',
    statusCode: 401,
  },
  PROVIDER_ERROR: {
    code: 'provider_error',
    message: 'OAuth provider returned an error',
    statusCode: 502,
  },
  MISSING_REFRESH_TOKEN: {
    code: 'missing_refresh_token',
    message: 'No refresh token available',
    statusCode: 400,
  },
} as const;

/**
 * Create OAuth error response
 */
export function createOAuthErrorResponse(
  errorCode: keyof typeof OAuthErrorCodes,
  details?: string
) {
  const error = OAuthErrorCodes[errorCode];
  return {
    error: error.code,
    error_description: details || error.message,
    statusCode: error.statusCode,
  };
}

/**
 * Parse OAuth callback error
 */
export function parseOAuthCallbackError(error: string, description?: string): {
  code: string;
  message: string;
  statusCode: number;
} {
  // Map provider error codes to our error codes
  const errorMap: Record<string, keyof typeof OAuthErrorCodes> = {
    access_denied: 'AUTHORIZATION_DENIED',
    invalid_grant: 'INVALID_CODE',
    invalid_request: 'INVALID_CODE',
  };

  const mappedError = errorMap[error] || 'PROVIDER_ERROR';
  const errorInfo = OAuthErrorCodes[mappedError];

  return {
    code: errorInfo.code,
    message: description || errorInfo.message,
    statusCode: errorInfo.statusCode,
  };
}

/**
 * Validate redirect URL
 * Ensures redirect URL is safe and matches allowed domains
 */
export function validateRedirectUrl(url: string, allowedDomains: string[]): boolean {
  try {
    const parsed = new URL(url);

    // Check protocol
    if (!['http:', 'https:'].includes(parsed.protocol)) {
      return false;
    }

    // Check domain
    const domain = parsed.hostname;
    return allowedDomains.some(
      allowed => domain === allowed || domain.endsWith(`.${allowed}`)
    );
  } catch {
    return false;
  }
}

/**
 * Build OAuth callback URL with parameters
 */
export function buildCallbackUrl(
  baseUrl: string,
  params: Record<string, string>
): string {
  const url = new URL(baseUrl);
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return url.toString();
}

/**
 * Extract error from OAuth callback
 */
export function extractOAuthError(query: Record<string, any>): {
  hasError: boolean;
  error?: string;
  description?: string;
} {
  if (query.error) {
    return {
      hasError: true,
      error: query.error,
      description: query.error_description,
    };
  }
  return { hasError: false };
}

/**
 * Retry logic for OAuth operations
 */
export async function retryOAuthOperation<T>(
  operation: () => Promise<T>,
  maxRetries: number = 3,
  delayMs: number = 1000
): Promise<T> {
  let lastError: Error | undefined;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await operation();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Don't retry on client errors (4xx)
      if ('statusCode' in lastError && typeof lastError.statusCode === 'number') {
        const statusCode = lastError.statusCode;
        if (statusCode >= 400 && statusCode < 500) {
          throw lastError;
        }
      }

      // Wait before retry (exponential backoff)
      if (attempt < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, delayMs * Math.pow(2, attempt - 1)));
      }
    }
  }

  throw lastError || new Error('OAuth operation failed after retries');
}

/**
 * Log OAuth event (for monitoring and debugging)
 */
export function logOAuthEvent(
  event: 'auth_start' | 'auth_success' | 'auth_error' | 'token_refresh' | 'token_revoke',
  data: {
    provider: 'google' | 'microsoft';
    userId?: string;
    error?: string;
    metadata?: Record<string, any>;
  }
): void {
  const logEntry = {
    timestamp: new Date().toISOString(),
    event,
    ...data,
  };

  // TODO: Send to proper logging service (e.g., Cloud Logging)
  console.log('[OAuth Event]', JSON.stringify(logEntry));
}

/**
 * Mask sensitive token data for logging
 */
export function maskToken(token: string): string {
  if (token.length <= 8) {
    return '***';
  }
  return `${token.substring(0, 4)}...${token.substring(token.length - 4)}`;
}

export default {
  generateState,
  generateCodeVerifier,
  generateCodeChallenge,
  stateManager,
  OAuthErrorCodes,
  createOAuthErrorResponse,
  parseOAuthCallbackError,
  validateRedirectUrl,
  buildCallbackUrl,
  extractOAuthError,
  retryOAuthOperation,
  logOAuthEvent,
  maskToken,
};
