/**
 * Database Configuration
 * Supabase configuration and connection settings
 */

// TODO: Load from environment variables
// TODO: Add connection pooling configuration
// TODO: Add retry logic configuration

module.exports = {
  supabase: {
    url: process.env.SUPABASE_URL || '',
    anonKey: process.env.SUPABASE_ANON_KEY || '',
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY || '',
  },
  // TODO: Add database schema configuration
  // TODO: Add table names as constants
};
