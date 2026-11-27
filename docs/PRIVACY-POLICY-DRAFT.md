# Audexa privacy policy: DRAFT

**DRAFT. Needs owner review before anything is published. Not legal advice.** Nothing in this file is live. Every factual sentence is
backed by code (see `docs/PRIVACY-DATA-FLOWS.md`, which cites file and line). Items in [square brackets] are decisions or checks for
the owner. Where the honest wording is less flattering than marketing wording, the honest one is used and the reason is noted
under "Notes for the owner" at the end.

## Where this goes

The live Privacy Policy and Terms are static pages in the public repository `tsushanth/kreative-koala-legal`
(`privacy.html`, `terms.html`), served from `https://kreativekoala.llc/privacy` and `https://kreativekoala.llc/terms`
(the live pages are byte-identical to the repository files; hosting is Cloudflare, `wrangler.toml` in that repository).
The Android app opens those two URLs (`Audexa/app/src/main/java/com/kreativekoala/audexa/ui/profile/ProfileScreen.kt:215,246`)
and the web home page links to them (`web-app/src/app/page.tsx:310,313`).

The live policy is one policy for all of the company's apps, with a numbered "App-Specific Disclosures" section per app
(InboxIQ, VoxKey, NotifyPal, SurfSense, TaskMasterBrowser). **It has no Audexa section and does not mention Audexa at all.**
Only the general text in sections 1 to 9 applies to Audexa today. The recommended change is therefore:

1. Add a new section "App-Specific Disclosures: Audexa" (text below, between the current section 14 and "15. Contact Us"; the
   Contact section becomes 16).
2. Make the small edits to the general sections listed in "Changes to the general sections".
3. Update "Last Updated" and tell users in the app (section 9 of the live policy promises notice of material changes).

## What the live policy says today, and what changes

| Live sentence (privacy.html) | Problem for Audexa |
|---|---|
| "Account Information: When you register for the Service, we collect your name, email address, and other account details." | True for Google sign-in, but silent that the email address is also the account id on our servers. |
| "Content: Any files, messages, or data you input or upload while using the Service." | Too vague to cover text sent to an AI provider. |
| "Usage Data: ... access times, features used, and device information." and "Device Information: Details such as your IP address, browser type, and operating system." | Overstates for Audexa (analytics keeps no IP, no device info; only crash reports carry device model and Android version) and does not describe the random install ids. |
| "Cookies: We use cookies and similar technologies to track user preferences..." | The web app sets no cookies of its own; it uses browser storage. Wording should say so. |
| "We may receive information about you from third-party integrations or services you connect to our platform, such as email or calendar services." | Does not say which scopes, what is read, that parts are sent to an AI provider, or how to disconnect. |
| "Except where you choose to opt in as described in Section 11 (VoxKey), AI and data processing used in our software is not used to develop, improve, or train generalized AI and/or ML models." | Nothing in Audexa code trains models. Keep, but the Audexa section should say it in its own words. [Check the Anthropic account terms: the Anthropic retention page I read (30 days) does not state the training rule for API data.] |
| "With Service Providers: Trusted third-party vendors who assist in operating our Service." | Fine as a category; the Audexa section names them. |
| "We retain your personal data only as long as necessary ... After this period, we securely delete or anonymize your data." | Not true for several Audexa items today: suggestion text, Ask text and audio, and briefing audio have no automatic deletion (see Retention). Replace with the retention table. |
| "Our Service is not intended for children under the age of 13" | Consistent with the terms' 18+ rule only if the Play target audience is adults. [Play target audience could not be found in the repository: check Play Console.] |
| "(Terms) ... Payment will be charged to your Apple ID account" | The Terms describe Apple billing only; Audexa Android bills through Google Play. [Add a Google Play sentence to terms.html.] |
| App link text: "We only read email subjects and senders to create summaries. We never store your email content or share your data with third parties." (Android `privacy_note`, Play listing) | Not accurate. See `docs/PRIVACY-MISMATCHES.md` item 1. Do not repeat this sentence anywhere. |

## Changes to the general sections (privacy.html)

* **1c Third-Party Information:** add "For Audexa, see Section 15."
* **1b Cookies:** change to "Our websites and apps use cookies or similar browser storage for preferences and sign-in state. Section 15 lists
  what Audexa stores on your device."
