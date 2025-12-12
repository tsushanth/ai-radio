/**
 * OAuth Configuration
 * OAuth settings for Gmail, Outlook, and Calendar integrations
 */

// TODO: Load from environment variables
// TODO: Add OAuth scopes for each provider
// TODO: Add redirect URIs configuration
// TODO: Add token refresh configuration

module.exports = {
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
    scopes: [
      // TODO: Define required scopes
      'https://www.googleapis.com/auth/gmail.readonly',
      'https://www.googleapis.com/auth/calendar.readonly',
    ],
  },
  microsoft: {
    clientId: process.env.MICROSOFT_CLIENT_ID || '',
    clientSecret: process.env.MICROSOFT_CLIENT_SECRET || '',
    redirectUri: process.env.MICROSOFT_REDIRECT_URI || '',
    scopes: [
      // TODO: Define required scopes
      'Mail.Read',
      'Calendars.Read',
    ],
  },
  // TODO: Add OAuth token storage configuration
  // TODO: Add token expiry handling
};
