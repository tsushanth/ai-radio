-- Useful Queries for Development and Debugging
-- Copy and paste these queries as needed

-- ================================================
-- USER QUERIES
-- ================================================

-- Get all users with their episode counts
SELECT
    u.id,
    u.email,
    u.name,
    u.timezone,
    u.preferences->>'briefing_time' as briefing_time,
    COUNT(pe.id) as total_episodes,
    COUNT(pe.id) FILTER (WHERE pe.status = 'completed') as completed_episodes,
    COUNT(pe.id) FILTER (WHERE pe.status = 'failed') as failed_episodes,
    u.created_at
FROM users u
LEFT JOIN podcast_episodes pe ON u.id = pe.user_id
GROUP BY u.id
ORDER BY u.created_at DESC;

-- Get user by email
SELECT * FROM users WHERE email = 'user@example.com';

-- Get user preferences
SELECT
    email,
    preferences->>'briefing_time' as briefing_time,
    preferences->'topics' as topics,
    preferences->>'voice_host1' as voice_host1,
    preferences->>'voice_host2' as voice_host2,
    preferences->>'include_weather' as include_weather,
    preferences->>'include_calendar' as include_calendar,
    preferences->>'include_email' as include_email
FROM users
WHERE email = 'user@example.com';

-- Get user statistics
SELECT * FROM get_user_stats('user-uuid-here');

-- ================================================
-- OAUTH TOKEN QUERIES
-- ================================================

-- View all tokens (grouped by user)
SELECT
    u.email,
    ot.provider,
    ot.expires_at,
    CASE
        WHEN ot.expires_at > NOW() THEN 'Valid'
        ELSE 'Expired'
    END as status,
    ot.scopes,
    ot.updated_at
FROM oauth_tokens ot
JOIN users u ON ot.user_id = u.id
ORDER BY u.email, ot.provider;

-- Find expired tokens
SELECT
    u.email,
    ot.provider,
    ot.expires_at,
    NOW() - ot.expires_at as time_since_expiry
FROM oauth_tokens ot
JOIN users u ON ot.user_id = u.id
WHERE ot.expires_at < NOW()
ORDER BY ot.expires_at DESC;

-- Check if user has valid tokens
SELECT
    u.email,
    BOOL_OR(ot.provider = 'google' AND ot.expires_at > NOW()) as has_valid_google,
    BOOL_OR(ot.provider = 'microsoft' AND ot.expires_at > NOW()) as has_valid_microsoft
FROM users u
LEFT JOIN oauth_tokens ot ON u.id = ot.user_id
WHERE u.email = 'user@example.com'
GROUP BY u.email;

-- ================================================
-- PODCAST EPISODE QUERIES
-- ================================================

-- Get recent episodes with user info
SELECT
    pe.id,
    u.email,
    pe.title,
    pe.status,
    pe.duration_seconds,
    pe.audio_url,
    pe.created_at,
    pe.generated_at
FROM podcast_episodes pe
JOIN users u ON pe.user_id = u.id
ORDER BY pe.created_at DESC
LIMIT 20;

-- Episodes by status
SELECT
    status,
    COUNT(*) as count,
    ROUND(AVG(duration_seconds))::INTEGER as avg_duration,
    MIN(created_at) as oldest,
    MAX(created_at) as newest
FROM podcast_episodes
GROUP BY status
ORDER BY status;

-- Get episodes for a specific user
SELECT
    pe.title,
    pe.status,
    pe.duration_seconds,
    pe.script->'segments' as segments,
    pe.audio_url,
    pe.created_at
FROM podcast_episodes pe
JOIN users u ON pe.user_id = u.id
WHERE u.email = 'user@example.com'
ORDER BY pe.created_at DESC;

-- Find failed episodes with errors
SELECT
    u.email,
    pe.title,
    pe.error_message,
    pe.created_at
FROM podcast_episodes pe
JOIN users u ON pe.user_id = u.id
WHERE pe.status = 'failed'
ORDER BY pe.created_at DESC;

-- Get episode script segments
SELECT
    pe.title,
    segment->>'speaker' as speaker,
    segment->>'type' as type,
    segment->>'text' as text,
    (segment->>'duration_estimate')::INTEGER as duration
FROM podcast_episodes pe,
     jsonb_array_elements(pe.script->'segments') as segment
WHERE pe.id = 'episode-uuid-here';

-- Episodes without audio URLs
SELECT
    u.email,
    pe.title,
    pe.status,
    pe.created_at
FROM podcast_episodes pe
JOIN users u ON pe.user_id = u.id
WHERE pe.audio_url IS NULL
  AND pe.status = 'completed'
ORDER BY pe.created_at DESC;

-- ================================================
-- JOB QUERIES
-- ================================================

-- Get all jobs with status
SELECT
    j.id,
    u.email,
    j.status,
    j.progress_percent,
    j.current_step,
    j.created_at,
    j.updated_at,
    EXTRACT(EPOCH FROM (j.updated_at - j.created_at))::INTEGER as duration_seconds
FROM podcast_generation_jobs j
JOIN users u ON j.user_id = u.id
ORDER BY j.created_at DESC
LIMIT 20;