* **4 Data Retention:** replace the last two sentences with "Section 15 says how long each kind of Audexa data is kept."
* **7 Children's Privacy:** keep. [Confirm the Play target audience matches.]
* **8 International Data Transfers:** keep. Our database and servers are in the United States (the API runs on Fly in region iad, the
  radio and speech servers in sjc; the database host region is **NOT VERIFIED**: check the Supabase project region).

## Text for the new section

---

### 15. App-Specific Disclosures: Audexa

Audexa is an AI radio and podcast app for Android and the web (audexa.app). Two AI hosts talk about news and topics. This section
explains what Audexa collects, why, who else sees it, and how long we keep it. It adds to the general terms above.

**The short version**

* You can use Audexa without an account (choose "Continue as guest" in the Android app, or "Get Started" on the web).
* If you sign in with Google, we keep your name, email address and profile name. Your email address is also your account id on our servers.
* Gmail and Calendar are optional. If you link them, we read parts of your messages and events to write your briefing. Short pieces of that text are sent to an AI provider.
* If you type a question or topic into "Ask the hosts", "Suggest a topic" or a radio request, that text goes to our servers and to an AI provider.
* We do not use advertising SDKs, we do not sell data, and we do not use your content to train AI models. [Owner: the first two are supported by the code. "Do not train" is true of our own code, but whether the AI providers train on API data depends on their terms with us: NOT VERIFIED, check the Anthropic and OpenRouter account terms before keeping this clause.]

**What we collect, why, and where it goes**

*1. Account*
* What: if you sign in with Google, your name, email address and the profile name Google shares. In guest mode, nothing.
* Why: to sign you in and to find your linked accounts and briefings.
* Where: our database (Supabase). Your email address is used as your account id in our systems, in file names and in some server logs.

*2. Linked Gmail and Google Calendar (optional)*
* What we ask Google for: for Gmail, the "read, compose and manage email" permission (`gmail.modify`). For Calendar, read-only access to your calendar. [Owner: confirm the app really needs `gmail.modify`; the code only reads. A narrower read-only permission would let this paragraph be simpler.]
* What we read: for the latest messages, the sender, subject, a short preview (snippet) and the first 500 characters of the text, so we can pick what matters. For Calendar, the titles, times and places of today's events.
* What leaves our server: for a briefing, we send an AI provider (Anthropic) a short digest: the part of your email address before the @, up to five message summaries (sender name, subject and the start of the preview), a few action items drawn from your messages, and today's calendar items. We do not send whole messages.
* What we store: a sign-in token that lets us read your mailbox and calendar for you, and the spoken briefing audio (see 3). We do not store your messages themselves; they are read into memory to write the briefing. [Owner: this is accurate for the code as written. Do not add "encrypted"; the token is stored as plain text in our database today.]
* How to stop: on the web, Settings > Disconnect removes the token and revokes it with Google. On Android, "Unlink" turns the feature off in the app on your phone, but it does not yet remove the token from our servers. To remove it, use Delete Account or email us. You can also remove Audexa in your Google Account under Security > Third-party access. [Owner decision: either fix the Android Unlink to call the server before publishing, or keep this sentence. See mismatches item 2.]
* Google user data: Audexa's use of information received from Google APIs follows the Google API Services User Data Policy, including its Limited Use requirements. We use Gmail and Calendar data only to provide the briefing you asked for, we do not use it for advertising, we do not sell it, and people at our company do not read it except where needed for security, to follow the law, or with your permission. [Owner: confirm each clause is true of how you operate before publishing; the code does not prevent staff from reading logs.]

*3. Briefing audio*
* What: the spoken briefing we generate for you. It can mention senders, subjects and meeting titles from your email and calendar.
* Where and how long: stored privately in our file storage under your email address as the file name, reachable only through a link we create for you, valid for one year. [Owner decision: today nothing deletes these files automatically and Delete Account does not remove them. Either change that before publishing, or state it plainly here as: "We keep briefing audio until you ask us to delete it."]

