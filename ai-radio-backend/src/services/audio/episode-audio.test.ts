import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import {
  detectAudioFormat, readWavInfo, wavDurationSeconds, normalizeWavRms, parseLoudnormJson, encodeSettings,
  transcodeWavToMp3, finalizeEpisodeAudio, measureLoudness, AudioEncodeError, type FfmpegRunner,
} from './episode-audio.ts';
import { pcmToWav } from '../tts/piper.client.ts';

const HAVE_FFMPEG = spawnSync('ffmpeg', ['-version']).status === 0;

/** Mono 16-bit PCM: a 220 Hz tone with a slow amplitude wobble (speech-like), `db` dBFS peak. */
function tone(seconds: number, db: number, rate = 24000): Buffer {
  const n = Math.round(seconds * rate);
  const pcm = Buffer.alloc(n * 2);
  const amp = 32767 * 10 ** (db / 20);
  for (let i = 0; i < n; i++) {
    const env = 0.6 + 0.4 * Math.sin((2 * Math.PI * 3 * i) / rate);
    pcm.writeInt16LE(Math.round(amp * env * Math.sin((2 * Math.PI * 220 * i) / rate)), i * 2);
  }
  return pcmToWav(pcm, rate);
}

const rmsDbfs = (wav: Buffer) => {
  const info = readWavInfo(wav)!; const n = info.dataBytes / 2; let s = 0;
  for (let i = 0; i < n; i++) { const v = wav.readInt16LE(info.dataOffset + i * 2); s += v * v; }
  return 20 * Math.log10(Math.sqrt(s / n) / 32768);
};

