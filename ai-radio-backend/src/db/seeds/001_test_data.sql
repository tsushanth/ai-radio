-- AI Radio Backend - Test Seed Data
-- This file populates the database with test data for development and testing
-- WARNING: Do NOT run this in production!

-- ================================================
-- CLEAN UP EXISTING TEST DATA (optional)
-- ================================================
-- Uncomment these lines if you want to reset test data
-- DELETE FROM podcast_generation_jobs WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.example.com');
-- DELETE FROM podcast_episodes WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.example.com');
-- DELETE FROM oauth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.example.com');
-- DELETE FROM users WHERE email LIKE '%@test.example.com';

-- ================================================
-- TEST USERS
-- ================================================

-- Test User 1: Basic user with default preferences
INSERT INTO users (id, email, name, timezone, preferences, created_at, updated_at)
VALUES (
    '11111111-1111-1111-1111-111111111111',
    'john.doe@test.example.com',
    'John Doe',
    'America/New_York',
    jsonb_build_object(
        'briefing_time', '07:00',
        'topics', jsonb_build_array('technology', 'business'),
        'voice_host1', 'en-US-Neural2-J',
        'voice_host2', 'en-US-Neural2-D',
        'include_weather', true,
        'include_calendar', true,
        'include_email', true
    ),
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '1 day'
) ON CONFLICT (email) DO NOTHING;

-- Test User 2: Power user with custom preferences
INSERT INTO users (id, email, name, timezone, preferences, created_at, updated_at)
VALUES (
    '22222222-2222-2222-2222-222222222222',
    'jane.smith@test.example.com',
    'Jane Smith',
    'America/Los_Angeles',
    jsonb_build_object(
        'briefing_time', '06:30',
        'topics', jsonb_build_array('technology', 'health', 'finance', 'science'),
        'voice_host1', 'en-US-Neural2-C',
        'voice_host2', 'en-US-Neural2-A',
        'include_weather', true,
        'include_calendar', true,
        'include_email', true
    ),
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '2 hours'
) ON CONFLICT (email) DO NOTHING;

-- Test User 3: New user with minimal activity
INSERT INTO users (id, email, name, timezone, preferences, created_at, updated_at)
VALUES (
    '33333333-3333-3333-3333-333333333333',
    'alex.johnson@test.example.com',
    'Alex Johnson',
    'Europe/London',
    jsonb_build_object(
        'briefing_time', '08:00',
        'topics', jsonb_build_array('news'),
        'voice_host1', 'en-GB-Neural2-A',
        'voice_host2', 'en-GB-Neural2-B',
        'include_weather', false,
        'include_calendar', true,
        'include_email', false
    ),
    NOW() - INTERVAL '3 days',
    NOW() - INTERVAL '1 hour'
) ON CONFLICT (email) DO NOTHING;

-- ================================================
-- OAUTH TOKENS (Test tokens - not real)
-- ================================================

-- Google OAuth token for User 1
INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at, scopes, created_at, updated_at)
VALUES (
    'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
    '11111111-1111-1111-1111-111111111111',
    'google',
    'ya29.test_access_token_user1_google',
    '1//test_refresh_token_user1_google',
    NOW() + INTERVAL '1 hour',
    ARRAY['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly'],
    NOW() - INTERVAL '30 days',
    NOW() - INTERVAL '30 minutes'
) ON CONFLICT (user_id, provider) DO NOTHING;

-- Microsoft OAuth token for User 1
INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at, scopes, created_at, updated_at)
VALUES (
    'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
    '11111111-1111-1111-1111-111111111111',
    'microsoft',
    'EwBIA8l6BAAUbDba3x2OMJElkF7gJ4z/VbCPEz0test',
    'M.R3_BAY.-CRudOlxvGjgjUKEaXEwJBRdtest',
    NOW() + INTERVAL '2 hours',
    ARRAY['Mail.Read', 'Calendars.Read'],
    NOW() - INTERVAL '25 days',
    NOW() - INTERVAL '1 hour'
) ON CONFLICT (user_id, provider) DO NOTHING;

