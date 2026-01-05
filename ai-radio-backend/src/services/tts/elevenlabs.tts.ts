/**
 * ElevenLabs TTS Service
 * Text-to-speech conversion using ElevenLabs API with voice cloning support
 */

import { env } from '../../config/environment';
import type { TTSResponse, AudioSegment } from '../../types/podcast';
import type { PodcastScript, ScriptSegment } from '../../types/database';

/**
 * ElevenLabs voice model options
 */
export type ElevenLabsModel =
  | 'eleven_monolingual_v1'
  | 'eleven_multilingual_v1'
  | 'eleven_multilingual_v2'
  | 'eleven_turbo_v2';

/**
 * Voice stability and similarity settings
 */
export interface VoiceSettings {
  stability: number;        // 0.0 - 1.0 (lower = more expressive)
  similarity_boost: number; // 0.0 - 1.0 (higher = closer to original voice)
  style?: number;           // 0.0 - 1.0 (style exaggeration, v2 only)
  use_speaker_boost?: boolean;
}

/**
 * ElevenLabs voice information
 */
export interface ElevenLabsVoice {
  voice_id: string;
  name: string;
  category: 'premade' | 'cloned' | 'generated' | 'professional';
  description?: string;
  preview_url?: string;
  labels?: Record<string, string>;
  settings?: VoiceSettings;
}

/**
 * Voice configuration for podcast hosts
 */
export interface ElevenLabsVoiceConfig {
  host1_voice_id: string;
  host2_voice_id: string;
  model: ElevenLabsModel;
  settings: VoiceSettings;
}

/**
 * Pre-defined popular voices from ElevenLabs library
 */
export const ELEVENLABS_PRESET_VOICES: ElevenLabsVoice[] = [
  // Male voices
  {
    voice_id: 'pNInz6obpgDQGcFmaJgB',
    name: 'Adam',
    category: 'premade',
    description: 'Deep, narrative voice - great for storytelling',
    labels: { accent: 'american', gender: 'male', age: 'middle-aged' },
  },
  {
    voice_id: 'ErXwobaYiN019PkySvjV',
    name: 'Antoni',
    category: 'premade',
    description: 'Warm, well-rounded voice',
    labels: { accent: 'american', gender: 'male', age: 'young' },
  },
  {
    voice_id: 'VR6AewLTigWG4xSOukaG',
    name: 'Arnold',
    category: 'premade',
    description: 'Crisp, authoritative voice',
    labels: { accent: 'american', gender: 'male', age: 'middle-aged' },
  },
  {
    voice_id: 'pqHfZKP75CvOlQylNhV4',
    name: 'Bill',
    category: 'premade',
    description: 'Trustworthy, documentary-style narrator',
    labels: { accent: 'american', gender: 'male', age: 'old' },
  },
  {
    voice_id: 'nPczCjzI2devNBz1zQrb',
    name: 'Brian',
    category: 'premade',
    description: 'Deep, authoritative American voice',
    labels: { accent: 'american', gender: 'male', age: 'middle-aged' },
  },
  {
    voice_id: 'IKne3meq5aSn9XLyUdCD',
    name: 'Charlie',
    category: 'premade',
    description: 'Casual, friendly Australian voice',
    labels: { accent: 'australian', gender: 'male', age: 'middle-aged' },
  },
  {
    voice_id: 'N2lVS1w4EtoT3dr4eOWO',
    name: 'Callum',
    category: 'premade',
    description: 'Intense, edgy character voice',
    labels: { accent: 'transatlantic', gender: 'male', age: 'middle-aged' },
  },
  {
    voice_id: 'onwK4e9ZLuTAKqWW03F9',
    name: 'Daniel',
    category: 'premade',
    description: 'Deep, authoritative British voice',
    labels: { accent: 'british', gender: 'male', age: 'middle-aged' },
  },
  // Female voices
  {
    voice_id: 'EXAVITQu4vr4xnSDxMaL',
    name: 'Sarah',
    category: 'premade',
    description: 'Soft, news-anchor quality voice',
    labels: { accent: 'american', gender: 'female', age: 'young' },
  },
  {
    voice_id: 'XB0fDUnXU5powFXDhCwa',
    name: 'Charlotte',
    category: 'premade',
    description: 'Seductive, video game character voice',
    labels: { accent: 'english-swedish', gender: 'female', age: 'middle-aged' },
  },
  {
    voice_id: 'Xb7hH8MSUJpSbSDYk0k2',
    name: 'Alice',
    category: 'premade',
    description: 'Confident, British news-reader',
    labels: { accent: 'british', gender: 'female', age: 'middle-aged' },
  },
  {
    voice_id: 'pFZP5JQG7iQjIQuC4Bku',
    name: 'Lily',
    category: 'premade',
    description: 'Warm, British narrative voice',
    labels: { accent: 'british', gender: 'female', age: 'middle-aged' },
  },
  {
    voice_id: 'XrExE9yKIg1WjnnlVkGX',
    name: 'Matilda',
    category: 'premade',
    description: 'Warm, friendly young voice',
    labels: { accent: 'american', gender: 'female', age: 'young' },
  },
  {
    voice_id: 'jBpfuIE2acCO8z3wKNLl',
    name: 'Gigi',
    category: 'premade',
    description: 'Childlike, animated character voice',
    labels: { accent: 'american', gender: 'female', age: 'young' },
  },
  // Character/Special voices
  {
    voice_id: '2EiwWnXFnvU5JabPnv8n',
    name: 'Clyde',
    category: 'premade',
    description: 'War veteran character voice',
    labels: { accent: 'american', gender: 'male', age: 'middle-aged', use_case: 'characters' },
  },
  {
    voice_id: 'CYw3kZ02Hs0563khs1Fj',
    name: 'Dave',
    category: 'premade',
    description: 'Conversational British-Essex accent',
    labels: { accent: 'british-essex', gender: 'male', age: 'young', use_case: 'conversational' },
  },
  {
    voice_id: 'JBFqnCBsd6RMkjVDRZzb',
    name: 'George',
    category: 'premade',
    description: 'Warm, raspy British storyteller',
    labels: { accent: 'british', gender: 'male', age: 'middle-aged', use_case: 'narration' },
  },
  {
    voice_id: 'TX3LPaxmHKxFdv7VOQHJ',
    name: 'Liam',
    category: 'premade',
    description: 'Articulate, neutral American voice',
    labels: { accent: 'american', gender: 'male', age: 'young' },
  },
];

