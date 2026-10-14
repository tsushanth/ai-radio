# On-demand languages (proposal)

Status: proposal. Nothing here is built except the `language_picked` event.

## Why not a live stream per language
A radio stream needs several rendered segments queued before it can air, so the first listener of a new
language would hear silence for minutes, and a stream is a 24/7 generation loop even for one listener.
Piper (current TTS) only speaks English. Demand is unknown: this is why picks are logged first.

## Unit of on-demand: the topic episode
1. User picks a language and opens a topic. App calls `GET /topics/:id/episode?lang=xx`.
2. If an episode for (topic, date, lang) exists, serve it (shared by every later user of that language).
3. If not, the app calls `POST /topics/:id/generate {language}` and shows progress; the result is cached under
   `topic_episodes` (id `{topic}-{date}-{lang}`), which the code already supports.
4. Expire: delete lang!=en episodes and storage objects not requested for N days (suggest 3); the nightly job
   regenerates English only.
5. Guards: allowlist of languages the TTS can actually speak (`languagesForTopic` must stop hard-filtering on Piper);
   per-day cap on non-English generations; per-install rate limit; never generate when the TTS for that
   language is unavailable (return "not available yet", not a fake English voice).

## Open questions (need a decision or a test)
- Which TTS speaks which language (Edge TTS exists in the radio orchestrator; backend path was Kokoro/Edge before Piper).
- Cost per episode per language (one LLM script + TTS).
- Whether the picker should only list languages that can be generated.

## Measure first
`[BriefingEvent] {"event":"language_picked","lang":"de"}` lines in `fly logs -a ai-radio-backend`. Counts only, anonymous
install id. Fly logs are short-lived: copy counts periodically, or add a table if this proves useful.
