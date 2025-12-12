# AI Radio API Documentation

Complete REST API for AI-powered personalized podcast generation.

## Base URL

```
Development: http://localhost:3000/api
Production: https://your-domain.com/api
```

## Authentication

Most endpoints require OAuth authentication via Google or Microsoft. See [Authentication](#authentication-endpoints) section.

---

## Table of Contents

1. [Authentication Endpoints](#authentication-endpoints)
2. [Podcast Endpoints](#podcast-endpoints)
3. [User Endpoints](#user-endpoints)
4. [Health Check Endpoints](#health-check-endpoints)
5. [Error Responses](#error-responses)

---

## Authentication Endpoints

### Initiate Google OAuth

```http
GET /auth/oauth/google
```

**Query Parameters:**
- `redirect_url` (optional): URL to redirect after authentication

**Response:**
Redirects to Google OAuth consent screen

---

### Google OAuth Callback

```http
GET /auth/oauth/google/callback
```

**Query Parameters:**
- `code`: Authorization code from Google
- `state`: State parameter for CSRF protection

**Response:**
Redirects to frontend with success/error parameters

---

### Initiate Microsoft OAuth

```http
GET /auth/oauth/microsoft
```

**Query Parameters:**
- `redirect_url` (optional): URL to redirect after authentication

**Response:**
Redirects to Microsoft OAuth consent screen

---

### Microsoft OAuth Callback

```http
GET /auth/oauth/microsoft/callback
```

**Query Parameters:**
- `code`: Authorization code from Microsoft
- `state`: State parameter for CSRF protection

**Response:**
Redirects to frontend with success/error parameters

---

### Refresh Token

```http
POST /auth/refresh
```

**Request Body:**
```json
{
  "userId": "user@example.com",
  "provider": "google" | "microsoft"
}
```

**Response:**
```json
{
  "success": true,
  "expiresAt": "2024-01-15T12:00:00Z"
}
```

---

### Revoke Token

```http
DELETE /auth/revoke/:provider
```

**Path Parameters:**
- `provider`: `google` or `microsoft`

**Request Body:**
```json
{
  "userId": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "message": "google integration disconnected"
}
```

---

### Check Auth Status

```http
GET /auth/status?userId=user@example.com
```

**Query Parameters:**
- `userId`: User email address

**Response:**
```json
{
  "google": {
    "connected": true
  },
  "microsoft": {
    "connected": false
  }
}
```

---

## Podcast Endpoints

### Generate Podcast

```http
POST /podcast/generate
```

**Request Body:**
```json
{
  "user_id": "user@example.com",
  "preferences": {
    "briefing_time": "07:00",
    "topics": ["work", "meetings"],
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
    "id": "ep_1234567890_user",
    "audio_url": "https://storage.example.com/podcasts/user_1234567890.mp3",
    "duration_seconds": 305,
    "script_segments": 15
  },
  "cost_estimate": {
    "script_cost_usd": 0.08,
    "tts_cost_usd": 0.07,
    "total_cost_usd": 0.15,
    "estimated_duration_seconds": 300
  }
}
```

**Validation Errors:**
```json
{
  "error": "Validation failed",
  "issues": [
    {
      "code": "invalid_email",
      "path": ["user_id"],
      "message": "Invalid email format"
    }
  ]
}
```

---

### Estimate Generation Cost

```http
POST /podcast/estimate
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
    "script_cost_usd": 0.08,
    "tts_cost_usd": 0.07,
    "total_cost_usd": 0.15,
    "estimated_duration_seconds": 300
  }
}
```

---

### Validate Prerequisites

```http
POST /podcast/validate
```

**Request Body:**
```json
{
  "user_id": "user@example.com"
}
```

**Response:**
```json
{
  "success": true,
  "valid": false,
  "issues": [
    "No OAuth tokens found - user needs to authenticate",
    "OpenAI API key not configured"
  ]
}
```

---

### Generate Scheduled Podcast

```http
POST /podcast/scheduled/:userId
```

**Path Parameters:**
- `userId`: User email address

**Response:**
```json
{
  "success": true,
  "episode": {
    "id": "ep_1234567890_user",
    "audio_url": "https://storage.example.com/podcasts/user_1234567890.mp3",
    "duration_seconds": 305
  }
}
```

---

### Get Generation Stats

```http
GET /podcast/stats?start_date=2024-01-01&end_date=2024-01-31
```

**Query Parameters:**
- `start_date` (optional): Start date (ISO 8601)
- `end_date` (optional): End date (ISO 8601)

**Response:**
```json
{
  "success": true,
  "stats": {
    "period": {
      "start": "2024-01-01T00:00:00Z",
      "end": "2024-01-31T23:59:59Z"
    },
    "total_episodes": 150,
    "successful": 145,
    "failed": 5,
    "average_duration_seconds": 305,
    "total_cost_usd": 22.50,
    "success_rate": "96.7%"
  }
}
```

---

### Get User Episodes

```http
GET /podcast/episodes/:userId?limit=10&offset=0
```

**Path Parameters:**
- `userId`: User email address

**Query Parameters:**
- `limit` (optional): Number of episodes (default: 10)
- `offset` (optional): Pagination offset (default: 0)

**Response:**
```json
{
  "success": true,
  "episodes": [
    {
      "id": "ep_123",
      "title": "Daily Briefing - Monday, January 15, 2024",
      "description": "Your personalized daily briefing...",
      "audio_url": "https://...",
      "duration_seconds": 305,
      "status": "completed",
      "generated_at": "2024-01-15T07:00:00Z",
      "created_at": "2024-01-15T06:55:00Z"
    }
  ],
  "pagination": {
    "limit": 10,
    "offset": 0,
    "total": 25
  }
}
```

---

### Get Episode Details

```http
GET /podcast/episode/:episodeId
```

**Path Parameters:**
- `episodeId`: Episode ID

**Response:**
```json
{
  "success": true,
  "episode": {
    "id": "ep_123",
    "user_id": "user@example.com",
    "title": "Daily Briefing - Monday, January 15, 2024",
    "description": "Your personalized daily briefing...",
    "audio_url": "https://...",
    "duration_seconds": 305,
    "status": "completed",
    "script": {
      "segments": [
        {
          "speaker": "host1",
          "text": "Good morning! Welcome to your daily briefing...",
          "type": "intro"
        }
      ],
      "total_duration_estimate": 305
    },
    "generated_at": "2024-01-15T07:00:00Z",
    "created_at": "2024-01-15T06:55:00Z"
  }
}
```

---

### Delete Episode

```http
DELETE /podcast/episode/:episodeId
```

**Path Parameters:**
- `episodeId`: Episode ID

**Response:**
```json
{
  "success": true,
  "message": "Episode deleted"
}
```

---

## User Endpoints

### Get User Profile

```http
GET /user/:userId
```

**Path Parameters:**
- `userId`: User email address

**Response:**
```json
{
  "success": true,
  "user": {
    "id": "user@example.com",
    "email": "user@example.com",
    "name": "John Doe",
    "timezone": "America/New_York",
    "preferences": {
      "briefing_time": "07:00",
      "topics": ["work", "meetings"],
      "voice_host1": "nova",
      "voice_host2": "onyx",
      "include_weather": false,
      "include_calendar": true,
      "include_email": true
    },
    "created_at": "2024-01-01T00:00:00Z",
    "updated_at": "2024-01-15T12:00:00Z"
  }
}
```

---

### Update User Profile

```http
PUT /user/:userId
```

**Path Parameters:**
- `userId`: User email address

**Request Body:**
```json
{
  "name": "John Doe",
  "timezone": "America/New_York"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Profile updated",
  "user": {
    "id": "user@example.com",
    "name": "John Doe",
    "timezone": "America/New_York",
    "updated_at": "2024-01-15T12:00:00Z"
  }
}
```

---

### Get User Preferences

```http
GET /user/:userId/preferences
```

**Path Parameters:**
- `userId`: User email address

**Response:**
```json
{
  "success": true,
  "preferences": {
    "briefing_time": "07:00",
    "topics": ["work", "meetings"],
    "voice_host1": "nova",
    "voice_host2": "onyx",
    "include_weather": false,
    "include_calendar": true,
    "include_email": true
  }
}
```

---

### Update User Preferences

```http
PUT /user/:userId/preferences
```

**Path Parameters:**
- `userId`: User email address

**Request Body:**
```json
{
  "briefing_time": "08:00",
  "voice_host1": "echo",
  "voice_host2": "shimmer",
  "include_weather": true
}
```

**Response:**
```json
{
  "success": true,
  "message": "Preferences updated",
  "preferences": {
    "briefing_time": "08:00",
    "voice_host1": "echo",
    "voice_host2": "shimmer",
    "include_weather": true
  }
}
```

---

### Delete User

```http
DELETE /user/:userId
```

**Path Parameters:**
- `userId`: User email address

**Response:**
```json
{
  "success": true,
  "message": "User deleted"
}
```

---

### Get User Statistics

```http
GET /user/:userId/stats
```

**Path Parameters:**
- `userId`: User email address

**Response:**
```json
{
  "success": true,
  "stats": {
    "total_episodes": 25,
    "total_duration_minutes": 125,
    "last_generated": "2024-01-15T07:00:00Z",
    "connected_services": {
      "google": true,
      "microsoft": false
    }
  }
}
```

---

## Health Check Endpoints

### Basic Health Check

```http
GET /health
```

**Response:**
```json
{
  "status": "healthy",
  "timestamp": "2024-01-15T12:00:00Z",
  "uptime": 3600,
  "environment": "production"
}
```

---

### Detailed Health Check

```http
GET /health/detailed
```

**Response:**
```json
{
  "timestamp": "2024-01-15T12:00:00Z",
  "status": "healthy",
  "services": {
    "api": {
      "status": "healthy",
      "uptime": 3600
    },
    "storage": {
      "status": "healthy",
      "configured": true
    },
    "openai": {
      "status": "configured",
      "model": "gpt-4-turbo-preview"
    },
    "database": {
      "status": "healthy",
      "connected": true
    }
  },
  "environment": {
    "node_env": "production",
    "node_version": "v20.10.0",
    "platform": "linux",
    "memory": {
      "used_mb": 150,
      "total_mb": 512
    }
  }
}
```

---

### Readiness Check

```http
GET /health/ready
```

**Response:**
```json
{
  "status": "ready",
  "timestamp": "2024-01-15T12:00:00Z"
}
```

---

### Liveness Check

```http
GET /health/live
```

**Response:**
```json
{
  "status": "alive",
  "timestamp": "2024-01-15T12:00:00Z"
}
```

---

### Version Information

```http
GET /health/version
```

**Response:**
```json
{
  "version": "1.0.0",
  "build": "abc123",
  "commit": "def456",
  "node_version": "v20.10.0",
  "environment": "production"
}
```

---

### System Metrics

```http
GET /health/metrics
```

**Response:**
```json
{
  "timestamp": "2024-01-15T12:00:00Z",
  "uptime_seconds": 3600,
  "memory": {
    "heap_used_mb": 120,
    "heap_total_mb": 150,
    "rss_mb": 180,
    "external_mb": 10
  },
  "cpu": {
    "user_microseconds": 1500000,
    "system_microseconds": 500000
  },
  "process": {
    "pid": 12345,
    "platform": "linux",
    "arch": "x64"
  }
}
```

---

## Error Responses

### Standard Error Format

```json
{
  "error": "error_code",
  "message": "Human-readable error message"
}
```

### Common Error Codes

| Code | Status | Description |
|------|--------|-------------|
| `validation_failed` | 400 | Request validation failed |
| `invalid_email` | 400 | Invalid email format |
| `invalid_state` | 400 | Invalid OAuth state parameter |
| `invalid_code` | 400 | Invalid OAuth authorization code |
| `missing_parameters` | 400 | Required parameters missing |
| `unauthorized` | 401 | Authentication required |
| `access_denied` | 403 | User denied authorization |
| `not_found` | 404 | Resource not found |
| `rate_limited` | 429 | Too many requests |
| `server_error` | 500 | Internal server error |
| `service_unavailable` | 503 | Service temporarily unavailable |

### Validation Error Format

```json
{
  "error": "Validation failed",
  "issues": [
    {
      "code": "invalid_type",
      "expected": "string",
      "received": "number",
      "path": ["preferences", "briefing_time"],
      "message": "Expected string, received number"
    }
  ]
}
```

---

## Rate Limiting

- **Default**: 100 requests per 15 minutes per IP
- **Authenticated**: 1000 requests per 15 minutes per user
- **Generation**: 10 podcast generations per day per user

Rate limit headers:
```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1642262400
```

---

## CORS

Allowed origins:
- `http://localhost:3000` (development)
- `https://your-frontend-domain.com` (production)

---

## Webhooks

Coming soon: Webhook support for generation completion events.

---

## Examples

### Complete Flow Example

```bash
# 1. Initiate OAuth
curl -X GET "http://localhost:3000/api/auth/oauth/google?redirect_url=http://localhost:3000/dashboard"

# 2. After OAuth callback, check status
curl -X GET "http://localhost:3000/api/auth/status?userId=user@example.com"

# 3. Update preferences
curl -X PUT "http://localhost:3000/api/user/user@example.com/preferences" \
  -H "Content-Type: application/json" \
  -d '{
    "briefing_time": "07:00",
    "voice_host1": "nova",
    "voice_host2": "onyx",
    "include_email": true,
    "include_calendar": true
  }'

# 4. Estimate cost
curl -X POST "http://localhost:3000/api/podcast/estimate" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user@example.com",
    "preferences": {
      "include_email": true,
      "include_calendar": true
    }
  }'

# 5. Generate podcast
curl -X POST "http://localhost:3000/api/podcast/generate" \
  -H "Content-Type: application/json" \
  -d '{
    "user_id": "user@example.com",
    "preferences": {
      "briefing_time": "07:00",
      "topics": ["work"],
      "voice_host1": "nova",
      "voice_host2": "onyx",
      "include_weather": false,
      "include_calendar": true,
      "include_email": true
    }
  }'

# 6. Get episodes
curl -X GET "http://localhost:3000/api/podcast/episodes/user@example.com?limit=10"
```

---

## Support

For issues and questions:
- GitHub: https://github.com/your-repo/ai-radio/issues
- Email: support@example.com
