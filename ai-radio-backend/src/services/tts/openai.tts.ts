/**
 * Kokoro TTS Service (replaces OpenAI TTS)
 * Text-to-speech conversion using self-hosted Kokoro model via readaloud-tts
 * Maintains same interface as previous OpenAI TTS for drop-in compatibility
 */

import type { TTSRequest, TTSResponse, AudioSegment } from '../../types/podcast';
import type { PodcastScript, ScriptSegment } from '../../types/database';

/**
 * Voice options (kept as OpenAI-style names for backwards compatibility)
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
  speed: number;
  /** ISO 639-1 language code (en, ja, es, fr, …). Threaded to the
   * Kokoro worker so non-English text is rendered with the right
   * voice + lang phonemes. Default 'en'. */
  language?: string;
}

// Map legacy voice names to default ENGLISH Kokoro voice IDs.
// When the script language is non-English, the worker remaps based on
// the `language` field — so `nova` for a JP script becomes `jf_alpha`.
// This map is only the en-default fallback.
const KOKORO_VOICE_MAP: Record<OpenAIVoice, string> = {
  nova: 'af_nicole',
  shimmer: 'af_sarah',
  alloy: 'am_adam',
  echo: 'am_michael',
  fable: 'am_adam',
  onyx: 'am_michael',
};

const TTS_BASE_URL = process.env.SELFHOSTED_TTS_URL || 'https://listenai-tts-worker.fly.dev';

// Valid segment types for audio validation
const VALID_SEGMENT_TYPES = ['intro', 'calendar', 'email', 'news', 'weather', 'outro'] as const;
type ValidSegmentType = typeof VALID_SEGMENT_TYPES[number];

function normalizeSegmentType(type: string): ValidSegmentType {
  const normalized = type?.toLowerCase()?.trim() || 'news';

  if (VALID_SEGMENT_TYPES.includes(normalized as ValidSegmentType)) {
    return normalized as ValidSegmentType;
  }

  const typeMapping: Record<string, ValidSegmentType> = {
    'introduction': 'intro', 'opening': 'intro', 'greeting': 'intro', 'welcome': 'intro',
    'emails': 'email', 'mail': 'email', 'message': 'email', 'messages': 'email',
    'schedule': 'calendar', 'meeting': 'calendar', 'meetings': 'calendar',
    'events': 'calendar', 'event': 'calendar', 'appointment': 'calendar',
    'topic': 'news', 'topics': 'news', 'update': 'news', 'updates': 'news',
    'discussion': 'news', 'content': 'news', 'general': 'news', 'summary': 'news',
    'forecast': 'weather',
    'closing': 'outro', 'goodbye': 'outro', 'farewell': 'outro',
    'signoff': 'outro', 'sign-off': 'outro', 'conclusion': 'outro',
  };

  if (typeMapping[normalized]) {
    console.log(`Mapped segment type "${type}" -> "${typeMapping[normalized]}"`);
    return typeMapping[normalized];
  }

  console.warn(`Unknown segment type "${type}", defaulting to "news"`);
  return 'news';
}

export class OpenAITTSService {
  private readonly DEFAULT_MODEL: TTSModel = 'tts-1-hd';
  private readonly DEFAULT_SPEED = 1.0;
  private readonly DEFAULT_FORMAT: AudioFormat = 'wav';
  private readonly MAX_RETRIES = 3;
  private readonly MAX_CHUNK_CHARS = 5000;

  constructor(_apiKey?: string) {
    // No API key needed — Kokoro is self-hosted
  }

