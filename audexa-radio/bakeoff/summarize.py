import json,collections
R="bakeoff/results/"
g=[json.loads(l) for l in open(R+"gates.jsonl")]; gen=[json.loads(l) for l in open(R+"gen.jsonl")]
S=collections.defaultdict(lambda:dict(n=0,ok=0,cost=0,lat=0,fails=collections.Counter()))
for x,y in zip(g,gen):
    s=S[x["model"]];s["n"]+=1;s["ok"]+=x["ok"];s["cost"]+=y.get("cost",0);s["lat"]+=y["latency_s"]
    for f in x["fail"]: s["fails"][f.split(":")[0]]+=1
print(f'{"model":44s} n pass  $/script  lat   top fails')
for m,s in sorted(S.items(),key=lambda kv:-kv[1]["ok"]/kv[1]["n"]):
    print(f'{m:44s} {s["n"]:2d} {s["ok"]:3d}  {s["cost"]/s["n"]:.5f} {s["lat"]/s["n"]:5.1f}  {dict(s["fails"].most_common(3))}')