*4. Ask the hosts*
* What: the question or event you type (up to 200 characters), the language you choose, and a random id made by your browser that lets us count requests. The web app keeps that id in browser storage under the name `audexa-ask-install`.
* Why: to check the request is acceptable, find recent news about it, and make a short two-host episode.
* Who sees it: our servers store the exact text with the id. An AI provider (Anthropic) receives the text twice: once to check it and once to write the script. A short search phrase written by the AI (not your text) is sent to Google News. The episode is spoken by our own speech servers.
* Sharing: each finished episode has a public link (audexa.app/ask/...). Anyone who has the link can listen. The page shows the title, description and the news headlines used; it does not show your text or your id. The episode is made from your text, so a listener may be able to tell what you asked about. Do not type anything private.
* How long: [Owner decision: today we keep the request text, the id and the audio until we delete them by hand. Suggested wording if unchanged: "We keep Ask requests and episodes until you ask us to delete them." Suggested change before publishing: delete after a fixed number of days.]

*5. Suggest a topic*
* What: the topic name and optional description you type, and your language. No account id or email is attached.
* Why: so we can review it and add good ones as public topics.
* Who sees it: stored in our database. An AI provider (Anthropic) reads it, with a list of existing topic names, to decide whether to add a topic. If it is added, the topic shown to everyone is a cleaned-up name and description written by the AI, based on your suggestion.
* How long: kept until we delete it by hand. Because it is not linked to you, we can only find your suggestion if you tell us its exact words.

*6. Live radio*
* Listening: we count how many people listen (numbers only). We do not store which listener is which.
* Chat and reactions: messages and emoji you send in the live chat are shown to everyone listening right now. We do not save them in our database. Do not share personal details.
* Radio topic requests (a request sheet, or a chat message with "@audexa"): the text is sent to our radio server, turned into a short on-air segment by an AI provider (our radio uses OpenRouter, which passes it to the AI model vendor), and read on air. The list of upcoming segments, including your requested text, can be seen by anyone who opens the radio's public status page. The text is also in the radio server's request logs. Do not put names, email addresses or phone numbers in a request.
* [Owner: if a phone number for requests exists, add: "If you phone the request line, the voice service passes us your number and what you said, and we keep the number only in memory until your request has been read."]

*7. Episodes in other languages and topic episodes*
When you ask for an episode in Spanish, French, German, Italian or Portuguese, or a fresh topic episode, we send the topic and language to our servers. An AI provider (Anthropic) writes the script from public news headlines, and our own speech servers read it. No text from you is involved. The episode is shared with everyone who picks that topic and language.

*8. Anonymous usage statistics (you can turn this off)*
* What: when the app is opened; which topics and languages you open or listen to and for roughly how long (in 30-second steps); whether an episode was generated or a topic suggested (never the text); language changes; taps on Share; and short error codes.
* Identifier: a random id created on your phone or in your browser. It is not linked to your name, email, account, advertising id or device id, and we do not store your IP address with it.
* Where and how long: our database, 180 days, then deleted.
* Not shared with anyone. No third-party analytics service is used.
* Control: Android: Profile > "Share anonymous usage statistics". Web: Settings > Privacy. The web app also honours Do Not Track and Global Privacy Control. Turning it off stops collection and deletes the id from your device. Rows already stored cannot be tied to you, and expire after 180 days.
* The Android app also sends a few anonymous "reminder" events (for example that the morning-reminder question was shown) with a second random id. That is recorded in a server log line, not in our database. [Owner decision: this is not covered by the switch today. Either make the switch cover it, or keep this sentence.]

*9. Crash and error reports*
* What: if the app crashes or something fails, a report goes to a service we run on Cloudflare: the app version, what the app was doing, the technical error text, and for Android the phone's make, model and Android version. It has no account id and no install id. These reports are not covered by the usage-statistics switch.
* How long: [NOT VERIFIED: check how long the reporting service keeps reports. Fill in the number.]

*10. Subscriptions*
Audexa uses Google Play to handle purchases and RevenueCat to manage subscription status. RevenueCat receives a random id for your installation and standard device and purchase information. We do not receive your payment details. [Owner: the paywall was removed in the Android app, so this may have little to say; keep it while the SDK is in the app.]

*11. On your device*
The app stores your sign-in details, language, bookmarks, hidden topics and settings on your phone. Android may include this in your Google device backup. The web app stores the same kind of settings in your browser. If you turn on the optional on-device voice, the app downloads a voice model file from Hugging Face; Hugging Face sees the download request, including your IP address, but nothing else from your phone.

