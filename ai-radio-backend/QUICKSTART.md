# AI Radio Backend - Quick Start Guide

This guide will help you get the AI Radio backend up and running in development mode in under 10 minutes.

## Prerequisites

- Node.js 20+ installed
- npm or yarn installed
- A Supabase account
- OpenAI API key
- Google Cloud account (for OAuth and deployment)

## Step-by-Step Setup

### 1. Install Dependencies

```bash
cd ai-radio-backend
npm install
```

### 2. Set Up Supabase

1. Go to [https://supabase.com](https://supabase.com) and create a new project
2. Wait for the project to be provisioned (~2 minutes)
3. Go to **Project Settings > API** and copy:
   - Project URL
   - `anon` public key
   - `service_role` secret key

4. Open the **SQL Editor** and run the migration:
   - Copy the contents of `src/db/migrations/001_initial_schema.sql`
   - Paste into SQL Editor
   - Click "Run"

5. (Optional) Load test data:
   - Copy the contents of `src/db/seeds/001_test_data.sql`
   - Paste into SQL Editor
   - Click "Run"

6. Verify the setup:
   - Copy the contents of `src/db/scripts/check_health.sql`
   - Paste into SQL Editor
   - Click "Run"
   - You should see "✓" checkmarks for all items

### 3. Configure Environment Variables

```bash
cp .env.example .env
```

Edit `.env` and fill in these **required** values:

```bash
# JWT Secret (generate a random 32+ character string)
JWT_SECRET=your-very-long-secret-key-at-least-32-characters-here

# Supabase (from Step 2)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=eyJhbG...
SUPABASE_SERVICE_KEY=eyJhbG...

# OpenAI
OPENAI_API_KEY=sk-your-openai-api-key

# Google OAuth (we'll set these up next)
GOOGLE_CLIENT_ID=your-google-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-google-client-secret

# Microsoft OAuth (optional for now)
MICROSOFT_CLIENT_ID=your-microsoft-client-id
MICROSOFT_CLIENT_SECRET=your-microsoft-client-secret

# GCP
GCP_PROJECT_ID=your-gcp-project-id
```

### 4. Set Up Google OAuth (for Gmail/Calendar)

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create a new project or select an existing one
3. Enable these APIs:
   - Gmail API
   - Google Calendar API
4. Go to **APIs & Services > Credentials**
5. Click **Create Credentials > OAuth 2.0 Client ID**
6. Configure:
   - Application type: Web application
   - Authorized redirect URIs: `http://localhost:3000/api/auth/oauth/google/callback`
7. Copy the Client ID and Client Secret to your `.env` file

### 5. Run the Development Server

```bash
npm run dev
```

You should see:
```
🚀 AI Radio Backend running on 0.0.0.0:3000
📡 Environment: development
📋 API available at: http://0.0.0.0:3000/api
```

### 6. Test the API

Open your browser or use curl:

```bash
# Health check
curl http://localhost:3000/health

# API info
curl http://localhost:3000/api

# List routes
curl http://localhost:3000/api/health
```

Expected response:
```json
{
  "status": "ok",
  "timestamp": "2025-01-15T10:30:00.000Z",
  "service": "ai-radio-backend"
}
```

## Testing with Seed Data

If you loaded the test data in Step 2, you can query it directly in Supabase:

```sql
-- View test users
SELECT email, name, timezone FROM users
WHERE email LIKE '%@test.example.com';

-- View test episodes
SELECT
    u.email,
    pe.title,
    pe.status,
    pe.duration_seconds
FROM podcast_episodes pe
JOIN users u ON pe.user_id = u.id
WHERE u.email LIKE '%@test.example.com';
```

Test user credentials:
- `john.doe@test.example.com` (ID: `11111111-1111-1111-1111-111111111111`)
- `jane.smith@test.example.com` (ID: `22222222-2222-2222-2222-222222222222`)
- `alex.johnson@test.example.com` (ID: `33333333-3333-3333-3333-333333333333`)

## Development Workflow

### Type Checking

```bash
# Check for TypeScript errors
npm run type-check
```

### Building

```bash
# Compile TypeScript to JavaScript
npm run build

# Run compiled code
npm start
```

### Linting & Formatting

```bash
# Run ESLint
npm run lint

# Format code with Prettier
npm run format
```

## Common Issues & Solutions

### Issue: "Invalid environment configuration"

**Solution:** Make sure all required environment variables are set in `.env`:
- `JWT_SECRET` must be at least 32 characters
- `OPENAI_API_KEY` must start with `sk-`
- All Supabase URLs must be valid URLs

### Issue: Database connection fails

**Solution:**
1. Verify Supabase project is running
2. Check that SUPABASE_URL and keys are correct
3. Make sure you're using the `service_role` key for backend operations

### Issue: TypeScript errors

**Solution:**
```bash
# Clean and rebuild
npm run clean
npm run build
```

### Issue: Port 3000 already in use

**Solution:**
Change the port in `.env`:
```bash
PORT=3001
```

## Next Steps

Now that your backend is running, you can:

1. **Implement OAuth Flows**
   - See `src/routes/auth.js` for OAuth route stubs
   - See `src/services/gmail.js` and `src/services/outlook.js` for API integration stubs

2. **Test Email Integration**
   - Store OAuth tokens for a test user
   - Implement `fetchEmails()` in `src/services/gmail.js`

3. **Generate Your First Podcast**
   - Implement `generateRadioScript()` in `src/services/openai.js`
   - Use the prompts in `src/services/ai/prompts.ts`

4. **Add Text-to-Speech**
   - Implement `convertTextToSpeech()` in `src/services/tts.js`
   - Configure Google TTS or ElevenLabs

5. **Deploy to Cloud Run**
   - See the [Deployment Guide](README.md#deployment-to-cloud-run)

## Useful Resources

### Documentation
- [Full README](README.md) - Complete project documentation
- [Database Guide](src/db/README.md) - Database schema and migrations
- [API Endpoints](README.md#api-endpoints) - All available endpoints

### Database Scripts
- [Health Check](src/db/scripts/check_health.sql) - Verify database integrity
- [Maintenance](src/db/scripts/maintenance.sql) - Cleanup and optimization
- [Common Queries](src/db/scripts/queries.sql) - Development queries

### API Documentation
- OpenAI API: https://platform.openai.com/docs
- Gmail API: https://developers.google.com/gmail/api
- Microsoft Graph: https://docs.microsoft.com/en-us/graph/
- Supabase: https://supabase.com/docs

## Getting Help

If you encounter issues:

1. Check the [main README](README.md) for detailed documentation
2. Review the [database README](src/db/README.md) for schema details
3. Run the health check script to verify your setup
4. Check TypeScript types in `src/types/` for data structures

## Project Structure

```
ai-radio-backend/
├── src/
│   ├── types/              # TypeScript type definitions
│   ├── config/             # Configuration (environment, etc.)
│   ├── db/
│   │   ├── migrations/     # Database migrations
│   │   ├── seeds/          # Test data
│   │   └── scripts/        # Maintenance scripts
│   ├── services/           # Business logic
│   │   └── ai/             # AI prompts and helpers
│   ├── middleware/         # Express middleware
│   ├── routes/             # API routes
│   └── index.js           # Entry point
├── dist/                   # Compiled JavaScript (generated)
├── .env                    # Your local config
├── tsconfig.json          # TypeScript config
└── package.json           # Dependencies and scripts
```

## Happy Coding! 🎉

You're all set! Start by exploring the type definitions in `src/types/` to understand the data structures, then implement the service stubs one by one.
