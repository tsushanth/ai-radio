# Google Play Data safety form: proposed answers for Audexa (`com.kreativekoala.audexa`)

**DRAFT. Needs owner review. Not legal advice.** Nothing here has been entered in Play Console. Evidence (file and line) for every
answer is in `docs/PRIVACY-DATA-FLOWS.md`; section numbers below refer to that file.

## What I could not see

I cannot open Play Console, so I do not know what the form says today. The repository's own note says the form was last updated before
the analytics, Ask, Suggest and language work (`docs/DATA-COLLECTION.md`, "Operating it" step 5). Open the current form and compare it
with the table in "Answers that probably change" before editing. Also compare the "Privacy policy" URL in the store listing with
`https://kreativekoala.llc/privacy` and the "Target audience and content" page (no copy of either is in the repository, so the
child-audience answer is **NOT VERIFIED**).

## Play's definitions that drive the answers

Fetched from Play Console Help, "Provide information for Google Play's Data safety section" (support.google.com/googleplay/android-developer/answer/10787469):

* "Collect" means "transmitting data from your app off a user's device."
* "Sharing" refers to "transferring user data collected from your app to a third party." Not counted as sharing: transfers to a "service provider" that "processes it on behalf of the developer"; transfers "based on a specific user-initiated action, where the user reasonably expects the data to be shared"; and transfers for legal reasons.
* Ephemeral processing: data "is only stored in memory and retained for no longer than necessary to service the specific request."
* Device or other IDs: "Identifiers that relate to an individual device, browser or app."
* "You must reflect data collection or sharing carried out by such third-party code" (SDKs and libraries) in the form.

### How these apply to text sent to an AI provider (Anthropic, OpenRouter)

User text (Ask, Suggest, radio requests) and email-derived text go from our server to Anthropic (radio requests to OpenRouter). Under the definitions above, the app **collects** that text (it leaves the device). Whether it counts as **shared** depends on the role of the provider:

* Anthropic receives it only to produce the output we ask for, using our API key, under its commercial API terms. That fits "service provider that processes it on behalf of the developer", so it is **collected, not shared**. This is the answer I recommend, on the condition (**NOT VERIFIED**) that the Anthropic terms on our account keep Anthropic to processing on our behalf. Check the account's data-processing terms.
* The weaker answer ("shared with third parties") is the safe fallback if you cannot confirm the service-provider terms or if the owner prefers to over-declare. It costs only a more cautious store label. For Gmail and Calendar data, Google's Limited Use rules (Google API Services User Data Policy) also apply independently of this form: transfers to a processor are allowed only where necessary to provide the user-facing feature.
* The radio request goes to OpenRouter, which forwards it to a model vendor chosen at run time. That is one more hop than Anthropic, so the service-provider argument is weaker. Treat radio requests as the case most likely to need "shared = yes" (user-generated content) unless OpenRouter's terms confirm processor status.
* Listening to a shared Ask link or reading public chat is a user-initiated disclosure to other users, not a developer-to-third-party transfer.

## Section: Data collection and security

| Question | Proposed answer | Why |
|---|---|---|
| Does your app collect or share any of the required user data types? | Yes | Sections 1 to 10 |
| Is all of the user data collected by your app encrypted in transit? | Yes | Every API, radio, Supabase and sign-in URL is HTTPS (section 13). The manifest allows cleartext (`Audexa/app/src/main/AndroidManifest.xml:15`); no user data uses it in the code I read. Recommend turning cleartext off. |
| Which of the following best describes how your app handles deletion requests? | "You provide a way for users to request that their data be deleted" | Delete Account in the app; email request. See below for the required web link |
| Account creation / "Delete account URL" | Provide a web URL that explains how to delete the account and data | The app creates accounts through Google sign-in, so Play requires a deletion-request web page. **No such page exists for Audexa**: the legal site has one for another app (`voxkey-chrome/delete.html`) but none for Audexa. Suggested text at the end of this file. |
| Committed to follow the Play Families Policy? | No | Not directed at children. **NOT VERIFIED**: Target audience in Play Console |
| Independent security review? | No (unless you did one) | Nothing in the repository |

