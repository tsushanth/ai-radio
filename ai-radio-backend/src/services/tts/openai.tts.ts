/**
 * OpenAI TTS Service
 * Text-to-speech conversion using OpenAI's TTS API with multiple voices
 */

import OpenAI from 'openai';
import { env } from '../../config/environment';
import type { TTSRequest, TTSResponse, AudioSegment } from '../../types/podcast';
import type { PodcastScript, ScriptSegment } from '../../types/database';

/**
 * OpenAI TTS voice options
 */
export type OpenAIVoice = 'alloy' | 'echo' | 'fable' | 'onyx' | 'nova' | 'shimmer';

/**
 * TTS model options
 */
export type TTSModel = 'tts-1' | 'tts-1-hd';

/**
 * Audio format options
 */
export type AudioFormat = 'mp3' | 'opus' | 'aac' | 'flac' | 'wav' | 'pcm';

/**
 * Voice configuration for each host
 */
export interface VoiceConfig {
  host1: OpenAIVoice;
  host2: OpenAIVoice;
  model: TTSModel;
  speed: number; // 0.25 to 4.0
}

// Valid segment types for audio validation
const VALID_SEGMENT_TYPES = ['intro', 'calendar', 'email', 'news', 'weather', 'outro'] as const;
type ValidSegmentType = typeof VALID_SEGMENT_TYPES[number];

/**
 * Map any segment type to a valid one
 * This handles cases where GPT-4 generates unexpected types
 */
function normalizeSegmentType(type: string): ValidSegmentType {
  const normalized = type?.toLowerCase()?.trim() || 'news';

  // Direct match
  if (VALID_SEGMENT_TYPES.includes(normalized as ValidSegmentType)) {
    return normalized as ValidSegmentType;
  }

  // Common mappings for unexpected types
  const typeMapping: Record<string, ValidSegmentType> = {
    'introduction': 'intro',
    'opening': 'intro',
    'greeting': 'intro',
    'welcome': 'intro',
    'emails': 'email',
    'mail': 'email',
    'message': 'email',
    'messages': 'email',
    'schedule': 'calendar',
    'meeting': 'calendar',
    'meetings': 'calendar',
    'events': 'calendar',
    'event': 'calendar',
    'appointment': 'calendar',
    'topic': 'news',
    'topics': 'news',
    'update': 'news',
    'updates': 'news',
    'discussion': 'news',
    'content': 'news',
    'general': 'news',
    'summary': 'news',
    'forecast': 'weather',
    'closing': 'outro',
    'goodbye': 'outro',
    'farewell': 'outro',
    'signoff': 'outro',
    'sign-off': 'outro',
    'conclusion': 'outro',
  };

  if (typeMapping[normalized]) {
    console.log(`Mapped segment type "${type}" -> "${typeMapping[normalized]}"`);
    return typeMapping[normalized];
  }

  // Default fallback
  console.warn(`Unknown segment type "${type}", defaulting to "news"`);
  return 'news';
}

export class OpenAITTSService {
  private openai: OpenAI;
  private readonly DEFAULT_MODEL: TTSModel = 'tts-1-hd';
  private readonly DEFAULT_SPEED = 1.0;
  private readonly DEFAULT_FORMAT: AudioFormat = 'mp3';
  private readonly MAX_RETRIES = 3;

  constructor(apiKey?: string) {
    this.openai = new OpenAI({
      apiKey: apiKey || env.OPENAI_API_KEY,
    });
  }

