-- Database Maintenance Script
-- Run periodically to clean up old data and optimize performance

-- ================================================
-- CLEANUP EXPIRED TOKENS
-- ================================================
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    RAISE NOTICE '============================================';
    RAISE NOTICE 'DATABASE MAINTENANCE';
    RAISE NOTICE '============================================';
    RAISE NOTICE '';
    RAISE NOTICE '1. CLEANING UP EXPIRED TOKENS...';

    deleted_count := cleanup_expired_tokens();

    IF deleted_count > 0 THEN
        RAISE NOTICE '   ✓ Deleted % expired OAuth tokens', deleted_count;
    ELSE
        RAISE NOTICE '   ✓ No expired tokens to clean up';
    END IF;
END $$;

-- ================================================
-- CLEANUP OLD EPISODES (older than 90 days)
-- ================================================
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '2. CLEANING UP OLD EPISODES...';

    WITH deleted AS (
        DELETE FROM podcast_episodes
        WHERE created_at < NOW() - INTERVAL '90 days'
          AND status IN ('completed', 'failed')
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    IF deleted_count > 0 THEN
        RAISE NOTICE '   ✓ Deleted % old episodes (>90 days)', deleted_count;
    ELSE
        RAISE NOTICE '   ✓ No old episodes to clean up';
    END IF;
END $$;

-- ================================================
-- CLEANUP OLD JOBS (older than 30 days)
-- ================================================
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '3. CLEANING UP OLD JOBS...';

    WITH deleted AS (
        DELETE FROM podcast_generation_jobs
        WHERE created_at < NOW() - INTERVAL '30 days'
          AND status IN ('completed', 'failed')
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    IF deleted_count > 0 THEN
        RAISE NOTICE '   ✓ Deleted % old jobs (>30 days)', deleted_count;
    ELSE
        RAISE NOTICE '   ✓ No old jobs to clean up';
    END IF;
END $$;

-- ================================================
-- CLEANUP ORPHANED JOBS (no episode_id)
-- ================================================
DO $$
DECLARE
    deleted_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '4. CLEANING UP ORPHANED JOBS...';

    WITH deleted AS (
        DELETE FROM podcast_generation_jobs
        WHERE episode_id IS NULL
          AND created_at < NOW() - INTERVAL '7 days'
          AND status IN ('failed', 'completed')
        RETURNING id
    )
    SELECT COUNT(*) INTO deleted_count FROM deleted;

    IF deleted_count > 0 THEN
        RAISE NOTICE '   ✓ Deleted % orphaned jobs', deleted_count;
    ELSE
        RAISE NOTICE '   ✓ No orphaned jobs to clean up';
    END IF;
END $$;

-- ================================================
-- VACUUM ANALYZE (optimize performance)
-- ================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '5. OPTIMIZING DATABASE...';
    RAISE NOTICE '   Running VACUUM ANALYZE on all tables...';
END $$;

VACUUM ANALYZE users;
VACUUM ANALYZE oauth_tokens;
VACUUM ANALYZE podcast_episodes;
VACUUM ANALYZE podcast_generation_jobs;

DO $$
BEGIN
    RAISE NOTICE '   ✓ Database optimization complete';
END $$;

-- ================================================
-- UPDATE STATISTICS
-- ================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '6. UPDATING TABLE STATISTICS...';
END $$;

ANALYZE users;
ANALYZE oauth_tokens;
ANALYZE podcast_episodes;
ANALYZE podcast_generation_jobs;

DO $$
BEGIN
    RAISE NOTICE '   ✓ Statistics updated';
END $$;

-- ================================================
-- STORAGE USAGE REPORT
-- ================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '7. STORAGE USAGE REPORT...';
END $$;

SELECT
    schemaname as schema,
    tablename as table,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- ================================================
-- INDEX USAGE STATISTICS
-- ================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '8. INDEX USAGE STATISTICS...';
    RAISE NOTICE '   (Low scans may indicate unused indexes)';
END $$;

SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    idx_tup_read as tuples_read,
    idx_tup_fetch as tuples_fetched
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan ASC;

-- ================================================
-- STUCK JOBS REPORT
-- ================================================
DO $$
DECLARE
    stuck_count INTEGER;
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '9. CHECKING FOR STUCK JOBS...';

    SELECT COUNT(*)
    INTO stuck_count
    FROM podcast_generation_jobs
    WHERE status = 'processing'
      AND updated_at < NOW() - INTERVAL '1 hour';

    IF stuck_count > 0 THEN
        RAISE WARNING '   ✗ Found % jobs stuck in "processing" state', stuck_count;
        RAISE NOTICE '   Consider manually updating these jobs to "failed"';
    ELSE
        RAISE NOTICE '   ✓ No stuck jobs found';
    END IF;
END $$;

-- ================================================
-- SUMMARY
-- ================================================
DO $$
BEGIN
    RAISE NOTICE '';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'MAINTENANCE COMPLETE';
    RAISE NOTICE '============================================';
    RAISE NOTICE '';
    RAISE NOTICE 'Recommendations:';
    RAISE NOTICE '- Run this script weekly';
    RAISE NOTICE '- Monitor storage usage trends';
    RAISE NOTICE '- Review unused indexes quarterly';
    RAISE NOTICE '- Set up automated cleanup jobs';
    RAISE NOTICE '============================================';
END $$;
