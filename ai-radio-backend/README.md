# AI Radio Backend

Backend service for the AI Radio application - generates personalized podcast episodes from emails and calendar events using TypeScript.

## Project Structure

```
ai-radio-backend/
├── src/
│   ├── config/          # Configuration files
│   │   ├── environment.ts   # Environment validation with Zod
│   │   ├── app.js           # Application settings (TODO: migrate to TS)
│   │   ├── database.js      # Supabase configuration (TODO: migrate to TS)
│   │   └── ...
│   ├── types/           # TypeScript type definitions
│   │   ├── database.ts      # Database schema types
│   │   ├── email.ts         # Email integration types
│   │   ├── calendar.ts      # Calendar integration types
│   │   └── podcast.ts       # Podcast generation types
│   ├── db/
│   │   └── migrations/      # Database migrations
│   │       └── 001_initial_schema.sql
│   ├── services/        # Business logic services
│   │   ├── ai/
│   │   │   └── prompts.ts   # AI prompt templates
│   │   ├── gmail.js         # Gmail integration (TODO: migrate to TS)
│   │   ├── outlook.js       # Outlook integration (TODO: migrate to TS)
│   │   └── ...
│   ├── middleware/      # Express middleware
│   ├── routes/          # API routes
│   └── index.js         # Application entry point (TODO: migrate to TS)
├── dist/                # Compiled JavaScript (generated)
├── Dockerfile           # Multi-stage Docker build
├── cloudbuild.yaml      # Cloud Build configuration
├── tsconfig.json        # TypeScript configuration
└── package.json         # Dependencies
```

## Setup

### Prerequisites

- Node.js 20+
- npm or yarn
- Supabase account
- Google Cloud Platform account (for deployment)

### Installation

1. Clone the repository
2. Install dependencies:
   ```bash
   npm install
   ```

3. Copy `.env.example` to `.env` and fill in your credentials:
   ```bash
   cp .env.example .env
   ```

4. Configure environment variables (see `.env.example`)

### Development

Run the development server with TypeScript watch mode:
```bash
npm run dev
```

Type check without building:
```bash
npm run type-check
```

Build TypeScript to JavaScript:
```bash
npm run build
```

The server will start on `http://localhost:3000`

## API Endpoints

### Authentication
- `POST /api/auth/login` - User login
- `POST /api/auth/signup` - User registration
- `POST /api/auth/logout` - User logout
- `GET /api/auth/oauth/google` - Google OAuth
- `GET /api/auth/oauth/microsoft` - Microsoft OAuth

### Podcast
- `POST /api/podcast/generate` - Generate podcast episode
- `GET /api/podcast/episodes` - List user episodes
- `GET /api/podcast/episodes/:id` - Get episode details
- `DELETE /api/podcast/episodes/:id` - Delete episode

### User
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update profile
- `GET /api/user/preferences` - Get preferences
- `PUT /api/user/preferences` - Update preferences

### Health
- `GET /health` - Basic health check
- `GET /health/ready` - Readiness check
- `GET /health/live` - Liveness check

## Database Setup

### Supabase Migration

1. Create a new Supabase project at https://supabase.com

2. Run the initial migration:
   ```bash
   # In Supabase SQL Editor, copy and paste:
   src/db/migrations/001_initial_schema.sql
   ```

3. (Optional) Load test data for development:
   ```bash
   # In Supabase SQL Editor, copy and paste:
   src/db/seeds/001_test_data.sql
   ```

4. The schema includes:
   - **users** - User accounts with preferences
   - **oauth_tokens** - OAuth tokens (with encryption notes)
   - **podcast_episodes** - Generated episodes with scripts
   - **podcast_generation_jobs** - Async job tracking
   - Row Level Security (RLS) policies on all tables
   - Helper functions for stats and cleanup