// Valid segment types for audio validation
const VALID_SEGMENT_TYPES = ['intro', 'calendar', 'email', 'news', 'weather', 'teaser', 'outro'] as const;
type ValidSegmentType = typeof VALID_SEGMENT_TYPES[number];

/**
 * Map any segment type to a valid one
 */
function normalizeSegmentType(type: string): ValidSegmentType {
  const normalized = type?.toLowerCase()?.trim() || 'news';
  if (VALID_SEGMENT_TYPES.includes(normalized as ValidSegmentType)) {
    return normalized as ValidSegmentType;
  }
  return 'news';
}

export class ElevenLabsTTSService {
  private apiKey: string;
  private readonly BASE_URL = 'https://api.elevenlabs.io/v1';
  private readonly DEFAULT_MODEL: ElevenLabsModel = 'eleven_multilingual_v2';
  private readonly MAX_RETRIES = 3;
  private cachedVoices: ElevenLabsVoice[] | null = null;

  constructor(apiKey?: string) {
    this.apiKey = apiKey || env.ELEVENLABS_API_KEY || '';
  }

  /**
   * Check if ElevenLabs is configured
   */
  isConfigured(): boolean {
    return !!this.apiKey;
  }

  /**
   * Get all available voices (includes user's cloned voices)
   */
  async getVoices(forceRefresh = false): Promise<ElevenLabsVoice[]> {
    if (this.cachedVoices && !forceRefresh) {
      return this.cachedVoices;
    }

    if (!this.isConfigured()) {
      console.warn('ElevenLabs API key not configured, returning preset voices only');
      return ELEVENLABS_PRESET_VOICES;
    }

    try {
      const response = await fetch(`${this.BASE_URL}/voices`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        throw new Error(`Failed to fetch voices: ${response.statusText}`);
      }

      const data = await response.json() as { voices: any[] };
      const voices: ElevenLabsVoice[] = data.voices.map((v: any) => ({
        voice_id: v.voice_id,
        name: v.name,
        category: v.category || 'premade',
        description: v.description,
        preview_url: v.preview_url,
        labels: v.labels,
        settings: v.settings,
      }));

      this.cachedVoices = voices;
      return voices;
    } catch (error) {
      console.error('Failed to fetch ElevenLabs voices:', error);
      return ELEVENLABS_PRESET_VOICES;
    }
  }

  /**
   * Get preset voices only (no API call needed)
   */
  getPresetVoices(): ElevenLabsVoice[] {
    return ELEVENLABS_PRESET_VOICES;
  }

  /**
   * Get voice by ID
   */
  async getVoice(voiceId: string): Promise<ElevenLabsVoice | null> {
    const voices = await this.getVoices();
    return voices.find(v => v.voice_id === voiceId) || null;
  }