## Section: Data types

For each type: Collected? Shared? Processed ephemerally? Required or optional? Purposes.

### Personal info

| Type | Collected | Shared | Ephemeral | Required / optional | Purposes |
|---|---|---|---|---|---|
| Name | Yes (Google sign-in profile name, `AuthRepository.kt:90`) | No | No (stored in Supabase Auth and app data) | Optional (guest mode exists) | App functionality, Account management |
| Email address | Yes (sign-in; also the account id, and the address before the @ goes to the AI provider as the user's first name for a briefing: `script.generator.ts:187`) | No (service providers only) | No | Optional | App functionality, Account management |
| User IDs | Yes (the email-as-id; Supabase Auth user id) | No | No | Optional | App functionality, Account management |
| Address, phone, race, politics, religion, sexual orientation, other | No | | | | |

### Financial info
Purchase history / other: Declare only if the Console already does. RevenueCat and Play Billing handle purchase state (`BillingManager.kt`, `AudexaApplication.kt:50-58`); the paywall is removed, so little or nothing is collected today. **Compare with RevenueCat's own Play guidance**, which lists the data its SDK collects. Payment card info: No.

### Health and fitness, Location, Contacts, Photos and videos, Files and docs, Web browsing
No. The Android manifest has no location, contacts, camera, microphone or storage permission.

### Messages

| Type | Collected | Shared | Ephemeral | Required / optional | Purposes |
|---|---|---|---|---|---|
| Emails | **Yes, if the user links Gmail.** Sender, subject, snippet and first 500 characters of the body are read by our server (`gmail.service.ts:181,205-232,280`) and a digest is sent to Anthropic (`script.generator.ts:84-142,503`) | No, as service provider (see above). Fallback: Yes | Raw email: processed in memory. But the finished spoken briefing, containing a summary of them, is stored (section 3). Recommend answering **No (not ephemeral)** | Optional | App functionality (the daily briefing) |
| SMS/MMS, Other in-app messages | No. (The public live chat is broadcast, not stored: sections 7.) If you treat chat as a message type: Other in-app messages, Collected = No stored, shared with other listeners by user action | | | | |

### Calendar

| Type | Collected | Shared | Ephemeral | Required / optional | Purposes |
|---|---|---|---|---|---|
| Calendar events | **Yes, if the user links Calendar** (titles, times, places for today; `script.generator.ts:84-142`) | No, as service provider. Fallback: Yes | Same as emails: No | Optional | App functionality |

### Audio files
Voice or sound recordings: No (no microphone). Music files: No. Other audio files: No collection FROM the user.

### App activity

| Type | Collected | Shared | Ephemeral | Required / optional | Purposes |
|---|---|---|---|---|---|
| App interactions | Yes: events listed in `ai-radio-backend/src/lib/analytics.ts:79-97` (app opened, first play, listening time in 30-second steps with topic id and language, topic open, generate requested/succeeded/failed, suggest submitted (no text), language change, share tap) plus the separate reminder events (`notifications.ts:303-312`) | No | No (180 days; reminder events appear in server logs) | Optional (analytics switch; reminder events are not covered by it) | Analytics |
| In-app search history | No (Android has no search sent to us) | | | | |
| Installed apps | No | | | | |
| **Other user-generated content** | **Yes**: Ask text (200 chars), topic suggestions (name, description), radio topic requests, and chat messages typed in the live chat | **Ask / Suggest: No (Anthropic = service provider).** Radio requests: see above (OpenRouter), and the text is displayed publicly in the radio queue and read on air, which is a user-initiated public disclosure, not "sharing" in Play's sense | **No** (stored; sections 4, 5, 7) | Optional (each feature is opt-in) | App functionality |
| Other actions | No | | | | |

### App info and performance

| Type | Collected | Shared | Ephemeral | Required / optional | Purposes |
|---|---|---|---|---|---|
| Crash logs | Yes (stack traces to our reporting service: `FailureReporter.kt:41-51,77-83`) | No | No | Required (not covered by the analytics switch) | Analytics / App functionality (fixing crashes) |
| Diagnostics | Yes (error codes `error_shown`; handled-failure messages; device manufacturer and model and Android version in crash reports) | No | No | Required for crash reports; optional for `error_shown` | Analytics |
| Other app performance data | No (server-side language-model usage counts have no user data) | | | | |

### Device or other IDs

| Type | Collected | Shared | Ephemeral | Required / optional | Purposes |
|---|---|---|---|---|---|
| Device or other IDs | **Yes**: (1) analytics install id (random UUID, `AnalyticsEngine.kt:210-214`); (2) second random "briefing" install id (`PreferencesManager.kt:291`); (3) RevenueCat's anonymous app user id (SDK, `AudexaApplication.kt:50`); (4) PaywallKit's random user id exists in the app (`ExperimentManager.kt`) and is sent only if its paywall is shown, which cannot happen today | No (service providers: Supabase, RevenueCat) | No | (1) optional; (2) required; (3) required | Analytics; App functionality |

Not collected: advertising id (there is no advertising SDK and the manifest does not request `AD_ID`: **NOT VERIFIED** for the merged manifest of the release build, because three libraries are built from outside this repository; open the release AAB's merged manifest and confirm), Android id, IMEI, push token (no push SDK).

## Answers that probably change versus the existing form (compare in Console)

| Item | Probably declared before | Proposed now | Why it changes |
|---|---|---|---|
| App activity: App interactions | Unknown/no | Yes, optional, Analytics | `POST /api/events` (the repo's own note says to add it) |
| Device or other IDs | Unknown/no | Yes (install ids) | Same |
| App info and performance: Diagnostics, Crash logs | Possibly no | Yes | `FailureReporter` (Android) |
| App activity: Other user-generated content | Probably no | **Yes** | Ask, Suggest, radio requests, chat (Suggest existed before; Ask is new) |
| Messages: Emails | Probably "Yes, collected, not shared" if Gmail was already declared; check the purposes | Keep, add that content goes to Anthropic; make sure "not ephemeral" matches | Section 2 |
| Calendar: Calendar events | Same | Same | Section 2 |
| Personal info: Name, Email, User IDs | Probably yes | Keep | Section 1 |
| Data shared | Probably "No" | Keep No if you accept the service-provider position; otherwise Yes for user text | See the note above |
| Deletion | Probably "No way to request" or app-only | Yes + web URL | Play's account-deletion requirement |

## What the store listing and in-app text must not say (they contradict these answers)

* "We only read email subjects and senders ... never store your email content or share your data with third parties" (Play description line 32, Android `privacy_note`): remove or correct before the form says "Emails: collected".
* "voice pairs powered by OpenAI and ElevenLabs" (Play description line 12): speech comes from our own servers.

## Suggested text for the account-deletion web page (for `kreative-koala-legal`, not published by this PR)

> **Delete your Audexa account and data.** In the Android app, open Profile and tap Delete Account. On the web, open Settings and tap
> Delete Account. This removes your account record, the Gmail and Calendar sign-in tokens we hold, and your saved briefing records.
> To also remove your briefing audio, anything you typed into Ask the hosts or Suggest a topic, or to delete without the app, email
> support@kreativekoala.llc from the address you signed in with, and include the exact text of anything you want removed or the
> random id shown in your browser storage (`audexa-ask-install`). We reply within [owner: pick a number of days]. Anonymous usage
> statistics are not linked to you and are deleted automatically after 180 days; you can switch them off in Profile (Android) or
> Settings (web).
