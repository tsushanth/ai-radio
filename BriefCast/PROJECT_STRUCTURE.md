# BriefCast (AIRadio) iOS App - Project Structure

## Overview
SwiftUI iOS app for personalized AI-generated podcast briefings from Gmail/Outlook emails and calendar events.

**Target:** iOS 17+
**Backend:** `https://ai-radio-backend-917362189743.us-central1.run.app/api`

---

## Folder Structure

```
BriefCast/
├── App/
│   ├── BriefCastApp.swift          ✅ Main app entry point
│   └── ContentView.swift            ✅ Root view with auth flow
├── Core/
│   ├── Design/
│   │   ├── Theme.swift              ✅ Colors, typography, spacing
│   │   ├── Components/
│   │   │   ├── GradientHeader.swift ✅ Hero section with warm gradient
│   │   │   ├── ShowCard.swift       ✅ Podcast/episode card
│   │   │   ├── CategoryRow.swift    ✅ Horizontal scrolling categories
│   │   │   ├── TabSelector.swift    ✅ "For You"/"Discover" toggle
│   │   │   ├── PlayButton.swift     ✅ Large oval play button
│   │   │   └── SearchBar.swift      ✅ Rounded search input
│   │   └── Extensions/
│   │       └── View+Extensions.swift ✅ Common view modifiers
│   └── Navigation/
│       └── TabRouter.swift          ✅ Bottom tab navigation
├── Features/
│   ├── Home/
│   │   ├── HomeView.swift           ✅ Main feed with episodes
│   │   └── HomeViewModel.swift      ✅ Episode loading logic
│   ├── Discover/
│   │   ├── DiscoverView.swift       ✅ Browse shows/categories
│   │   └── DiscoverViewModel.swift  ✅ Discovery logic
│   ├── Player/
│   │   ├── PlayerView.swift         ✅ Full-screen player
│   │   ├── MiniPlayer.swift         ✅ Bottom mini player bar
│   │   └── PlayerViewModel.swift    ✅ Playback control
│   ├── Profile/
│   │   ├── ProfileView.swift        ✅ User profile & settings
│   │   └── LinkedAccountsView.swift ✅ Gmail/Outlook linking
│   └── Auth/
│       ├── AuthView.swift           ✅ Login screen
│       └── AuthViewModel.swift      ✅ Sign-in logic
├── Services/
│   ├── AudioService.swift           ✅ AVPlayer wrapper
│   ├── APIService.swift             ✅ Backend communication
│   └── AuthService.swift            ✅ Google/Apple Sign-In
├── Models/
│   ├── User.swift                   ✅ User model
│   ├── Episode.swift                ✅ Podcast episode model
│   ├── Show.swift                   ✅ Show/podcast model
│   └── LinkedAccount.swift          ✅ OAuth account model
└── Resources/
    └── Assets.xcassets              ✅ Images & colors
```

---

## Design System

### Colors (Theme.Colors)
- `background` - Pure black (#000000)
- `cardBackground` - Dark gray (#1C1C1E)
- `primaryText` - White
- `secondaryText` - Light gray (#8E8E93)
- `accent` - Warm orange (#FF6B35)
- `heroGradient` - Warm gradient (brown → chocolate → orange → gold)

### Typography (Theme.Typography)
- `largeTitle` - 36pt bold
- `title` - 20pt semibold
- `body` - 16pt regular
- `caption` - 12pt regular

### Spacing (Theme.Spacing)
- `cardCornerRadius` - 16pt
- `screenPadding` - 16pt
- `cardSpacing` - 12pt
- `sectionSpacing` - 24pt

---

## Key Components

### GradientHeader
Warm gradient hero section with title and optional subtitle.

### ShowCard
Podcast/episode card with thumbnail, title, subtitle, and duration.

### TabSelector
Segmented control for "For You" / "Discover" tabs.

### PlayButton
Large oval button for play/pause actions.

### MiniPlayer
Compact bottom player bar with episode info and controls.

---

## Features Overview

### 🏠 Home
- Time-based greeting (Morning/Afternoon/Evening)
- Generate new briefing button
- Recent episodes list
- Empty state when no episodes

### 🔍 Discover
- Search bar for finding shows
- Tab selector (For You / Discover)
- Category browsing
- Popular shows list

### ▶️ Player
- Full-screen player with gradient background
- Episode artwork and info
- Progress slider
- Playback controls (skip ±15s, play/pause)
- Mini player for background playback

### 👤 Profile
- User info display
- Linked accounts management
- Settings & preferences
- Sign out

### 🔐 Auth
- Sign in with Apple
- Sign in with Google
- OAuth account linking for Gmail/Outlook

---

## Services

### AudioService
- AVPlayer wrapper for audio playback
- Play/pause/seek controls
- Time tracking with observers

### APIService
- Backend API communication
- Endpoints:
  - `GET /podcast/episodes/:userId`
  - `POST /podcast/generate`
  - `POST /podcast/validate`
  - `POST /podcast/estimate`
- Auth token management

### AuthService
- Apple Sign-In (TODO)
- Google Sign-In (TODO)
- Session restoration (TODO)
- OAuth account linking (TODO)

---

## Models

### User
```swift
{
  id: String
  email: String
  name: String?
  timezone: String
  preferences: UserPreferences
}
```

### Episode
```swift
{
  id: String
  title: String
  description: String
  audioUrl: String?
  durationSeconds: Int?
  status: EpisodeStatus
}
```

### LinkedAccount
```swift
{
  provider: OAuthProvider (google|microsoft)
  email: String
  isActive: Bool
  lastSyncedAt: Date?
}
```

---

## Next Steps (TODO)

### Phase 2: Authentication
1. Implement Sign in with Apple
2. Implement Google Sign-In SDK
3. Add Keychain storage for tokens
4. Add session restoration

### Phase 3: API Integration
1. Complete APIService implementations
2. Add proper error handling
3. Add loading states
4. Test with backend

### Phase 4: Audio Playback
1. Complete AudioService implementation
2. Add background audio support
3. Add Now Playing info
4. Add media controls

### Phase 5: OAuth Integration
1. Google OAuth for Gmail/Calendar
2. Microsoft OAuth for Outlook/Calendar
3. Account linking flow
4. Token refresh logic

### Phase 6: Polish
1. Add animations
2. Add haptic feedback
3. Add error handling UI
4. Add onboarding flow
5. Add app icons and launch screen

---

## Build & Run

1. Open `BriefCast.xcodeproj` in Xcode
2. Select a simulator (iOS 17+)
3. Build and run (⌘R)

**Note:** Most features are placeholder implementations with TODO comments. The UI structure and design system are complete.