  /**
   * Synthesize text to speech
   */
  async synthesize(
    text: string,
    voiceId: string,
    options?: {
      model?: ElevenLabsModel;
      settings?: VoiceSettings;
    }
  ): Promise<TTSResponse> {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const model = options?.model || this.DEFAULT_MODEL;
    const settings = options?.settings || this.getDefaultSettings();

    try {
      const response = await fetch(
        `${this.BASE_URL}/text-to-speech/${voiceId}`,
        {
          method: 'POST',
          headers: {
            'xi-api-key': this.apiKey,
            'Content-Type': 'application/json',
            'Accept': 'audio/mpeg',
          },
          body: JSON.stringify({
            text,
            model_id: model,
            voice_settings: settings,
          }),
        }
      );

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`ElevenLabs API error: ${response.status} - ${errorText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Estimate duration (ElevenLabs doesn't provide it)
      const duration = this.estimateDuration(text);

      return {
        audio_buffer: buffer,
        duration_seconds: duration,
        format: 'mp3',
      };
    } catch (error) {
      console.error('ElevenLabs synthesis failed:', error);
      throw error;
    }
  }

  /**
   * Synthesize with retry logic
   */
  async synthesizeWithRetry(
    text: string,
    voiceId: string,
    options?: {
      model?: ElevenLabsModel;
      settings?: VoiceSettings;
    },
    maxRetries?: number
  ): Promise<TTSResponse> {
    const retries = maxRetries || this.MAX_RETRIES;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.synthesize(text, voiceId, options);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`ElevenLabs TTS attempt ${attempt} failed:`, lastError.message);

        if (attempt < retries) {
          const delayMs = 1000 * Math.pow(2, attempt - 1);
          await this.delay(delayMs);
        }
      }
    }

    throw lastError || new Error('ElevenLabs TTS synthesis failed after retries');
  }

  /**
   * Synthesize a script segment
   */
  async synthesizeSegment(
    segment: ScriptSegment,
    voiceConfig: ElevenLabsVoiceConfig
  ): Promise<AudioSegment> {
    const voiceId = segment.speaker === 'host1'
      ? voiceConfig.host1_voice_id
      : voiceConfig.host2_voice_id;

    const response = await this.synthesizeWithRetry(
      segment.text,
      voiceId,
      {
        model: voiceConfig.model,
        settings: voiceConfig.settings,
      }
    );

    return {
      buffer: response.audio_buffer,
      duration_seconds: response.duration_seconds,
      speaker: segment.speaker,
      segment_type: normalizeSegmentType(segment.type),
    };
  }

  /**
   * Synthesize entire script
   */
  async synthesizeScript(
    script: PodcastScript,
    voiceConfig: ElevenLabsVoiceConfig
  ): Promise<AudioSegment[]> {
    const audioSegments: AudioSegment[] = [];

    for (const segment of script.segments) {
      console.log(`[ElevenLabs] Synthesizing segment ${segment.sequence}/${script.total_segments}`);

      const audioSegment = await this.synthesizeSegment(segment, voiceConfig);
      audioSegments.push(audioSegment);

      // Rate limiting - ElevenLabs has per-minute limits
      await this.delay(200);
    }

    return audioSegments;
  }

  /**
   * Synthesize script with parallel processing
   */
  async synthesizeScriptParallel(
    script: PodcastScript,
    voiceConfig: ElevenLabsVoiceConfig,
    concurrency: number = 3
  ): Promise<AudioSegment[]> {
    const audioSegments: AudioSegment[] = [];

    for (let i = 0; i < script.segments.length; i += concurrency) {
      const batch = script.segments.slice(i, i + concurrency);

      console.log(`[ElevenLabs] Synthesizing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(script.segments.length / concurrency)}`);

      const batchPromises = batch.map(segment =>
        this.synthesizeSegment(segment, voiceConfig)
      );

      const batchResults = await Promise.all(batchPromises);
      audioSegments.push(...batchResults);

      if (i + concurrency < script.segments.length) {
        await this.delay(500);
      }
    }

    return audioSegments;
  }

  /**
   * Clone a voice from audio samples
   */
  async cloneVoice(
    name: string,
    description: string,
    audioFiles: Buffer[],
    labels?: Record<string, string>
  ): Promise<ElevenLabsVoice> {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const formData = new FormData();
    formData.append('name', name);
    formData.append('description', description);

    if (labels) {
      formData.append('labels', JSON.stringify(labels));
    }

    audioFiles.forEach((file, index) => {
      const blob = new Blob([file], { type: 'audio/mpeg' });
      formData.append('files', blob, `sample_${index}.mp3`);
    });

    const response = await fetch(`${this.BASE_URL}/voices/add`, {
      method: 'POST',
      headers: {
        'xi-api-key': this.apiKey,
      },
      body: formData,
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Failed to clone voice: ${response.status} - ${errorText}`);
    }

    const data = await response.json() as { voice_id: string };

    // Refresh cache
    this.cachedVoices = null;

    return {
      voice_id: data.voice_id,
      name,
      category: 'cloned',
      description,
      labels,
    };
  }

  /**
   * Delete a cloned voice
   */
  async deleteVoice(voiceId: string): Promise<void> {
    if (!this.isConfigured()) {
      throw new Error('ElevenLabs API key not configured');
    }

    const response = await fetch(`${this.BASE_URL}/voices/${voiceId}`, {
      method: 'DELETE',
      headers: {
        'xi-api-key': this.apiKey,
      },
    });

    if (!response.ok) {
      throw new Error(`Failed to delete voice: ${response.statusText}`);
    }

    // Refresh cache
    this.cachedVoices = null;
  }

  /**
   * Get default voice settings
   */
  getDefaultSettings(): VoiceSettings {
    return {
      stability: 0.5,
      similarity_boost: 0.75,
      style: 0.0,
      use_speaker_boost: true,
    };
  }

  /**
   * Get default voice configuration for podcasts
   */
  getDefaultVoiceConfig(): ElevenLabsVoiceConfig {
    return {
      host1_voice_id: 'EXAVITQu4vr4xnSDxMaL', // Sarah - warm female
      host2_voice_id: 'pNInz6obpgDQGcFmaJgB', // Adam - deep male
      model: this.DEFAULT_MODEL,
      settings: this.getDefaultSettings(),
    };
  }

  /**
   * Get recommended voice pairs for podcasts
   */
  getRecommendedVoicePairs(): Array<{
    name: string;
    host1: ElevenLabsVoice;
    host2: ElevenLabsVoice;
    description: string;
  }> {
    const voices = ELEVENLABS_PRESET_VOICES;
    const findVoice = (id: string) => voices.find(v => v.voice_id === id)!;

    return [
      {
        name: 'Classic News Duo',
        host1: findVoice('EXAVITQu4vr4xnSDxMaL'), // Sarah
        host2: findVoice('pNInz6obpgDQGcFmaJgB'), // Adam
        description: 'Professional female anchor with authoritative male co-host',
      },
      {
        name: 'British Broadcasting',
        host1: findVoice('Xb7hH8MSUJpSbSDYk0k2'), // Alice
        host2: findVoice('onwK4e9ZLuTAKqWW03F9'), // Daniel
        description: 'Confident British duo for a refined sound',
      },
      {
        name: 'Casual Chat',
        host1: findVoice('XrExE9yKIg1WjnnlVkGX'), // Matilda
        host2: findVoice('CYw3kZ02Hs0563khs1Fj'), // Dave
        description: 'Friendly, conversational style',
      },
      {
        name: 'Storytellers',
        host1: findVoice('pFZP5JQG7iQjIQuC4Bku'), // Lily
        host2: findVoice('JBFqnCBsd6RMkjVDRZzb'), // George
        description: 'Warm British voices for narrative content',
      },
    ];
  }

  /**
   * Estimate audio duration based on text
   * ElevenLabs speaks at approximately 130-150 words per minute
   */
  private estimateDuration(text: string): number {
    const words = text.split(/\s+/).length;
    const wpm = 140;
    const minutes = words / wpm;
    return Math.ceil(minutes * 60);
  }

  /**
   * Get subscription/usage info
   */
  async getSubscriptionInfo(): Promise<{
    character_count: number;
    character_limit: number;
    can_extend_character_limit: boolean;
    tier: string;
  } | null> {
    if (!this.isConfigured()) {
      return null;
    }

    try {
      const response = await fetch(`${this.BASE_URL}/user/subscription`, {
        headers: {
          'xi-api-key': this.apiKey,
        },
      });

      if (!response.ok) {
        return null;
      }

      const data = await response.json() as {
        character_count: number;
        character_limit: number;
        can_extend_character_limit: boolean;
        tier: string;
      };
      return data;
    } catch {
      return null;
    }
  }

  /**
   * Estimate cost for script generation
   */
  estimateCost(script: PodcastScript): {
    total_characters: number;
    estimated_cost_usd: number;
  } {
    // ElevenLabs pricing varies by plan
    // Starter: ~$0.30 per 1000 characters
    // Creator: ~$0.24 per 1000 characters
    const pricePerThousandChars = 0.27; // Average estimate

    const totalCharacters = script.segments.reduce(
      (sum, segment) => sum + segment.text.length,
      0
    );

    const estimatedCost = (totalCharacters / 1000) * pricePerThousandChars;

    return {
      total_characters: totalCharacters,
      estimated_cost_usd: parseFloat(estimatedCost.toFixed(4)),
    };
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export singleton instance
export const elevenLabsTTS = new ElevenLabsTTSService();

export default ElevenLabsTTSService;