**What we do not collect**
Location (GPS or from your IP address), contacts, photos, microphone recordings, advertising id, or payment card details. The Android app does not use a microphone. The analytics events never carry the text you type.

**Who receives your data (service providers)**
They process data for us and may not use it for their own purposes under our agreements with them [owner: confirm for each vendor]:
* Supabase: database, sign-in, file storage and live chat delivery (United States).
* Fly.io: runs our servers (United States).
* Anthropic: AI that writes and checks scripts (it receives the text described in 2, 4, 5 and 7). Anthropic's published rule for its API is to delete inputs and outputs within 30 days of receipt, except where the law or its safety rules require longer. [NOT VERIFIED for our account: check our Anthropic terms and any data-retention setting.]
* OpenRouter and its AI model vendor: radio scripts (6).
* Google: sign-in, Gmail and Calendar access, and Google News searches.
* RevenueCat: subscription management.
* Cloudflare: web delivery and our crash-report service.
* Hugging Face: only if you download the on-device voice.
* Microsoft (speech service): [only if non-English radio streams are running: confirm].

We do not sell your data and we do not share it with advertisers.

**How long we keep things**

| Data | How long |
|---|---|
| Account details | Until you delete your account |
| Gmail/Calendar sign-in token | Until you disconnect on the web, delete your account, or ask us |
| Briefing audio | [Today: until deleted by hand (see 3)] |
| Ask the hosts: text, id, audio | [Today: until deleted by hand (see 4)] |
| Topic suggestions | [Today: until deleted by hand (see 5)] |
| Anonymous usage statistics | 180 days |
| Crash reports | [NOT VERIFIED: fill in] |
| Server and proxy logs | [NOT VERIFIED: Fly log retention; fill in] |
| Live listener counts | 30 days |
| Live chat | Not stored |

**Your choices**
* Turn off usage statistics (above).
* Disconnect Gmail or Calendar (web: Settings; Android: see the note in 2).
* Delete your account: Android Profile > Delete Account; web Settings > Delete Account (the shared web guest profile only clears your browser). This deletes your linked-account tokens, your profile and your saved daily-brief records on our servers. [Owner: today it does NOT remove the briefing audio files, the Google sign-in record in our authentication service, or Ask and Suggest rows. Either extend Delete Account before publishing or write: "To remove briefing audio and anything you typed into Ask or Suggest, email us."]
* Ask us to delete or give you a copy of what we hold: email support@kreativekoala.llc. For items not linked to your account we can only find your data if you tell us the exact text you typed, or the random id (Android: we cannot read it for you; it sits in the app's data; web: your browser storage key `audexa-analytics-id` or `audexa-ask-install`).
* Your rights under local law (access, correction, deletion, objection) are described in Section 5 above.

**Children**
Audexa is not directed to children under 13 and the Ask and Suggest features accept free text, so we do not want children to use them. [Owner: the Play target audience setting could not be found in the repository. Make sure Play Console says the same, and does not select "children".]

**Contact**
support@kreativekoala.llc (the address already used in the live policy).

---

## Notes for the owner

1. **Honest wording over marketing wording.** The old line "We never store your email content or share your data with third parties" was replaced because the code reads message previews, sends derived text to Anthropic (a third party), stores OAuth tokens, and keeps spoken briefing audio. I did not write "we never store your email content" because the audio stores a spoken summary of it.
2. **"Sold" and "shared".** The text says we do not sell and do not share with advertisers. It does say data goes to named providers. That is the accurate position under the Play definition (service providers are not "sharing"; see `docs/PLAY-DATA-SAFETY-ANSWERS.md`).
3. **No claim of encryption at rest, no claim of automatic deletion** is made anywhere, because the code does neither for several items.
4. **Retention rows in brackets** show the current behaviour. You can publish the policy as soon as you pick, for each row, either "change the code" or "publish the plain statement". Publishing a number the code does not enforce would be inaccurate.
5. **Analytics text** is the text proposed in `docs/DATA-COLLECTION.md`, with the corrections listed in `docs/PRIVACY-DATA-FLOWS.md` section 8.
6. **Before the analytics build reaches users:** the live analytics statement above is accurate for the analytics channel. Do not publish "turning it off deletes the id" without the separate reminder-event sentence, or fix that channel first. Crash reports and the reminder events keep flowing when a user opts out.