-- Active jobs
SELECT
    u.email,
    j.status,
    j.progress_percent,
    j.current_step,
    j.created_at,
    NOW() - j.created_at as running_for
FROM podcast_generation_jobs j
JOIN users u ON j.user_id = u.id
WHERE j.status IN ('queued', 'processing')
ORDER BY j.created_at DESC;

-- Jobs by status with metadata
SELECT
    j.status,
    COUNT(*) as count,
    ROUND(AVG(j.progress_percent))::INTEGER as avg_progress,
    AVG((j.metadata->>'emails_fetched')::INTEGER) as avg_emails,
    AVG((j.metadata->>'calendar_events_fetched')::INTEGER) as avg_events,
    AVG((j.metadata->>'generation_time_seconds')::INTEGER) as avg_generation_time
FROM podcast_generation_jobs j
WHERE j.metadata IS NOT NULL
GROUP BY j.status;

-- Stuck jobs (processing for > 1 hour)
SELECT
    u.email,
    j.id,
    j.progress_percent,
    j.current_step,
    j.created_at,
    NOW() - j.updated_at as stuck_for
FROM podcast_generation_jobs j
JOIN users u ON j.user_id = u.id
WHERE j.status = 'processing'
  AND j.updated_at < NOW() - INTERVAL '1 hour'
ORDER BY j.updated_at ASC;

-- Job success rate by user
SELECT
    u.email,
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE j.status = 'completed') as completed,
    COUNT(*) FILTER (WHERE j.status = 'failed') as failed,
    ROUND(
        COUNT(*) FILTER (WHERE j.status = 'completed')::NUMERIC /
        NULLIF(COUNT(*), 0) * 100,
        1
    ) as success_rate_percent
FROM podcast_generation_jobs j
JOIN users u ON j.user_id = u.id
WHERE j.status IN ('completed', 'failed')
GROUP BY u.id, u.email
ORDER BY total_jobs DESC;

-- ================================================
-- COMBINED QUERIES
-- ================================================

-- Full user overview
SELECT
    u.email,
    u.name,
    u.timezone,
    u.preferences->>'briefing_time' as briefing_time,
    COUNT(DISTINCT ot.id) as oauth_tokens,
    COUNT(DISTINCT pe.id) as total_episodes,
    COUNT(DISTINCT pe.id) FILTER (WHERE pe.status = 'completed') as completed_episodes,
    COUNT(DISTINCT j.id) as total_jobs,
    MAX(pe.generated_at) as last_episode_date,
    u.created_at as user_since
FROM users u
LEFT JOIN oauth_tokens ot ON u.id = ot.user_id
LEFT JOIN podcast_episodes pe ON u.id = pe.user_id
LEFT JOIN podcast_generation_jobs j ON u.id = j.user_id
GROUP BY u.id
ORDER BY u.created_at DESC;

-- Recent activity across all tables
SELECT * FROM (
    SELECT
        'user_created' as event_type,
        email as details,
        created_at
    FROM users
    UNION ALL
    SELECT
        'episode_' || status,
        u.email || ' - ' || pe.title,
        pe.created_at
    FROM podcast_episodes pe
    JOIN users u ON pe.user_id = u.id
    UNION ALL
    SELECT
        'job_' || status,
        u.email || ' - ' || COALESCE(j.current_step, 'no step'),
        j.created_at
    FROM podcast_generation_jobs j
    JOIN users u ON j.user_id = u.id
) activity
ORDER BY created_at DESC
LIMIT 50;

-- ================================================
-- PERFORMANCE QUERIES
-- ================================================

-- Table sizes
SELECT
    schemaname,
    tablename,
    pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as total_size,
    pg_size_pretty(pg_relation_size(schemaname||'.'||tablename)) as table_size,
    pg_size_pretty(pg_indexes_size(schemaname||'.'||tablename)) as index_size,
    pg_stat_get_live_tuples(schemaname||'.'||tablename::regclass) as row_estimate
FROM pg_tables
WHERE schemaname = 'public'
ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC;

-- Index usage
SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan as scans,
    pg_size_pretty(pg_relation_size(indexrelid)) as index_size
FROM pg_stat_user_indexes
WHERE schemaname = 'public'
ORDER BY idx_scan DESC;

-- ================================================
-- CLEANUP QUERIES (Use with caution!)
-- ================================================

-- Delete test users (ONLY IN DEVELOPMENT!)
-- DELETE FROM users WHERE email LIKE '%@test.example.com';

-- Delete old episodes
-- DELETE FROM podcast_episodes WHERE created_at < NOW() - INTERVAL '90 days' AND status IN ('completed', 'failed');

-- Delete old jobs
-- DELETE FROM podcast_generation_jobs WHERE created_at < NOW() - INTERVAL '30 days' AND status IN ('completed', 'failed');

-- Reset stuck jobs
-- UPDATE podcast_generation_jobs
-- SET status = 'failed',
--     error_message = 'Job stuck in processing state',
--     updated_at = NOW()
-- WHERE status = 'processing'
--   AND updated_at < NOW() - INTERVAL '1 hour';
