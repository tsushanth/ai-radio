/**
 * Enable gate for an additional podcast language. Builds ONE real episode through the production path (the pipeline the on-demand
 * endpoint uses: local-language sources, a real generated script for a launch topic, the ReadAloud speech client posting to
 * https://api.readaloudai.org/v1/text-to-speech with the backend's own key and the language's voices), encodes it the way the
 * generator does, transcribes it, and runs the checks in services/languages/gate.ts (length, speaking rate overall and per line,
 * transcript fidelity, transcript length, repetition). The flag row in the database is NOT touched and the daily caps are not used: the
 * language is enabled in memory only. A language passes only when every check passes; then (and only then) enable it with
 *   node dist/scripts/language-flags.js enable <lang>
 *
 *   node dist/scripts/language-gate.js <lang> [--topic world-update] [--voice mira] [--voice2 remy] [--out DIR] [--stt-model M] [--no-stt]
 *
 * Environment: READALOUD_API_KEY (the backend's key), a script model key (OPENROUTER_API_KEY or ANTHROPIC_API_KEY), and for the
 * transcript DEEPGRAM_API_KEY (default) or GATE_STT_API_KEY (an OpenAI-compatible /v1/audio/transcriptions key); see transcribe().
 * Exit code 0 = pass, 2 = fail, 1 = could not run.
 * Cost: one script call, one episode of speech (about 3000 to 5000 characters), one transcription.
 */
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { requireLanguageSpec } from '../services/languages/registry';
import { LanguageControls } from '../services/languages/controls';
import { MemoryControlStore } from '../services/languages/controls.store';
import { buildNewLanguageEpisode } from '../services/languages/pipeline';
import { evaluateGate, type GateReport } from '../services/languages/gate';
import { topicsService } from '../services/supabase/topics.service';
import { concatenateBuffers } from '../services/tts/audio.utils';
import { finalizeEpisodeAudio } from '../services/audio/episode-audio';

const arg = (a: string[], n: string): string | undefined => { const i = a.indexOf(n); return i >= 0 ? a[i + 1] : undefined; };

/** Studio voices: remy does not speak Malay or Slovenian, so those two use mira for both hosts. */
export const defaultVoices = (lang: string): [string, string] => (lang === 'ms' || lang === 'sl' ? ['mira', 'mira'] : ['mira', 'remy']);

/**
 * Transcript for the gate. GATE_STT_PROVIDER=deepgram (default when DEEPGRAM_API_KEY is set; model from --stt-model, GATE_STT_MODEL or
 * nova-3) or openai (an OpenAI-compatible /v1/audio/transcriptions endpoint, key GATE_STT_API_KEY, GATE_STT_URL optional).
 */
async function transcribe(audio: Buffer, filename: string, language: string, model?: string): Promise<string> {
  const provider = (process.env.GATE_STT_PROVIDER ?? (process.env.DEEPGRAM_API_KEY ? 'deepgram' : 'openai')).toLowerCase();
  if (provider === 'deepgram') {
    const key = (process.env.DEEPGRAM_API_KEY ?? '').trim();
    if (!key) throw new Error('DEEPGRAM_API_KEY is not set');
    const m = model ?? process.env.GATE_STT_MODEL ?? 'nova-3';
    const res = await fetch(`https://api.deepgram.com/v1/listen?model=${encodeURIComponent(m)}&language=${encodeURIComponent(language)}&smart_format=false&punctuate=false`, {
      method: 'POST', headers: { Authorization: `Token ${key}`, 'Content-Type': filename.endsWith('.mp3') ? 'audio/mpeg' : 'audio/wav' }, body: new Uint8Array(audio), signal: AbortSignal.timeout(300_000),
    });
    if (!res.ok) throw new Error(`transcription HTTP ${res.status}`);
    const j = await res.json() as { results?: { channels?: Array<{ alternatives?: Array<{ transcript?: string }> }> } };
    return (j.results?.channels?.[0]?.alternatives?.[0]?.transcript ?? '').trim();
  }
  const key = (process.env.GATE_STT_API_KEY ?? '').trim();
  if (!key) throw new Error('GATE_STT_API_KEY is not set');
  const url = process.env.GATE_STT_URL ?? 'https://api.openai.com/v1/audio/transcriptions';
  const form = new FormData();
  form.append('file', new Blob([new Uint8Array(audio)], { type: 'audio/mpeg' }), filename);
  form.append('model', model ?? process.env.GATE_STT_MODEL ?? 'whisper-1');
  form.append('language', language);
  form.append('response_format', 'text');
  const res = await fetch(url, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form, signal: AbortSignal.timeout(300_000) });
  if (!res.ok) throw new Error(`transcription HTTP ${res.status}`);
  return (await res.text()).trim();
}

