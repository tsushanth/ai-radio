"""Finalist head-to-head: gpt-5.6-luna vs gpt-6-luna (Sonnet 5.5 as reference). Paired per case, bootstrap CIs."""
import json, random, statistics as st, collections, pathlib
R = pathlib.Path(__file__).parent / "results"
A, B, S = "openai/gpt-5.6-luna", "openai/gpt-6-luna", "anthropic/claude-sonnet-5.5"
JUD = {"C": "judge_r{r}_anthropic_claude_sonnet_5_5", "G": "judge_r{r}_google_gemini_3_8_flash"}
def rows(f): return [json.loads(l) for l in open(R / f)] if (R / f).exists() else []
gen, gates, sc = {}, {}, collections.defaultdict(dict)
for r in (1, 2):
    for y in rows(f"final_gen_r{r}.jsonl"): gen[(r, y["model"], y["case"])] = y
    for g in rows(f"final_gates_r{r}.jsonl"): gates[(r, g["model"], g["case"])] = g
    for j, f in JUD.items():
        for x in rows(f.format(r=r) + ".jsonl"):
            if "scores" in x:
                try: sc[j][(r, x["model"], x["case"])] = {k: (float(v) if k != "note" else v) for k, v in x["scores"].items()}
                except (TypeError, ValueError): pass
cases = sorted({k[2] for k in gen}); task = lambda c: c.split(":")[0].replace("F-", "").split("-thin")[0]
def per_case(model, j, key="overall"):
    out = {}
    for c in cases:
        v = []
        for r in (1, 2):
            if (r, model, c) in gen and not gen[(r, model, c)].get("error"):
                s = sc[j].get((r, model, c)); v.append(s[key] if s else 1)  # unjudged hard failure = 1
        if v: out[c] = st.mean(v)
    return out
def boot(d, n=4000):
    xs = list(d.values()) if isinstance(d, dict) else list(d); ms = sorted(st.mean(random.choice(xs) for _ in xs) for _ in range(n)); return ms[int(.025 * n)], ms[int(.975 * n)]
random.seed(1)
print("== cost / reliability (both reps) ==")
for m in (S, A, B):
    g = [v for k, v in gen.items() if k[1] == m]; gt = [v for k, v in gates.items() if k[1] == m]
    print(f"{m:30s} n={len(g)} gate_pass={sum(x['ok'] for x in gt)}/{len(gt)} $/script={st.mean(x['cost'] for x in g):.5f} lat={st.mean(x['latency_s'] for x in g):.1f}s "
          f"fails={dict(collections.Counter(f.split(':')[0] for x in gt for f in x['fail']))}")
for j, name in (("C", "Claude judge"), ("G", "Gemini judge")):
    print(f"\n== {name}: {A.split('/')[1]} minus {B.split('/')[1]} (paired by case, positive = 5.6 better) ==")
    for key in ("overall", "faithfulness", "naturalness", "coverage"):
        a, b = per_case(A, j, key), per_case(B, j, key); d = {c: a[c] - b[c] for c in a if c in b}
        if len(d) < 5: continue
        lo, hi = boot(d); print(f"  {key:13s} mean diff {st.mean(d.values()):+.2f}  95% CI [{lo:+.2f},{hi:+.2f}]  n={len(d)}  5.6 wins {sum(v>0 for v in d.values())} / 6 wins {sum(v<0 for v in d.values())}")
    a, b = per_case(A, j), per_case(B, j)
    for t in ("headlines", "deep_dive", "listener", "transition"):
        d = [a[c] - b[c] for c in a if c in b and task(c) == t]
        if d: print(f"    {t:10s} diff {st.mean(d):+.2f} (n={len(d)})")
    if (j == "C"):
        inv = lambda m: st.mean(sc[j][k]["invented_facts"] for k in sc[j] if k[1] == m)
        print(f"  invented facts/script: 5.6={inv(A):.2f}  6={inv(B):.2f}")
    s_ = per_case(S, j)
    for m, nm in ((A, "5.6"), (B, "6")):
        mm = per_case(m, j); d = [mm[c] - s_[c] for c in mm if c in s_]
        if d: print(f"  vs Sonnet ({nm}): mean {st.mean(d):+.2f}, wins/ties {sum(v>0 for v in d)}/{sum(v==0 for v in d)} of {len(d)}")
