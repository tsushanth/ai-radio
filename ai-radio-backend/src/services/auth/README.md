# OAuth Authentication Services

This directory contains the OAuth2 authentication implementation for Gmail (Google) and Outlook (Microsoft) integrations.

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                        OAuth Flow                            │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  User → Authorization URL → Provider → Callback → Tokens   │
│                                                              │
│  1. Generate state & redirect to provider                   │
│  2. User authorizes application                             │
│  3. Provider redirects with code                            │
│  4. Exchange code for tokens                                │
│  5. Store tokens in database                                │
│  6. Auto-refresh when needed                                │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

## Files

### Core Services

#### `gmail.auth.ts`
Google OAuth2 implementation for Gmail and Calendar access.

**Key Features:**
- Authorization URL generation with consent prompt
- Code-to-token exchange
- Automatic token refresh
- Token validation
- User info retrieval
- Authenticated client for API calls

**Scopes:**
- `gmail.readonly` - Read Gmail messages
- `calendar.readonly` - Read calendar events
- `userinfo.email` - Get user email
- `userinfo.profile` - Get user profile

**Example Usage:**
```typescript
import { gmailAuthService } from './gmail.auth';

// 1. Get authorization URL
const { url, params } = await gmailAuthService.getAuthorizationUrl('state123');
// Redirect user to url

// 2. Handle callback
const tokens = await gmailAuthService.exchangeCodeForTokens(code, state);

// 3. Refresh when needed
const newTokens = await gmailAuthService.refreshAccessToken(refreshToken);

// 4. Get authenticated client for API calls
const client = gmailAuthService.getAuthenticatedClient(accessToken, refreshToken);
```

#### `outlook.auth.ts`
Microsoft OAuth2 implementation for Outlook Mail and Calendar access.

**Key Features:**
- Authorization URL generation
- Code-to-token exchange via Microsoft's token endpoint
- Automatic token refresh
- Token validation via Graph API
- User info retrieval
- Helper methods for Graph API headers

**Scopes:**
- `offline_access` - Required for refresh token
- `User.Read` - Read user profile
- `Mail.Read` - Read mail
- `Calendars.Read` - Read calendars

**Example Usage:**
```typescript
import { outlookAuthService } from './outlook.auth';

// 1. Get authorization URL
const { url, params } = await outlookAuthService.getAuthorizationUrl('state456');

// 2. Handle callback
const tokens = await outlookAuthService.exchangeCodeForTokens(code, state);

// 3. Refresh when needed
const newTokens = await outlookAuthService.refreshAccessToken(refreshToken);

// 4. Get headers for Graph API calls
const headers = outlookAuthService.getGraphHeaders(accessToken);
```

#### `token.manager.ts`
Centralized token management with automatic refresh.

**Key Features:**
- Token storage in database
- Automatic retrieval and refresh
- Token validation
- Provider management
- Token revocation

**Example Usage:**
```typescript
import { tokenManager } from './token.manager';

// Store token after OAuth
await tokenManager.storeToken(userId, tokens);

// Get valid token (auto-refreshes if needed)
const accessToken = await tokenManager.getValidAccessToken(userId, 'google');

// Check if user has connected a provider
const hasGoogle = await tokenManager.hasProvider(userId, 'google');

// Revoke token
await tokenManager.revokeToken(userId, 'google');
```

#### `oauth.utils.ts`
Utility functions for OAuth security and state management.

**Key Features:**
- Cryptographically secure state generation
- State storage and validation (CSRF protection)
- PKCE support (code verifier/challenge)
- Error handling and parsing
- Retry logic with exponential backoff
- Logging utilities

**Example Usage:**
```typescript
import {
  generateState,
  stateManager,
  retryOAuthOperation,
  logOAuthEvent
} from './oauth.utils';

// Generate and store state
const state = generateState();
stateManager.store(state, {
  userId: 'user123',
  redirectUrl: '/dashboard'
});

// Validate and retrieve state
const stateData = stateManager.retrieve(state);

// Retry operation with backoff
const result = await retryOAuthOperation(
  () => outlookAuthService.refreshAccessToken(token),
  3, // max retries
  1000 // initial delay
);

// Log events
logOAuthEvent('auth_success', {
  provider: 'google',
  userId: 'user123'
});
```

### Type Definitions

#### `../../types/oauth.ts`
TypeScript interfaces for OAuth flow.

**Key Types:**
- `OAuthProvider` - Interface for OAuth providers
- `OAuthConfig` - Provider configuration
- `StoredOAuthToken` - Token storage format
- `OAuthError` - Standardized error type
- `OAuthCallbackParams` - Callback query parameters

