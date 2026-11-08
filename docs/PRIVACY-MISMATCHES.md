# Privacy: places where app copy, store copy or behaviour contradict the code

DRAFT, for owner review. Found while writing `docs/PRIVACY-POLICY-DRAFT.md` and `docs/PLAY-DATA-SAFETY-ANSWERS.md`. This pull request
changes none of them; each line says what is wrong and which side (copy or code) the owner could change. Evidence: `docs/PRIVACY-DATA-FLOWS.md`.
Ordered by how much a user could be misled.

## A. Statements to users that the code contradicts

1. **"We only read email subjects and senders to create summaries. We never store your email content or share your data with third parties."**
   Android string `privacy_note` (`Audexa/app/src/main/res/values/strings.xml:158`, shown on the Linked Accounts screen,
   `LinkedAccountsScreen.kt:260-268`), translated into about twenty languages in `values-*/strings.xml` (line 156 in each), and repeated in the
   Play listing (`Audexa/fastlane/metadata/android/en-US/full_description.txt:32` and the Italian file).
   * The server reads the full message and uses sender, subject, snippet and the first 500 characters of the body (`ai-radio-backend/src/services/email/gmail.service.ts:181,205-232,280`; `email.utils.ts:206`).
   * Part of it is sent to a third party, Anthropic (`script.generator.ts:187,203,503`).
   * A sign-in token for the mailbox is stored (`token.manager.ts:83-91`), and a spoken briefing built from the emails is stored in file storage (`storage.service.ts:33,119-123`).
   * The Gmail permission requested is `gmail.modify` (read and modify), not read-only (`AuthRepository.kt:36`).
   Fix on the copy side (see the policy draft), or narrow the code. Do not publish the Data safety form saying "Emails collected" while the listing says this.

2. **Android "Unlink" / "Disconnect" does not disconnect on the server.** `LinkedAccountsViewModel.kt:221-257` only flips local flags. The server route it
   could call is an empty stub (`ai-radio-backend/src/routes/linked-accounts.ts:192-233`, every step is a commented TODO). The web Disconnect does call the real revoke
   route (`web-app/src/lib/api/episodes.ts:145-150`). So an Android user who taps Unlink and sees "Gmail account unlinked" still has a token row in our database. The policy
   draft says this plainly; the alternative is to call the existing revoke route from the Android app.

3. **"Delete Account ... will permanently delete all your data including podcasts, preferences, and linked accounts."** (`strings.xml:78`; the web text at `web-app/src/app/(dashboard)/settings/page.tsx:114` says linked accounts, daily briefs and profile.)
   The route (`ai-radio-backend/src/routes/user.ts:222-320`) deletes `linked_accounts`, `podcast_episodes`, `users`. It leaves:
   * briefing audio files, which are named after the user's email, in the `podcasts` storage bucket, valid-link period one year, no expiry (section 3 of the flows file);
   * the Supabase Auth account created by Google sign-in on Android (`AuthRepository.kt:84-87`);
   * `ask_episodes` rows and their public audio (keyed by random id, not by account), `topic_requests` rows (no account link), `analytics_events` (unlinkable by design);
   * any rows in per-user tables the route does not name (`user_settings`, `qa_sessions`, `custom_sources`, `playback_interactions`, `push_notification_log`, `user_preferences`, and so on);
   * log lines that contain the email.
   On Android, a guest session has an empty email, so the call goes to `DELETE /api/user/` (`AuthRepository.kt:281-290`); I expect that to fail, **not tested**.
   Also: the route has no authentication; the caller names an email in the path and nothing checks that the caller owns it (`user.ts:222-224`; there is no auth middleware in `routes/index.ts`). The same is true of `GET /linked-accounts/:userId` (`linked-accounts.ts:39`).

4. **The Android reminder events escape the "usage statistics" switch.** The switch text says "A random id on this device ... Turning this off deletes the id." (`strings.xml:64`,
   `docs/DATA-COLLECTION.md`). A second random id is still sent to `POST /api/notifications/event` (`Audexa/app/src/main/java/com/kreativekoala/audexa/service/BriefingManager.kt:139-158` has no check of the switch) and written to a server log line (`notifications.ts:324`). Crash reports (`FailureReporter.kt`) and web crash reports also continue. Either gate them on the switch or say so in the switch text and the policy.

5. **Web "Get Started" button.** The web sign-in page lists "Email Summaries: Get your important emails read to you" and "Calendar Updates" above a button that signs in as the shared local identity `guest@audexa.app` (`web-app/src/app/auth/page.tsx:13-17,34-50`). No Google sign-in exists on the web; Gmail and Calendar linking is separate, in Settings (`settings/page.tsx:139-148`).
   The same page says "By continuing, you agree to our Terms of Service and Privacy Policy" as plain text with no links (`auth/page.tsx:71-73`); the links exist only in the home page footer (`web-app/src/app/page.tsx:310-316`). Make them links.

