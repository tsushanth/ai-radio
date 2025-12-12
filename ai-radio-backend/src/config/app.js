/**
 * Application Configuration
 * General application settings
 */

// TODO: Load from environment variables
// TODO: Add environment-specific configurations
// TODO: Add feature flags

module.exports = {
  env: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  host: process.env.HOST || '0.0.0.0',

  cors: {
    origin: process.env.CORS_ORIGIN || '*',
    credentials: true,
    // TODO: Add CORS configuration
  },

  jwt: {
    secret: process.env.JWT_SECRET || '',
    expiresIn: process.env.JWT_EXPIRES_IN || '7d',
    // TODO: Add JWT configuration
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
    // TODO: Add logging configuration
  },

  podcast: {
    maxDuration: 600, // 10 minutes in seconds
    defaultVoice: 'professional',
    includeMusic: true,
    // TODO: Add podcast generation defaults
  },

  // TODO: Add feature flags
  features: {
    emailIntegration: true,
    calendarIntegration: true,
    customVoices: false,
  },
};