## OAuth Flow Diagrams

### Google OAuth Flow

```
┌──────┐                    ┌─────────┐                  ┌────────────┐
│ User │                    │  App    │                  │  Google    │
└──┬───┘                    └────┬────┘                  └─────┬──────┘
   │                              │                             │
   │  Click "Connect Gmail"       │                             │
   ├─────────────────────────────>│                             │
   │                              │                             │
   │                              │  Generate state             │
   │                              │  Create auth URL            │
   │                              ├────────────────────────────>│
   │                              │                             │
   │  Redirect to Google          │                             │
   │<─────────────────────────────┤                             │
   │                              │                             │
   │  User authorizes             │                             │
   ├──────────────────────────────┼────────────────────────────>│
   │                              │                             │
   │  Redirect with code          │                             │
   │<─────────────────────────────┼─────────────────────────────┤
   │                              │                             │
   │  GET /callback?code=xxx      │                             │
   ├─────────────────────────────>│                             │
   │                              │                             │
   │                              │  Exchange code for tokens   │
   │                              ├────────────────────────────>│
   │                              │                             │
   │                              │  Return access + refresh    │
   │                              │<────────────────────────────┤
   │                              │                             │
   │                              │  Store in database          │
   │                              │  [encrypted]                │
   │                              │                             │
   │  Redirect to dashboard       │                             │
   │<─────────────────────────────┤                             │
   │                              │                             │
```

### Token Refresh Flow

```
┌────────────┐                 ┌──────────────┐              ┌──────────┐
│  API Call  │                 │TokenManager  │              │ Provider │
└─────┬──────┘                 └──────┬───────┘              └────┬─────┘
      │                                │                           │
      │  getValidAccessToken()         │                           │
      ├───────────────────────────────>│                           │
      │                                │                           │
      │                                │  Get from DB              │
      │                                │  Check expiry             │
      │                                │                           │
      │                                │  Token expired?           │
      │                                │  ─────┐                   │
      │                                │       │ Yes               │
      │                                │  <────┘                   │
      │                                │                           │
      │                                │  Refresh token            │
      │                                ├──────────────────────────>│
      │                                │                           │
      │                                │  New access token         │
      │                                │<──────────────────────────┤
      │                                │                           │
      │                                │  Update DB                │
      │                                │                           │
      │  Return valid token            │                           │
      │<───────────────────────────────┤                           │
      │                                │                           │
```

## Security Features

### State Parameter (CSRF Protection)
- Cryptographically random 64-character hex string
- Stored server-side with 10-minute TTL
- One-time use (deleted after validation)
- Associated with user context and metadata

### Token Storage
- Tokens stored in database (Supabase)
- **TODO:** Implement encryption at rest using pgcrypto or Supabase Vault
- Automatic cleanup of expired tokens

### PKCE (Future Enhancement)
- Proof Key for Code Exchange
- Additional security for mobile/SPA apps
- Helper functions already implemented

### Rate Limiting
- Google API: 250 quota units/second
- Microsoft Graph: Throttling based on tenant
- Retry logic with exponential backoff
- Automatic handling in token manager

## Error Handling

### OAuth Error Codes

| Code | Description | Status |
|------|-------------|--------|
| `invalid_state` | State parameter invalid or expired | 400 |
| `access_denied` | User denied authorization | 403 |
| `invalid_code` | Authorization code invalid | 400 |
| `token_expired` | Access token expired | 401 |
| `token_revoked` | Refresh token revoked | 401 |
| `provider_error` | OAuth provider error | 502 |
| `missing_refresh_token` | No refresh token received | 400 |

### Error Response Format

```json
{
  "error": "invalid_state",
  "error_description": "Invalid or expired state parameter",
  "statusCode": 400
}
```

### Retry Strategy

Operations that may fail temporarily are automatically retried:
- Maximum 3 attempts
- Exponential backoff (1s, 2s, 4s)
- No retry on client errors (4xx)
- Retry on server errors (5xx) and network failures

## Configuration

### Environment Variables

Required in `.env`:
```bash
# Google OAuth
GOOGLE_CLIENT_ID=your-client-id.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/oauth/google/callback

# Microsoft OAuth
MICROSOFT_CLIENT_ID=your-client-id
MICROSOFT_CLIENT_SECRET=your-client-secret
MICROSOFT_REDIRECT_URI=http://localhost:3000/api/auth/oauth/microsoft/callback
```

### Setting Up OAuth Credentials

#### Google Cloud Console

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Create or select a project
3. Enable APIs:
   - Gmail API
   - Google Calendar API
