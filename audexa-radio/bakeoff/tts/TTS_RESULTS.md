# Kokoro vs Piper (distilled warm-f) on Audexa segments, 2026-10-04

Same 41 real segments (3 scripts written by gpt-6-luna, avg 43.7 words each), single stream, Apple-silicon Mac, `bench.py`.
Kokoro = torch 2.6 + kokoro 0.9.4 (what Audexa's tts-service runs). Piper = piper-tts 1.8.0, voice custom:en-us-warm-f (Kokoro-distilled), as on piper-tts-sjc.

| engine | threads | RTF | x realtime | p50 / p95 per segment | peak RSS | load |
|---|---|---|---|---|---|---|
| Piper | 2 | 0.053 | 19x | 0.74 s / 1.3 s | 446 MB | 1.7 s |
| Piper | 1 | 0.086 | 11.6x | 1.2 s / 2.2 s | 452 MB | 1.7 s |
| Kokoro | 2 | 0.268 | 3.7x | 4.1 s / 7.9 s | 2.4 GB | 9.1 s |

Production Kokoro (Hetzner, last 24 h, client-side log): 4,213 calls at 7.4 s avg for ~266 chars (about 1.8x slower than this Mac on similar segment length), plus 3,613 failed attempts (mostly "cannot connect to tts-service").
Audexa volume (last 24 h): 450 generations, 214,162 words, about 7,100 segment calls.

Extrapolated daily compute (Mac numbers x1.8 for cloud vCPUs): Piper about 1.9 machine-hours/day, Kokoro about 10.8.
Fly performance-2x 4GB = $66/mo ($0.0917/h) in iad/ewr, more elsewhere. Piper on a started machine: about $5-6/mo incremental, about $0 if absorbed by the already-warm machine (about 8% of its capacity).
Not measured on the Fly machine itself (would steal CPU from live Calldesk calls). Wavs for listening: scratchpad tts/wav/{piper_t2,kokoro_t2}/.