-- Google OAuth token for User 2
INSERT INTO oauth_tokens (id, user_id, provider, access_token, refresh_token, expires_at, scopes, created_at, updated_at)
VALUES (
    'cccccccc-cccc-cccc-cccc-cccccccccccc',
    '22222222-2222-2222-2222-222222222222',
    'google',
    'ya29.test_access_token_user2_google',
    '1//test_refresh_token_user2_google',
    NOW() + INTERVAL '45 minutes',
    ARRAY['https://www.googleapis.com/auth/gmail.readonly', 'https://www.googleapis.com/auth/calendar.readonly'],
    NOW() - INTERVAL '60 days',
    NOW() - INTERVAL '20 minutes'
) ON CONFLICT (user_id, provider) DO NOTHING;

-- ================================================
-- PODCAST EPISODES
-- ================================================

-- Completed episode for User 1 (recent)
INSERT INTO podcast_episodes (
    id, user_id, title, description, script, audio_url,
    duration_seconds, status, error_message, generated_at, created_at
)
VALUES (
    'eeeeeeee-1111-eeee-1111-eeeeeeee0001',
    '11111111-1111-1111-1111-111111111111',
    'Morning Briefing - January 15, 2025',
    'Your personalized morning briefing covering emails, calendar, and news',
    jsonb_build_object(
        'segments', jsonb_build_array(
            jsonb_build_object(
                'speaker', 'host1',
                'text', 'Good morning John! Welcome to your daily briefing for Tuesday, January 15th.',
                'type', 'intro',
                'duration_estimate', 5
            ),
            jsonb_build_object(
                'speaker', 'host2',
                'text', 'Thanks Alex! Let''s dive into what''s happening today. You have 8 new emails since yesterday.',
                'type', 'intro',
                'duration_estimate', 5
            ),
            jsonb_build_object(
                'speaker', 'host1',
                'text', 'Starting with your inbox - you have three important project updates from your team.',
                'type', 'email',
                'duration_estimate', 6
            ),
            jsonb_build_object(
                'speaker', 'host2',
                'text', 'Looking at your calendar, you have that big presentation at 2 PM today with the executive team.',
                'type', 'calendar',
                'duration_estimate', 7
            ),
            jsonb_build_object(
                'speaker', 'host1',
                'text', 'Weather-wise, it''s going to be a beautiful day - 72 degrees and sunny. Perfect!',
                'type', 'weather',
                'duration_estimate', 5
            ),
            jsonb_build_object(
                'speaker', 'host2',
                'text', 'That''s your briefing for today. Have a great day, John!',
                'type', 'outro',
                'duration_estimate', 4
            )
        ),
        'total_duration_estimate', 32
    ),
    'https://storage.example.com/podcasts/user1/episode001.mp3',
    187,
    'completed',
    NULL,
    NOW() - INTERVAL '12 hours',
    NOW() - INTERVAL '12 hours'
);

-- Completed episode for User 1 (yesterday)
INSERT INTO podcast_episodes (
    id, user_id, title, description, script, audio_url,
    duration_seconds, status, error_message, generated_at, created_at
)
VALUES (
    'eeeeeeee-1111-eeee-1111-eeeeeeee0002',
    '11111111-1111-1111-1111-111111111111',
    'Morning Briefing - January 14, 2025',
    'Your personalized morning briefing',
    jsonb_build_object(
        'segments', jsonb_build_array(
            jsonb_build_object(
                'speaker', 'host1',
                'text', 'Good morning! It''s Monday, January 14th.',
                'type', 'intro',
                'duration_estimate', 4
            ),
            jsonb_build_object(
                'speaker', 'host2',
                'text', 'Starting the week off with 5 new emails and 3 meetings today.',
                'type', 'email',
                'duration_estimate', 6
            )
        ),
        'total_duration_estimate', 10
    ),
    'https://storage.example.com/podcasts/user1/episode002.mp3',
    154,
    'completed',
    NULL,
    NOW() - INTERVAL '1 day' - INTERVAL '12 hours',
    NOW() - INTERVAL '1 day' - INTERVAL '12 hours'
);

-- Failed episode for User 1
INSERT INTO podcast_episodes (
    id, user_id, title, description, script, audio_url,
    duration_seconds, status, error_message, generated_at, created_at
)
VALUES (
    'eeeeeeee-1111-eeee-1111-eeeeeeee0003',
    '11111111-1111-1111-1111-111111111111',
    'Morning Briefing - January 13, 2025',
    'Your personalized morning briefing',
    jsonb_build_object(
        'segments', jsonb_build_array(),
        'total_duration_estimate', 0
    ),
    NULL,
    NULL,
    'failed',
    'OpenAI API rate limit exceeded',
    NULL,
    NOW() - INTERVAL '2 days' - INTERVAL '7 hours'
);