4. Create OAuth 2.0 credentials:
   - Application type: Web application
   - Authorized redirect URIs: Your callback URL
5. Copy Client ID and Client Secret

#### Microsoft Azure Portal

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to Azure Active Directory > App registrations
3. Create new registration
4. Add redirect URI under Authentication
5. Add API permissions:
   - Microsoft Graph > User.Read
   - Microsoft Graph > Mail.Read
   - Microsoft Graph > Calendars.Read
6. Generate client secret under Certificates & secrets

## API Routes

Routes are defined in `../../routes/auth.ts`:

### GET /api/auth/oauth/google
Initiates Google OAuth flow
- Generates state and redirects to Google

### GET /api/auth/oauth/google/callback
Handles Google OAuth callback
- Validates state
- Exchanges code for tokens
- Stores tokens
- Redirects to frontend

### GET /api/auth/oauth/microsoft
Initiates Microsoft OAuth flow

### GET /api/auth/oauth/microsoft/callback
Handles Microsoft OAuth callback

### POST /api/auth/refresh
Manually refresh tokens
```json
{
  "provider": "google",
  "userId": "user123"
}
```

### DELETE /api/auth/revoke/:provider
Revoke OAuth tokens
```json
{
  "userId": "user123"
}
```

### GET /api/auth/status
Check OAuth connection status
```
GET /api/auth/status?userId=user123
```

Response:
```json
{
  "google": { "connected": true },
  "microsoft": { "connected": false }
}
```

## Testing

### Manual Testing Flow

1. Start the server:
```bash
npm run dev
```

2. Navigate to authorization URL:
```
http://localhost:3000/api/auth/oauth/google
```

3. Authorize the application

4. Check database for stored tokens

5. Test token refresh:
```bash
curl -X POST http://localhost:3000/api/auth/refresh \
  -H "Content-Type: application/json" \
  -d '{"provider":"google","userId":"user@example.com"}'
```

### Unit Testing (TODO)

Create tests for:
- State generation and validation
- Token exchange
- Token refresh
- Error handling
- Retry logic

## Monitoring & Logging

OAuth events are logged with the following structure:
```typescript
{
  timestamp: "2025-01-15T10:30:00.000Z",
  event: "auth_success",
  provider: "google",
  userId: "user123",
  metadata: { ... }
}
```

Events:
- `auth_start` - OAuth flow initiated
- `auth_success` - OAuth flow completed successfully
- `auth_error` - OAuth flow failed
- `token_refresh` - Token refreshed
- `token_revoke` - Token revoked

## Troubleshooting

### Issue: "No refresh token received"

**Cause:** User already authorized the app
**Solution:**
- Force consent screen with `prompt=consent`
- User must revoke access and re-authorize
- Already implemented in both services

### Issue: "Token expired"

**Cause:** Access token lifetime expired (usually 1 hour)
**Solution:**
- Automatically handled by `tokenManager.getToken()`
- Refreshes before API calls

### Issue: "Invalid state parameter"

**Cause:** State expired (>10 minutes) or used twice
**Solution:**
- Restart OAuth flow
- States are single-use for security

### Issue: Microsoft token revocation not working

**Cause:** Microsoft doesn't support programmatic token revocation
**Solution:**
- Tokens deleted locally
- Remain valid until expiration
- Users can revoke manually in their Microsoft account

## Best Practices

1. **Always use state parameter** - CSRF protection
2. **Request offline_access** - Get refresh token
3. **Store tokens encrypted** - Use pgcrypto or Vault
4. **Handle token refresh** - Before every API call
5. **Implement retry logic** - For network failures
6. **Log all OAuth events** - For debugging and monitoring
7. **Validate redirect URLs** - Prevent open redirects
8. **Use HTTPS in production** - Protect tokens in transit

## Future Enhancements

- [ ] Implement PKCE for mobile apps
- [ ] Add token encryption at rest
- [ ] Implement webhook for token revocation events
- [ ] Add multi-account support per provider
- [ ] Implement incremental authorization
- [ ] Add token usage analytics
- [ ] Support additional providers (Apple, Facebook)
- [ ] Implement device flow for CLI/TV apps

## References

- [Google OAuth 2.0 Documentation](https://developers.google.com/identity/protocols/oauth2)
- [Microsoft Identity Platform](https://docs.microsoft.com/en-us/azure/active-directory/develop/)
- [OAuth 2.0 RFC](https://tools.ietf.org/html/rfc6749)
- [PKCE RFC](https://tools.ietf.org/html/rfc7636)
