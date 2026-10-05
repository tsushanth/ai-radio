"""Second, fresh fixture set for the finalist test (new live stories, more topics, more listener probes).
Writes fixtures_final.json = these new cases + the original 23 (ids stay distinct)."""
import asyncio, json, sys, pathlib
ROOT = pathlib.Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "orchestrator"))
from topics import TOPICS
from content_fetcher import ContentFetcher
from prompts import (RADIO_SYSTEM_PROMPT, build_headlines_prompt, build_deep_dive_prompt,
                     build_listener_request_prompt, build_transition_prompt, format_stories_for_prompt)
HEAD = ["daily-news","us-politics","world-update","ai-ml","tech-news","coding-dev","startups-vc","markets-finance",
        "space-nasa","science-discoveries","gaming","sports-roundup","health-wellness"]
DEEP = ["us-politics","world-update","tech-news","coding-dev","startups-vc","space-nasa","sports-roundup","science-discoveries"]
LISTEN = ["why the sky is blue", "how vaccines train the immune system", "the Tunguska event",
          "the rules of cricket for beginners", "the Voynich manuscript", "how to start a vegetable garden"]
async def main():
    by = {t.id: t for t in TOPICS}; f = ContentFetcher(); content = {}
    for tid in sorted(set(HEAD + DEEP)):
        content[tid] = (await f.fetch_topic_content(by[tid])).stories
    await f.close()
    cases = []
    def add(cid, task, user, src, lang="en"):
        cases.append(dict(id=cid, task=task, language=lang, system=RADIO_SYSTEM_PROMPT, user=user, source=src))
    for tid in HEAD:
        st = format_stories_for_prompt(content[tid]); t = by[tid]
        add(f"F-headlines:{tid}", "headlines", build_headlines_prompt(t.name, st, t.prompt_context), st)
    for tid in DEEP:
        st = format_stories_for_prompt(content[tid]); t = by[tid]
        add(f"F-deep_dive:{tid}", "deep_dive", build_deep_dive_prompt(t.name, st, t.prompt_context), st)
    for i, tp in enumerate(LISTEN):
        add(f"F-listener:{i}", "listener_request", build_listener_request_prompt(tp), "(none: model knowledge only) topic=" + tp)
    for i in range(3): add(f"F-transition:{i}", "transition", build_transition_prompt(), "(none)")
    for tid, n in (("space-nasa", 1), ("gaming", 2)):  # thin-source probes, prompt unchanged on purpose
        t = by[tid]; st = format_stories_for_prompt(content[tid][:n])
        add(f"F-headlines-thin{n}:{tid}", "headlines", build_headlines_prompt(t.name, st, t.prompt_context), st)
    for lang, region in (("fr","fr"),("pt","br"),("hi","in")):
        t = by["tech-news"]; st = format_stories_for_prompt(content["tech-news"])
        add(f"F-headlines:tech-news:{lang}", "headlines", build_headlines_prompt(t.name, st, t.prompt_context, lang, region), st, lang)
    cases += json.load(open(ROOT / "bakeoff" / "fixtures.json"))
    (ROOT / "bakeoff" / "fixtures_final.json").write_text(json.dumps(cases, ensure_ascii=False, indent=1))
    print(len(cases), "cases")
asyncio.run(main())