-- Completed episodes for User 2
INSERT INTO podcast_episodes (
    id, user_id, title, description, script, audio_url,
    duration_seconds, status, error_message, generated_at, created_at
)
VALUES (
    'eeeeeeee-2222-eeee-2222-eeeeeeee0001',
    '22222222-2222-2222-2222-222222222222',
    'Morning Briefing - January 15, 2025',
    'Your personalized morning briefing',
    jsonb_build_object(
        'segments', jsonb_build_array(
            jsonb_build_object(
                'speaker', 'host1',
                'text', 'Good morning Jane! Welcome to your briefing for January 15th.',
                'type', 'intro',
                'duration_estimate', 5
            ),
            jsonb_build_object(
                'speaker', 'host2',
                'text', 'You have 12 new emails and a busy day ahead with 5 meetings scheduled.',
                'type', 'email',
                'duration_estimate', 7
            )
        ),
        'total_duration_estimate', 12
    ),
    'https://storage.example.com/podcasts/user2/episode001.mp3',
    245,
    'completed',
    NULL,
    NOW() - INTERVAL '6 hours',
    NOW() - INTERVAL '6 hours'
);

-- Generating episode for User 2 (in progress)
INSERT INTO podcast_episodes (
    id, user_id, title, description, script, audio_url,
    duration_seconds, status, error_message, generated_at, created_at
)
VALUES (
    'eeeeeeee-2222-eeee-2222-eeeeeeee0002',
    '22222222-2222-2222-2222-222222222222',
    'Morning Briefing - January 16, 2025',
    'Your personalized morning briefing',
    jsonb_build_object(
        'segments', jsonb_build_array(
            jsonb_build_object(
                'speaker', 'host1',
                'text', 'Good morning Jane!',
                'type', 'intro',
                'duration_estimate', 3
            )
        ),
        'total_duration_estimate', 3
    ),
    NULL,
    NULL,
    'generating',
    NULL,
    NOW() - INTERVAL '5 minutes'
);

-- Pending episode for User 3
INSERT INTO podcast_episodes (
    id, user_id, title, description, script, audio_url,
    duration_seconds, status, error_message, generated_at, created_at
)
VALUES (
    'eeeeeeee-3333-eeee-3333-eeeeeeee0001',
    '33333333-3333-3333-3333-333333333333',
    'Morning Briefing - January 15, 2025',
    'Your personalized morning briefing',
    jsonb_build_object(
        'segments', jsonb_build_array(),
        'total_duration_estimate', 0
    ),
    NULL,
    NULL,
    'pending',
    NULL,
    NOW() - INTERVAL '30 minutes'
);

-- ================================================
-- PODCAST GENERATION JOBS
-- ================================================

-- Completed job for User 1
INSERT INTO podcast_generation_jobs (
    id, user_id, episode_id, status, progress_percent, current_step,
    error_message, metadata, created_at, updated_at, completed_at
)
VALUES (
    'jjjjjjjj-1111-jjjj-1111-jjjjjjjj0001',
    '11111111-1111-1111-1111-111111111111',
    'eeeeeeee-1111-eeee-1111-eeeeeeee0001',
    'completed',
    100,
    'Upload completed',
    NULL,
    jsonb_build_object(
        'emails_fetched', 8,
        'calendar_events_fetched', 3,
        'script_tokens_used', 1250,
        'tts_characters', 847,
        'generation_time_seconds', 42
    ),
    NOW() - INTERVAL '12 hours',
    NOW() - INTERVAL '12 hours' + INTERVAL '42 seconds',
    NOW() - INTERVAL '12 hours' + INTERVAL '42 seconds'
);

