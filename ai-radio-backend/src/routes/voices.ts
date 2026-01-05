/**
 * Voice Selection API Routes
 * Endpoints for managing TTS voices and voice preferences
 */

import { Router, Request, Response } from 'express';
import {
  getAllVoices,
  getVoicesByProvider,
  getRecommendedVoicePairs,
  getProviderStatus,
  type TTSProvider,
} from '../services/tts/tts.provider';
import { elevenLabsTTS } from '../services/tts/elevenlabs.tts';

const router = Router();

/**
 * GET /api/voices
 * Get all available voices from all providers
 */
router.get('/', async (req: Request, res: Response) => {
  try {
    const { provider, gender } = req.query;

    let voices = await getAllVoices();

    // Filter by provider if specified
    if (provider && typeof provider === 'string') {
      voices = voices.filter(v => v.provider === provider);
    }

    // Filter by gender if specified
    if (gender && typeof gender === 'string') {
      voices = voices.filter(v => v.gender === gender);
    }

    // Group by category for easier UI display
    const groupedVoices: Record<string, typeof voices> = {};
    for (const voice of voices) {
      const category = voice.category || 'Other';
      if (!groupedVoices[category]) {
        groupedVoices[category] = [];
      }
      groupedVoices[category].push(voice);
    }

    res.json({
      success: true,
      total: voices.length,
      voices,
      grouped: groupedVoices,
    });
  } catch (error) {
    console.error('Failed to get voices:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch voices',
    });
  }
});

/**
 * GET /api/voices/providers
 * Get available TTS providers and their status
 */
router.get('/providers', (req: Request, res: Response) => {
  try {
    const status = getProviderStatus();

    res.json({
      success: true,
      providers: [
        {
          id: 'openai',
          name: 'OpenAI TTS',
          description: 'High-quality neural voices',
          available: status.openai.available,
          configured: status.openai.configured,
          voice_count: 6,
          features: ['Fast generation', 'Multiple languages', 'HD quality'],
        },
        {
          id: 'elevenlabs',
          name: 'ElevenLabs',
          description: 'Ultra-realistic voices with cloning',
          available: status.elevenlabs.available,
          configured: status.elevenlabs.configured,
          voice_count: 18, // Preset voices
          features: ['Voice cloning', 'Emotional range', 'Character voices'],
        },
      ],
    });
  } catch (error) {
    console.error('Failed to get provider status:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch provider status',
    });
  }
});

/**
 * GET /api/voices/pairs
 * Get recommended voice pairs for two-host podcasts
 */
router.get('/pairs', (req: Request, res: Response) => {
  try {
    const pairs = getRecommendedVoicePairs();

    res.json({
      success: true,
      pairs,
    });
  } catch (error) {
    console.error('Failed to get voice pairs:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch voice pairs',
    });
  }
});

/**
 * GET /api/voices/:provider
 * Get voices for a specific provider
 */
router.get('/:provider', async (req: Request, res: Response) => {
  try {
    const { provider } = req.params;

    if (provider !== 'openai' && provider !== 'elevenlabs') {
      return res.status(400).json({
        success: false,
        error: 'Invalid provider. Must be "openai" or "elevenlabs"',
      });
    }

    const voices = await getVoicesByProvider(provider as TTSProvider);

    res.json({
      success: true,
      provider,
      voices,
    });
  } catch (error) {
    console.error('Failed to get voices for provider:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch voices',
    });
  }
});

/**
 * GET /api/voices/preview/:voiceId
 * Get voice preview URL (ElevenLabs only)
 */
router.get('/preview/:voiceId', async (req: Request, res: Response) => {
  try {
    const { voiceId } = req.params;

    const voice = await elevenLabsTTS.getVoice(voiceId);

    if (!voice) {
      return res.status(404).json({
        success: false,
        error: 'Voice not found',
      });
    }

    if (!voice.preview_url) {
      return res.status(404).json({
        success: false,
        error: 'No preview available for this voice',
      });
    }

    res.json({
      success: true,
      voice_id: voiceId,
      preview_url: voice.preview_url,
    });
  } catch (error) {
    console.error('Failed to get voice preview:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch voice preview',
    });
  }
});

/**
 * POST /api/voices/clone
 * Clone a voice from audio samples (ElevenLabs only)
 * Requires multipart form data with audio files
 */
router.post('/clone', async (req: Request, res: Response) => {
  try {
    if (!elevenLabsTTS.isConfigured()) {
      return res.status(400).json({
        success: false,
        error: 'ElevenLabs API key not configured',
      });
    }

    const { name, description, labels } = req.body;

    if (!name) {
      return res.status(400).json({
        success: false,
        error: 'Voice name is required',
      });
    }

    // Note: Actual file upload handling would require multer middleware
    // This is a placeholder for the voice cloning endpoint
    res.status(501).json({
      success: false,
      error: 'Voice cloning endpoint not yet implemented. Use ElevenLabs dashboard.',
      hint: 'Upload audio samples at https://elevenlabs.io/voice-lab',
    });
  } catch (error) {
    console.error('Failed to clone voice:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to clone voice',
    });
  }
});

/**
 * GET /api/voices/usage
 * Get ElevenLabs subscription/usage info
 */
router.get('/usage/elevenlabs', async (req: Request, res: Response) => {
  try {
    const info = await elevenLabsTTS.getSubscriptionInfo();

    if (!info) {
      return res.status(400).json({
        success: false,
        error: 'ElevenLabs not configured or unable to fetch usage',
      });
    }

    res.json({
      success: true,
      usage: {
        characters_used: info.character_count,
        character_limit: info.character_limit,
        characters_remaining: info.character_limit - info.character_count,
        percentage_used: Math.round((info.character_count / info.character_limit) * 100),
        tier: info.tier,
        can_extend: info.can_extend_character_limit,
      },
    });
  } catch (error) {
    console.error('Failed to get usage info:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to fetch usage info',
    });
  }
});

export default router;
