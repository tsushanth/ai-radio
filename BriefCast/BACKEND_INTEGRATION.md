# Backend Integration Guide

This guide explains how the BriefCast iOS app integrates with the AI Radio backend to generate personalized morning brief podcasts.

## Overview

The backend is deployed at:
```
https://ai-radio-backend-917362189743.us-central1.run.app
```

## Architecture

```
┌─────────────────────┐
│   iOS App           │
│  (BriefCast)        │
└──────────┬──────────┘
           │
           │ HTTPS/REST API
           │
┌──────────▼──────────┐
│   Backend API       │
│  (Node.js/Express)  │
└──────────┬──────────┘
           │
    ┌──────┴──────┬─────────────┬──────────────┐
    │             │             │              │
┌───▼────┐  ┌────▼─────┐  ┌───▼────┐    ┌────▼─────┐
│ Gmail  │  │ Calendar │  │ OpenAI │    │ Storage  │
│  API   │  │   API    │  │  API   │    │ (GCS)    │
└────────┘  └──────────┘  └────────┘    └──────────┘
```

## API Endpoints

### 1. Linked Accounts Management

#### Store OAuth Tokens
```
POST /api/linked-accounts/:userId
```

**Request Body:**
```json
{
  "provider": "google" | "microsoft",
  "email": "user@gmail.com",
  "access_token": "ya29.a0...",
  "refresh_token": "1//0g...",
  "email_enabled": true,
  "calendar_enabled": true
}
```

**Response:**
```json
{
  "success": true,
  "linked_account": {
    "id": "acc_1234567890",
    "provider": "google",
    "email": "user@gmail.com",
    "email_enabled": true,
    "calendar_enabled": true,
    "created_at": "2024-01-01T00:00:00Z"
  }
}
```

**iOS Implementation:**
- Location: `LinkedAccountsView.swift` → `LinkedAccountsViewModel.storeLinkedAccount()`
- Called after: Google/Microsoft OAuth completes successfully
- Purpose: Securely store OAuth tokens on backend for podcast generation

#### Get Linked Accounts
```
GET /api/linked-accounts/:userId
```

**Response:**
```json
{
  "success": true,
  "linked_accounts": [
    {
      "id": "acc_1234567890",
      "provider": "google",
      "email": "user@gmail.com",
      "created_at": "2024-01-01T00:00:00Z",
      "email_enabled": true,
      "calendar_enabled": true
    }
  ]
}
```

#### Update Permissions
```
PATCH /api/linked-accounts/:userId/:accountId
```

**Request Body:**
```json
{
  "email_enabled": false,
  "calendar_enabled": true
}
```

#### Delete Linked Account
```
DELETE /api/linked-accounts/:userId/:accountId
```

### 2. Podcast Generation

#### Generate Morning Brief
```
POST /api/podcast/generate
```

**Request Body:**
```json
{
  "user_id": "user@example.com",
  "preferences": {
    "briefing_time": "07:00",
    "topics": ["Technology", "AI", "Business"],
    "voice_host1": "nova",
    "voice_host2": "onyx",
    "include_weather": false,
    "include_calendar": true,
    "include_email": true
  },
  "options": {
    "skip_email": false,
    "skip_calendar": false,
    "skip_upload": false,
    "voice_speed": 1.0,
    "parallel_tts": true,
    "tts_concurrency": 5
  }
}
```

**Response:**
```json
{
  "success": true,
  "episode": {
    "id": "ep_1704096000_user",
    "audio_url": "https://storage.googleapis.com/.../podcast.mp3",
    "duration_seconds": 312,
    "script_segments": 12
  },
  "cost_estimate": {
    "script_cost_usd": 0.0234,
    "tts_cost_usd": 0.0075,
    "total_cost_usd": 0.0309
  }
}
```

**iOS Implementation:**
- Service: `PodcastService.swift` → `generatePodcast()`
- Called from: Home screen "Generate Brief" button
- Progress: Backend sends progress updates (future: WebSocket/SSE)

#### Estimate Cost
```
POST /api/podcast/estimate
```

**Request Body:**
```json
{
  "user_id": "user@example.com",
  "preferences": {
    "include_email": true,
    "include_calendar": true
  }
}
```

