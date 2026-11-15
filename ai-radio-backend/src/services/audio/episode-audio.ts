/**
 * Episode audio finishing: WAV from the TTS worker -> loudness-normalised MP3.
 *
 * Until this existed every topic episode was uploaded as a 24 kHz mono 16-bit WAV (about 2.9 MB per minute) under a ".mp3" name with
 * Content-Type audio/mpeg. The Supabase bucket only accepts audio/mpeg, so the content type stays; the bytes are now really MP3.
 *
 *   finalizeEpisodeAudio(buffer) -> { buffer, contentType: 'audio/mpeg', format }
 *     - WAV in:  two-pass EBU R128 loudnorm (target -16 LUFS, true peak -1.5 dBTP) and a 128 kbps mono MP3 out (ffmpeg).
 *     - MP3 in:  returned unchanged (already finished).
 *     - Anything else, or ffmpeg missing / failing / AUDIO_TRANSCODE=off: the input is returned unchanged and the result says so,
 *       so an episode is never lost because the encoder had a bad day. Callers log `format` and `fallbackReason`.
 *   Existing ".mp3" objects that are really WAV keep working: format detection looks at the bytes, never at the name.
 *
 * Env: AUDIO_TRANSCODE (default on, "off" disables), AUDIO_MP3_KBPS (default 128), AUDIO_LOUDNESS_LUFS (default -16),
 *      AUDIO_TRUE_PEAK_DB (default -1.5), FFMPEG_PATH (default "ffmpeg").
 */
import { spawn } from 'node:child_process';

export type AudioFormat = 'wav' | 'mp3' | 'unknown';

export function detectAudioFormat(buf: Buffer): AudioFormat {
  if (buf.length >= 12 && buf.subarray(0, 4).toString('ascii') === 'RIFF' && buf.subarray(8, 12).toString('ascii') === 'WAVE') return 'wav';
  if (buf.length >= 3 && buf.subarray(0, 3).toString('ascii') === 'ID3') return 'mp3';
  if (buf.length >= 2 && buf[0] === 0xff && (buf[1] & 0xe0) === 0xe0) return 'mp3';
  return 'unknown';
}

export interface WavInfo { sampleRate: number; channels: number; bitsPerSample: number; dataOffset: number; dataBytes: number }

/** Reads the fmt and data chunks of a PCM WAV. Returns null when the buffer is not a parseable PCM WAV. */
export function readWavInfo(buf: Buffer): WavInfo | null {
  if (detectAudioFormat(buf) !== 'wav') return null;
  let off = 12;
  let fmt: { sampleRate: number; channels: number; bitsPerSample: number } | null = null;
  while (off + 8 <= buf.length) {
    const tag = buf.subarray(off, off + 4).toString('ascii');
    const size = buf.readUInt32LE(off + 4);
    if (tag === 'fmt ' && off + 8 + 16 <= buf.length) {
      fmt = { channels: buf.readUInt16LE(off + 10), sampleRate: buf.readUInt32LE(off + 12), bitsPerSample: buf.readUInt16LE(off + 22) };
    } else if (tag === 'data') {
      if (!fmt) return null;
      const available = buf.length - (off + 8);
      return { ...fmt, dataOffset: off + 8, dataBytes: Math.min(size, available) };
    }
    off += 8 + size + (size % 2);
  }
  return null;
}

export function wavDurationSeconds(buf: Buffer): number | null {
  const info = readWavInfo(buf);
  if (!info || info.bitsPerSample !== 16) return null;
  return info.dataBytes / (info.sampleRate * info.channels * 2);
}

/**
 * Pure-JS loudness equaliser for 16-bit PCM WAV: scales the whole buffer so its RMS (over samples above a silence gate) sits at
 * `targetDbfs`. Gain is limited to +/- `maxGainDb` and to what keeps the peak under -1 dBFS, so it never clips. Used per chunk before
 * chunks are joined (so one sentence is not 6 dB louder than the next) and as the fallback when ffmpeg is not available.
 */
export function normalizeWavRms(wav: Buffer, targetDbfs = -20, maxGainDb = 12): Buffer {
  const info = readWavInfo(wav);
  if (!info || info.bitsPerSample !== 16 || info.dataBytes < 2) return wav;
  const n = Math.floor(info.dataBytes / 2);
  let peak = 0;
  for (let i = 0; i < n; i++) peak = Math.max(peak, Math.abs(wav.readInt16LE(info.dataOffset + i * 2)));
  if (peak === 0) return wav;
  const gate = peak * 0.02; // ignore pauses so they do not drag the measured level down
  let sum = 0; let counted = 0;
  for (let i = 0; i < n; i++) {
    const s = wav.readInt16LE(info.dataOffset + i * 2);
    if (Math.abs(s) >= gate) { sum += s * s; counted++; }
  }
  if (counted === 0) return wav;
  const rmsDbfs = 20 * Math.log10(Math.sqrt(sum / counted) / 32768);
  let gainDb = Math.max(-maxGainDb, Math.min(maxGainDb, targetDbfs - rmsDbfs));
  const peakDb = 20 * Math.log10(peak / 32768);
  gainDb = Math.min(gainDb, -1 - peakDb); // never push the peak above -1 dBFS
  if (Math.abs(gainDb) < 0.1) return wav;
  const gain = 10 ** (gainDb / 20);
  const out = Buffer.from(wav);
  for (let i = 0; i < n; i++) {
    const v = Math.round(wav.readInt16LE(info.dataOffset + i * 2) * gain);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, v)), info.dataOffset + i * 2);
  }
  return out;
}

