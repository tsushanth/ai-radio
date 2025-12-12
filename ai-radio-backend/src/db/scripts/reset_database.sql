-- Reset Database Script
-- WARNING: This will DROP ALL TABLES and DATA!
-- Only use in development environments

-- ================================================
-- SAFETY CHECK
-- ================================================
-- Uncomment the line below to confirm you want to proceed
-- DO $$ BEGIN RAISE NOTICE 'Proceeding with database reset...'; END $$;

-- If the above line is NOT uncommented, this script will not run
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_stat_statements WHERE query LIKE '%Proceeding with database reset%'
    ) THEN
        RAISE EXCEPTION 'Safety check failed. Uncomment the confirmation line to proceed with reset.';
    END IF;
END $$;

-- ================================================
-- DROP EXISTING OBJECTS
-- ================================================

-- Drop policies first (to avoid dependency issues)
DROP POLICY IF EXISTS "Users can view their own data" ON users CASCADE;
DROP POLICY IF EXISTS "Users can update their own data" ON users CASCADE;
DROP POLICY IF EXISTS "Users can view their own oauth tokens" ON oauth_tokens CASCADE;
DROP POLICY IF EXISTS "Users can insert their own oauth tokens" ON oauth_tokens CASCADE;
DROP POLICY IF EXISTS "Users can update their own oauth tokens" ON oauth_tokens CASCADE;
DROP POLICY IF EXISTS "Users can delete their own oauth tokens" ON oauth_tokens CASCADE;
DROP POLICY IF EXISTS "Users can view their own episodes" ON podcast_episodes CASCADE;
DROP POLICY IF EXISTS "Users can insert their own episodes" ON podcast_episodes CASCADE;
DROP POLICY IF EXISTS "Users can update their own episodes" ON podcast_episodes CASCADE;
DROP POLICY IF EXISTS "Users can delete their own episodes" ON podcast_episodes CASCADE;
DROP POLICY IF EXISTS "Users can view their own jobs" ON podcast_generation_jobs CASCADE;
DROP POLICY IF EXISTS "Users can insert their own jobs" ON podcast_generation_jobs CASCADE;

-- Drop tables (with CASCADE to drop dependent objects)
DROP TABLE IF EXISTS podcast_generation_jobs CASCADE;
DROP TABLE IF EXISTS podcast_episodes CASCADE;
DROP TABLE IF EXISTS oauth_tokens CASCADE;
DROP TABLE IF EXISTS users CASCADE;

-- Drop functions
DROP FUNCTION IF EXISTS update_updated_at_column() CASCADE;
DROP FUNCTION IF EXISTS cleanup_expired_tokens() CASCADE;
DROP FUNCTION IF EXISTS get_user_stats(UUID) CASCADE;

RAISE NOTICE '============================================';
RAISE NOTICE 'Database reset complete!';
RAISE NOTICE 'All tables, policies, and functions dropped.';
RAISE NOTICE '============================================';
RAISE NOTICE 'Next steps:';
RAISE NOTICE '1. Run migrations/001_initial_schema.sql';
RAISE NOTICE '2. (Optional) Run seeds/001_test_data.sql';
RAISE NOTICE '============================================';
