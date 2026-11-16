# Episode audio pipeline

Applies to topic episodes (`topic-podcasts` bucket) and Ask the hosts audio (`ask/` folder of the same bucket).

## What changed

Before: the TTS worker returns WAV (24 kHz mono 16-bit, about 2.9 MB per minute). The WAV was uploaded unchanged under a `.mp3`
name with `Content-Type: audio/mpeg`. About 11.5 MB per 4-minute episode, no level control between languages or voices.

Now (`ai-radio-backend/src/services/audio/episode-audio.ts`):

1. WAV in, two ffmpeg passes: measure loudness, then apply a linear gain to the target (EBU R128 loudnorm, **-16 LUFS**, true peak
   **-1.5 dBTP**) while encoding **mono MP3 at 128 kbps** (libmp3lame). A 4-minute episode is about 3.8 MB.
2. The upload still sends `Content-Type: audio/mpeg`: the bucket only accepts `audio/mpeg` and `audio/mp3`, so that value is
   unchanged; the bytes behind the `.mp3` name are now really MP3.
3. If ffmpeg is missing, fails, times out or `AUDIO_TRANSCODE=off`, the WAV is stored exactly as before and a log line says why
   (`[audio] transcode failed, keeping the WAV: ...`). An episode is never lost because of the encoder.
4. Objects already in the bucket (WAV under an `.mp3` name) keep working: nothing reads the name, and clients play them as before.
   They are not re-encoded. Retention (below) removes them over time.

`normalizeWavRms()` is a small pure-JS equaliser for 16-bit WAV (RMS target, gain limited, never above -1 dBFS peak). It is the
hook for equalising chunks before they are joined (used by the multilingual TTS path) and is not needed for the final MP3.

| Env | Default | Meaning |
|---|---|---|
| `AUDIO_TRANSCODE` | on | `off` stores the WAV as before (kill switch, no redeploy of code needed, only a secret/env change) |
| `AUDIO_MP3_KBPS` | 128 | 32 to 320 |
| `AUDIO_LOUDNESS_LUFS` | -16 | integrated loudness target |
| `AUDIO_TRUE_PEAK_DB` | -1.5 | true-peak ceiling |
| `FFMPEG_PATH` | `ffmpeg` | binary |

Container: the production image installs ffmpeg (`apk add ffmpeg`). Cost: about 1 to 3 seconds of CPU per episode on the 1-CPU Fly
machine, one process at a time per episode.

## Additional languages

Episodes in the additional languages (`docs/LANGUAGES.md`) arrive as 24 kHz PCM pieces from the speech API. Each piece is brought to a
common level with `normalizeWavRms`, the pieces are joined with short gaps, and the whole episode goes through the same single encode
above (one lossy generation, loudness normalised across the whole episode). `LANG_TTS_FORMAT=mp3` instead stores the API's own MP3
pieces joined (no ffmpeg, no level equalisation across pieces); use it only if the encoder is unavailable.

## Retention (not scheduled, not enabled)

`ai-radio-backend/src/services/storage/retention.ts`, CLI `node dist/scripts/audio-retention.js`.

- Policy: audio of an episode is removed when its date is older than **30 days (English)** or **14 days (other languages)**:
  `AUDIO_RETENTION_DAYS_EN`, `AUDIO_RETENTION_DAYS_OTHER`. Never less than 7 days whatever is set.
- The `topic_episodes` row stays (title, script, stories, play count). Only `audio_url` is cleared, and `getRecentEpisodes` skips rows
  with no `audio_url`, so the app never lists an episode that cannot play. `audio_path` is kept for the record.
- Only objects named `<topic>/<yyyy-mm-dd>-<lang>.mp3` are touched. `ask/` audio and anything else is skipped and counted.
- **Dry run is the default.** The report lists counts and sizes per language, the date range, and how many objects a run would
  target (`AUDIO_RETENTION_MAX_DELETES`, default 500 per run, oldest first).
- Deleting needs both `--apply` and `AUDIO_RETENTION_APPLY=yes`. Nothing in the repo or on Fly runs it on a schedule.

```
fly ssh console -a ai-radio-backend -C "node dist/scripts/audio-retention.js"            # report only
fly ssh console -a ai-radio-backend -C "node dist/scripts/audio-retention.js --json"
```

Sizes come from storage metadata; an object without one is counted as "unknown size".

## Rollback

- Encoder misbehaves: set `AUDIO_TRANSCODE=off` (one env change and restart). New episodes are WAV again; MP3 episodes already
  stored stay valid.
- Code rollback: redeploy the previous release. Nothing in the database changes in this release.