test('format detection reads the bytes, not the name: a WAV that was stored as .mp3 is still a WAV', () => {
  assert.equal(detectAudioFormat(tone(0.1, -20)), 'wav');
  assert.equal(detectAudioFormat(Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00')), 'mp3');
  assert.equal(detectAudioFormat(Buffer.from([0xff, 0xfb, 0x90, 0x00])), 'mp3');
  assert.equal(detectAudioFormat(Buffer.from('hello world, not audio')), 'unknown');
  assert.equal(detectAudioFormat(Buffer.alloc(0)), 'unknown');
});

test('readWavInfo and wavDurationSeconds parse the header the TTS path writes', () => {
  const wav = tone(2, -20, 24000);
  const info = readWavInfo(wav)!;
  assert.equal(info.sampleRate, 24000); assert.equal(info.channels, 1); assert.equal(info.bitsPerSample, 16);
  assert.ok(Math.abs(wavDurationSeconds(wav)! - 2) < 0.001);
  assert.equal(readWavInfo(Buffer.from('nope')), null);
});

test('normalizeWavRms brings quiet and loud chunks to the same level and never clips', () => {
  const quiet = tone(1, -34); const loud = tone(1, -6);
  const a = normalizeWavRms(quiet, -20, 24); const b = normalizeWavRms(loud, -20, 24);
  assert.ok(Math.abs(rmsDbfs(a) - rmsDbfs(b)) < 1.5, `levels ${rmsDbfs(a)} vs ${rmsDbfs(b)}`);
  for (const w of [a, b]) {
    const info = readWavInfo(w)!; let peak = 0;
    for (let i = 0; i < info.dataBytes / 2; i++) peak = Math.max(peak, Math.abs(w.readInt16LE(info.dataOffset + i * 2)));
    assert.ok(peak <= 32767 * 10 ** (-1 / 20) + 2, 'peak stays under -1 dBFS');
  }
});

test('normalizeWavRms limits the gain, leaves silence and non-WAV input alone', () => {
  const quiet = tone(1, -60);
  assert.ok(rmsDbfs(normalizeWavRms(quiet, -20, 6)) - rmsDbfs(quiet) <= 6.2, 'gain capped at maxGainDb');
  const silence = pcmToWav(Buffer.alloc(4800), 24000);
  assert.deepEqual(normalizeWavRms(silence), silence);
  const junk = Buffer.from('not a wav');
  assert.equal(normalizeWavRms(junk), junk);
});

test('parseLoudnormJson reads the block ffmpeg prints on stderr', () => {
  const stderr = `[Parsed_loudnorm_0 @ 0x1] \n{\n\t"input_i" : "-27.61",\n\t"input_tp" : "-4.47",\n\t"input_lra" : "18.06",\n\t"input_thresh" : "-39.20",\n\t"output_i" : "-16.58",\n\t"target_offset" : "0.58"\n}\n`;
  assert.deepEqual(parseLoudnormJson(stderr), { inputLufs: -27.61, inputTruePeakDb: -4.47, inputLra: 18.06, inputThresh: -39.2, offset: 0.58 });
  assert.equal(parseLoudnormJson('no json here'), null);
  assert.equal(parseLoudnormJson('{"input_i": "-inf"}'), null);
});

test('settings: on by default, 128 kbps, -16 LUFS, overridable, bad numbers fall back', () => {
  assert.deepEqual(encodeSettings({}), { enabled: true, bitrateKbps: 128, targetLufs: -16, truePeakDb: -1.5 });
  assert.equal(encodeSettings({ AUDIO_TRANSCODE: 'off' }).enabled, false);
  assert.equal(encodeSettings({ AUDIO_MP3_KBPS: '64' }).bitrateKbps, 64);
  assert.equal(encodeSettings({ AUDIO_MP3_KBPS: 'abc' }).bitrateKbps, 128);
  assert.equal(encodeSettings({ AUDIO_MP3_KBPS: '9999' }).bitrateKbps, 320);
});

// ---- encoder with a scripted ffmpeg (no binary needed) ----

const FAKE_MP3 = Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00'), Buffer.alloc(400, 1)]);
const measureStderr = (i: number) => `{"input_i":"${i}","input_tp":"-3.0","input_lra":"5.0","input_thresh":"-40.0","target_offset":"0.1"}`;

function scripted(opts: { measure?: string; encodeCode?: number; encodeOut?: Buffer; startFails?: boolean } = {}) {
  const calls: string[][] = [];
  const run: FfmpegRunner = async (args) => {
    calls.push(args);
    if (opts.startFails) throw new AudioEncodeError('ffmpeg could not start: ENOENT');
    if (args.includes('null')) return { code: 0, stdout: Buffer.alloc(0), stderr: opts.measure ?? measureStderr(-30) };
    return { code: opts.encodeCode ?? 0, stdout: opts.encodeOut ?? FAKE_MP3, stderr: '' };
  };
  return { run, calls };
}

test('transcode: measures first, then encodes mono MP3 at the set bitrate with the measured gain and the source sample rate', async () => {
  const s = scripted();
  const { mp3, measured } = await transcodeWavToMp3(tone(1, -20, 24000), { run: s.run });
  assert.equal(s.calls.length, 2);
  const enc = s.calls[1];
  assert.ok(enc.includes('libmp3lame')); assert.equal(enc[enc.indexOf('-b:a') + 1], '128k'); assert.equal(enc[enc.indexOf('-ac') + 1], '1');
  const af = enc[enc.indexOf('-af') + 1];
  assert.match(af, /loudnorm=I=-16:TP=-1\.5:LRA=11:measured_I=-30:measured_TP=-3.*linear=true/);
  assert.match(af, /aresample=24000$/);
  assert.equal(measured?.inputLufs, -30);
  assert.equal(detectAudioFormat(mp3), 'mp3');
});

test('transcode: silence (-inf) is encoded without a gain stage', async () => {
  const s = scripted({ measure: '{"input_i":"-70.0","input_tp":"-70.0","input_lra":"0","input_thresh":"-70.0","target_offset":"0"}' });
  await transcodeWavToMp3(tone(1, -20), { run: s.run });
  assert.ok(!s.calls[1][s.calls[1].indexOf('-af') + 1].includes('loudnorm'));
});

test('transcode: an encoder that exits non-zero, or returns junk, is an AudioEncodeError', async () => {
  await assert.rejects(transcodeWavToMp3(tone(1, -20), { run: scripted({ encodeCode: 1 }).run }), AudioEncodeError);
  await assert.rejects(transcodeWavToMp3(tone(1, -20), { run: scripted({ encodeOut: Buffer.from('xxxx'.repeat(100)) }).run }), AudioEncodeError);
});

test('finalize: WAV becomes MP3 with content type audio/mpeg and a much smaller body', async () => {
  const s = scripted();
  const wav = tone(2, -20);
  const out = await finalizeEpisodeAudio(wav, { run: s.run, log: () => {} });
  assert.equal(out.format, 'mp3'); assert.equal(out.contentType, 'audio/mpeg');
  assert.equal(out.bytesIn, wav.length); assert.equal(out.bytesOut, FAKE_MP3.length); assert.equal(out.inputLufs, -30);
  assert.equal(out.fallbackReason, undefined);
});

test('finalize: an MP3 passes through untouched and ffmpeg is never started', async () => {
  const s = scripted();
  const out = await finalizeEpisodeAudio(FAKE_MP3, { run: s.run });
  assert.equal(out.buffer, FAKE_MP3); assert.equal(out.format, 'mp3'); assert.equal(s.calls.length, 0);
});

test('finalize: ffmpeg missing or failing keeps the WAV (never loses the episode) and says why', async () => {
  const wav = tone(1, -20);
  const warn = console.warn; console.warn = () => {};
  try {
    for (const run of [scripted({ startFails: true }).run, scripted({ encodeCode: 1 }).run]) {
      const out = await finalizeEpisodeAudio(wav, { run, log: () => {} });
      assert.equal(out.buffer, wav); assert.equal(out.format, 'wav'); assert.equal(out.contentType, 'audio/mpeg'); assert.ok(out.fallbackReason);
    }
  } finally { console.warn = warn; }
});

test('finalize: AUDIO_TRANSCODE=off and non-audio input skip the encoder', async () => {
  const s = scripted(); const wav = tone(1, -20);
  const off = await finalizeEpisodeAudio(wav, { run: s.run, env: { AUDIO_TRANSCODE: 'off' } });
  assert.equal(off.buffer, wav); assert.equal(off.fallbackReason, 'AUDIO_TRANSCODE=off');
  const junk = Buffer.from('not audio at all');
  assert.equal((await finalizeEpisodeAudio(junk, { run: s.run })).buffer, junk);
  assert.equal(s.calls.length, 0);
});

// ---- real ffmpeg (skipped where it is not installed) ----

test('real ffmpeg: a quiet and a loud WAV both come out as MP3 at about -16 LUFS, smaller than the WAV', { skip: !HAVE_FFMPEG }, async () => {
  for (const db of [-34, -8]) {
    const wav = tone(6, db);
    const out = await finalizeEpisodeAudio(wav, { log: () => {} });
    assert.equal(out.format, 'mp3', out.fallbackReason);
    assert.ok(out.bytesOut < out.bytesIn / 2, `${out.bytesOut} vs ${out.bytesIn}`);
    const after = await measureLoudness(out.buffer);
    assert.ok(Math.abs(after.inputLufs - -16) < 1.5, `loudness ${after.inputLufs} for input ${db} dBFS`);
  }
});

test('real ffmpeg: duration survives the transcode (within 0.2 s)', { skip: !HAVE_FFMPEG }, async () => {
  const wav = tone(5, -20);
  const { mp3 } = await transcodeWavToMp3(wav);
  const dec = spawnSync('ffmpeg', ['-v', 'error', '-i', 'pipe:0', '-f', 'wav', 'pipe:1'], { input: mp3, maxBuffer: 64 * 1024 * 1024 });
  const dur = wavDurationSeconds(dec.stdout as Buffer);
  assert.ok(dur !== null && Math.abs(dur - 5) < 0.2, String(dur));
});