5. Useful maintenance scripts:
   - [src/db/scripts/check_health.sql](src/db/scripts/check_health.sql) - Verify database integrity
   - [src/db/scripts/maintenance.sql](src/db/scripts/maintenance.sql) - Cleanup and optimization
   - [src/db/scripts/queries.sql](src/db/scripts/queries.sql) - Common development queries

See [src/db/README.md](src/db/README.md) for detailed database documentation.

## Deployment to Cloud Run

### Prerequisites
- Google Cloud SDK installed
- GCP project created with billing enabled
- Artifact Registry repository created

### Setup GCP Resources

```bash
# Create service account
gcloud iam service-accounts create ai-radio-backend

# Create Artifact Registry repository
gcloud artifacts repositories create ai-radio \
  --repository-format=docker \
  --location=us-central1

# Store secrets in Secret Manager
echo -n "your-secret-value" | gcloud secrets create SECRET_NAME --data-file=-

# Grant secret access to service account
gcloud secrets add-iam-policy-binding SECRET_NAME \
  --member="serviceAccount:ai-radio-backend@PROJECT_ID.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"
```

### Deploy

Build and deploy using Cloud Build:
```bash
gcloud builds submit --config cloudbuild.yaml
```

The deployment includes:
- Multi-stage Docker build with TypeScript compilation
- Secrets from Secret Manager
- Health checks and auto-scaling
- OIDC authentication for webhooks

## Environment Variables

See [.env.example](.env.example) for a complete list of required environment variables. Key variables:

- **SUPABASE_URL**, **SUPABASE_SERVICE_KEY** - Database connection
- **OPENAI_API_KEY** - AI script generation
- **GOOGLE_CLIENT_ID**, **GOOGLE_CLIENT_SECRET** - Gmail/Calendar OAuth
- **MICROSOFT_CLIENT_ID**, **MICROSOFT_CLIENT_SECRET** - Outlook OAuth
- **JWT_SECRET** - Must be at least 32 characters

## Type System

This project uses TypeScript with strict type checking. Key type definitions:

- [src/types/database.ts](src/types/database.ts) - Database schema types
- [src/types/email.ts](src/types/email.ts) - Email integration types
- [src/types/calendar.ts](src/types/calendar.ts) - Calendar types
- [src/types/podcast.ts](src/types/podcast.ts) - Podcast generation types

Environment validation uses Zod in [src/config/environment.ts](src/config/environment.ts).

## Implementation Notes

### Security Considerations
- **OAuth Tokens**: Should be encrypted at rest using pgcrypto or Supabase Vault
- **Rate Limiting**: Gmail API has 250 quota units/second limit
- **Webhook Security**: Cloud Scheduler webhooks need OIDC token validation
- **RLS Policies**: Enforced at database level for all tables

### Performance Considerations
- **Audio Mixing**: May require ffmpeg for combining host tracks with crossfade
- **Retry Logic**: All external API calls should use exponential backoff
- **Caching**: Consider Redis for OAuth tokens and user preferences

## TODO

All service implementations are placeholder stubs. Implementation needed for:

### High Priority
- [ ] Migrate existing JS files to TypeScript
- [ ] Authentication & OAuth flows (Google, Microsoft)
- [ ] Gmail API integration with rate limiting
- [ ] Outlook API integration with throttling
- [ ] Calendar API integration
- [ ] OpenAI script generation with prompt engineering
- [ ] Text-to-speech conversion (Google TTS/ElevenLabs)

### Medium Priority
- [ ] Podcast generation pipeline orchestration
- [ ] Audio post-processing with ffmpeg
- [ ] Cloud storage integration (Supabase Storage/GCS)
- [ ] Error handling & logging (structured logging)
- [ ] Token encryption at rest
- [ ] Webhook signature verification

### Low Priority
- [ ] Unit tests with Jest
- [ ] Integration tests
- [ ] E2E tests
- [ ] Performance monitoring
- [ ] Analytics and usage tracking

## License

MIT
