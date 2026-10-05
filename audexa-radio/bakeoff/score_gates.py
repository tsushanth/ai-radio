"""Deterministic quality gates on generated scripts (no LLM). Output: results/gates.jsonl
Gates mirror spec 3.3/3.8: parse (production parser), strict speakers/types, length, repetition,
placeholders/meta, markdown, language, grounding (numbers not present in source)."""
import json, re, sys, pathlib, collections
HERE = pathlib.Path(__file__).resolve().parent
sys.path.insert(0, str(HERE.parent / "orchestrator"))
from script_generator import RadioScriptGenerator
parse = RadioScriptGenerator._parse_response
TYPES = {"intro", "headlines", "deep_dive", "listener_request", "transition", "outro"}
WORDS = {"headlines": (150, 700), "deep_dive": (250, 1000), "listener_request": (180, 850), "transition": (30, 140)}  # floor ~ what prod already airs (157-word headline seen)
META = re.compile(r"here is (the|your) script|as an ai\b|\[host ?\d|\[(TODO|placeholder)\]|<think>|\bjson\b|```", re.I)
STOP = {"es": {"el", "la", "de", "que", "y", "en", "los", "es", "un"}, "de": {"der", "die", "und", "das", "ist", "nicht", "ein", "zu"},
        "fr": {"le", "la", "les", "de", "et", "est", "un", "une", "des", "que"}, "pt": {"o", "a", "de", "e", "que", "um", "uma", "os", "do", "da"}}

def lang_ok(lang, text):
    if lang == "en": return len(re.findall(r"\b(the|and|is|to|of|a|you|we)\b", text.lower())) >= max(2, len(text.split()) // 25)
    if lang == "ja": return len(re.findall(r"[぀-ヿ一-鿿]", text)) > 50
    if lang == "hi": return len(re.findall(r"[\u0900-\u097f]", text)) > 50
    w = re.findall(r"\w+", text.lower()); return sum(x in STOP[lang] for x in w) / max(len(w), 1) > 0.08

def rep_ratio(words, n=4):
    g = [tuple(words[i:i+n]) for i in range(len(words)-n+1)]
    if not g: return 0.0
    c = collections.Counter(g); return sum(v-1 for v in c.values()) / len(g)

def ungrounded_numbers(text, source):
    nums = set(re.findall(r"\d[\d,\.]*\d|\d", text)); src = source
    bad = [n for n in nums if len(n) >= 2 and n not in src and n.replace(",", "") not in src.replace(",", "")]
    return bad

def score(rec, case):
    g = dict(model=rec["model"], case=rec["case"], task=case["task"])
    if rec.get("error") or not rec["text"].strip():
        g.update(ok=False, fail=["api_error" if rec.get("error") else "empty"]); return g
    fail = []
    if rec.get("finish") == "length": fail.append("truncated")
    try: segs = parse(None, rec["text"])
    except Exception: segs = []; fail.append("parse")
    raw_ok = True
    if segs:
        try:
            body = rec["text"].strip(); json.loads(re.sub(r',\s*([}\]])', r'\1', body[body.find("["):body.rfind("]")+1]))
        except Exception: pass
        if len(segs) < 3 and case["task"] != "transition": fail.append("few_segments")
        # strict speaker check on the model's own labels
        try:
            raw = json.loads(re.sub(r',\s*([}\]])', r'\1', rec["text"][rec["text"].find("["):rec["text"].rfind("]")+1]))
            bad_sp = sum(1 for x in raw if x.get("speaker") not in ("host1", "host2"))
            bad_ty = sum(1 for x in raw if x.get("type") not in TYPES)
            if bad_sp: fail.append(f"speaker_labels:{bad_sp}")
            if bad_ty: fail.append(f"type_labels:{bad_ty}")
            if any(not isinstance(x.get("text"), str) or not x.get("text").strip() for x in raw): fail.append("empty_text")
            if len({x.get("speaker") for x in raw}) < 2 and case["task"] != "transition": fail.append("one_speaker")
        except Exception: pass
    text = " ".join(s.text for s in segs); words = text.split(); n = len(words)
    g["words"] = n
    lo, hi = WORDS[case["task"]]
    if case["language"] == "ja": lo, hi = lo * 3, hi * 4  # char-ish counting: whitespace split undercounts
    if case["language"] != "ja" and not (lo <= n <= hi): fail.append(f"length:{n}")
    r = rep_ratio(words); g["rep"] = round(r, 3)
    if r > 0.08: fail.append("repetition")
    if META.search(rec["text"][:2000]) and "```" not in rec["text"][:2000] or META.search(text): fail.append("meta_text")
    if "```" in rec["text"]: g["fenced"] = True  # parser tolerates; informational
    if re.search(r"(\*\*|^#+ |\n- )", text): fail.append("markdown_in_speech")
    if not lang_ok(case["language"], text): fail.append("wrong_language")
    if case["task"] in ("headlines", "deep_dive"):
        bad = ungrounded_numbers(text, case["source"] + case["user"])
        g["ungrounded_nums"] = bad[:8]
        if len(bad) >= 3: fail.append(f"ungrounded_numbers:{len(bad)}")
    g.update(fail=fail, ok=not fail)
    return g

if __name__ == "__main__":
    fx = sys.argv[1] if len(sys.argv) > 1 else str(HERE / "fixtures.json")
    src = pathlib.Path(sys.argv[2]) if len(sys.argv) > 2 else HERE / "results" / "gen.jsonl"
    out = pathlib.Path(sys.argv[3]) if len(sys.argv) > 3 else HERE / "results" / "gates.jsonl"
    cases = {c["id"]: c for c in json.load(open(fx))}
    rows = [json.loads(l) for l in src.read_text().splitlines()]
    with out.open("w") as f:
        for r in rows: f.write(json.dumps(score(r, cases[r["case"]]), ensure_ascii=False) + "\n")
    print("scored", len(rows))
