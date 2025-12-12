# Database Migrations & Seeds

This directory contains SQL migrations and seed files for the AI Radio backend Supabase database.

## Structure

```
db/
├── migrations/          # Schema migrations
│   └── 001_initial_schema.sql
├── seeds/              # Test data seeds
│   └── 001_test_data.sql
└── README.md           # This file
```

## Running Migrations

### Initial Setup

1. Create a new Supabase project at [https://supabase.com](https://supabase.com)

2. Open the SQL Editor in your Supabase dashboard

3. Run the initial migration:
   ```sql
   -- Copy and paste the contents of:
   -- migrations/001_initial_schema.sql
   ```

4. Verify the migration:
   ```sql
   -- Check tables
   SELECT table_name
   FROM information_schema.tables
   WHERE table_schema = 'public';

   -- Should show: users, oauth_tokens, podcast_episodes, podcast_generation_jobs
   ```

### Loading Test Data (Development Only)

**WARNING: Never run seed files in production!**

```sql
-- Copy and paste the contents of:
-- seeds/001_test_data.sql
```

This will create:
- 3 test users with different configurations
- OAuth tokens for Google and Microsoft
- Sample podcast episodes in various states
- Generation jobs for testing the pipeline

## Database Schema Overview

### Tables

#### users
Stores user accounts with preferences for podcast generation.

**Key columns:**
- `id` - UUID primary key
- `email` - Unique email address
- `name` - User's display name
- `timezone` - User's timezone (e.g., 'America/New_York')
- `preferences` - JSONB with briefing preferences

**Preferences structure:**
```json
{
  "briefing_time": "07:00",
  "topics": ["technology", "business"],
  "voice_host1": "en-US-Neural2-J",
  "voice_host2": "en-US-Neural2-D",
  "include_weather": true,
  "include_calendar": true,
  "include_email": true
}
```

#### oauth_tokens
Stores OAuth tokens for external service integrations.

**Key columns:**
- `user_id` - References users.id
- `provider` - 'google' or 'microsoft'
- `access_token` - OAuth access token (TODO: encrypt)
- `refresh_token` - OAuth refresh token (TODO: encrypt)
- `expires_at` - Token expiration timestamp
- `scopes` - Array of OAuth scopes

**Security Note:** Tokens should be encrypted at rest using pgcrypto or Supabase Vault.

#### podcast_episodes
Stores generated podcast episodes.

**Key columns:**
- `user_id` - References users.id
- `title` - Episode title
- `description` - Episode description
- `script` - JSONB containing the podcast script with segments
- `audio_url` - URL to the generated audio file
- `duration_seconds` - Audio duration
- `status` - 'pending', 'generating', 'completed', or 'failed'

**Script structure:**
```json
{
  "segments": [
    {
      "speaker": "host1",
      "text": "Good morning!",
      "type": "intro",
      "duration_estimate": 5
    }
  ],
  "total_duration_estimate": 300
}
```

#### podcast_generation_jobs
Tracks async podcast generation jobs.

**Key columns:**
- `user_id` - References users.id
- `episode_id` - References podcast_episodes.id
- `status` - 'queued', 'processing', 'completed', or 'failed'
- `progress_percent` - 0-100
- `current_step` - Description of current step
- `metadata` - JSONB with generation metadata

### Row Level Security (RLS)

All tables have RLS enabled. Users can only:
- View their own data
- Insert their own records
- Update their own records
- Delete their own records

Service role key bypasses RLS for backend operations.

### Helper Functions

#### cleanup_expired_tokens()
Removes OAuth tokens that expired more than 7 days ago.

```sql
SELECT cleanup_expired_tokens();
-- Returns: number of tokens deleted
```

#### get_user_stats(user_uuid)
Returns statistics for a user's podcast episodes.

```sql
SELECT * FROM get_user_stats('user-uuid-here');
-- Returns: total_episodes, completed_episodes, failed_episodes,
--          total_duration_seconds, last_episode_date
```

## Test Data Details

### Test Users

1. **john.doe@test.example.com**
   - ID: `11111111-1111-1111-1111-111111111111`
   - Timezone: America/New_York
   - Has 3 episodes (2 completed, 1 failed)

2. **jane.smith@test.example.com**
   - ID: `22222222-2222-2222-2222-222222222222`
   - Timezone: America/Los_Angeles
   - Has 2 episodes (1 completed, 1 generating)

3. **alex.johnson@test.example.com**
   - ID: `33333333-3333-3333-3333-333333333333`
   - Timezone: Europe/London
   - Has 1 episode (pending)

### Testing Queries

```sql
-- View all test users
SELECT email, name, timezone, preferences
FROM users
WHERE email LIKE '%@test.example.com';

-- View episodes by status
SELECT
    u.email,
    pe.title,
    pe.status,
    pe.duration_seconds,
    pe.created_at
FROM podcast_episodes pe
JOIN users u ON pe.user_id = u.id
WHERE u.email LIKE '%@test.example.com'
ORDER BY pe.created_at DESC;

-- View active jobs
SELECT
    u.email,
    j.status,
    j.progress_percent,
    j.current_step,
    j.created_at
FROM podcast_generation_jobs j
JOIN users u ON j.user_id = u.id
WHERE u.email LIKE '%@test.example.com'
  AND j.status IN ('queued', 'processing')
ORDER BY j.created_at DESC;

-- Get stats for a user
SELECT * FROM get_user_stats('11111111-1111-1111-1111-111111111111');
```

## Cleaning Up Test Data

```sql
-- Remove all test data
DELETE FROM podcast_generation_jobs
WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE '%@test.example.com'
);

DELETE FROM podcast_episodes
WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE '%@test.example.com'
);

DELETE FROM oauth_tokens
WHERE user_id IN (
    SELECT id FROM users WHERE email LIKE '%@test.example.com'
);

DELETE FROM users
WHERE email LIKE '%@test.example.com';
```

## Database Indexes

The schema includes optimized indexes for:
- User lookups by email
- OAuth token lookups by user and provider
- Episode queries by user and status
- Job tracking by status and creation time

## Security Considerations

### OAuth Token Encryption

Currently, OAuth tokens are stored in plain text. **This must be addressed before production deployment.**

**Option 1: pgcrypto (Application-level encryption)**
```sql
-- Encrypt when inserting
INSERT INTO oauth_tokens (access_token, refresh_token, ...)
VALUES (
    pgp_sym_encrypt('token_value', current_setting('app.encryption_key')),
    pgp_sym_encrypt('refresh_token_value', current_setting('app.encryption_key')),
    ...
);

-- Decrypt when reading
SELECT pgp_sym_decrypt(access_token::bytea, current_setting('app.encryption_key'))
FROM oauth_tokens;
```

**Option 2: Supabase Vault**
Store tokens in Supabase Vault and reference them by ID.

### Rate Limiting

Consider implementing database-level rate limiting:
```sql
-- Track API call rates per user
CREATE TABLE api_rate_limits (
    user_id UUID REFERENCES users(id),
    endpoint TEXT,
    call_count INTEGER,
    window_start TIMESTAMPTZ,
    PRIMARY KEY (user_id, endpoint, window_start)
);
```

### Audit Logging

For compliance, consider adding audit logs:
```sql
-- Track sensitive operations
CREATE TABLE audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES users(id),
    action TEXT NOT NULL,
    resource_type TEXT NOT NULL,
    resource_id UUID,
    metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
```

## Backup & Recovery

### Export Data
```bash
# Using Supabase CLI
supabase db dump -f backup.sql

# Or via pg_dump
pg_dump -h your-project.supabase.co -U postgres -d postgres > backup.sql
```

### Restore Data
```bash
# Using psql
psql -h your-project.supabase.co -U postgres -d postgres < backup.sql
```

## Migration Best Practices

1. **Always backup** before running migrations in production
2. **Test migrations** in a staging environment first
3. **Use transactions** for complex migrations
4. **Document changes** in migration files
5. **Version control** all migration files
6. **Never edit** already-run migrations

## Future Migrations

When adding new migrations:
1. Create a new file: `002_description.sql`
2. Include rollback instructions in comments
3. Test on seed data first
4. Update this README with changes

## Troubleshooting

### RLS Policies Blocking Queries?
Use the service role key for backend operations, not the anon key.

### Triggers Not Firing?
Check if the trigger function exists and is attached:
```sql
SELECT * FROM pg_trigger WHERE tgname LIKE '%updated_at%';
```

### Performance Issues?
Check query plans and consider adding indexes:
```sql
EXPLAIN ANALYZE SELECT ...;
```

## Additional Resources

- [Supabase Documentation](https://supabase.com/docs)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/)
- [RLS Policies Guide](https://supabase.com/docs/guides/auth/row-level-security)
