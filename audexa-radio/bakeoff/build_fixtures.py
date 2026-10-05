"""Freeze real Audexa prompts (live stories, production prompt builders) into fixtures.json.

Run from audexa-radio/: python bakeoff/build_fixtures.py
Fixtures are the exact prompts the orchestrator sends (system + user), so results transfer.
"""
import asyncio, json, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "orchestrator"))
from topics import TOPICS, get_sources_for_region
from content_fetcher import ContentFetcher
from prompts import (RADIO_SYSTEM_PROMPT, build_headlines_prompt, build_deep_dive_prompt,
                     build_listener_request_prompt, build_transition_prompt, format_stories_for_prompt)

HEADLINE_TOPICS = ["daily-news", "us-politics", "ai-ml", "tech-news", "markets-finance",
                   "space-nasa", "health-wellness", "sports-roundup"]
DEEP_TOPICS = ["daily-news", "world-update", "ai-ml", "markets-finance", "science-discoveries", "gaming"]
LISTENER = ["how black holes form", "why mortgage rates move when the Fed meets",
            "the history of the Kuleshov effect in film editing",  # obscure: hallucination probe
            "tips for a first marathon"]
NON_EN = [("es", "us"), ("de", "de"), ("ja", "jp")]

async def main():
    by_id = {t.id: t for t in TOPICS}
    f = ContentFetcher()
    content = {}
    for tid in sorted(set(HEADLINE_TOPICS + DEEP_TOPICS)):
        c = await f.fetch_topic_content(by_id[tid])
        content[tid] = c.stories
        print(tid, len(c.stories))
    await f.close()
    cases = []
    def add(cid, task, user, stories_text, lang="en"):
        cases.append(dict(id=cid, task=task, language=lang, system=RADIO_SYSTEM_PROMPT, user=user, source=stories_text))
    for tid in HEADLINE_TOPICS:
        t = by_id[tid]; st = format_stories_for_prompt(content[tid])
        add(f"headlines:{tid}", "headlines", build_headlines_prompt(t.name, st, t.prompt_context), st)
    for tid in DEEP_TOPICS:
        t = by_id[tid]; st = format_stories_for_prompt(content[tid])
        add(f"deep_dive:{tid}", "deep_dive", build_deep_dive_prompt(t.name, st, t.prompt_context), st)
    for i, topic in enumerate(LISTENER):
        add(f"listener:{i}", "listener_request", build_listener_request_prompt(topic), "(none: model knowledge only) topic=" + topic)
    for i in range(2):
        add(f"transition:{i}", "transition", build_transition_prompt(), "(none)")
    for lang, region in NON_EN:
        t = by_id["tech-news"]; st = format_stories_for_prompt(content["tech-news"])
        add(f"headlines:tech-news:{lang}", "headlines", build_headlines_prompt(t.name, st, t.prompt_context, lang, region), st, lang)
    out = ROOT / "bakeoff" / "fixtures.json"
    out.write_text(json.dumps(cases, ensure_ascii=False, indent=1))
    print("wrote", len(cases), "cases ->", out)

asyncio.run(main())
