/**
 * Podcast Generation Error Types
 * Specific error types to help the UI display appropriate messages and actions
 */

export enum PodcastErrorCode {
  // Authentication errors - require user action
  TOKEN_EXPIRED = 'TOKEN_EXPIRED',
  TOKEN_REVOKED = 'TOKEN_REVOKED',
  TOKEN_INVALID = 'TOKEN_INVALID',
  REAUTH_REQUIRED = 'REAUTH_REQUIRED',

  // Content errors - can be handled gracefully
  NO_EMAILS = 'NO_EMAILS',
  INSUFFICIENT_CONTENT = 'INSUFFICIENT_CONTENT',

  // AI/Generation errors - can retry
  SCRIPT_GENERATION_FAILED = 'SCRIPT_GENERATION_FAILED',
  INVALID_SCRIPT_FORMAT = 'INVALID_SCRIPT_FORMAT',
  TTS_FAILED = 'TTS_FAILED',

  // System errors - internal issues
  STORAGE_ERROR = 'STORAGE_ERROR',
  DATABASE_ERROR = 'DATABASE_ERROR',
  UNKNOWN_ERROR = 'UNKNOWN_ERROR',
}

export interface PodcastError extends Error {
  code: PodcastErrorCode;
  statusCode: number;
  userMessage: string;  // User-friendly message to display
  action?: PodcastErrorAction;  // Suggested action for the UI
  retryable: boolean;
  details?: Record<string, any>;
}

export enum PodcastErrorAction {
  RELINK_GMAIL = 'RELINK_GMAIL',
  RELINK_OUTLOOK = 'RELINK_OUTLOOK',
  RETRY = 'RETRY',
  CONTACT_SUPPORT = 'CONTACT_SUPPORT',
  NONE = 'NONE',
}

/**
 * Create a PodcastError with appropriate metadata
 */
export function createPodcastError(
  code: PodcastErrorCode,
  originalError?: Error
): PodcastError {
  const errorConfig = ERROR_CONFIGS[code];

  const error = new Error(errorConfig.message) as PodcastError;
  error.code = code;
  error.statusCode = errorConfig.statusCode;
  error.userMessage = errorConfig.userMessage;
  error.action = errorConfig.action;
  error.retryable = errorConfig.retryable;

  if (originalError) {
    error.details = {
      originalMessage: originalError.message,
      stack: originalError.stack,
    };
  }

  return error;
}

/**
 * Check if an error indicates token expiry or authentication issues
 */
export function isAuthError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();

  // Check for common OAuth error patterns
  const authErrorPatterns = [
    'token',
    'expired',
    'invalid_grant',
    'unauthorized',
    '401',
    'unauthenticated',
    'revoked',
    'invalid credentials',
    'access denied',
    'authentication',
    'no gmail authentication',
    'no outlook authentication',
    'failed to refresh',
  ];

  return authErrorPatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Check if an error indicates insufficient content
 */
export function isContentError(error: Error): boolean {
  const errorMessage = error.message.toLowerCase();

  const contentErrorPatterns = [
    'no emails',
    'no content',
    'insufficient',
    'empty',
    'no segments',
  ];

  return contentErrorPatterns.some(pattern => errorMessage.includes(pattern));
}

/**
 * Classify an error into a PodcastErrorCode
 */
export function classifyError(error: Error): PodcastErrorCode {
  const message = error.message.toLowerCase();

  // Authentication errors
  if (message.includes('expired') || message.includes('invalid_grant')) {
    return PodcastErrorCode.TOKEN_EXPIRED;
  }
  if (message.includes('revoked')) {
    return PodcastErrorCode.TOKEN_REVOKED;
  }
  if (message.includes('unauthorized_client')) {
    // OAuth client configuration error or token was invalidated
    return PodcastErrorCode.REAUTH_REQUIRED;
  }
  if (message.includes('invalid credentials')) {
    // Google API returns "Invalid Credentials" when access token is invalid/expired
    return PodcastErrorCode.TOKEN_INVALID;
  }
  if (message.includes('unauthorized') || message.includes('401') || message.includes('unauthenticated')) {
    return PodcastErrorCode.TOKEN_INVALID;
  }
  if (message.includes('no gmail authentication') || message.includes('no outlook authentication') ||
      message.includes('authentication') || message.includes('failed to refresh')) {
    return PodcastErrorCode.REAUTH_REQUIRED;
  }

  // Content errors
  if (message.includes('no emails') || message.includes('empty inbox')) {
    return PodcastErrorCode.NO_EMAILS;
  }
  if (message.includes('insufficient') || message.includes('no content') || message.includes('no segments')) {
    return PodcastErrorCode.INSUFFICIENT_CONTENT;
  }

  // AI/Generation errors
  if (message.includes('gpt') || message.includes('openai') || message.includes('script')) {
    return PodcastErrorCode.SCRIPT_GENERATION_FAILED;
  }
  if (message.includes('invalid') && message.includes('format')) {
    return PodcastErrorCode.INVALID_SCRIPT_FORMAT;
  }
  if (message.includes('tts') || message.includes('audio') || message.includes('speech')) {
    return PodcastErrorCode.TTS_FAILED;
  }

  // System errors
  if (message.includes('storage') || message.includes('upload')) {
    return PodcastErrorCode.STORAGE_ERROR;
  }
  if (message.includes('database') || message.includes('supabase')) {
    return PodcastErrorCode.DATABASE_ERROR;
  }

  return PodcastErrorCode.UNKNOWN_ERROR;
}

