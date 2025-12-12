-- Database Health Check Script
-- Run this to verify database status and integrity

-- ================================================
-- SCHEMA VERIFICATION
-- ================================================
DO $$
DECLARE
    table_count INTEGER;
    expected_tables TEXT[] := ARRAY['users', 'oauth_tokens', 'podcast_episodes', 'podcast_generation_jobs'];
    missing_tables TEXT[];
    function_count INTEGER;
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'DATABASE HEALTH CHECK';
    RAISE NOTICE '============================================';
    RAISE NOTICE '';

    -- Check tables
    RAISE NOTICE '1. CHECKING TABLES...';
    SELECT COUNT(*) INTO table_count
    FROM information_schema.tables
    WHERE table_schema = 'public'
      AND table_name = ANY(expected_tables);

    IF table_count = array_length(expected_tables, 1) THEN
        RAISE NOTICE '   ✓ All % required tables present', table_count;
    ELSE
        RAISE WARNING '   ✗ Expected % tables, found %', array_length(expected_tables, 1), table_count;

        -- Find missing tables
        SELECT ARRAY_AGG(table_name)
        INTO missing_tables
        FROM unnest(expected_tables) AS table_name
        WHERE table_name NOT IN (
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
        );

        IF missing_tables IS NOT NULL THEN
            RAISE WARNING '   Missing tables: %', array_to_string(missing_tables, ', ');
        END IF;
    END IF;

    -- Check functions
    RAISE NOTICE '';
    RAISE NOTICE '2. CHECKING FUNCTIONS...';
    SELECT COUNT(*) INTO function_count
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname IN ('update_updated_at_column', 'cleanup_expired_tokens', 'get_user_stats');

    IF function_count = 3 THEN
        RAISE NOTICE '   ✓ All 3 required functions present';
    ELSE
        RAISE WARNING '   ✗ Expected 3 functions, found %', function_count;
    END IF;
END $$;

-- ================================================
-- RLS STATUS
-- ================================================
DO $$
DECLARE
    rls_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '3. CHECKING ROW LEVEL SECURITY...';

    SELECT COUNT(*)
    INTO rls_count
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename IN ('users', 'oauth_tokens', 'podcast_episodes', 'podcast_generation_jobs')
      AND rowsecurity = true;

    IF rls_count = 4 THEN
        RAISE NOTICE '   ✓ RLS enabled on all 4 tables';
    ELSE
        RAISE WARNING '   ✗ RLS should be enabled on 4 tables, but is enabled on % tables', rls_count;
    END IF;
END $$;

-- ================================================
-- POLICY COUNT
-- ================================================
DO $$
DECLARE
    policy_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '4. CHECKING RLS POLICIES...';

    SELECT COUNT(*)
    INTO policy_count
    FROM pg_policies
    WHERE schemaname = 'public';

    IF policy_count >= 12 THEN
        RAISE NOTICE '   ✓ Found % RLS policies', policy_count;
    ELSE
        RAISE WARNING '   ✗ Expected at least 12 policies, found %', policy_count;
    END IF;
END $$;

-- ================================================
-- INDEX STATUS
-- ================================================
DO $$
DECLARE
    index_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '5. CHECKING INDEXES...';

    SELECT COUNT(*)
    INTO index_count
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename IN ('users', 'oauth_tokens', 'podcast_episodes', 'podcast_generation_jobs');

    IF index_count >= 10 THEN
        RAISE NOTICE '   ✓ Found % indexes', index_count;
    ELSE
        RAISE WARNING '   ✗ Expected at least 10 indexes, found %', index_count;
    END IF;
END $$;

-- ================================================
-- DATA COUNTS
-- ================================================
DO $$
DECLARE
    user_count INTEGER;
    token_count INTEGER;
    episode_count INTEGER;
    job_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '6. DATA SUMMARY...';

    SELECT COUNT(*) INTO user_count FROM users;
    SELECT COUNT(*) INTO token_count FROM oauth_tokens;
    SELECT COUNT(*) INTO episode_count FROM podcast_episodes;
    SELECT COUNT(*) INTO job_count FROM podcast_generation_jobs;

    RAISE NOTICE '   Users: %', user_count;
    RAISE NOTICE '   OAuth Tokens: %', token_count;
    RAISE NOTICE '   Podcast Episodes: %', episode_count;
    RAISE NOTICE '   Generation Jobs: %', job_count;
END $$;

-- ================================================
-- EXTENSION CHECK
-- ================================================
DO $$
DECLARE
    uuid_ossp_exists BOOLEAN;
    pgcrypto_exists BOOLEAN;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '7. CHECKING EXTENSIONS...';

    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'uuid-ossp'
    ) INTO uuid_ossp_exists;

    SELECT EXISTS (
        SELECT 1 FROM pg_extension WHERE extname = 'pgcrypto'
    ) INTO pgcrypto_exists;

    IF uuid_ossp_exists THEN
        RAISE NOTICE '   ✓ uuid-ossp extension enabled';
    ELSE
        RAISE WARNING '   ✗ uuid-ossp extension not found';
    END IF;

    IF pgcrypto_exists THEN
        RAISE NOTICE '   ✓ pgcrypto extension enabled';
    ELSE
        RAISE WARNING '   ✗ pgcrypto extension not found';
    END IF;
END $$;

-- ================================================
-- DETAILED TABLE INFO
-- ================================================
\echo ''
\echo '8. DETAILED TABLE INFORMATION...'
\echo ''

-- Users table
\echo '   users table:'
SELECT
    COUNT(*) as total_users,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '7 days') as new_this_week,
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days') as new_this_month
FROM users;

-- OAuth tokens
\echo ''
\echo '   oauth_tokens table:'
SELECT
    provider,
    COUNT(*) as total,
    COUNT(*) FILTER (WHERE expires_at > NOW()) as valid,
    COUNT(*) FILTER (WHERE expires_at <= NOW()) as expired
FROM oauth_tokens
GROUP BY provider;

-- Episodes by status
\echo ''
\echo '   podcast_episodes by status:'
SELECT
    status,
    COUNT(*) as count,
    ROUND(AVG(duration_seconds))::INTEGER as avg_duration_sec
FROM podcast_episodes
GROUP BY status
ORDER BY status;

-- Jobs by status
\echo ''
\echo '   podcast_generation_jobs by status:'
SELECT
    status,
    COUNT(*) as count,
    ROUND(AVG(progress_percent))::INTEGER as avg_progress
FROM podcast_generation_jobs
GROUP BY status
ORDER BY status;

-- ================================================
-- SUMMARY
-- ================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'HEALTH CHECK COMPLETE';
    RAISE NOTICE '============================================';
END $$;