// ---------------------------------------------------------------------------------------------------------------------
// ffmpeg

export interface FfmpegResult { code: number | null; stdout: Buffer; stderr: string }
export type FfmpegRunner = (args: string[], input: Buffer, timeoutMs: number) => Promise<FfmpegResult>;

export class AudioEncodeError extends Error {
  constructor(message: string) { super(message); this.name = 'AudioEncodeError'; }
}

/** Runs ffmpeg with `input` on stdin; stdout is returned as bytes, stderr as text (capped). */
export const runFfmpeg: FfmpegRunner = (args, input, timeoutMs) => new Promise((resolve, reject) => {
  const bin = process.env.FFMPEG_PATH || 'ffmpeg';
  const child = spawn(bin, args, { stdio: ['pipe', 'pipe', 'pipe'] });
  const out: Buffer[] = []; let err = '';
  const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new AudioEncodeError(`ffmpeg timed out after ${timeoutMs} ms`)); }, timeoutMs);
  child.stdout.on('data', (d: Buffer) => out.push(d));
  child.stderr.on('data', (d: Buffer) => { if (err.length < 64_000) err += d.toString('utf8'); });
  child.on('error', (e) => { clearTimeout(timer); reject(new AudioEncodeError(`ffmpeg could not start: ${(e as NodeJS.ErrnoException).code || e.message}`)); });
  child.on('close', (code) => { clearTimeout(timer); resolve({ code, stdout: Buffer.concat(out), stderr: err }); });
  child.stdin.on('error', () => { /* ffmpeg closed stdin early: the exit code reports the real problem */ });
  child.stdin.end(input);
});

export interface Loudness { inputLufs: number; inputTruePeakDb: number; inputLra: number; inputThresh: number; offset: number }

/** Parses the JSON block that loudnorm prints on stderr when print_format=json. */
export function parseLoudnormJson(stderr: string): Loudness | null {
  const end = stderr.lastIndexOf('}');
  const start = end >= 0 ? stderr.lastIndexOf('{', end) : -1;
  if (start < 0) return null;
  try {
    const o = JSON.parse(stderr.slice(start, end + 1)) as Record<string, string>;
    const f = (k: string) => Number(o[k]);
    const r = { inputLufs: f('input_i'), inputTruePeakDb: f('input_tp'), inputLra: f('input_lra'), inputThresh: f('input_thresh'), offset: f('target_offset') };
    return Object.values(r).every(Number.isFinite) ? r : null;
  } catch { return null; }
}

export interface EncodeOptions {
  bitrateKbps?: number;
  targetLufs?: number;
  truePeakDb?: number;
  timeoutMs?: number;
  run?: FfmpegRunner;
}

const num = (v: string | undefined, dflt: number) => { const n = Number((v ?? '').trim()); return v !== undefined && v.trim() !== '' && Number.isFinite(n) ? n : dflt; };

export function encodeSettings(env: NodeJS.ProcessEnv = process.env) {
  return {
    enabled: (env.AUDIO_TRANSCODE ?? '').trim().toLowerCase() !== 'off',
    bitrateKbps: Math.max(32, Math.min(320, Math.round(num(env.AUDIO_MP3_KBPS, 128)))),
    targetLufs: num(env.AUDIO_LOUDNESS_LUFS, -16),
    truePeakDb: num(env.AUDIO_TRUE_PEAK_DB, -1.5),
  };
}

/** Loudness of a WAV (or any ffmpeg-readable audio) with the ffmpeg loudnorm analyser. Used by the encoder and by tests. */
export async function measureLoudness(input: Buffer, o: EncodeOptions = {}): Promise<Loudness> {
  const run = o.run ?? runFfmpeg;
  const s = encodeSettings();
  const filter = `loudnorm=I=${o.targetLufs ?? s.targetLufs}:TP=${o.truePeakDb ?? s.truePeakDb}:LRA=11:print_format=json`;
  const r = await run(['-hide_banner', '-nostats', '-i', 'pipe:0', '-af', filter, '-f', 'null', '-'], input, o.timeoutMs ?? 120_000);
  if (r.code !== 0) throw new AudioEncodeError(`ffmpeg loudness pass failed (exit ${r.code})`);
  const m = parseLoudnormJson(r.stderr);
  if (!m) throw new AudioEncodeError('ffmpeg loudness pass printed no measurement');
  return m;
}

