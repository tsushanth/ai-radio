# Audexa script-generation bake-off (2026-10-04)

23 frozen production prompts (live stories, real prompt builders: 8 headlines, 6 deep dives, 4 listener requests incl. an obscure-topic
hallucination probe, 2 transitions, es/de/ja headlines; one fixture has only 1 live story). 27 models via OpenRouter, real `usage.cost`.
Scored by deterministic gates (`score_gates.py`) plus two blind LLM judges (`judge.py`: Claude Sonnet 5.5, Gemini 3.8 Flash). Raw data in `results/`.
Total spend about $6.2 (generation $1.29, judges $3.31 + $1.60). Volume assumption: 430 scripts/day (measured on the orchestrator, 24h).
Full table: `results/report.txt`. Reproduce: `build_fixtures.py`, `run_bakeoff.py`, `score_gates.py`, `judge.py`, `report.py`.

## Findings
1. Sonnet 5.5 is best and also the most expensive (~$0.023/script, ~$293/mo at full volume on API pricing; production uses OAuth so this is the "what you'd pay" figure).
2. gpt-5.6-luna ($17/mo) is the closest: composite z +0.74 vs Sonnet +0.87, 23/23 gate pass, and the only model that stayed honest on the thin-source fixture besides Sonnet and gpt-6-luna.
   gpt-6-luna ($7/mo, z +0.44) is the cheap sensible backup. Both win or tie Sonnet on about 24-33% of cases (Gemini judge).
3. Cheapest tier (deepseek-v4.1-flash $9, gemma-4-31b-it $6, ling-3.1-flash free, mimo $4) is well-formed but weaker on deep dives and prone to inventing facts.
4. Free endpoints are unreliable: gemma-4-31b:free 21/23 API errors, inkling:free 23/23, nemotron-ultra:free 7/23. Not usable as a dependable link.
5. Hallucination: with one source story (headlines prompt asks for 4-5), Haiku, deepseek-v4.1-flash, gemma, ling all fabricated stories (7-9 invented facts). Sonnet and the luna models mostly hedged.
   This is a prompt/pipeline bug too: do not request 4-5 stories when fewer are available; skip the headlines segment when fewer than 3 stories.
6. Judges disagree on calibration (Claude mean 2.3, Gemini 3.65, r=0.52; Gemini gives faithfulness 5 almost always and rated itself highest). Use ranks and the Claude judge's faithfulness, not absolute scores.

## Caveats
- LLM judges, not listeners. The spec requires an owner blind-rating before any task flips off Claude; this ranking only picks who to test.
- One run per cell, 23 cases: differences under ~0.3 z are noise.
- Gate length floors are looser than the spec (production already airs ~150-word headlines).
- Reasoning disabled for all models (matches the production OpenRouter call); some models may do better with it on, at higher cost.

## Finalist test: gpt-5.6-luna vs gpt-6-luna (2026-10-04)
58 cases (23 original + 35 fresh incl. 2 thin-source probes, fr/pt/hi), 2 runs each, Sonnet 5.5 run once as reference. Paired by case.
- Reliability: gpt-6-luna 116/116 gates, gpt-5.6-luna 111/116 (4 length, 1 ungrounded). Cost $0.00049 vs $0.00124 per script; 8.5 s vs 10.0 s.
- Claude judge: overall -0.08 (CI -0.18..+0.03, no difference); faithfulness -0.34 (CI -0.47..-0.22) in favour of gpt-6-luna, wins 30 of 58 vs 4; invented facts 2.3 vs 3.3.
- Gemini judge: overall +0.19 for 5.6 (CI +0.03..+0.36), driven by naturalness (+0.20); faithfulness equal.
- Both trail Sonnet 5.5 (mean -0.3 to -0.6); they tie it on about 24-27 of 58 cases and beat it on 4-5.
- Decision: gpt-6-luna as the OpenRouter backup default. Faithfulness matters most for a news station; it is also cheaper and passed every gate.
- Not decided by this test: whether either is acceptable to air to listeners. That needs the owner's blind listen (spec 3.8).
Bake-off total spend about $10.7 (first round $6.2 + finalists $4.5).
