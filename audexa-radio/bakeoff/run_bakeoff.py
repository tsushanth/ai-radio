"""Run every candidate model over frozen Audexa fixtures via OpenRouter; record output, tokens, REAL cost.

Prompt shape matches production: one user message = SYSTEM + "\n\n---\n\n" + user, temp 0.7, max_tokens 4096,
reasoning disabled (falls back to unset if the model rejects it). Key from $OPENROUTER_API_KEY, never printed.
usage:  python bakeoff/run_bakeoff.py [--budget-usd 5] [--models id,id] [--cases N] [--out results/gen.jsonl]
Resumable: (model, case) pairs already in the out file are skipped.
"""
import argparse, json, os, sys, time, threading, urllib.request, urllib.error, pathlib, concurrent.futures as cf
HERE = pathlib.Path(__file__).resolve().parent
URL = "https://openrouter.ai/api/v1/chat/completions"
KEY = os.environ.get("OPENROUTER_API_KEY", "")

def call(model, prompt, reasoning_off=True, timeout=150):
    body = {"model": model, "messages": [{"role": "user", "content": prompt}], "temperature": 0.7, "max_tokens": 4096}
    if reasoning_off: body["reasoning"] = {"enabled": False}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), method="POST",
        headers={"Authorization": f"Bearer {KEY}", "Content-Type": "application/json", "X-Title": "Audexa bakeoff"})
    t0 = time.time()
    try:
        with urllib.request.urlopen(req, timeout=timeout) as r: d = json.loads(r.read())
        return d, time.time() - t0, None
    except urllib.error.HTTPError as e:
        try: msg = e.read().decode("utf-8", "replace")[:300]
        except Exception: msg = ""
        return None, time.time() - t0, (e.code, msg.replace(KEY, "[redacted]") if KEY else msg)
    except Exception as e:
        return None, time.time() - t0, (0, f"{type(e).__name__}: {e}")

def run_one(model, case):
    prompt = f"{case['system']}\n\n---\n\n{case['user']}"
    for attempt in range(4):
        d, dt, err = call(model, prompt)
        if err and err[0] == 400 and "reasoning" in err[1].lower():
            d, dt, err = call(model, prompt, reasoning_off=False)
        if err and err[0] in (429, 502, 503, 0) and attempt < 3:
            time.sleep(8 * (attempt + 1)); continue
        break
    rec = dict(model=model, case=case["id"], latency_s=round(dt, 2), ts=int(time.time()))
    if err or not d or not d.get("choices"):
        rec.update(error=err or (0, "no choices" + str(d)[:200]), text="", cost=0.0)
        return rec
    ch = d["choices"][0]; u = d.get("usage") or {}
    rec.update(text=(ch.get("message") or {}).get("content") or "", finish=ch.get("finish_reason"),
               served_model=d.get("model"), provider=d.get("provider"),
               tokens_in=u.get("prompt_tokens"), tokens_out=u.get("completion_tokens"),
               reasoning_tokens=((u.get("completion_tokens_details") or {}).get("reasoning_tokens")),
               cost=float(u.get("cost") or 0.0))
    return rec

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--budget-usd", type=float, default=5.0)
    ap.add_argument("--models", default="")
    ap.add_argument("--cases", type=int, default=0)
    ap.add_argument("--out", default=str(HERE / "results" / "gen.jsonl"))
    ap.add_argument("--workers", type=int, default=6)
    ap.add_argument("--fixtures", default=str(HERE / "fixtures.json"))
    a = ap.parse_args()
    if not KEY: sys.exit("OPENROUTER_API_KEY not set")
    cases = json.load(open(a.fixtures))
    if a.cases: cases = cases[:a.cases]
    cand = json.load(open(HERE / "candidates.json"))
    models = [m for g in cand.values() for m in g] if not a.models else a.models.split(",")
    out = pathlib.Path(a.out); out.parent.mkdir(exist_ok=True)
    done = set()
    spent = 0.0
    if out.exists():
        for l in out.read_text().splitlines():
            r = json.loads(l); done.add((r["model"], r["case"])); spent += r.get("cost", 0)
    jobs = [(m, c) for m in models for c in cases if (m, c["id"]) not in done]
    print(f"{len(jobs)} jobs, already spent ${spent:.4f}, budget ${a.budget_usd}", flush=True)
    lock = threading.Lock(); stop = [False]
    def work(j):
        if stop[0]: return None
        r = run_one(*j)
        with lock:
            nonlocal_spent[0] += r.get("cost", 0)
            with out.open("a") as f: f.write(json.dumps(r, ensure_ascii=False) + "\n")
            if nonlocal_spent[0] >= a.budget_usd: stop[0] = True
            tag = "ERR " + str(r["error"][0]) if r.get("error") else f"{r.get('tokens_out')}t ${r['cost']:.5f}"
            print(f"{j[0]:48s} {j[1]['id']:28s} {r['latency_s']:6.1f}s {tag}  total=${nonlocal_spent[0]:.4f}", flush=True)
        return r
    nonlocal_spent = [spent]
    with cf.ThreadPoolExecutor(a.workers) as ex: list(ex.map(work, jobs))
    print("done; total spend $%.4f%s" % (nonlocal_spent[0], " (BUDGET HIT, stopped)" if stop[0] else ""))

if __name__ == "__main__":
    main()