  /**
   * Convert single text segment to audio
   */
  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    try {
      const voice = this.validateVoice(request.voice);
      const speed = request.speed || this.DEFAULT_SPEED;

      const response = await this.openai.audio.speech.create({
        model: this.DEFAULT_MODEL,
        voice: voice,
        input: request.text,
        speed: this.clampSpeed(speed),
        response_format: this.DEFAULT_FORMAT,
      });

      // Convert response to buffer
      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // Estimate duration (OpenAI doesn't provide it)
      const duration = this.estimateDuration(request.text, speed);

      return {
        audio_buffer: buffer,
        duration_seconds: duration,
        format: this.DEFAULT_FORMAT,
      };
    } catch (error) {
      console.error('TTS synthesis failed:', error);
      throw this.createError('Failed to synthesize audio', error);
    }
  }

  /**
   * Convert single text segment with retry logic
   */
  async synthesizeWithRetry(request: TTSRequest, maxRetries?: number): Promise<TTSResponse> {
    const retries = maxRetries || this.MAX_RETRIES;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.synthesize(request);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`TTS attempt ${attempt} failed:`, lastError.message);

        // Don't retry on client errors (4xx)
        if (error instanceof OpenAI.APIError && error.status && error.status >= 400 && error.status < 500) {
          throw lastError;
        }

        // Wait before retry (exponential backoff)
        if (attempt < retries) {
          const delayMs = 1000 * Math.pow(2, attempt - 1);
          await this.delay(delayMs);
        }
      }
    }

    throw lastError || new Error('TTS synthesis failed after retries');
  }

  /**
   * Convert script segment to audio
   */
  async synthesizeSegment(
    segment: ScriptSegment,
    voiceConfig: VoiceConfig
  ): Promise<AudioSegment> {
    try {
      const voice = segment.speaker === 'host1' ? voiceConfig.host1 : voiceConfig.host2;

      const response = await this.synthesizeWithRetry({
        text: segment.text,
        voice: voice,
        speed: voiceConfig.speed,
      });

      return {
        buffer: response.audio_buffer,
        duration_seconds: response.duration_seconds,
        speaker: segment.speaker,
        segment_type: normalizeSegmentType(segment.type),
      };
    } catch (error) {
      throw this.createError(`Failed to synthesize segment ${segment.sequence}`, error);
    }
  }

  /**
   * Convert entire script to audio segments
   */
  async synthesizeScript(
    script: PodcastScript,
    voiceConfig: VoiceConfig
  ): Promise<AudioSegment[]> {
    try {
      const audioSegments: AudioSegment[] = [];

      // Process segments sequentially to respect rate limits
      for (const segment of script.segments) {
        console.log(`Synthesizing segment ${segment.sequence}/${script.total_segments}`);

        const audioSegment = await this.synthesizeSegment(segment, voiceConfig);
        audioSegments.push(audioSegment);

        // Small delay between requests to respect rate limits
        await this.delay(100);
      }

      return audioSegments;
    } catch (error) {
      throw this.createError('Failed to synthesize script', error);
    }
  }

  /**
   * Convert entire script with parallel processing (for faster generation)
   */
  async synthesizeScriptParallel(
    script: PodcastScript,
    voiceConfig: VoiceConfig,
    concurrency: number = 5
  ): Promise<AudioSegment[]> {
    try {
      const audioSegments: AudioSegment[] = [];

      // Process in batches to control concurrency
      for (let i = 0; i < script.segments.length; i += concurrency) {
        const batch = script.segments.slice(i, i + concurrency);

        console.log(`Synthesizing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(script.segments.length / concurrency)}`);

        const batchPromises = batch.map(segment =>
          this.synthesizeSegment(segment, voiceConfig)
        );

        const batchResults = await Promise.all(batchPromises);
        audioSegments.push(...batchResults);

        // Small delay between batches
        if (i + concurrency < script.segments.length) {
          await this.delay(200);
        }
      }

      return audioSegments;
    } catch (error) {
      throw this.createError('Failed to synthesize script in parallel', error);
    }
  }

  /**
   * Get default voice configuration
   */
  getDefaultVoiceConfig(): VoiceConfig {
    return {
      host1: 'nova', // Warm, friendly, energetic
      host2: 'onyx', // Deep, authoritative, calm
      model: this.DEFAULT_MODEL,
      speed: this.DEFAULT_SPEED,
    };
  }

  /**
   * Get voice configuration from preferences
   */
  getVoiceConfigFromPreferences(preferences: {
    voice_host1?: string;
    voice_host2?: string;
  }): VoiceConfig {
    return {
      host1: this.validateVoice(preferences.voice_host1 || 'nova'),
      host2: this.validateVoice(preferences.voice_host2 || 'onyx'),
      model: this.DEFAULT_MODEL,
      speed: this.DEFAULT_SPEED,
    };
  }

  /**
   * Calculate total audio duration
   */
  calculateTotalDuration(audioSegments: AudioSegment[]): number {
    return audioSegments.reduce((total, segment) => total + segment.duration_seconds, 0);
  }

  /**
   * Get audio size in MB
   */
  calculateTotalSize(audioSegments: AudioSegment[]): {
    bytes: number;
    megabytes: number;
  } {
    const bytes = audioSegments.reduce((total, segment) => total + segment.buffer.length, 0);
    return {
      bytes,
      megabytes: parseFloat((bytes / (1024 * 1024)).toFixed(2)),
    };
  }

  /**
   * Validate voice name
   */
  private validateVoice(voice: string): OpenAIVoice {
    const validVoices: OpenAIVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];

    if (validVoices.includes(voice as OpenAIVoice)) {
      return voice as OpenAIVoice;
    }

    console.warn(`Invalid voice "${voice}", using default "nova"`);
    return 'nova';
  }

  /**
   * Clamp speed to valid range (0.25 - 4.0)
   */
  private clampSpeed(speed: number): number {
    return Math.max(0.25, Math.min(4.0, speed));
  }

  /**
   * Estimate audio duration based on text length and speed
   * OpenAI TTS speaks at approximately 150 words per minute at speed 1.0
   */
  private estimateDuration(text: string, speed: number): number {
    const words = text.split(/\s+/).length;
    const baseWPM = 150; // Words per minute at speed 1.0
    const adjustedWPM = baseWPM * speed;
    const minutes = words / adjustedWPM;
    return Math.ceil(minutes * 60); // Convert to seconds
  }

  /**
   * Get voice characteristics (for UI/documentation)
   */
  getVoiceCharacteristics(): Record<OpenAIVoice, {
    description: string;
    gender: string;
    tone: string;
    best_for: string;
  }> {
    return {
      alloy: {
        description: 'Neutral, balanced voice',
        gender: 'Neutral',
        tone: 'Balanced',
        best_for: 'General purpose narration',
      },
      echo: {
        description: 'Male voice, warm and engaging',
        gender: 'Male',
        tone: 'Warm',
        best_for: 'Friendly conversations',
      },
      fable: {
        description: 'British accent, articulate',
        gender: 'Male',
        tone: 'Articulate',
        best_for: 'Professional narration',
      },
      onyx: {
        description: 'Deep male voice, authoritative',
        gender: 'Male',
        tone: 'Authoritative',
        best_for: 'Analytical content, Host 2',
      },
      nova: {
        description: 'Female voice, upbeat and energetic',
        gender: 'Female',
        tone: 'Energetic',
        best_for: 'Engaging content, Host 1',
      },
      shimmer: {
        description: 'Female voice, soft and gentle',
        gender: 'Female',
        tone: 'Gentle',
        best_for: 'Calm narration',
      },
    };
  }

  /**
   * Estimate cost for TTS generation
   */
  estimateCost(script: PodcastScript): {
    total_characters: number;
    estimated_cost_usd: number;
    cost_per_segment: number;
  } {
    // OpenAI TTS pricing: $15 per 1M characters for tts-1-hd
    const pricePerMillionChars = 15.0;

    const totalCharacters = script.segments.reduce(
      (sum, segment) => sum + segment.text.length,
      0
    );

    const estimatedCost = (totalCharacters / 1_000_000) * pricePerMillionChars;
    const costPerSegment = estimatedCost / script.total_segments;

    return {
      total_characters: totalCharacters,
      estimated_cost_usd: parseFloat(estimatedCost.toFixed(4)),
      cost_per_segment: parseFloat(costPerSegment.toFixed(4)),
    };
  }

  /**
   * Get rate limit information
   */
  getRateLimitInfo(): {
    requests_per_minute: number;
    recommended_concurrency: number;
    recommended_delay_ms: number;
  } {
    return {
      requests_per_minute: 50, // OpenAI TTS rate limit
      recommended_concurrency: 5,
      recommended_delay_ms: 100,
    };
  }

  /**
   * Validate audio buffer
   */
  validateAudioBuffer(buffer: Buffer): {
    valid: boolean;
    size_bytes: number;
    is_mp3: boolean;
  } {
    // Check if buffer is valid MP3 (starts with MP3 header)
    const isMp3 = buffer.length > 3 &&
      (buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) || // MP3 sync word
      (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33); // ID3 tag

    return {
      valid: buffer.length > 0 && isMp3,
      size_bytes: buffer.length,
      is_mp3: isMp3,
    };
  }

  /**
   * Split long text into chunks (OpenAI TTS limit: 4096 characters)
   */
  splitTextIntoChunks(text: string, maxChars: number = 4000): string[] {
    if (text.length <= maxChars) {
      return [text];
    }

    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';

    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars) {
        if (currentChunk) {
          chunks.push(currentChunk.trim());
        }
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }

    if (currentChunk) {
      chunks.push(currentChunk.trim());
    }

    return chunks;
  }

  /**
   * Synthesize long text by splitting into chunks
   */
  async synthesizeLongText(
    text: string,
    voice: OpenAIVoice,
    speed?: number
  ): Promise<TTSResponse[]> {
    const chunks = this.splitTextIntoChunks(text);
    const responses: TTSResponse[] = [];

    for (const chunk of chunks) {
      const response = await this.synthesizeWithRetry({
        text: chunk,
        voice,
        speed,
      });
      responses.push(response);
    }

    return responses;
  }

  /**
   * Get supported voices list
   */
  getSupportedVoices(): OpenAIVoice[] {
    return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  }

  /**
   * Get recommended voice pairs for two-host podcasts
   */
  getRecommendedVoicePairs(): Array<{
    name: string;
    host1: OpenAIVoice;
    host2: OpenAIVoice;
    description: string;
  }> {
    return [
      {
        name: 'Energetic & Authoritative (Default)',
        host1: 'nova',
        host2: 'onyx',
        description: 'Upbeat female voice paired with deep male voice',
      },
      {
        name: 'Warm & Balanced',
        host1: 'echo',
        host2: 'alloy',
        description: 'Warm male voice paired with neutral voice',
      },
      {
        name: 'Professional British',
        host1: 'fable',
        host2: 'shimmer',
        description: 'Articulate male voice paired with gentle female voice',
      },
      {
        name: 'Friendly Duo',
        host1: 'nova',
        host2: 'echo',
        description: 'Two warm, engaging voices',
      },
    ];
  }

  /**
   * Delay helper
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Create standardized error
   */
  private createError(message: string, originalError?: unknown): Error {
    const error = new Error(message);

    if (originalError instanceof Error) {
      error.message = `${message}: ${originalError.message}`;
      error.stack = originalError.stack;
    }

    return error;
  }
}

// Export singleton instance
export const openaiTTS = new OpenAITTSService();

// Export class for testing
export default OpenAITTSService;
