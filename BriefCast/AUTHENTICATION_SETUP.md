# Supabase Authentication Setup Guide

This guide walks you through setting up Apple and Google Sign-In with Supabase for BriefCast.

## 1. Add Swift Package Dependencies

In Xcode:
1. Go to **File → Add Package Dependencies**
2. Add the following packages:

### Supabase Swift SDK
```
https://github.com/supabase/supabase-swift
```
- Version: Latest (2.0.0 or higher)
- Add to target: **BriefCast**

### Google Sign-In SDK
```
https://github.com/google/GoogleSignIn-iOS
```
- Version: Latest (7.0.0 or higher)
- Add to target: **BriefCast**

## 2. Configure Info.plist in Xcode

### Add Google Client ID

1. In Xcode, select your **BriefCast** target
2. Go to the **Info** tab
3. Under **Custom iOS Target Properties**, hover over any row and click the **+** button
4. Add a new row:
   - **Key**: `GIDClientID`
   - **Type**: String
   - **Value**: `917362189743-4n98540e37mh504qer0m1lihiero6dfh.apps.googleusercontent.com`

### Add URL Types for OAuth Callbacks

1. Still in the **Info** tab, find **URL Types** section (scroll down)
2. If **URL Types** doesn't exist, click **+** next to **Custom iOS Target Properties** and add:
   - **Key**: `URL types`
   - **Type**: Array
3. Expand **URL types**, click **+** to add **Item 0**:
   - Expand **Item 0**, click **+** to add:
     - **Key**: `URL Schemes`
     - **Type**: Array
   - Expand **URL Schemes**, click **+** to add **Item 0**:
     - **Type**: String
     - **Value**: `com.googleusercontent.apps.917362189743-4n98540e37mh504qer0m1lihiero6dfh`
   - Add another property to **Item 0**:
     - **Key**: `URL identifier`
     - **Type**: String
     - **Value**: `com.google.oauth`

4. Add **Item 1** to **URL types** (click **+** next to URL types):
   - Expand **Item 1**, click **+** to add:
     - **Key**: `URL Schemes`
     - **Type**: Array
   - Expand **URL Schemes**, click **+** to add **Item 0**:
     - **Type**: String
     - **Value**: `com.kreativekoala.briefcast`
   - Add another property to **Item 1**:
     - **Key**: `URL identifier`
     - **Type**: String
     - **Value**: `com.kreativekoala.briefcast`

**Alternative: Edit Info.plist as Source Code**

If you prefer, you can right-click on **Info.plist** in the Project Navigator, select **Open As → Source Code**, and add:

```xml
<key>GIDClientID</key>
<string>917362189743-4n98540e37mh504qer0m1lihiero6dfh.apps.googleusercontent.com</string>

<key>CFBundleURLTypes</key>
<array>
    <dict>
        <key>CFBundleTypeRole</key>
        <string>Editor</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>com.googleusercontent.apps.917362189743-4n98540e37mh504qer0m1lihiero6dfh</string>
        </array>
        <key>CFBundleURLName</key>
        <string>com.google.oauth</string>
    </dict>
    <dict>
        <key>CFBundleTypeRole</key>
        <string>Editor</string>
        <key>CFBundleURLSchemes</key>
        <array>
            <string>com.kreativekoala.briefcast</string>
        </array>
        <key>CFBundleURLName</key>
        <string>com.kreativekoala.briefcast</string>
    </dict>
</array>
```

### URL Scheme Handler

In your `BriefCastApp.swift`, add:

```swift
import GoogleSignIn

@main
struct BriefCastApp: App {
    var body: some Scene {
        WindowGroup {
            ContentView()
                .onOpenURL { url in
                    GIDSignIn.sharedInstance.handle(url)
                }
        }
    }
}
```

## 3. Enable Sign in with Apple Capability

1. In Xcode, select your project target
2. Go to **Signing & Capabilities** tab
3. Click **+ Capability**
4. Add **Sign in with Apple**

## 4. Configure Supabase Dashboard

**IMPORTANT**: For native mobile apps, you must configure Supabase to accept native sign-in with ID tokens.

### Enable Native Mobile Authentication

1. Go to your Supabase project: https://supabase.com/dashboard/project/lxtuvvsrtpoqgikbpasm
2. Navigate to **Authentication → Providers**
3. **CRITICAL**: Ensure "Enable Mobile Deep Linking" is enabled for native app authentication

### Apple Sign-In Setup

1. In **Authentication → Providers**, find **Apple**
2. Enable the Apple provider
3. Configure:
   - **Enabled**: Toggle ON
   - **iOS Bundle ID**: `com.kreativekoala.briefcast`
   - **Skip nonce verification**: Leave OFF (we send proper nonce)