**Response:**
```json
{
  "success": true,
  "estimate": {
    "script_cost_usd": 0.0234,
    "tts_cost_usd": 0.0075,
    "total_cost_usd": 0.0309,
    "estimated_duration_seconds": 300
  }
}
```

#### Get Episodes
```
GET /api/podcast/episodes/:userId?limit=10&offset=0
```

**Response:**
```json
{
  "success": true,
  "episodes": [
    {
      "id": "ep_1704096000_user",
      "title": "Daily Briefing - Monday, January 1, 2024",
      "description": "Your personalized daily briefing...",
      "audio_url": "https://storage.googleapis.com/.../podcast.mp3",
      "duration_seconds": 312,
      "generated_at": "2024-01-01T07:00:00Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 45
  }
}
```

### 3. User Management

#### Get User Profile
```
GET /api/user/:userId
```

#### Update Preferences
```
PUT /api/user/:userId/preferences
```

**Request Body:**
```json
{
  "briefing_time": "07:30",
  "topics": ["Technology", "AI"],
  "voice_host1": "nova",
  "voice_host2": "onyx",
  "include_weather": true,
  "include_calendar": true,
  "include_email": true
}
```

## Backend Pipeline

When a podcast is generated, the backend performs these steps:

### Step 1: Fetch Data (20%)
```typescript
// Fetch from Gmail API
const emails = await gmailService.fetchEmails(userId, {
  max_results: 50,
  since_hours: 24,
  exclude_categories: ['promotions', 'social', 'updates']
});

// Fetch from Google Calendar API
const calendarEvents = await googleCalendarService.fetchTodayAndTomorrowEvents(userId);
```

### Step 2: Generate Script (40%)
```typescript
// Use GPT-4 to generate podcast script
const script = await scriptGenerator.generateScriptWithRetry({
  user_id: userId,
  emails,
  calendar_events: calendarEvents,
  date: new Date().toISOString().split('T')[0],
  preferences
}, 3);

// Script format:
{
  segments: [
    { speaker: 'host1', text: 'Good morning!', type: 'intro', sequence: 1 },
    { speaker: 'host2', text: 'Hello! Ready for today?', type: 'intro', sequence: 2 },
    { speaker: 'host1', text: 'You have 3 important emails...', type: 'email', sequence: 3 },
    // ... more segments
  ],
  total_segments: 12,
  estimated_duration_seconds: 300
}
```

### Step 3: Generate Audio (70%)
```typescript
// Use OpenAI TTS to convert script to audio
const audioSegments = await openaiTTS.synthesizeScriptParallel(
  script,
  {
    host1_voice: 'nova',
    host2_voice: 'onyx',
    speed: 1.0,
    model: 'tts-1-hd'
  },
  5 // concurrency
);

// Each segment is synthesized separately then concatenated
```

### Step 4: Upload (90%)
```typescript
// Upload to Google Cloud Storage
const audioUrl = await storageService.uploadPodcast(
  audioSegments,
  userId,
  episodeId
);
```

### Step 5: Save Episode (100%)
```typescript
// Save metadata to database
await saveEpisode({
  user_id: userId,
  title: `Daily Briefing - ${date}`,
  audio_url: audioUrl,
  duration_seconds: totalDuration,
  script,
  status: 'completed'
});
```

## iOS Integration Points

### 1. Account Linking Flow

```swift
// User taps "Connect Google" in Profile
LinkedAccountsView
  → LinkedAccountsViewModel.connectAccount()
    → GoogleOAuthHelper.requestAccess()  // Get tokens from Google
      → LinkedAccountsViewModel.storeLinkedAccount()  // Store in backend
```

**Key Files:**
- `LinkedAccountsView.swift`
- `LinkedAccountsViewModel.swift`
- `GoogleOAuthHelper.swift`
- `MicrosoftOAuthHelper.swift`

### 2. Podcast Generation Flow

```swift
// User taps "Generate Brief" on Home
HomeView
  → HomeViewModel.generateBrief()
    → PodcastService.generatePodcast()  // Call backend API
      → Display audio player with episode URL
```

**Key Files:**
- `HomeView.swift` (to be updated)
- `PodcastService.swift`

### 3. Episode Playback Flow

```swift
// User selects episode from history
EpisodeListView
  → EpisodeDetailView
    → AudioPlayer plays from episode.audio_url
```