export interface GateRun { language: string; topic: string; voices: [string, string]; ttsChars: number; report: GateReport | null; error?: string; files: string[] }

export async function runGate(argv: string[]): Promise<GateRun> {
  const lang = (argv[0] ?? '').toLowerCase();
  const spec = requireLanguageSpec(lang);
  const topicId = arg(argv, '--topic') ?? 'world-update';
  const [v1d, v2d] = defaultVoices(lang);
  const voices: [string, string] = [arg(argv, '--voice') ?? v1d, arg(argv, '--voice2') ?? v2d];
  const out = arg(argv, '--out') ?? fs.mkdtempSync(path.join(os.tmpdir(), `gate-${lang}-`));
  fs.mkdirSync(out, { recursive: true });

  const store = new MemoryControlStore([lang]);
  const controls = new LanguageControls({ store, env: { LANG_TTS_DAILY_CHARS: '40000', LANG_GLOBAL_DAILY_CAP: '5' }, log: (m) => console.warn(m) });
  await controls.setFlag(lang, { enabled: true, beta: true, dailyCap: 5, voice: voices[0], voiceHost2: voices[1] }, 'gate');

  const topic = await topicsService.getTopicById(topicId);
  if (!topic) throw new Error(`unknown topic ${topicId}`);
  const date = new Date().toISOString().slice(0, 10);
  const files: string[] = [];
  console.log(`[gate] ${lang}: building a real ${topicId} episode (voices ${voices.join('/')}) ...`);
  const parts = await buildNewLanguageEpisode(topic, lang, date, { controls });
  const scriptText = parts.script.segments.map((s) => s.text).join('\n');
  fs.writeFileSync(path.join(out, `${lang}.script.json`), JSON.stringify(parts.script, null, 2)); files.push(`${lang}.script.json`);

  const wav = concatenateBuffers(parts.audioSegments.map((s) => s.buffer));
  const fin = await finalizeEpisodeAudio(wav);
  const ext = fin.contentType === 'audio/mpeg' ? 'mp3' : 'wav';
  fs.writeFileSync(path.join(out, `${lang}.${ext}`), fin.buffer); files.push(`${lang}.${ext}`);
  const seconds = parts.audioSegments.reduce((n, s) => n + s.duration_seconds, 0);
  // lines whose audio exists, in order (a skipped piece drops its whole line from audioSegments: compare like with like)
  let k = 0; const lines = parts.script.segments.flatMap((seg) => { const a = parts.audioSegments[k]; if (a && a.speaker === seg.speaker) { k++; return [{ text: seg.text, seconds: a.duration_seconds }]; } return []; });

  if (argv.includes('--no-stt')) {
    console.log(`[gate] ${lang}: ${scriptText.length} chars, ${seconds.toFixed(1)} s; transcription skipped`);
    return { language: lang, topic: topicId, voices, ttsChars: parts.ttsChars, report: null, files };
  }
  const transcript = await transcribe(fin.buffer, `${lang}.${ext}`, lang, arg(argv, '--stt-model'));
  fs.writeFileSync(path.join(out, `${lang}.transcript.txt`), transcript); files.push(`${lang}.transcript.txt`);
  const report = evaluateGate({ script: scriptText, lines, totalSeconds: seconds, transcript });
  fs.writeFileSync(path.join(out, `${lang}.report.json`), JSON.stringify(report, null, 2)); files.push(`${lang}.report.json`);
  return { language: lang, topic: topicId, voices, ttsChars: parts.ttsChars, report, files: files.map((f) => path.join(out, f)) };
}

async function main() {
  try {
    const r = await runGate(process.argv.slice(2));
    const rep = r.report;
    console.log(JSON.stringify({ language: r.language, topic: r.topic, voices: r.voices, ttsChars: r.ttsChars, verdict: rep ? (rep.ok ? 'PASS' : 'FAIL') : 'NOT_RUN', failures: rep?.failures ?? [], scriptChars: rep?.scriptChars, seconds: rep ? Math.round(rep.seconds) : undefined, charsPerSecond: rep ? Number(rep.charsPerSecond.toFixed(1)) : undefined, cer: rep ? Number(rep.cer.toFixed(3)) : undefined, transcriptRatio: rep ? Number(rep.wordRatio.toFixed(2)) : undefined, files: r.files }, null, 2));
    process.exit(rep ? (rep.ok ? 0 : 2) : 0);
  } catch (e) {
    console.error(`[gate] could not run: ${e instanceof Error ? e.message : e}`);
    process.exit(1);
  }
}

if (require.main === module) main();
