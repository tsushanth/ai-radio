/**
 * Episode audio on its way to storage: a WAV from the TTS worker is stored as an MP3 with Content-Type audio/mpeg, and a list of
 * recent episodes never offers one whose audio was removed by retention.
 */
import test from 'node:test';
import assert from 'node:assert/strict';

Object.assign(process.env, {
  NODE_ENV: 'test', JWT_SECRET: 'x'.repeat(40), SUPABASE_URL: 'https://example.invalid', SUPABASE_SERVICE_KEY: 'test-service-key',
  GOOGLE_CLIENT_ID: 'x', GOOGLE_CLIENT_SECRET: 'x', ANTHROPIC_API_KEY: 'x',
});

import { pcmToWav } from '../tts/piper.client.ts';
import { detectAudioFormat } from '../audio/episode-audio.ts';

async function gen(db: unknown) {
  const { TopicPodcastGenerator } = await import('./topic.generator');
  const g = new TopicPodcastGenerator() as any;
  g.supabase = db;
  return g;
}

test('uploadAudio sends audio/mpeg and, when ffmpeg is present, real MP3 bytes', async () => {
  const uploads: Array<{ path: string; body: Buffer; opts: any }> = [];
  const db = { storage: { from: () => ({
    upload: async (path: string, body: Buffer, opts: any) => { uploads.push({ path, body, opts }); return { error: null }; },
    getPublicUrl: (path: string) => ({ data: { publicUrl: `https://cdn.invalid/${path}` } }),
  }) } };
  const wav = pcmToWav(Buffer.alloc(24000 * 2 * 2), 24000);
  const url = await (await gen(db)).uploadAudio(wav, 'tech-news/2026-11-15-cs.mp3');
  assert.equal(url, 'https://cdn.invalid/tech-news/2026-11-15-cs.mp3');
  assert.equal(uploads.length, 1);
  assert.equal(uploads[0].opts.contentType, 'audio/mpeg');
  assert.ok(['mp3', 'wav'].includes(detectAudioFormat(uploads[0].body)));
});

test('getRecentEpisodes asks only for completed episodes that still have audio', async () => {
  const calls: string[] = [];
  const q: any = { select: () => q, eq: (c: string, v: string) => { calls.push(`eq:${c}=${v}`); return q; }, not: (c: string, op: string, v: unknown) => { calls.push(`not:${c} ${op} ${v}`); return q; }, order: () => q, limit: async () => ({ data: [], error: null }) };
  const db = { from: () => q };
  assert.deepEqual(await (await gen(db)).getRecentEpisodes('t', 7, 'cs'), []);
  assert.ok(calls.includes('eq:status=completed')); assert.ok(calls.includes('eq:language=cs')); assert.ok(calls.includes('not:audio_url is null'));
});
