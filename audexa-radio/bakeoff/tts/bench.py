import sys, json, time, resource, os, wave, pathlib, io
eng, threads = sys.argv[1], int(sys.argv[2]); tag = f"{eng}_t{threads}"
here = pathlib.Path(__file__).parent; out = here / "wav" / tag; out.mkdir(parents=True, exist_ok=True)
segs = json.load(open(here / "segments.json"))
rss = lambda: resource.getrusage(resource.RUSAGE_SELF).ru_maxrss / 1e6  # bytes on macOS -> MB
import numpy as np, soundfile as sf
t0 = time.time()
if eng == "piper":
    import onnxruntime
    from piper import PiperVoice, SynthesisConfig
    v = PiperVoice.load(str(here / "model.onnx"))
    so = onnxruntime.SessionOptions(); so.intra_op_num_threads = threads; so.inter_op_num_threads = 1
    v.session = onnxruntime.InferenceSession(str(here / "model.onnx"), sess_options=so, providers=["CPUExecutionProvider"])
    sr = v.config.sample_rate; cfg = SynthesisConfig(length_scale=v.config.length_scale / 1.05)
    def synth(text, spk): return np.concatenate([c.audio_float_array for c in v.synthesize(text, syn_config=cfg)])
else:
    import torch; torch.set_num_threads(threads)
    from kokoro import KPipeline
    p = KPipeline(lang_code="a", repo_id="hexgrad/Kokoro-82M"); sr = 24000
    voices = {"host1": "am_adam", "host2": "af_bella"}
    def synth(text, spk): return np.concatenate([a.numpy() if hasattr(a, "numpy") else a for _, _, a in p(text, voice=voices[spk], speed=1.05)])
load_s = time.time() - t0; rss_load = rss()
synth("Warm up the model with a short sentence.", "host1")
rows = []
for i, s in enumerate(segs):
    t = time.time(); a = synth(s["text"], s["speaker"]); dt = time.time() - t
    dur = len(a) / sr; rows.append((dt, dur, len(s["text"].split())))
    sf.write(out / f"{i:02d}_{s['speaker']}.wav", a, sr)
tt = sum(r[0] for r in rows); ad = sum(r[1] for r in rows); lat = sorted(r[0] for r in rows)
print(json.dumps(dict(engine=eng, threads=threads, segments=len(rows), load_s=round(load_s, 1), rss_after_load_mb=round(rss_load), peak_rss_mb=round(rss()),
      audio_s=round(ad, 1), synth_s=round(tt, 1), RTF=round(tt / ad, 3), x_realtime=round(ad / tt, 1),
      p50_seg_ms=round(lat[len(lat)//2] * 1000), p95_seg_ms=round(lat[int(len(lat) * .95)] * 1000), cpu_s_per_audio_min=round(60 * tt / ad, 1))))
