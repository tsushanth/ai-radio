/**
 * Voice Clone Service — thin proxy to the self-hosted OpenVoice v2 server
 * on audexa-radio (Hetzner cpx41). The service exposes /clone-voice and /tts;
 * we sit in front of it from the fly backend so the audio cloning host stays
 * gated behind a shared-secret API key.
 *
 * Pipeline:
 *   uploadSample(audio)  →  POST /clone-voice  →  { voice_id }
 *   synthesize(voice_id, text)  →  POST /tts  →  audio/mpeg stream
 *
 * Voice embeddings (~2KB .pth each) live on the Hetzner host's
 * /opt/audexa-clip/storage/voices/. We persist the voice_id on the user
 * record in Supabase so future syntheses can find them.
 */

import { env } from '../../config/environment';

const VOICE_BASE = env.VOICE_SERVICE_URL;
const VOICE_KEY = env.VOICE_SERVICE_API_KEY;

function ensureConfigured(): void {
  if (!VOICE_BASE || !VOICE_KEY) {
    throw new Error('VOICE_SERVICE_URL / VOICE_SERVICE_API_KEY not configured');
  }
}

export interface CloneResult {
  voice_id: string;
}

/**
 * Upload a 10–30s voice sample, get back a voice_id whose tone-color
 * embedding is now persisted on the OpenVoice host.
 */
export async function uploadSample(
  audio: Buffer,
  filename = 'sample.wav',
  mimeType = 'audio/wav'
): Promise<CloneResult> {
  ensureConfigured();

  const form = new FormData();
  form.append('audio', new Blob([audio], { type: mimeType }), filename);

  const resp = await fetch(`${VOICE_BASE}/clone-voice`, {
    method: 'POST',
    headers: { 'X-API-Key': VOICE_KEY! },
    body: form,
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`clone-voice failed (${resp.status}): ${body.slice(0, 300)}`);
  }
  return (await resp.json()) as CloneResult;
}

/**
 * Synthesize <text> using <voice_id>'s timbre. Returns the MP3 bytes;
 * the caller decides whether to stream to the client or push to storage.
 */
export async function synthesize(
  voiceId: string,
  text: string,
  opts: { lang?: string; speed?: number } = {}
): Promise<Buffer> {
  ensureConfigured();

  const form = new FormData();
  form.append('voice_id', voiceId);
  form.append('text', text);
  form.append('lang', opts.lang ?? 'EN');
  form.append('speed', String(opts.speed ?? 1.0));

  const resp = await fetch(`${VOICE_BASE}/tts`, {
    method: 'POST',
    headers: { 'X-API-Key': VOICE_KEY! },
    body: form,
  });

  if (!resp.ok) {
    const body = await resp.text();
    throw new Error(`tts failed (${resp.status}): ${body.slice(0, 300)}`);
  }
  return Buffer.from(await resp.arrayBuffer());
}

export async function health(): Promise<unknown> {
  ensureConfigured();
  const resp = await fetch(`${VOICE_BASE}/health`);
  return resp.json();
}
