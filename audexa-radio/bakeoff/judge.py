"""Blind LLM-judge scoring of generated scripts (absolute 1-5 rubric, model identity hidden).
usage: python bakeoff/judge.py --judge anthropic/claude-sonnet-5.5 [--budget-usd 5]
Only outputs that parse and are not truncated/empty are judged; hard failures score 0 by definition elsewhere.
Output: results/judge_<tag>.jsonl"""
import argparse, json, os, re, sys, time, threading, pathlib, concurrent.futures as cf
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE)); sys.path.insert(0, str(HERE.parent / "orchestrator"))
from run_bakeoff import call
from script_generator import RadioScriptGenerator
parse = RadioScriptGenerator._parse_response

RUBRIC = """You are a strict editor for Audexa Radio, a free 24/7 AI news/talk station with two hosts: Alex (upbeat) and Jordan (analytical).
Rate ONE script on 1-5 per criterion (5 excellent, 3 acceptable to air, 1 unusable). Be harsh; most scripts deserve 2-4.
- naturalness: sounds like two real radio hosts (banter, contractions, distinct personas, varied rhythm), not stiff or repetitive
- faithfulness: every fact/number/name is supported by SOURCE (or, when SOURCE says model knowledge only, is accurate common knowledge). Invented or wrong facts => 1-2. Count them.
- coverage: uses the source stories well for the task (headlines: 4-5 stories briefly; deep dive: 2-3 stories in depth with real discussion; listener: informative and acknowledges the caller; transition: short and fitting)
- spoken_ready: reads cleanly aloud by TTS (no markdown, URLs, stage directions, awkward numbers), has proper teases/outro per instructions, correct language
- overall: would you air this as-is on a station where listeners are not paying? 5 = yes, great; 3 = fine filler; 1 = never
Return ONLY JSON: {"naturalness":n,"faithfulness":n,"coverage":n,"spoken_ready":n,"overall":n,"invented_facts":n,"note":"<=20 words"}"""

def render(segs):
    return "\n".join(f"{'Alex' if s.speaker=='host1' else 'Jordan'}: {s.text}" for s in segs)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--judge", required=True); ap.add_argument("--budget-usd", type=float, default=5.0)
    ap.add_argument("--workers", type=int, default=8); ap.add_argument("--gen", default=str(HERE/"results"/"gen.jsonl")); ap.add_argument("--fixtures", default=str(HERE/"fixtures.json")); ap.add_argument("--tag", default=""); ap.add_argument("--only-models", default="")
    a = ap.parse_args()
    tag = re.sub(r"[^a-z0-9]+", "_", a.judge.lower()).strip("_")
    out = HERE / "results" / (f"judge_{tag}.jsonl" if not a.tag else f"judge_{a.tag}_{tag}.jsonl")
    cases = {c["id"]: c for c in json.load(open(a.fixtures))}
    gens = [json.loads(l) for l in pathlib.Path(a.gen).read_text().splitlines()]
    done = set(); spent = 0.0
    if out.exists():
        for l in out.read_text().splitlines():
            r = json.loads(l); done.add((r["model"], r["case"])); spent += r.get("cost", 0)
    only = set(a.only_models.split(",")) if a.only_models else None
    jobs = []
    for g in gens:
        if (g["model"], g["case"]) in done or g.get("error") or g.get("finish") == "length": continue
        if only and g["model"] not in only: continue
        try: segs = parse(None, g["text"])
        except Exception: continue
        if len(segs) < 2: continue
        jobs.append((g, render(segs)))
    print(f"{len(jobs)} to judge with {a.judge}; spent so far ${spent:.3f}", flush=True)
    lock = threading.Lock(); tot = [spent]; stop = [False]
    def work(j):
        g, script = j
        if stop[0]: return
        c = cases[g["case"]]
        prompt = f"{RUBRIC}\n\nTASK TYPE: {c['task']} (language: {c['language']})\n\nINSTRUCTIONS GIVEN TO THE WRITER:\n{c['user'][:1500]}\n\nSOURCE:\n{c['source'][:4500]}\n\nSCRIPT:\n{script}"
        d, dt, err = call(a.judge, prompt, reasoning_off=True, timeout=120)
        if err and err[0] == 400: d, dt, err = call(a.judge, prompt, reasoning_off=False, timeout=120)
        rec = dict(model=g["model"], case=g["case"], judge=a.judge)
        try:
            txt = d["choices"][0]["message"]["content"]; rec["cost"] = float((d.get("usage") or {}).get("cost") or 0)
            rec["scores"] = json.loads(txt[txt.find("{"):txt.rfind("}")+1])
        except Exception:
            rec["error"] = str(err or d)[:200]; rec["cost"] = 0.0
        with lock:
            tot[0] += rec["cost"]
            with out.open("a") as f: f.write(json.dumps(rec) + "\n")
            if tot[0] >= a.budget_usd: stop[0] = True
            print(rec["model"], rec["case"], rec.get("scores", {}).get("overall"), f"${tot[0]:.3f}", flush=True)
    with cf.ThreadPoolExecutor(a.workers) as ex: list(ex.map(work, jobs))
    print("judge done; total $%.3f" % tot[0])
main()
