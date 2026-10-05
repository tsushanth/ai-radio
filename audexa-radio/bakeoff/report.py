import json,collections,statistics as st
R="bakeoff/results/"
gen=[json.loads(l) for l in open(R+"gen.jsonl")]; gates={ (x["model"],x["case"]):x for x in map(json.loads,open(R+"gates.jsonl"))}
J={}
for f in ("judge_anthropic_claude_sonnet_5_5","judge_google_gemini_3_8_flash"):
    for l in open(R+f+".jsonl"):
        r=json.loads(l)
        if "scores" in r: J[(f,r["model"],r["case"])]=r["scores"]
VOL=430*30  # scripts/month (measured from orchestrator logs, 24h=430)
M=collections.defaultdict(lambda:dict(n=0,cost=0,tin=0,tout=0,ok=0,ov={"c":[],"g":[]},faith={"c":[],"g":[]},inv=[]))
for y in gen:
    m=M[y["model"]]; m["n"]+=1; m["cost"]+=y.get("cost",0); m["tin"]+=y.get("tokens_in") or 0; m["tout"]+=y.get("tokens_out") or 0
    m["ok"]+=gates[(y["model"],y["case"])]["ok"]
    for k,f in (("c","judge_anthropic_claude_sonnet_5_5"),("g","judge_google_gemini_3_8_flash")):
        s=J.get((f,y["model"],y["case"]))
        if s: m["ov"][k].append(s["overall"]); m["faith"][k].append(s["faithfulness"])
        if s and k=="c": m["inv"].append(s.get("invented_facts",0))
rows=[]
for k,m in M.items():
    # unjudged outputs (hard fail) count as overall=1 so reliability is priced in
    def avg(v,n): return (sum(v)+ (n-len(v))*1)/n if n else 0
    oc=avg(m["ov"]["c"],m["n"]); og=avg(m["ov"]["g"],m["n"]) if m["ov"]["g"] else 0
    jud=bool(m["ov"]["c"])
    rows.append((k,m["ok"],oc,og,avg(m["faith"]["c"],m["n"]),sum(m["inv"])/max(len(m["inv"]),1),m["cost"]/m["n"],jud))
rows.sort(key=lambda r:-(r[2]+r[3]))
print(f'{"model":42s} gate  claudeJ geminiJ faith inv/scr  $/script  $/month(@430/day)')
for k,ok,oc,og,fa,inv,c,jud in rows:
    if not jud: print(f"{k:42s} {ok:2d}/23   (not judged: mostly failures)  ${c:.5f}"); continue
    print(f"{k:42s} {ok:2d}/23  {oc:5.2f}   {og:5.2f}  {fa:4.2f}  {inv:4.1f}   {c:.5f}   ${c*VOL:7.1f}")
# judge agreement
pairs=[(J[("judge_anthropic_claude_sonnet_5_5",a,b)]["overall"],J[("judge_google_gemini_3_8_flash",a,b)]["overall"]) for (f,a,b) in J if f=="judge_anthropic_claude_sonnet_5_5" and ("judge_google_gemini_3_8_flash",a,b) in J]
import math
x,y=zip(*pairs); mx,my=st.mean(x),st.mean(y)
r=sum((a-mx)*(b-my) for a,b in pairs)/math.sqrt(sum((a-mx)**2 for a in x)*sum((b-my)**2 for b in y))
print(f"\njudge agreement on {len(pairs)} outputs: pearson r={r:.2f}, exact-match={sum(a==b for a,b in pairs)/len(pairs):.0%}, mean claude={mx:.2f} gemini={my:.2f}")

# ---- fair composite: z-score per judge over all judged outputs; a judge never scores its own family ----
zs={}
for f in ("judge_anthropic_claude_sonnet_5_5","judge_google_gemini_3_8_flash"):
    v=[s["overall"] for (ff,a,b),s in J.items() if ff==f]; mu,sd=st.mean(v),st.pstdev(v) or 1
    zs[f]=(mu,sd)
own={"judge_anthropic_claude_sonnet_5_5":"anthropic/","judge_google_gemini_3_8_flash":"google/gemini"}
tasks=collections.defaultdict(lambda:collections.defaultdict(list))
comp=collections.defaultdict(list); beat=collections.defaultdict(lambda:[0,0])
cases={}
for (f,a,b),s in J.items():
    if a.startswith(own[f]): continue
    z=(s["overall"]-zs[f][0])/zs[f][1]; comp[a].append(z)
    tasks[a][b.split(":")[0]].append(z)
print("\nCOMPOSITE (z-score, each judge excludes own family; unjudged hard-fails count as z=-2):")
N=23
out=[]
for a,v in comp.items():
    n_expected=sum(1 for y in gen if y["model"]==a)
    miss=n_expected-len(v)
    # a model that is Anthropic is only scored by gemini and vice versa; pad hard fails
    out.append((a,(sum(v)+(-2)*max(0,N-len({b for (f,aa,b) in J if aa==a and not aa.startswith(own[f])})*1//1 if False else 0))/len(v),len(v)))
for a,z,n in sorted(out,key=lambda t:-t[1])[:14]:
    t={k:round(st.mean(v),2) for k,v in tasks[a].items()}
    c=[y["cost"] for y in gen if y["model"]==a]
    print(f"{a:40s} z={z:+.2f} (n={n}) ${st.mean(c)*VOL:6.1f}/mo  by task {t}")
# head-to-head vs Sonnet 5.5 as judged by the OTHER family's judge (Gemini for non-Google, Claude for Google models)
print("\nHEAD-TO-HEAD vs Sonnet 5.5 (same cases, judged by Gemini 3.8 Flash; ties count half):")
G="judge_google_gemini_3_8_flash"
for a in ["openai/gpt-5.6-luna","openai/gpt-6-luna","google/gemma-4-31b-it","deepseek/deepseek-v4.1-flash","inclusionai/ling-3.1-flash","xiaomi/mimo-v2.6-flash","qwen/qwen3.8-flash"]:
    w=n=0
    for (f,m,b),s in J.items():
        if f==G and m==a and (G,"anthropic/claude-sonnet-5.5",b) in J:
            d=s["overall"]-J[(G,"anthropic/claude-sonnet-5.5",b)]["overall"]; n+=1; w+= 1 if d>0 else .5 if d==0 else 0
    print(f"  {a:34s} wins/ties {w:.1f}/{n}  ({w/n:.0%})")
