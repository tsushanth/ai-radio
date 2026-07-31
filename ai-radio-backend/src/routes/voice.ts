/**
 * Voice Clone Routes
 *
 * POST /api/voice/:userId/clone        upload sample → save voice_id on user
 * POST /api/voice/:userId/synthesize   { text, lang? } → audio/mpeg stream
 * GET  /api/voice/:userId              returns { voice_id, has_voice }
 * GET  /api/voice/health               proxies to the OpenVoice host's /health
 *
 * No middleware-based auth: this matches the existing convention in user.ts,
 * topics.ts, etc. — the userId is trusted from the path. Tightening auth is a
 * separate slice across the whole backend.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { createClient } from '@supabase/supabase-js';
import { env } from '../config/environment';
import {
  uploadSample,
  synthesize,
  health,
} from '../services/voice-clone/voice-clone.service';

const router = Router();

const supabase = env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY
  ? createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY)
  : null;

// Cap sample uploads at 20MB — a 60s WAV at 44.1kHz mono 16-bit is ~5MB; this
// leaves headroom for stereo MP3 etc. without inviting abuse.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});


router.get('/health', async (_req: Request, res: Response) => {
  try {
    res.json({ success: true, voice_service: await health() });
  } catch (e) {
    res.status(503).json({ success: false, error: (e as Error).message });
  }
});


router.get('/:userId', async (req: Request, res: Response) => {
  if (!supabase) {
    res.status(503).json({ success: false, error: 'Supabase not configured' });
    return;
  }
  const { userId } = req.params;
  const { data, error } = await supabase
    .from('users')
    .select('voice_id')
    .eq('id', userId)
    .single();

  if (error) {
    res.status(404).json({ success: false, error: error.message });
    return;
  }
  res.json({
    success: true,
    voice_id: data?.voice_id ?? null,
    has_voice: Boolean(data?.voice_id),
  });
});


router.post(
  '/:userId/clone',
  upload.single('audio'),
  async (req: Request, res: Response) => {
    if (!supabase) {
      res.status(503).json({ success: false, error: 'Supabase not configured' });
      return;
    }
    const { userId } = req.params;
    const file = req.file;
    if (!file) {
      res.status(400).json({ success: false, error: 'audio file is required' });
      return;
    }

    try {
      const { voice_id } = await uploadSample(
        file.buffer,
        file.originalname || 'sample.wav',
        file.mimetype || 'audio/wav'
      );

      const { error: updErr } = await supabase
        .from('users')
        .update({ voice_id, voice_cloned_at: new Date().toISOString() })
        .eq('id', userId);
      if (updErr) {
        // Voice exists on the host but we couldn't link it to the user; surface
        // both so the client can retry the link without re-uploading.
        res.status(500).json({
          success: false,
          voice_id,
          error: `voice cloned but user update failed: ${updErr.message}`,
        });
        return;
      }

      res.json({ success: true, voice_id });
    } catch (e) {
      res.status(502).json({ success: false, error: (e as Error).message });
    }
  }
);


router.post('/:userId/synthesize', async (req: Request, res: Response) => {
  if (!supabase) {
    res.status(503).json({ success: false, error: 'Supabase not configured' });
    return;
  }
  const { userId } = req.params;
  const { text, lang, speed, voice_id: voiceIdOverride } = req.body ?? {};

  if (typeof text !== 'string' || text.trim().length === 0) {
    res.status(400).json({ success: false, error: 'text is required' });
    return;
  }
  if (text.length > 8000) {
    res.status(400).json({ success: false, error: 'text exceeds 8000 chars' });
    return;
  }

  let voiceId = typeof voiceIdOverride === 'string' ? voiceIdOverride : null;
  if (!voiceId) {
    const { data, error } = await supabase
      .from('users')
      .select('voice_id')
      .eq('id', userId)
      .single();
    if (error || !data?.voice_id) {
      res.status(404).json({
        success: false,
        error: 'no voice_id on user — call /clone first',
      });
      return;
    }
    voiceId = data.voice_id;
  }

  try {
    const mp3 = await synthesize(voiceId, text, { lang, speed });
    res.setHeader('Content-Type', 'audio/mpeg');
    res.setHeader('Content-Length', String(mp3.length));
    res.setHeader(
      'Content-Disposition',
      `inline; filename="${userId}.mp3"`
    );
    res.send(mp3);
  } catch (e) {
    res.status(502).json({ success: false, error: (e as Error).message });
  }
});

export default router;