6. **Play listing line 12:** "multiple voice pairs powered by OpenAI and ElevenLabs" (`full_description.txt:12`). The backend speaks with its own Piper server (`ai-radio-backend/fly.toml:9`), no ElevenLabs key is configured, nothing calls OpenAI. Remove the vendor names (also a policy issue: a user reading it would assume those vendors receive their text).

7. **Play listing "Ad-Free Option ... Upgrade"** and Android strings "Go Ad-Free", "Remove all ads", "You're an Ad-Free subscriber!": the paywall was removed and every user is treated as subscribed (`BillingManager.kt:41-45,202-206`); no ad campaigns exist in the live database. Not a privacy statement, but it matters to the Data safety "purchases" answers and to the Terms text about subscriptions.

8. **Terms vs product.** `terms.html` says payment is charged to an Apple ID and managed in the App Store; Audexa Android uses Google Play. The policy says "not intended for children under the age of 13"; the Terms say users must be 18. Pick one and match the Play target audience.

9. **Version row shows "1.0.0"** (`ProfileScreen.kt:196`) while the app is 12.9.2 (`Audexa/app/build.gradle.kts:38-39`). Minor, but support and reviewers read it.

## B. Things users cannot see but the policy must account for

10. **Radio topic requests are public.** Anyone can read the requested text at `https://radio.audexa.app/api/status` and `/api/upcoming-plays` (`audexa-radio/orchestrator/main.py:668-780`); the request endpoint accepts any 3 to 200 characters that pass a keyword filter, including email addresses and phone numbers (`retell_handler.py:83-118`), and the Android chat blocks emails/phone numbers but the "Request a topic" sheet does not apply that check (`LiveRadioViewModel.kt:276-293` versus `:241-270`). A live request I looked at showed in the public output. The text is also in the proxy request log through the URL query (`audexa-radio/fly/nginx.conf:7`; `LiveRadioViewModel.kt:298`).
11. **Radio text goes to OpenRouter, not Anthropic** (`audexa-radio/orchestrator/script_generator.py:3-5,35`). The Data safety "shared" answer for radio requests is weaker than for Ask (see the Play file).
12. **Ask episodes are in a public storage bucket** and the share page works for anyone with the link (`ask.runtime.ts:19,154-158`). The link id is a random UUID. There is no expiry and no "delete my episode" path.
13. **Server logs contain emails.** `linked-accounts.ts:56,109-110`, `daily-brief.scheduler.ts:187`. Retention is Fly's; **NOT VERIFIED**.
14. **Old radio host address still in config defaults.** `environment.ts:108` defaults `RADIO_STREAM_BASE_URL` to a plain-HTTP IP address and `/api/config` hands it to clients (`routes/config.ts:19`). Check the Fly secret value; if it still names the old host, clients may be sent to a cleartext URL. `AndroidManifest.xml:15` allows cleartext.
15. **Android backup** is on (`AndroidManifest.xml:16`): the stored email/name and settings can go to the user's Google backup. Say so, or set `allowBackup="false"`, or exclude the DataStore file.
16. **Three libraries are built from outside the repository** (`Audexa/settings.gradle.kts:18-24`, absolute paths on one Mac): PaywallKit, RatingKit, CrossPromoKit. PaywallKit contains code that posts to its own API with a random id and, when given one, an email (`PaywallManager.kt`, outside this repo). It is dormant only because every user counts as subscribed. Their code must be reviewed for the Data safety form, and the Android build is not reproducible from a clean clone.
17. **Database grants vs policies (latent).** Live check (metadata only, no row content): several tables still give the public roles full privileges and carry row policies of the form "true" for everyone (for example `playback_interactions`, `user_preferences`, `push_notification_log`, `scheduled_generation_log`, `tell_me_more_expansions`). They are empty today, so nothing is exposed, but any future feature that writes per-user rows into them would be readable and writable with the public key. The tables that hold user data today (`linked_accounts`, `topic_requests`, `user_settings`, `ask_episodes`, `analytics_events`) have no public privileges. Migration `002_create_topic_requests_table.sql:43-47` still defines "public read" for `topic_requests`; it is inert only because migration 010 removed the privileges.
18. **File names with emails in a public bucket.** The `deep-dive-podcasts` bucket is public and holds a few files named after email addresses. The Deep Dive feature is iOS-only in this repository, so likely legacy; do not list it in the policy but consider removing the files.
19. **Existing analytics doc statement to soften:** `docs/DATA-COLLECTION.md` says the IP address is not stored. The code does not store it; the hosting platform may keep connection metadata (that document already says so). Keep that caveat in the Play form notes.

## C. Not mismatches, but decisions the policy forces

* Retention: Ask text/audio, Suggest text and briefing audio have no automatic deletion. Either build deletion (for example a daily job like `purgeOldAnalyticsEvents`, `ai-radio-backend/src/routes/events.ts:45-63`) or publish "kept until you ask".
* Token storage is plain text in `linked_accounts` (`002_linked_accounts.sql:17-19`). The policy draft makes no encryption claim.
* Google API data wording: the policy draft includes a Limited Use sentence. The owner must be comfortable that it is true of staff practice.