**Note**: Unlike web OAuth, native iOS apps authenticate directly with Apple and send the ID token to Supabase. No redirect URLs needed for native apps.

### Google Sign-In Setup

**CRITICAL**: Supabase needs to be configured to accept native mobile Google Sign-In.

1. In **Authentication → Providers**, find **Google**
2. Enable the Google provider
3. Configure:
   - **Enabled**: Toggle ON
   - **Client ID (for OAuth)**: `917362189743-4n98540e37mh504qer0m1lihiero6dfh.apps.googleusercontent.com`
   - **Client Secret (for OAuth)**: `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`
   - **Authorized Client IDs** (IMPORTANT): Add your iOS client ID here:
     - `917362189743-4n98540e37mh504qer0m1lihiero6dfh.apps.googleusercontent.com`
   - **Skip nonce verification**: Toggle ON for Google

**Why this matters**: The "Authorized Client IDs" field tells Supabase to accept ID tokens from your native iOS app. Without this, Supabase rejects the token with "invalid_request" error.

**Note**: For native mobile, we're using the ID token from Google Sign-In SDK, not web OAuth flow.

## 5. Apple Developer Console Setup

### Create Services ID

1. Go to https://developer.apple.com/account/resources/identifiers/list/serviceId
2. Click **+** to create a new Services ID
3. Configure:
   - **Description**: BriefCast Authentication
   - **Identifier**: `com.kreativekoala.briefcast.auth` (must be different from your App ID)
   - Enable **Sign in with Apple**
   - Click **Configure** next to Sign in with Apple
   - Configure domains and return URLs:
     - **Primary App ID**: Select your app's bundle ID (`com.kreativekoala.briefcast`)
     - **Domains and Subdomains**: `lxtuvvsrtpoqgikbpasm.supabase.co`
     - **Return URLs**: `https://lxtuvvsrtpoqgikbpasm.supabase.co/auth/v1/callback`
   - Click **Save** and **Continue**

### Configure App ID

1. Go to https://developer.apple.com/account/resources/identifiers/list
2. Find your app's App ID (or create one)
3. Enable **Sign in with Apple** capability
4. Save and download the updated provisioning profile

## 6. Google Cloud Console Setup

1. Go to https://console.cloud.google.com
2. Select your project
3. Navigate to **APIs & Services → Credentials**
4. Find your OAuth 2.0 Client ID: `917362189743-4n98540e37mh504qer0m1lihiero6dfh`
5. Add authorized redirect URIs:
   - `https://lxtuvvsrtpoqgikbpasm.supabase.co/auth/v1/callback`
   - `com.googleusercontent.apps.917362189743-4n98540e37mh504qer0m1lihiero6dfh:/oauth2redirect/google`

## 7. Testing Authentication

### Test Apple Sign-In
1. Run the app on a physical device or simulator with iOS 13+
2. Tap **Sign in with Apple**
3. Complete the authentication flow
4. Verify user is created in Supabase dashboard

### Test Google Sign-In
1. Run the app
2. Tap **Sign in with Google**
3. Select your Google account
4. Grant permissions
5. Verify user is created in Supabase dashboard

## 8. Session Persistence

The app will automatically restore sessions on launch via `AuthService.restoreSession()`. Call this in your app's initialization:

```swift
@main
struct BriefCastApp: App {
    @StateObject private var authService = AuthService()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(authService)
                .task {
                    await authService.restoreSession()
                }
        }
    }
}
```

## 9. Security Notes

⚠️ **IMPORTANT**: The Supabase anon key in `SupabaseClient.swift` is safe to expose in client apps. However:

- **Never commit** service role keys to version control
- Store sensitive keys in environment variables
- Use row-level security (RLS) policies in Supabase
- Enable rate limiting on authentication endpoints

## Troubleshooting

### Apple Sign-In Issues
- Ensure bundle ID matches across Xcode, Apple Developer Console, and Supabase
- Verify Sign in with Apple capability is enabled
- Check that Services ID is configured correctly
- Test on a physical device (simulator may have limitations)

### Google Sign-In Issues
- Verify `GIDClientID` in Info.plist matches your OAuth client
- Ensure URL scheme is correctly configured
- Check that redirect URIs are added in Google Cloud Console
- Make sure `onOpenURL` handler is implemented in app

### Supabase Issues
- Verify project URL and anon key are correct
- Check that providers are enabled in Supabase dashboard
- Review authentication logs in Supabase dashboard
- Ensure redirect URLs match exactly

## Next Steps

After authentication is working:
1. Implement user profile management
2. Add account linking for Google/Microsoft OAuth (Gmail, Calendar, Outlook)
3. Store auth tokens securely in Keychain
4. Implement token refresh logic
5. Add biometric authentication (Face ID/Touch ID) for convenience
