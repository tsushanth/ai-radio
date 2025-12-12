/**
 * Rate Limiter Middleware
 * Implements rate limiting for API endpoints
 */

const rateLimit = require('express-rate-limit');

// TODO: Configure rate limiting rules
// TODO: Add different limits for different endpoints
// TODO: Implement user-based rate limiting
// TODO: Add Redis store for distributed rate limiting

/**
 * General API rate limiter
 */
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
  // TODO: Add custom handler
  // TODO: Add Redis store
});

/**
 * Podcast generation rate limiter (more strict)
 */
const podcastGenerationLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5, // Limit to 5 podcast generations per hour
  message: 'Too many podcast generation requests, please try again later.',
  // TODO: Add custom handler
  // TODO: Add user-based limiting
});

/**
 * Auth endpoints rate limiter
 */
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit login attempts
  message: 'Too many login attempts, please try again later.',
  // TODO: Add custom handler
});

module.exports = {
  apiLimiter,
  podcastGenerationLimiter,
  authLimiter,
};