/**
 * WAV -> MP3, loudness normalised to the target (two passes: measure, then apply a linear gain so dynamics are untouched).
 * Silence (measured -inf) is encoded without the filter. Throws AudioEncodeError when ffmpeg fails.
 */
export async function transcodeWavToMp3(wav: Buffer, o: EncodeOptions = {}): Promise<{ mp3: Buffer; measured: Loudness | null }> {
  const run = o.run ?? runFfmpeg;
  const s = encodeSettings();
  const kbps = o.bitrateKbps ?? s.bitrateKbps;
  const target = o.targetLufs ?? s.targetLufs;
  const tp = o.truePeakDb ?? s.truePeakDb;
  const timeoutMs = o.timeoutMs ?? 120_000;
  const info = readWavInfo(wav);
  const rate = info?.sampleRate && info.sampleRate >= 8000 ? info.sampleRate : 44100; // loudnorm resamples to 192 kHz internally: set the rate back

  let measured: Loudness | null = null;
  try { measured = await measureLoudness(wav, { ...o, run, targetLufs: target, truePeakDb: tp, timeoutMs }); } catch (e) {
    if (e instanceof AudioEncodeError && /could not start|timed out/.test(e.message)) throw e;
    measured = null; // the analysis failed: still produce an MP3 below, without a gain stage
  }
  const filters: string[] = [];
  if (measured && Number.isFinite(measured.inputLufs) && measured.inputLufs > -70) {
    filters.push(`loudnorm=I=${target}:TP=${tp}:LRA=11:measured_I=${measured.inputLufs}:measured_TP=${measured.inputTruePeakDb}:measured_LRA=${measured.inputLra}:measured_thresh=${measured.inputThresh}:offset=${measured.offset}:linear=true`);
  }
  filters.push(`aresample=${rate}`);
  const args = ['-hide_banner', '-nostats', '-loglevel', 'error', '-i', 'pipe:0', '-vn', '-af', filters.join(','), '-ac', '1',
    '-codec:a', 'libmp3lame', '-b:a', `${kbps}k`, '-id3v2_version', '3', '-f', 'mp3', 'pipe:1'];
  const r = await run(args, wav, timeoutMs);
  if (r.code !== 0 || r.stdout.length < 128 || detectAudioFormat(r.stdout) !== 'mp3') throw new AudioEncodeError(`ffmpeg MP3 encode failed (exit ${r.code})`);
  return { mp3: r.stdout, measured };
}

export interface FinalAudio {
  buffer: Buffer;
  /** Always audio/mpeg: the topic-podcasts bucket accepts nothing else. */
  contentType: 'audio/mpeg';
  /** What the bytes really are. 'wav' means the encoder was skipped or failed (see fallbackReason). */
  format: AudioFormat;
  bytesIn: number;
  bytesOut: number;
  inputLufs?: number;
  fallbackReason?: string;
}

export async function finalizeEpisodeAudio(input: Buffer, o: EncodeOptions & { env?: NodeJS.ProcessEnv; log?: (m: string) => void } = {}): Promise<FinalAudio> {
  const log = o.log ?? ((m: string) => console.log(m));
  const format = detectAudioFormat(input);
  const base = { contentType: 'audio/mpeg' as const, bytesIn: input.length };
  if (format === 'mp3') return { ...base, buffer: input, format, bytesOut: input.length };
  const settings = encodeSettings(o.env);
  if (format !== 'wav' || !settings.enabled) {
    const fallbackReason = format !== 'wav' ? 'input is not a WAV' : 'AUDIO_TRANSCODE=off';
    return { ...base, buffer: input, format, bytesOut: input.length, fallbackReason };
  }
  try {
    const { mp3, measured } = await transcodeWavToMp3(input, { bitrateKbps: settings.bitrateKbps, targetLufs: settings.targetLufs, truePeakDb: settings.truePeakDb, ...o });
    log(`[audio] transcoded WAV ${input.length} B -> MP3 ${mp3.length} B (${settings.bitrateKbps} kbps)${measured ? `, input ${measured.inputLufs} LUFS -> ${settings.targetLufs}` : ''}`);
    return { ...base, buffer: mp3, format: 'mp3', bytesOut: mp3.length, inputLufs: measured?.inputLufs };
  } catch (e) {
    const reason = e instanceof Error ? e.message : String(e);
    console.warn(`[audio] transcode failed, keeping the WAV: ${reason}`);
    return { ...base, buffer: input, format, bytesOut: input.length, fallbackReason: reason };
  }
}
