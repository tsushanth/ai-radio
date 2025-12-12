/**
 * Storage Configuration
 * Cloud storage settings for audio files and assets
 */

// TODO: Load from environment variables
// TODO: Add storage bucket configuration
// TODO: Add CDN configuration
// TODO: Add file size limits and validation

module.exports = {
  provider: process.env.STORAGE_PROVIDER || 'supabase', // 'supabase', 'gcs', 's3'

  supabase: {
    bucket: process.env.SUPABASE_STORAGE_BUCKET || 'podcasts',
    // TODO: Add Supabase storage configuration
  },

  gcs: {
    projectId: process.env.GCS_PROJECT_ID || '',
    bucket: process.env.GCS_BUCKET || '',
    keyFilename: process.env.GCS_KEY_FILE || '',
    // TODO: Add GCS configuration
  },

  s3: {
    region: process.env.AWS_REGION || 'us-east-1',
    bucket: process.env.S3_BUCKET || '',
    accessKeyId: process.env.AWS_ACCESS_KEY_ID || '',
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY || '',
    // TODO: Add S3 configuration
  },

  // TODO: Add file size limits
  // TODO: Add allowed file types
  // TODO: Add CDN URL configuration
};