/**
 * Error configuration mapping
 */
const ERROR_CONFIGS: Record<PodcastErrorCode, {
  message: string;
  userMessage: string;
  statusCode: number;
  action: PodcastErrorAction;
  retryable: boolean;
}> = {
  [PodcastErrorCode.TOKEN_EXPIRED]: {
    message: 'OAuth token has expired',
    userMessage: 'Your email account connection has expired. Please reconnect your account.',
    statusCode: 401,
    action: PodcastErrorAction.RELINK_GMAIL,
    retryable: false,
  },
  [PodcastErrorCode.TOKEN_REVOKED]: {
    message: 'OAuth token was revoked',
    userMessage: 'Your email account access was revoked. Please reconnect your account.',
    statusCode: 401,
    action: PodcastErrorAction.RELINK_GMAIL,
    retryable: false,
  },
  [PodcastErrorCode.TOKEN_INVALID]: {
    message: 'OAuth token is invalid',
    userMessage: 'There was an issue with your email account connection. Please reconnect.',
    statusCode: 401,
    action: PodcastErrorAction.RELINK_GMAIL,
    retryable: false,
  },
  [PodcastErrorCode.REAUTH_REQUIRED]: {
    message: 'Re-authentication required',
    userMessage: 'Please reconnect your email account to continue generating podcasts.',
    statusCode: 401,
    action: PodcastErrorAction.RELINK_GMAIL,
    retryable: false,
  },
  [PodcastErrorCode.NO_EMAILS]: {
    message: 'No emails found',
    userMessage: 'No emails found to create a podcast. Check back when you have new emails!',
    statusCode: 200, // Not an error from user perspective
    action: PodcastErrorAction.NONE,
    retryable: false,
  },
  [PodcastErrorCode.INSUFFICIENT_CONTENT]: {
    message: 'Insufficient content for podcast',
    userMessage: 'Not enough content to create a meaningful podcast. Try again later when you have more emails.',
    statusCode: 200,
    action: PodcastErrorAction.NONE,
    retryable: false,
  },
  [PodcastErrorCode.SCRIPT_GENERATION_FAILED]: {
    message: 'Script generation failed',
    userMessage: 'We had trouble creating your podcast script. Please try again.',
    statusCode: 500,
    action: PodcastErrorAction.RETRY,
    retryable: true,
  },
  [PodcastErrorCode.INVALID_SCRIPT_FORMAT]: {
    message: 'Invalid script format',
    userMessage: 'There was an issue with the podcast script. Please try again.',
    statusCode: 500,
    action: PodcastErrorAction.RETRY,
    retryable: true,
  },
  [PodcastErrorCode.TTS_FAILED]: {
    message: 'Text-to-speech failed',
    userMessage: 'We had trouble generating the audio. Please try again.',
    statusCode: 500,
    action: PodcastErrorAction.RETRY,
    retryable: true,
  },
  [PodcastErrorCode.STORAGE_ERROR]: {
    message: 'Storage error',
    userMessage: 'We had trouble saving your podcast. Please try again.',
    statusCode: 500,
    action: PodcastErrorAction.RETRY,
    retryable: true,
  },
  [PodcastErrorCode.DATABASE_ERROR]: {
    message: 'Database error',
    userMessage: 'A system error occurred. Please try again.',
    statusCode: 500,
    action: PodcastErrorAction.RETRY,
    retryable: true,
  },
  [PodcastErrorCode.UNKNOWN_ERROR]: {
    message: 'Unknown error',
    userMessage: 'Something went wrong. Please try again or contact support if the issue persists.',
    statusCode: 500,
    action: PodcastErrorAction.CONTACT_SUPPORT,
    retryable: true,
  },
};
