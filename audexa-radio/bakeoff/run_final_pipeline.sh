#!/bin/sh
# waits for both finalist generation runs, then gates + both judges for each rep
cd "$(dirname "$0")/.."
F=bakeoff/fixtures_final.json; R=bakeoff/results
until grep -q "^done;" $R/final_gen_r1.log 2>/dev/null && grep -q "^done;" $R/final_gen_r2.log 2>/dev/null; do sleep 15; done
for r in 1 2; do python3 bakeoff/score_gates.py $F $R/final_gen_r$r.jsonl $R/final_gates_r$r.jsonl; done
for r in 1 2; do
  b=3; [ $r = 2 ] && b=2
  python3 bakeoff/judge.py --judge anthropic/claude-sonnet-5.5 --gen $R/final_gen_r$r.jsonl --fixtures $F --tag r$r --budget-usd $b > $R/final_judgeC_r$r.log 2>&1 &
  python3 bakeoff/judge.py --judge google/gemini-3.8-flash --gen $R/final_gen_r$r.jsonl --fixtures $F --tag r$r --budget-usd 1.5 > $R/final_judgeG_r$r.log 2>&1 &
done
wait
echo ALLDONE > $R/final_pipeline.done
