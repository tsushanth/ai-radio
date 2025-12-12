/**
 * Rate Limiter Middleware
 * Rate limiting for API endpoints
 */

import rateLimit from 'express-rate-limit';
import { env } from '../config/environment';

/**
 * General API Rate Limiter
 * Applied to all /api routes
 */
export const apiLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.RATE_LIMIT_MAX_REQUESTS,
  message: {
    error: {
      status: 'error',
      message: 'Too many requests from this IP, please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Skip rate limiting for health checks
  skip: (req) => {
    return req.path === '/health' || req.path === '/';
  },
});

/**
 * Podcast Generation Rate Limiter
 * More restrictive limits for resource-intensive operations
 */
export const podcastLimiter = rateLimit({
  windowMs: env.RATE_LIMIT_WINDOW_MS,
  max: env.PODCAST_RATE_LIMIT_MAX,
  message: {
    error: {
      status: 'error',
      message: 'Too many podcast generation requests. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Use user ID from auth if available, otherwise IP
  keyGenerator: (req) => {
    return (req as any).user?.id || req.ip || 'unknown';
  },
});

/**
 * Authentication Rate Limiter
 * Stricter limits for authentication endpoints
 */
export const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 requests per window
  message: {
    error: {
      status: 'error',
      message: 'Too many authentication attempts. Please try again later.',
    },
  },
  standardHeaders: true,
  legacyHeaders: false,
});