-- Failed job for User 1
INSERT INTO podcast_generation_jobs (
    id, user_id, episode_id, status, progress_percent, current_step,
    error_message, metadata, created_at, updated_at, completed_at
)
VALUES (
    'jjjjjjjj-1111-jjjj-1111-jjjjjjjj0002',
    '11111111-1111-1111-1111-111111111111',
    'eeeeeeee-1111-eeee-1111-eeeeeeee0003',
    'failed',
    45,
    'Script generation',
    'OpenAI API rate limit exceeded',
    jsonb_build_object(
        'emails_fetched', 5,
        'calendar_events_fetched', 2,
        'retry_count', 3
    ),
    NOW() - INTERVAL '2 days' - INTERVAL '7 hours',
    NOW() - INTERVAL '2 days' - INTERVAL '7 hours' + INTERVAL '15 seconds',
    NOW() - INTERVAL '2 days' - INTERVAL '7 hours' + INTERVAL '15 seconds'
);

-- Processing job for User 2 (currently running)
INSERT INTO podcast_generation_jobs (
    id, user_id, episode_id, status, progress_percent, current_step,
    error_message, metadata, created_at, updated_at, completed_at
)
VALUES (
    'jjjjjjjj-2222-jjjj-2222-jjjjjjjj0001',
    '22222222-2222-2222-2222-222222222222',
    'eeeeeeee-2222-eeee-2222-eeeeeeee0002',
    'processing',
    75,
    'Generating audio',
    NULL,
    jsonb_build_object(
        'emails_fetched', 12,
        'calendar_events_fetched', 5,
        'script_tokens_used', 1856
    ),
    NOW() - INTERVAL '5 minutes',
    NOW() - INTERVAL '30 seconds',
    NULL
);

-- Queued job for User 3
INSERT INTO podcast_generation_jobs (
    id, user_id, episode_id, status, progress_percent, current_step,
    error_message, metadata, created_at, updated_at, completed_at
)
VALUES (
    'jjjjjjjj-3333-jjjj-3333-jjjjjjjj0001',
    '33333333-3333-3333-3333-333333333333',
    'eeeeeeee-3333-eeee-3333-eeeeeeee0001',
    'queued',
    0,
    'Waiting for resources',
    NULL,
    jsonb_build_object(),
    NOW() - INTERVAL '30 minutes',
    NOW() - INTERVAL '30 minutes',
    NULL
);

-- ================================================
-- VERIFICATION QUERIES
-- ================================================

-- Query to verify data was inserted correctly
DO $$
DECLARE
    user_count INTEGER;
    token_count INTEGER;
    episode_count INTEGER;
    job_count INTEGER;
BEGIN
    SELECT COUNT(*) INTO user_count FROM users WHERE email LIKE '%@test.example.com';
    SELECT COUNT(*) INTO token_count FROM oauth_tokens WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.example.com');
    SELECT COUNT(*) INTO episode_count FROM podcast_episodes WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.example.com');
    SELECT COUNT(*) INTO job_count FROM podcast_generation_jobs WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@test.example.com');

    RAISE NOTICE '============================================';
    RAISE NOTICE 'Seed Data Inserted Successfully!';
    RAISE NOTICE '============================================';
    RAISE NOTICE 'Test Users: %', user_count;
    RAISE NOTICE 'OAuth Tokens: %', token_count;
    RAISE NOTICE 'Podcast Episodes: %', episode_count;
    RAISE NOTICE 'Generation Jobs: %', job_count;
    RAISE NOTICE '============================================';

    IF user_count = 0 THEN
        RAISE WARNING 'No test users were inserted. Check for conflicts or errors.';
    END IF;
END $$;

-- ================================================
-- HELPFUL QUERIES FOR TESTING
-- ================================================

-- View all test users with their episode counts
-- SELECT
--     u.email,
--     u.name,
--     u.timezone,
--     COUNT(pe.id) as total_episodes,
--     COUNT(pe.id) FILTER (WHERE pe.status = 'completed') as completed_episodes
-- FROM users u
-- LEFT JOIN podcast_episodes pe ON u.id = pe.user_id
-- WHERE u.email LIKE '%@test.example.com'
-- GROUP BY u.id, u.email, u.name, u.timezone;

-- View user statistics using the helper function
-- SELECT * FROM get_user_stats('11111111-1111-1111-1111-111111111111');

-- View all jobs with their progress
-- SELECT
--     j.id,
--     u.email,
--     j.status,
--     j.progress_percent,
--     j.current_step,
--     j.created_at
-- FROM podcast_generation_jobs j
-- JOIN users u ON j.user_id = u.id
-- WHERE u.email LIKE '%@test.example.com'
-- ORDER BY j.created_at DESC;
