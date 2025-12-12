# Changelog

All notable changes to the AI Radio Backend project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### To Be Implemented
- OAuth flow implementations (Google, Microsoft)
- Email fetching and parsing (Gmail, Outlook)
- Calendar integration (Google Calendar, Outlook Calendar)
- OpenAI script generation
- Text-to-speech conversion
- Podcast generation pipeline
- Audio post-processing with ffmpeg
- OAuth token encryption at rest

## [0.1.0] - 2025-01-15

### Added - Foundation Complete

#### Type System
- Complete TypeScript type definitions for database, email, calendar, and podcast
- Runtime environment validation with Zod
- Strict TypeScript configuration with comprehensive type checking

#### Database
- Full Supabase schema migration with 4 tables
  - `users` - User accounts with JSONB preferences
  - `oauth_tokens` - OAuth token storage with encryption notes
  - `podcast_episodes` - Generated podcast episodes
  - `podcast_generation_jobs` - Async job tracking
- Row Level Security (RLS) policies on all tables
- Optimized indexes for common query patterns
- Helper functions: `cleanup_expired_tokens()`, `get_user_stats()`
- Automatic `updated_at` triggers

#### Test Data & Scripts
- Comprehensive seed data with 3 test users
- OAuth tokens for Google and Microsoft
- Sample podcast episodes in various states
- Generation jobs for testing
- Health check script for database verification
- Maintenance script for cleanup and optimization
- Common development queries collection
- Database reset script with safety checks

#### AI Integration
- Professional two-host podcast prompt system
  - Host 1 (Alex): Upbeat and energetic
  - Host 2 (Jordan): Analytical and thoughtful
- Email and calendar summarization prompts
- Content filtering and prioritization prompts
- Dynamic prompt generation with user context

#### Deployment
- Multi-stage Docker build optimized for Node 20
- Cloud Build configuration with Artifact Registry
- Cloud Run deployment with Secret Manager integration
- OIDC webhook security configuration
- Health check endpoints

#### Development Tools
- ESLint configuration for TypeScript
- Prettier code formatting
- tsx for fast TypeScript development
- Hot reload with watch mode
- Type checking without building

#### Documentation
- Comprehensive README with setup instructions
- Quick start guide for 10-minute setup
- Complete database documentation
- Implementation summary with roadmap
- API endpoint documentation
- Security considerations guide
- Troubleshooting guide

#### Configuration
- Environment variable validation
- Example .env file with all variables
- Docker and Cloud Run configuration
- TypeScript compiler configuration
- Git ignore rules

### Project Structure
```
ai-radio-backend/
├── src/
│   ├── types/          # TypeScript definitions
│   ├── config/         # Configuration
│   ├── db/
│   │   ├── migrations/ # Database schema
│   │   ├── seeds/      # Test data
│   │   └── scripts/    # Maintenance scripts
│   ├── services/       # Business logic (stubs)
│   │   └── ai/         # AI prompts
│   ├── middleware/     # Express middleware (stubs)
│   └── routes/         # API routes (stubs)
├── docs/               # Documentation
├── .env.example        # Environment template
├── tsconfig.json       # TypeScript config
├── Dockerfile          # Docker build
└── cloudbuild.yaml     # Cloud Build config
```

### Notes
- All service implementations are stubs with TODO comments
- OAuth token encryption should be implemented before production
- Rate limiting needs fine-tuning based on actual usage
- Audio mixing requires ffmpeg integration

---

## Version History

- **0.1.0** - Foundation complete with TypeScript, database, and documentation
- **Unreleased** - Service implementations pending

## Contributing

When adding changes:
1. Update this CHANGELOG under [Unreleased]
2. Follow semantic versioning
3. Document breaking changes clearly
4. Include migration instructions if needed

## Categories

Use these categories for organizing changes:
- **Added** - New features
- **Changed** - Changes to existing functionality
- **Deprecated** - Soon-to-be removed features
- **Removed** - Removed features
- **Fixed** - Bug fixes
- **Security** - Security improvements