  /**
   * Convert single text segment to audio via Kokoro
   */
  async synthesize(request: TTSRequest): Promise<TTSResponse> {
    try {
      const voice = this.validateVoice(request.voice);
      const kokoroVoice = KOKORO_VOICE_MAP[voice];
      const speed = request.speed || this.DEFAULT_SPEED;

      const endpoint = request.text.length > this.MAX_CHUNK_CHARS ? '/synthesize-long' : '/synthesize';

      const controller = new AbortController();
      // 240s — Kokoro on shared-CPU Fly worker can stall on long/awkward segments.
      // 120s was too tight; we'd rather wait than retry+skip when avoidable.
      const timeoutId = setTimeout(() => controller.abort(), 240000);

      // Thread language through so the worker can route JP/ES/FR/etc.
      // to the correct Kokoro voice family (or Edge TTS fallback for de/ko).
      // Default 'en' preserves prior behavior for callers that don't set it.
      const language = (request.language_code || 'en').toLowerCase();

      const response = await fetch(`${TTS_BASE_URL}${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: request.text,
          voice_id: kokoroVoice,
          speed: this.clampSpeed(speed),
          model: 'kokoro',
          language,
          max_chunk_chars: this.MAX_CHUNK_CHARS,
        }),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Kokoro TTS error (${response.status}): ${errText}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);
      const duration = this.estimateDuration(request.text, speed);

      return {
        audio_buffer: buffer,
        duration_seconds: duration,
        format: this.DEFAULT_FORMAT,
      };
    } catch (error) {
      if (error instanceof Error && error.name === 'AbortError') {
        throw new Error('Kokoro TTS request timed out after 120 seconds');
      }
      console.error('TTS synthesis failed:', error);
      throw this.createError('Failed to synthesize audio', error);
    }
  }

  async synthesizeWithRetry(request: TTSRequest, maxRetries?: number): Promise<TTSResponse> {
    const retries = maxRetries || this.MAX_RETRIES;
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        return await this.synthesize(request);
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        console.error(`TTS attempt ${attempt} failed:`, lastError.message);

        if (attempt < retries) {
          const delayMs = 1000 * Math.pow(2, attempt - 1);
          await this.delay(delayMs);
        }
      }
    }

    throw lastError || new Error('TTS synthesis failed after retries');
  }

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
        language_code: voiceConfig.language || 'en',
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

  async synthesizeScript(
    script: PodcastScript,
    voiceConfig: VoiceConfig
  ): Promise<AudioSegment[]> {
    const audioSegments: AudioSegment[] = [];
    const skipped: number[] = [];

    for (const segment of script.segments) {
      console.log(`Synthesizing segment ${segment.sequence}/${script.total_segments}`);
      try {
        const audioSegment = await this.synthesizeSegment(segment, voiceConfig);
        audioSegments.push(audioSegment);
      } catch (error) {
        // Skip the failed segment instead of failing the entire script.
        // Shared-CPU Kokoro is occasionally slow on individual segments; losing
        // one segment out of 30+ produces a slightly shorter but listenable podcast.
        console.warn(
          `Segment ${segment.sequence} failed after retries, skipping: ${error instanceof Error ? error.message : error}`
        );
        skipped.push(segment.sequence);
      }
      await this.delay(100);
    }

    if (audioSegments.length === 0) {
      throw this.createError('Failed to synthesize any segments', new Error('all segments failed'));
    }
    if (skipped.length > 0) {
      console.log(`Synthesis complete: ${audioSegments.length}/${script.segments.length} segments OK; skipped: [${skipped.join(', ')}]`);
    }
    return audioSegments;
  }

  async synthesizeScriptParallel(
    script: PodcastScript,
    voiceConfig: VoiceConfig,
    concurrency: number = 3
  ): Promise<AudioSegment[]> {
    try {
      const audioSegments: AudioSegment[] = [];

      for (let i = 0; i < script.segments.length; i += concurrency) {
        const batch = script.segments.slice(i, i + concurrency);
        console.log(`Synthesizing batch ${Math.floor(i / concurrency) + 1}/${Math.ceil(script.segments.length / concurrency)}`);

        const batchPromises = batch.map(segment =>
          this.synthesizeSegment(segment, voiceConfig)
        );
        const batchResults = await Promise.all(batchPromises);
        audioSegments.push(...batchResults);

        if (i + concurrency < script.segments.length) {
          await this.delay(200);
        }
      }

      return audioSegments;
    } catch (error) {
      throw this.createError('Failed to synthesize script in parallel', error);
    }
  }

  getDefaultVoiceConfig(): VoiceConfig {
    return {
      host1: 'nova',
      host2: 'onyx',
      model: this.DEFAULT_MODEL,
      speed: this.DEFAULT_SPEED,
    };
  }

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

  calculateTotalDuration(audioSegments: AudioSegment[]): number {
    return audioSegments.reduce((total, segment) => total + segment.duration_seconds, 0);
  }

  calculateTotalSize(audioSegments: AudioSegment[]): { bytes: number; megabytes: number } {
    const bytes = audioSegments.reduce((total, segment) => total + segment.buffer.length, 0);
    return { bytes, megabytes: parseFloat((bytes / (1024 * 1024)).toFixed(2)) };
  }

  private validateVoice(voice: string): OpenAIVoice {
    const validVoices: OpenAIVoice[] = ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
    if (validVoices.includes(voice as OpenAIVoice)) {
      return voice as OpenAIVoice;
    }
    console.warn(`Invalid voice "${voice}", using default "nova"`);
    return 'nova';
  }

  private clampSpeed(speed: number): number {
    return Math.max(0.5, Math.min(2.0, speed));
  }

  private estimateDuration(text: string, speed: number): number {
    const words = text.split(/\s+/).length;
    const baseWPM = 150;
    const adjustedWPM = baseWPM * speed;
    return Math.ceil((words / adjustedWPM) * 60);
  }

  getVoiceCharacteristics(): Record<OpenAIVoice, {
    description: string; gender: string; tone: string; best_for: string;
  }> {
    return {
      alloy: { description: 'Neutral, balanced voice', gender: 'Male', tone: 'Balanced', best_for: 'General purpose narration' },
      echo: { description: 'Male voice, warm and engaging', gender: 'Male', tone: 'Warm', best_for: 'Friendly conversations' },
      fable: { description: 'Male voice, articulate', gender: 'Male', tone: 'Articulate', best_for: 'Professional narration' },
      onyx: { description: 'Deep male voice, authoritative', gender: 'Male', tone: 'Authoritative', best_for: 'Analytical content, Host 2' },
      nova: { description: 'Female voice, upbeat and energetic', gender: 'Female', tone: 'Energetic', best_for: 'Engaging content, Host 1' },
      shimmer: { description: 'Female voice, soft and gentle', gender: 'Female', tone: 'Gentle', best_for: 'Calm narration' },
    };
  }

  estimateCost(_script: PodcastScript): { total_characters: number; estimated_cost_usd: number; cost_per_segment: number } {
    // Self-hosted Kokoro — no per-request cost
    return { total_characters: 0, estimated_cost_usd: 0, cost_per_segment: 0 };
  }

  getRateLimitInfo(): { requests_per_minute: number; recommended_concurrency: number; recommended_delay_ms: number } {
    return { requests_per_minute: 100, recommended_concurrency: 3, recommended_delay_ms: 100 };
  }

  validateAudioBuffer(buffer: Buffer): { valid: boolean; size_bytes: number; is_mp3: boolean } {
    // Kokoro returns WAV — check RIFF header
    const isWav = buffer.length > 4 && buffer[0] === 0x52 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x46;
    const isMp3 = buffer.length > 3 &&
      ((buffer[0] === 0xFF && (buffer[1] & 0xE0) === 0xE0) ||
       (buffer[0] === 0x49 && buffer[1] === 0x44 && buffer[2] === 0x33));
    return { valid: buffer.length > 0 && (isWav || isMp3), size_bytes: buffer.length, is_mp3: isMp3 };
  }

  splitTextIntoChunks(text: string, maxChars: number = 5000): string[] {
    if (text.length <= maxChars) return [text];
    const chunks: string[] = [];
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    let currentChunk = '';
    for (const sentence of sentences) {
      if ((currentChunk + sentence).length > maxChars) {
        if (currentChunk) chunks.push(currentChunk.trim());
        currentChunk = sentence;
      } else {
        currentChunk += sentence;
      }
    }
    if (currentChunk) chunks.push(currentChunk.trim());
    return chunks;
  }

  async synthesizeLongText(text: string, voice: OpenAIVoice, speed?: number): Promise<TTSResponse[]> {
    // Kokoro's /synthesize-long handles chunking server-side
    const response = await this.synthesizeWithRetry({ text, voice, speed });
    return [response];
  }

  getSupportedVoices(): OpenAIVoice[] {
    return ['alloy', 'echo', 'fable', 'onyx', 'nova', 'shimmer'];
  }

  getRecommendedVoicePairs(): Array<{ name: string; host1: OpenAIVoice; host2: OpenAIVoice; description: string }> {
    return [
      { name: 'Energetic & Authoritative (Default)', host1: 'nova', host2: 'onyx', description: 'Upbeat female voice paired with deep male voice' },
      { name: 'Warm & Balanced', host1: 'echo', host2: 'alloy', description: 'Warm male voice paired with neutral voice' },
      { name: 'Professional', host1: 'fable', host2: 'shimmer', description: 'Articulate male voice paired with gentle female voice' },
      { name: 'Friendly Duo', host1: 'nova', host2: 'echo', description: 'Two warm, engaging voices' },
    ];
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  private createError(message: string, originalError?: unknown): Error {
    const error = new Error(message);
    if (originalError instanceof Error) {
      error.message = `${message}: ${originalError.message}`;
      error.stack = originalError.stack;
    }
    return error;
  }
}

export const openaiTTS = new OpenAITTSService();
export default OpenAITTSService;
