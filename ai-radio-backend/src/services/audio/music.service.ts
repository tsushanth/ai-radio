/**
 * Music Service
 * Manages background music assets for podcasts (intro, transitions, outro)
 * Uses pre-recorded static music files stored in cloud storage
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';

/**
 * Music segment types
 */
export type MusicType = 'intro' | 'transition' | 'outro' | 'background';

/**
 * Music asset definition
 */
export interface MusicAsset {
  id: string;
  type: MusicType;
  name: string;
  duration_seconds: number;
  url: string;
  volume: number; // 0.0 - 1.0
  fade_in_ms: number;
  fade_out_ms: number;
}

/**
 * Music configuration for a podcast
 */
export interface PodcastMusicConfig {
  intro: MusicAsset | null;
  transitions: MusicAsset[];
  outro: MusicAsset | null;
  background_volume: number; // Volume for any background music (0.0 - 1.0)
}

/**
 * Pre-defined music assets
 * These are placeholders - actual URLs would point to Supabase Storage
 */
const DEFAULT_MUSIC_ASSETS: MusicAsset[] = [
  // Intro jingles (upbeat, energetic)
  {
    id: 'intro-bright-morning',
    type: 'intro',
    name: 'Bright Morning',
    duration_seconds: 5,
    url: '', // To be set from storage
    volume: 0.7,
    fade_in_ms: 500,
    fade_out_ms: 1000,
  },
  {
    id: 'intro-daily-pulse',
    type: 'intro',
    name: 'Daily Pulse',
    duration_seconds: 4,
    url: '',
    volume: 0.7,
    fade_in_ms: 300,
    fade_out_ms: 800,
  },
  {
    id: 'intro-fresh-start',
    type: 'intro',
    name: 'Fresh Start',
    duration_seconds: 6,
    url: '',
    volume: 0.65,
    fade_in_ms: 500,
    fade_out_ms: 1200,
  },

  // Transition sounds (subtle, smooth)
  {
    id: 'transition-soft-swoosh',
    type: 'transition',
    name: 'Soft Swoosh',
    duration_seconds: 1.5,
    url: '',
    volume: 0.5,
    fade_in_ms: 200,
    fade_out_ms: 200,
  },
  {
    id: 'transition-chime',
    type: 'transition',
    name: 'Gentle Chime',
    duration_seconds: 2,
    url: '',
    volume: 0.4,
    fade_in_ms: 100,
    fade_out_ms: 500,
  },
  {
    id: 'transition-page-turn',
    type: 'transition',
    name: 'Page Turn',
    duration_seconds: 1,
    url: '',
    volume: 0.45,
    fade_in_ms: 100,
    fade_out_ms: 300,
  },

  // Outro music (warm, concluding)
  {
    id: 'outro-warm-goodbye',
    type: 'outro',
    name: 'Warm Goodbye',
    duration_seconds: 6,
    url: '',
    volume: 0.6,
    fade_in_ms: 1000,
    fade_out_ms: 2000,
  },
  {
    id: 'outro-until-tomorrow',
    type: 'outro',
    name: 'Until Tomorrow',
    duration_seconds: 5,
    url: '',
    volume: 0.6,
    fade_in_ms: 800,
    fade_out_ms: 1500,
  },
];

export class MusicService {
  private supabase: SupabaseClient | null = null;
  private readonly BUCKET = 'podcast-music';
  private musicAssets: MusicAsset[] = [...DEFAULT_MUSIC_ASSETS];
  private initialized = false;

