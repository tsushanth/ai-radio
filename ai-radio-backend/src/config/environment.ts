/**
 * Environment Configuration
 * Validates and exports environment variables using Zod
 */

import { z } from 'zod';

const envSchema = z.object({
  // Application
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.string().transform(Number).pipe(z.number().min(1).max(65535)).default('3000'),
  HOST: z.string().default('0.0.0.0'),

  // CORS
  CORS_ORIGIN: z.string().default('*'),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_EXPIRES_IN: z.string().default('7d'),

  // Supabase
  SUPABASE_URL: z.string().url('Invalid Supabase URL'),
  SUPABASE_ANON_KEY: z.string().optional(), // Optional - service key is sufficient for backend
  SUPABASE_SERVICE_KEY: z.string().min(1, 'Supabase service key is required'),
  SUPABASE_STORAGE_BUCKET: z.string().default('podcasts'),

  // Google OAuth & APIs
  GOOGLE_CLIENT_ID: z.string().min(1, 'Google client ID is required'),
  GOOGLE_CLIENT_SECRET: z.string().min(1, 'Google client secret is required'),
  GOOGLE_REDIRECT_URI: z.string().optional(), // Optional for backend-only operations
  GOOGLE_TTS_API_KEY: z.string().optional(),

  // Microsoft OAuth (optional - only needed for Outlook integration)
  MICROSOFT_CLIENT_ID: z.string().optional(),
  MICROSOFT_CLIENT_SECRET: z.string().optional(),
  MICROSOFT_REDIRECT_URI: z.string().optional(),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1, 'OpenAI API key is required').startsWith('sk-', 'Invalid OpenAI API key format'),
  OPENAI_ORG_ID: z.string().optional(),

  // Google Cloud Platform
  GCP_PROJECT_ID: z.string().optional(), // Optional - auto-detected in Cloud Run
  GCP_REGION: z.string().default('us-central1'),

  // TTS Provider
  TTS_PROVIDER: z.enum(['google', 'elevenlabs', 'aws']).default('google'),
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_VOICE_ID: z.string().optional(),

  // AWS (optional, for AWS Polly or S3)
  AWS_REGION: z.string().default('us-east-1'),
  AWS_ACCESS_KEY_ID: z.string().optional(),
  AWS_SECRET_ACCESS_KEY: z.string().optional(),
  S3_BUCKET: z.string().optional(),

  // Storage Provider
  STORAGE_PROVIDER: z.enum(['supabase', 'gcs', 's3']).default('supabase'),

  // Google Cloud Storage (optional)
  GCS_BUCKET: z.string().optional(),
  GCS_KEY_FILE: z.string().optional(),

  // Logging
  LOG_LEVEL: z.enum(['debug', 'info', 'warn', 'error']).default('info'),

  // Feature Flags
  ENABLE_EMAIL_INTEGRATION: z.string().transform(val => val === 'true').default('true'),
  ENABLE_CALENDAR_INTEGRATION: z.string().transform(val => val === 'true').default('true'),
  ENABLE_WEATHER: z.string().transform(val => val === 'true').default('false'),

  // Rate Limiting
  RATE_LIMIT_WINDOW_MS: z.string().transform(Number).default('900000'), // 15 minutes
  RATE_LIMIT_MAX_REQUESTS: z.string().transform(Number).default('100'),
  PODCAST_RATE_LIMIT_MAX: z.string().transform(Number).default('5'),

  // Podcast Generation
  MAX_PODCAST_DURATION_MINUTES: z.string().transform(Number).default('10'),
  DEFAULT_VOICE_HOST1: z.string().default('en-US-Neural2-J'),
  DEFAULT_VOICE_HOST2: z.string().default('en-US-Neural2-D'),

  // Push Notifications - APNs (iOS)
  APNS_KEY_ID: z.string().optional(),
  APNS_TEAM_ID: z.string().optional(),
  APNS_PRIVATE_KEY: z.string().optional(), // Base64 encoded or PEM format with \n
  APNS_BUNDLE_ID: z.string().default('com.kreativekoala.briefcast'),

  // Push Notifications - FCM (Android)
  FCM_SERVER_KEY: z.string().optional(),

  // External APIs
  OPENWEATHER_API_KEY: z.string().optional(),

  // Scheduler
  ENABLE_SCHEDULER: z.string().transform(val => val === 'true').default('true'),

  // Batch Generation
  BATCH_SECRET: z.string().optional().default(''),
  ENABLE_TOPIC_BATCH: z.string().transform(val => val === 'true').default('true'),

  // Subscription Verification (optional)
  APPLE_SHARED_SECRET: z.string().optional(),
  GOOGLE_PLAY_SERVICE_ACCOUNT_KEY: z.string().optional(),
});

export type Environment = z.infer<typeof envSchema>;

/**
 * Validate and parse environment variables
 * Throws error if validation fails
 */
function validateEnv(): Environment {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map(err => {
        return `  - ${err.path.join('.')}: ${err.message}`;
      });

      console.error('❌ Environment variable validation failed:\n');
      console.error(missingVars.join('\n'));
      console.error('\n💡 Check your .env file and ensure all required variables are set.\n');

      throw new Error('Invalid environment configuration');
    }
    throw error;
  }
}

// Validate on import
export const env = validateEnv();

/**
 * Helper to check if running in production
 */
export const isProduction = env.NODE_ENV === 'production';

/**
 * Helper to check if running in development
 */
export const isDevelopment = env.NODE_ENV === 'development';

/**
 * Helper to check if running in test
 */
export const isTest = env.NODE_ENV === 'test';

/**
 * Get database URL
 */
export const getDatabaseUrl = (): string => {
  return env.SUPABASE_URL;
};

/**
 * Get API base URL
 */
export const getApiBaseUrl = (): string => {
  if (isProduction) {
    return `https://${env.GCP_PROJECT_ID}.run.app`;
  }
  return `http://${env.HOST}:${env.PORT}`;
};

// Log configuration on startup (hide sensitive values)
if (isDevelopment) {
  console.log('📋 Environment Configuration:');
  console.log(`  - NODE_ENV: ${env.NODE_ENV}`);
  console.log(`  - PORT: ${env.PORT}`);
  console.log(`  - SUPABASE_URL: ${env.SUPABASE_URL}`);
  console.log(`  - TTS_PROVIDER: ${env.TTS_PROVIDER}`);
  console.log(`  - STORAGE_PROVIDER: ${env.STORAGE_PROVIDER}`);
  console.log(`  - GCP_PROJECT_ID: ${env.GCP_PROJECT_ID}`);
}

// TODO: Add environment variable refresh mechanism for long-running processes
// TODO: Implement secure secret rotation support
// TODO: Add support for Google Secret Manager integration
// TODO: Add validation for conditional requirements (e.g., if TTS_PROVIDER=elevenlabs, require ELEVENLABS_API_KEY)