## Required Backend Environment Variables

The backend needs these environment variables configured:

```yaml
# OAuth Configuration
GOOGLE_CLIENT_ID: "917362189743-..."
GOOGLE_CLIENT_SECRET: "GOCSPX-..."
MICROSOFT_CLIENT_ID: "..."
MICROSOFT_CLIENT_SECRET: "..."

# OpenAI API
OPENAI_API_KEY: "sk-..."

# Google Cloud Storage
GCS_BUCKET_NAME: "ai-radio-podcasts"
GCS_PROJECT_ID: "..."

# Supabase (optional - for database)
SUPABASE_URL: "https://..."
SUPABASE_KEY: "..."
```

## Testing the Integration

### 1. Test Account Linking

```bash
# Test storing Google OAuth tokens
curl -X POST https://ai-radio-backend-917362189743.us-central1.run.app/api/linked-accounts/test@example.com \
  -H "Content-Type: application/json" \
  -d '{
    "provider": "google",
    "email": "user@gmail.com",
    "access_token": "test_token",
    "refresh_token": "test_refresh",
    "email_enabled": true,
    "calendar_enabled": true
  }'
```

### 2. Test Podcast Generation

```bash
# Test generating a podcast
curl -X POST https://ai-radio-backend-917362189743.us-central1.run.app/api/podcast/generate \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "test@example.com",
    "preferences": {
      "briefing_time": "07:00",
      "topics": ["Technology"],
      "voice_host1": "nova",
      "voice_host2": "onyx",
      "include_weather": false,
      "include_calendar": true,
      "include_email": true
    }
  }'
```

### 3. Test from iOS

1. Link a Google account in Profile
2. Check backend logs to verify token was stored
3. Generate a brief from Home screen
4. Verify podcast generation completes
5. Play the generated audio

## Security Considerations

### OAuth Token Storage
- **Never store tokens in iOS app** - always send to backend immediately
- Backend should encrypt tokens at rest
- Use HTTPS for all API communication
- Implement token refresh logic on backend

### API Authentication
- Future: Add authentication to backend endpoints
- Use Supabase Auth JWT tokens
- Validate user owns the resources they're accessing

### Rate Limiting
- Backend implements rate limiting per user
- Prevent abuse of expensive OpenAI API calls
- Monitor costs and set budgets

## Cost Monitoring

### Typical Costs per Episode
- **GPT-4 Turbo (script)**: ~$0.02-0.05
- **OpenAI TTS HD**: ~$0.01-0.02
- **Total per episode**: ~$0.03-0.07

### Daily Cost for Active User
- 1 brief/day = ~$2.10/month
- 30 days × $0.07 = $2.10

### Optimization Strategies
1. Cache frequent emails (newsletters)
2. Batch TTS requests
3. Use standard TTS for testing
4. Implement usage quotas per user

## Next Steps

1. **Database Integration**
   - Set up Supabase tables for users, oauth_tokens, episodes
   - Migrate from in-memory to persistent storage

2. **Real-time Progress**
   - Implement WebSocket or SSE for generation progress
   - Show live updates in iOS app

3. **Background Generation**
   - Schedule daily podcasts via Cloud Scheduler
   - Send push notifications when ready

4. **Analytics**
   - Track generation success/failure rates
   - Monitor costs per user
   - Measure audio quality metrics

5. **Testing**
   - Unit tests for backend services
   - Integration tests for full pipeline
   - iOS UI tests for flows

## Troubleshooting

### Backend Returns 400 "Prerequisites not met"
- User hasn't linked Gmail/Calendar account yet
- OAuth tokens are expired or invalid
- Check linked accounts in Profile

### Backend Returns 500 "Generation failed"
- Check backend logs in Google Cloud Console
- Verify OpenAI API key is valid
- Ensure Gmail/Calendar APIs are enabled

### iOS Can't Connect to Backend
- Verify backend URL is correct
- Check iOS App Transport Security settings
- Ensure backend is deployed and running

### Audio URL Returns 404
- GCS bucket permissions may be incorrect
- Audio file may have been deleted
- Check storage service logs

## Support

For issues or questions:
- Backend logs: Google Cloud Console → Cloud Run → Logs
- iOS debugging: Xcode Console
- API testing: Use Postman or curl
- Documentation: See API.md in backend repository