  constructor() {
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
    }
  }

  /**
   * Initialize music service and load asset URLs
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    if (!this.supabase) {
      console.log('⚠️ Music service: Supabase not configured, using placeholder assets');
      this.initialized = true;
      return;
    }

    try {
      // Check if bucket exists, create if needed
      const { data: buckets } = await this.supabase.storage.listBuckets();
      const bucketExists = buckets?.some(b => b.name === this.BUCKET);

      if (!bucketExists) {
        console.log(`📦 Creating music bucket '${this.BUCKET}'...`);
        await this.supabase.storage.createBucket(this.BUCKET, {
          public: true,
          fileSizeLimit: 10485760, // 10MB per file
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav', 'audio/ogg'],
        });
      }

      // List available music files and update URLs
      const { data: files } = await this.supabase.storage
        .from(this.BUCKET)
        .list();

      if (files && files.length > 0) {
        console.log(`🎵 Found ${files.length} music files in storage`);

        // Update asset URLs based on available files
        for (const asset of this.musicAssets) {
          const filename = `${asset.id}.mp3`;
          const matchingFile = files.find(f => f.name === filename);

          if (matchingFile) {
            const { data } = this.supabase.storage
              .from(this.BUCKET)
              .getPublicUrl(filename);
            asset.url = data.publicUrl;
          }
        }
      } else {
        console.log('⚠️ No music files found in storage - upload files to enable music');
      }

      this.initialized = true;
    } catch (error) {
      console.error('Failed to initialize music service:', error);
      this.initialized = true; // Mark as initialized to prevent repeated attempts
    }
  }

  /**
   * Get all available music assets
   */
  getAllAssets(): MusicAsset[] {
    return this.musicAssets.filter(a => a.url !== '');
  }

  /**
   * Get assets by type
   */
  getAssetsByType(type: MusicType): MusicAsset[] {
    return this.musicAssets.filter(a => a.type === type && a.url !== '');
  }

  /**
   * Get a random intro music
   */
  getRandomIntro(): MusicAsset | null {
    const intros = this.getAssetsByType('intro');
    if (intros.length === 0) return null;
    return intros[Math.floor(Math.random() * intros.length)];
  }

  /**
   * Get a random transition sound
   */
  getRandomTransition(): MusicAsset | null {
    const transitions = this.getAssetsByType('transition');
    if (transitions.length === 0) return null;
    return transitions[Math.floor(Math.random() * transitions.length)];
  }

  /**
   * Get a random outro music
   */
  getRandomOutro(): MusicAsset | null {
    const outros = this.getAssetsByType('outro');
    if (outros.length === 0) return null;
    return outros[Math.floor(Math.random() * outros.length)];
  }

  /**
   * Get specific asset by ID
   */
  getAssetById(id: string): MusicAsset | undefined {
    return this.musicAssets.find(a => a.id === id);
  }

  /**
   * Generate a music configuration for a podcast
   * Selects appropriate music for intro, transitions, and outro
   */
  generatePodcastMusicConfig(options?: {
    includeIntro?: boolean;
    includeTransitions?: boolean;
    includeOutro?: boolean;
    transitionCount?: number;
  }): PodcastMusicConfig {
    const {
      includeIntro = true,
      includeTransitions = true,
      includeOutro = true,
      transitionCount = 3,
    } = options || {};

    const config: PodcastMusicConfig = {
      intro: null,
      transitions: [],
      outro: null,
      background_volume: 0.15,
    };

    if (includeIntro) {
      config.intro = this.getRandomIntro();
    }

    if (includeTransitions && transitionCount > 0) {
      const availableTransitions = this.getAssetsByType('transition');
      for (let i = 0; i < transitionCount; i++) {
        const transition = availableTransitions[i % availableTransitions.length];
        if (transition) {
          config.transitions.push(transition);
        }
      }
    }

    if (includeOutro) {
      config.outro = this.getRandomOutro();
    }

    return config;
  }

  /**
   * Download a music asset as a buffer
   */
  async downloadAsset(asset: MusicAsset): Promise<Buffer | null> {
    if (!asset.url) {
      console.warn(`Music asset ${asset.id} has no URL`);
      return null;
    }

    try {
      const response = await fetch(asset.url);
      if (!response.ok) {
        throw new Error(`Failed to fetch music: ${response.statusText}`);
      }
      const arrayBuffer = await response.arrayBuffer();
      return Buffer.from(arrayBuffer);
    } catch (error) {
      console.error(`Failed to download music asset ${asset.id}:`, error);
      return null;
    }
  }

  /**
   * Upload a music file to storage
   */
  async uploadAsset(
    id: string,
    buffer: Buffer,
    type: MusicType,
    metadata: {
      name: string;
      duration_seconds: number;
      volume?: number;
      fade_in_ms?: number;
      fade_out_ms?: number;
    }
  ): Promise<MusicAsset | null> {
    if (!this.supabase) {
      console.warn('Supabase not configured - cannot upload music');
      return null;
    }

    const filename = `${id}.mp3`;

    try {
      const { error } = await this.supabase.storage
        .from(this.BUCKET)
        .upload(filename, buffer, {
          contentType: 'audio/mpeg',
          upsert: true,
        });

      if (error) {
        throw error;
      }

      const { data } = this.supabase.storage
        .from(this.BUCKET)
        .getPublicUrl(filename);

      const asset: MusicAsset = {
        id,
        type,
        name: metadata.name,
        duration_seconds: metadata.duration_seconds,
        url: data.publicUrl,
        volume: metadata.volume ?? 0.5,
        fade_in_ms: metadata.fade_in_ms ?? 500,
        fade_out_ms: metadata.fade_out_ms ?? 500,
      };

      // Add to local cache
      const existingIndex = this.musicAssets.findIndex(a => a.id === id);
      if (existingIndex >= 0) {
        this.musicAssets[existingIndex] = asset;
      } else {
        this.musicAssets.push(asset);
      }

      console.log(`✅ Uploaded music asset: ${id}`);
      return asset;
    } catch (error) {
      console.error(`Failed to upload music asset ${id}:`, error);
      return null;
    }
  }

  /**
   * Check if music is available for podcast generation
   */
  isMusicAvailable(): boolean {
    return this.getAllAssets().length > 0;
  }

  /**
   * Get music service status
   */
  getStatus(): {
    initialized: boolean;
    supabaseConfigured: boolean;
    totalAssets: number;
    availableAssets: number;
    assetsByType: Record<MusicType, number>;
  } {
    const availableAssets = this.getAllAssets();
    const assetsByType: Record<MusicType, number> = {
      intro: 0,
      transition: 0,
      outro: 0,
      background: 0,
    };

    availableAssets.forEach(a => {
      assetsByType[a.type]++;
    });

    return {
      initialized: this.initialized,
      supabaseConfigured: this.supabase !== null,
      totalAssets: this.musicAssets.length,
      availableAssets: availableAssets.length,
      assetsByType,
    };
  }
}

// Export singleton instance
export const musicService = new MusicService();

export default MusicService;
