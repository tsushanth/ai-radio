/**
 * TTS Provider Abstraction
 * Unified interface for multiple TTS providers (OpenAI, ElevenLabs)
 */

import { openaiTTS, type OpenAIVoice, type VoiceConfig as OpenAIVoiceConfig } from './openai.tts';
import {
  elevenLabsTTS,
  type ElevenLabsVoice,
  type ElevenLabsVoiceConfig,
  ELEVENLABS_PRESET_VOICES,
} from './elevenlabs.tts';
import type { AudioSegment } from '../../types/podcast';
import type { PodcastScript } from '../../types/database';

/**
 * Supported TTS providers
 */
export type TTSProvider = 'openai' | 'elevenlabs';

/**
 * Unified voice representation
 */
export interface UnifiedVoice {
  id: string;
  name: string;
  provider: TTSProvider;
  gender: 'male' | 'female' | 'neutral';
  accent?: string;
  description?: string;
  preview_url?: string;
  category?: string;
}

/**
 * Unified voice configuration
 */
export interface UnifiedVoiceConfig {
  provider: TTSProvider;
  host1_voice_id: string;
  host2_voice_id: string;
  speed?: number;  // OpenAI only
}

/**
 * Voice pair recommendation
 */
export interface VoicePairRecommendation {
  id: string;
  name: string;
  provider: TTSProvider;
  host1: UnifiedVoice;
  host2: UnifiedVoice;
  description: string;
}

/**
 * Get all available voices from all providers
 */
export async function getAllVoices(): Promise<UnifiedVoice[]> {
  const voices: UnifiedVoice[] = [];

  // Add OpenAI voices
  const openaiVoices = openaiTTS.getSupportedVoices();
  const openaiCharacteristics = openaiTTS.getVoiceCharacteristics();

  for (const voice of openaiVoices) {
    const characteristics = openaiCharacteristics[voice];
    voices.push({
      id: `openai:${voice}`,
      name: voice.charAt(0).toUpperCase() + voice.slice(1),
      provider: 'openai',
      gender: characteristics.gender.toLowerCase() as 'male' | 'female' | 'neutral',
      description: characteristics.description,
      category: 'OpenAI Standard',
    });
  }

  // Add ElevenLabs voices
  if (elevenLabsTTS.isConfigured()) {
    try {
      const elevenVoices = await elevenLabsTTS.getVoices();
      for (const voice of elevenVoices) {
        voices.push({
          id: `elevenlabs:${voice.voice_id}`,
          name: voice.name,
          provider: 'elevenlabs',
          gender: (voice.labels?.gender as 'male' | 'female') || 'neutral',
          accent: voice.labels?.accent,
          description: voice.description,
          preview_url: voice.preview_url,
          category: voice.category === 'cloned' ? 'Your Cloned Voices' : 'ElevenLabs Library',
        });
      }
    } catch (error) {
      console.warn('Failed to fetch ElevenLabs voices:', error);
      // Add preset voices as fallback
      for (const voice of ELEVENLABS_PRESET_VOICES) {
        voices.push({
          id: `elevenlabs:${voice.voice_id}`,
          name: voice.name,
          provider: 'elevenlabs',
          gender: (voice.labels?.gender as 'male' | 'female') || 'neutral',
          accent: voice.labels?.accent,
          description: voice.description,
          category: 'ElevenLabs Library',
        });
      }
    }
  } else {
    // Add preset voices without API call
    for (const voice of ELEVENLABS_PRESET_VOICES) {
      voices.push({
        id: `elevenlabs:${voice.voice_id}`,
        name: voice.name,
        provider: 'elevenlabs',
        gender: (voice.labels?.gender as 'male' | 'female') || 'neutral',
        accent: voice.labels?.accent,
        description: voice.description,
        category: 'ElevenLabs Library (Requires API Key)',
      });
    }
  }

  return voices;
}

/**
 * Get voices filtered by provider
 */
export async function getVoicesByProvider(provider: TTSProvider): Promise<UnifiedVoice[]> {
  const allVoices = await getAllVoices();
  return allVoices.filter(v => v.provider === provider);
}

/**
 * Get recommended voice pairs
 */
