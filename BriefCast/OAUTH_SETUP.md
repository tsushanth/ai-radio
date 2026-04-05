# OAuth Account Linking Setup Guide

This guide walks you through configuring Google and Microsoft OAuth for linking Gmail/Calendar and Outlook/Calendar accounts in BriefCast.

## Overview

BriefCast allows users to link their Google and Microsoft accounts to access:
- **Google**: Gmail messages and Google Calendar events
- **Microsoft**: Outlook emails and Calendar appointments

## 1. Google OAuth Configuration

### A. Google Cloud Console Setup

1. Go to [Google Cloud Console](https://console.cloud.google.com)
2. Select your project (or create a new one)
3. Navigate to **APIs & Services → Credentials**

### B. Configure OAuth Consent Screen

1. Go to **OAuth consent screen**
2. Configure:
   - **User Type**: External (for public access) or Internal (for Google Workspace only)
   - **App name**: BriefCast
   - **User support email**: Your email
   - **App logo**: (Optional) Upload your app logo
   - **Authorized domains**: `kreativekoala.llc` (if you have a website)
   - **Developer contact**: Your email

3. Add **Scopes**:
   - Click **Add or Remove Scopes**
   - Add the following scopes:
     - `https://www.googleapis.com/auth/gmail.readonly` - Read Gmail messages
     - `https://www.googleapis.com/auth/calendar.readonly` - Read Calendar events
     - `https://www.googleapis.com/auth/userinfo.email` - Email address
     - `https://www.googleapis.com/auth/userinfo.profile` - Basic profile info

4. Click **Save and Continue**

### C. OAuth Client ID Configuration

Your existing OAuth client ID should already be configured from authentication setup:
- **Client ID**: `917362189743-aenphin8ar1buslf7gvki6ko5anj54h6.apps.googleusercontent.com`

Verify the redirect URIs include:
- `com.googleusercontent.apps.917362189743-aenphin8ar1buslf7gvki6ko5anj54h6:/oauth2redirect/google`
- `https://lxtuvvsrtpoqgikbpasm.supabase.co/auth/v1/callback`

### D. Enable Required APIs

1. Go to **APIs & Services → Library**
2. Enable the following APIs:
   - **Gmail API**
   - **Google Calendar API**
   - **Google People API** (for profile info)

## 2. Microsoft OAuth Configuration

### A. Azure Portal Setup

1. Go to [Azure Portal](https://portal.azure.com)
2. Navigate to **Azure Active Directory → App registrations**
3. Click **New registration**

### B. Register Application

1. Configure:
   - **Name**: BriefCast
   - **Supported account types**: Accounts in any organizational directory and personal Microsoft accounts
   - **Redirect URI**:
     - **Platform**: iOS/macOS
     - **Redirect URI**: `com.kreativekoala.briefcast://oauth/microsoft`

2. Click **Register**

3. Note down:
   - **Application (client) ID** - You'll need this
   - **Directory (tenant) ID** - You'll need this

### C. Configure API Permissions

1. Go to **API permissions**
2. Click **Add a permission**
3. Select **Microsoft Graph**
4. Select **Delegated permissions**
5. Add the following permissions:
   - **Mail.Read** - Read user mail
   - **Calendars.Read** - Read user calendars
   - **User.Read** - Read user profile
   - **offline_access** - Maintain access to data

6. Click **Add permissions**
7. Click **Grant admin consent** (if you're an admin)

### D. Update MicrosoftOAuthHelper

Update the client ID in `MicrosoftOAuthHelper.swift`:

```swift
private let clientId = "YOUR_APPLICATION_CLIENT_ID_HERE"
```

Replace `YOUR_APPLICATION_CLIENT_ID_HERE` with your actual Application (client) ID from Azure.

### E. Optional: Client Secret (for backend token exchange)

If you plan to exchange tokens on your backend:

1. Go to **Certificates & secrets**
2. Click **New client secret**
3. Add description: "BriefCast backend"
4. Set expiration: 24 months
5. Click **Add**
6. **IMPORTANT**: Copy the secret value immediately - it won't be shown again
7. Store securely in your backend environment variables

## 3. Info.plist Configuration

The URL scheme for Microsoft OAuth is already configured in your Info.plist as:
- `com.kreativekoala.briefcast`

This handles the OAuth callback from Microsoft.

## 4. Testing OAuth Flows

### Test Google Account Linking

1. Run the app
2. Navigate to Profile → Linked Accounts
3. Tap "Google" card
4. Complete OAuth flow:
   - Sign in with Google (if not already)
   - Grant permissions for Gmail and Calendar
5. Verify account appears as connected with the correct email
6. Check console logs for access token (first 20 chars)

### Test Microsoft Account Linking

1. In Profile → Linked Accounts
2. Tap "Microsoft" card
3. Complete OAuth flow:
   - Sign in with Microsoft account
   - Grant permissions for Mail and Calendar
4. Verify account appears as connected
5. Check console logs for access token

### Test Permission Toggles

1. For a connected account, toggle Email or Calendar permissions
2. Verify console logs show updated preferences
3. These will later sync to your backend

### Test Disconnect

1. Tap a connected account
2. Tap "Disconnect Account"
3. Confirm the action
4. Verify account is removed from the list
5. OAuth tokens should be revoked (check console)

## 5. Backend Integration (TODO)

The current implementation logs tokens to console. For production, you need to:

### A. Store OAuth Tokens Securely

Create backend API endpoints:

```
POST /api/linked-accounts
Body: {
  "provider": "google" | "microsoft",
  "email": "user@example.com",
  "access_token": "...",
  "refresh_token": "...",
  "expires_at": "2024-01-01T00:00:00Z"
}
```

### B. Token Refresh

Implement token refresh logic:
- Google tokens expire after 1 hour
- Microsoft tokens expire after 1 hour
- Use refresh tokens to get new access tokens
- Store in secure database (encrypted)

### C. API Endpoints Needed

```
POST   /api/linked-accounts           # Create new linked account
GET    /api/linked-accounts           # List user's linked accounts
PATCH  /api/linked-accounts/:id       # Update permissions
DELETE /api/linked-accounts/:id       # Remove linked account
POST   /api/linked-accounts/:id/sync  # Trigger sync
```

### D. Update LinkedAccountsViewModel

Replace the TODO comments with actual API calls:

```swift
// After connecting account
let accountData = [
    "provider": provider.id,
    "email": email,
    "access_token": accessToken,
    "refresh_token": refreshToken,
    "email_enabled": true,
    "calendar_enabled": true
]

let response = try await apiService.post("/api/linked-accounts", body: accountData)
```

## 6. Security Best Practices

### A. Token Storage

- **Never store tokens in UserDefaults or local files**
- Store tokens in secure backend database
- Encrypt tokens at rest
- Use HTTPS for all API communication

### B. Token Expiration

- Implement automatic token refresh
- Handle expired tokens gracefully
- Show re-authentication prompt if refresh fails

### C. Scope Minimization

- Only request scopes you actually need
- Request additional scopes only when needed
- Allow users to revoke individual permissions

### D. User Privacy

- Be transparent about what data you access
- Never access data without user permission
- Implement data deletion upon account disconnect
- Comply with GDPR, CCPA, and other privacy regulations

## 7. Gmail and Outlook API Usage

### A. Fetching Gmail Messages

```swift
let url = "https://gmail.googleapis.com/gmail/v1/users/me/messages"
var request = URLRequest(url: URL(string: url)!)
request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

let (data, _) = try await URLSession.shared.data(for: request)
// Parse and process messages
```

### B. Fetching Google Calendar Events

```swift
let url = "https://www.googleapis.com/calendar/v3/calendars/primary/events"
var request = URLRequest(url: URL(string: url)!)
request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

let (data, _) = try await URLSession.shared.data(for: request)
// Parse and process events
```

### C. Fetching Outlook Mail

```swift
let url = "https://graph.microsoft.com/v1.0/me/messages"
var request = URLRequest(url: URL(string: url)!)
request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

let (data, _) = try await URLSession.shared.data(for: request)
// Parse and process messages
```

### D. Fetching Outlook Calendar

```swift
let url = "https://graph.microsoft.com/v1.0/me/events"
var request = URLRequest(url: URL(string: url)!)
request.setValue("Bearer \(accessToken)", forHTTPHeaderField: "Authorization")

let (data, _) = try await URLSession.shared.data(for: request)
// Parse and process events
```

## 8. Troubleshooting

### Google OAuth Issues

**Issue**: "Access blocked: Authorization Error"
- **Solution**: Verify OAuth consent screen is configured
- Ensure scopes are added correctly
- Check that Google APIs are enabled

**Issue**: "redirect_uri_mismatch"
- **Solution**: Verify redirect URI in Google Cloud Console matches exactly
- Include both the custom scheme and Supabase callback URL

### Microsoft OAuth Issues

**Issue**: "Invalid redirect URI"
- **Solution**: Ensure redirect URI is registered in Azure portal
- Check that platform is set to iOS/macOS

**Issue**: "AADSTS65001: The user or administrator has not consented"
- **Solution**: Grant admin consent in Azure portal
- Or have users consent during first sign-in

### General OAuth Issues

**Issue**: Tokens expire quickly
- **Solution**: Implement refresh token logic
- Store refresh tokens securely
- Automatically refresh before expiration

**Issue**: User sees OAuth screen multiple times
- **Solution**: Check if tokens are being stored properly
- Verify refresh token is being used

## Next Steps

1. **Complete Backend API**: Implement secure token storage
2. **Add Sync Logic**: Fetch emails and calendar events
3. **Implement Briefing Generation**: Use linked account data in briefings
4. **Add Token Refresh**: Automatic background token refresh
5. **Testing**: Test with real Gmail and Outlook accounts
6. **App Review**: Submit for Google OAuth verification and Microsoft certification