export function getRecommendedVoicePairs(): VoicePairRecommendation[] {
  const pairs: VoicePairRecommendation[] = [];

  // OpenAI pairs
  const openaiPairs = openaiTTS.getRecommendedVoicePairs();
  const openaiCharacteristics = openaiTTS.getVoiceCharacteristics();

  for (const pair of openaiPairs) {
    pairs.push({
      id: `openai:${pair.host1}-${pair.host2}`,
      name: pair.name,
      provider: 'openai',
      host1: {
        id: `openai:${pair.host1}`,
        name: pair.host1.charAt(0).toUpperCase() + pair.host1.slice(1),
        provider: 'openai',
        gender: openaiCharacteristics[pair.host1].gender.toLowerCase() as 'male' | 'female' | 'neutral',
        description: openaiCharacteristics[pair.host1].description,
      },
      host2: {
        id: `openai:${pair.host2}`,
        name: pair.host2.charAt(0).toUpperCase() + pair.host2.slice(1),
        provider: 'openai',
        gender: openaiCharacteristics[pair.host2].gender.toLowerCase() as 'male' | 'female' | 'neutral',
        description: openaiCharacteristics[pair.host2].description,
      },
      description: pair.description,
    });
  }

  // ElevenLabs pairs
  const elevenPairs = elevenLabsTTS.getRecommendedVoicePairs();

  for (const pair of elevenPairs) {
    pairs.push({
      id: `elevenlabs:${pair.host1.voice_id}-${pair.host2.voice_id}`,
      name: pair.name,
      provider: 'elevenlabs',
      host1: {
        id: `elevenlabs:${pair.host1.voice_id}`,
        name: pair.host1.name,
        provider: 'elevenlabs',
        gender: (pair.host1.labels?.gender as 'male' | 'female') || 'neutral',
        description: pair.host1.description,
      },
      host2: {
        id: `elevenlabs:${pair.host2.voice_id}`,
        name: pair.host2.name,
        provider: 'elevenlabs',
        gender: (pair.host2.labels?.gender as 'male' | 'female') || 'neutral',
        description: pair.host2.description,
      },
      description: pair.description,
    });
  }

  return pairs;
}

/**
 * Parse unified voice ID
 */
export function parseVoiceId(unifiedId: string): { provider: TTSProvider; voiceId: string } {
  const [provider, voiceId] = unifiedId.split(':');
  return {
    provider: provider as TTSProvider,
    voiceId,
  };
}

/**
 * Synthesize script using the appropriate provider
 */
export async function synthesizeScript(
  script: PodcastScript,
  config: UnifiedVoiceConfig,
  options?: {
    parallel?: boolean;
    concurrency?: number;
  }
): Promise<AudioSegment[]> {
  const { provider, host1_voice_id, host2_voice_id, speed } = config;

  // Parse voice IDs (remove provider prefix if present)
  const host1Id = host1_voice_id.includes(':')
    ? parseVoiceId(host1_voice_id).voiceId
    : host1_voice_id;
  const host2Id = host2_voice_id.includes(':')
    ? parseVoiceId(host2_voice_id).voiceId
    : host2_voice_id;

  if (provider === 'openai') {
    const voiceConfig: OpenAIVoiceConfig = {
      host1: host1Id as OpenAIVoice,
      host2: host2Id as OpenAIVoice,
      model: 'tts-1-hd',
      speed: speed || 1.0,
    };

    if (options?.parallel) {
      return openaiTTS.synthesizeScriptParallel(
        script,
        voiceConfig,
        options.concurrency || 5
      );
    }
    return openaiTTS.synthesizeScript(script, voiceConfig);
  }

  if (provider === 'elevenlabs') {
    if (!elevenLabsTTS.isConfigured()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const voiceConfig: ElevenLabsVoiceConfig = {
      host1_voice_id: host1Id,
      host2_voice_id: host2Id,
      model: 'eleven_multilingual_v2',
      settings: elevenLabsTTS.getDefaultSettings(),
    };

    if (options?.parallel) {
      return elevenLabsTTS.synthesizeScriptParallel(
        script,
        voiceConfig,
        options.concurrency || 3
      );
    }
    return elevenLabsTTS.synthesizeScript(script, voiceConfig);
  }

  throw new Error(`Unknown TTS provider: ${provider}`);
}

/**
 * Get default voice configuration
 */
export function getDefaultVoiceConfig(): UnifiedVoiceConfig {
  return {
    provider: 'openai',
    host1_voice_id: 'nova',
    host2_voice_id: 'onyx',
    speed: 1.0,
  };
}

/**
 * Estimate cost for script generation
 */
export function estimateCost(
  script: PodcastScript,
  provider: TTSProvider
): { total_characters: number; estimated_cost_usd: number } {
  if (provider === 'openai') {
    return openaiTTS.estimateCost(script);
  }
  if (provider === 'elevenlabs') {
    return elevenLabsTTS.estimateCost(script);
  }
  throw new Error(`Unknown provider: ${provider}`);
}

/**
 * Check provider availability
 */
export function getProviderStatus(): {
  openai: { available: boolean; configured: boolean };
  elevenlabs: { available: boolean; configured: boolean };
} {
  return {
    openai: {
      available: true,
      configured: true, // OpenAI is always configured via environment
    },
    elevenlabs: {
      available: true,
      configured: elevenLabsTTS.isConfigured(),
    },
  };
}

// Export for convenience
export { openaiTTS, elevenLabsTTS };
