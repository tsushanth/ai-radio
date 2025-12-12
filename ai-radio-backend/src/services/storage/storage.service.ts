/**
 * Storage Service
 * Handles audio file uploads to cloud storage (Supabase Storage / Cloud Storage)
 */

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { env } from '../../config/environment';
import type { AudioSegment } from '../../types/podcast';
import { concatenateBuffers } from '../tts/audio.utils';

/**
 * Upload result
 */
export interface UploadResult {
  url: string;
  path: string;
  size_bytes: number;
  bucket: string;
}

/**
 * Storage options
 */
export interface StorageOptions {
  bucket?: string;
  content_type?: string;
  cache_control?: string;
  upsert?: boolean;
}

export class StorageService {
  private supabase: SupabaseClient | null = null;
  private readonly DEFAULT_BUCKET = 'podcasts';
  private readonly DEFAULT_CACHE_CONTROL = '3600'; // 1 hour
  private readonly DEFAULT_CONTENT_TYPE = 'audio/mpeg';
  private bucketInitialized = false;
  private initPromise: Promise<void> | null = null;

  constructor() {
    // Initialize Supabase client if configured
    if (env.SUPABASE_URL && env.SUPABASE_SERVICE_KEY) {
      this.supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_KEY);
      // Initialize bucket asynchronously
      this.initPromise = this.initializeBucket();
    } else {
      console.warn('Supabase not configured - storage operations will use mock mode');
    }
  }

  /**
   * Initialize storage bucket (create if doesn't exist)
   */
  private async initializeBucket(): Promise<void> {
    if (!this.supabase || this.bucketInitialized) return;

    try {
      console.log(`📦 Checking if bucket '${this.DEFAULT_BUCKET}' exists...`);

      // Check if bucket exists
      const { data: buckets, error: listError } = await this.supabase.storage.listBuckets();

      if (listError) {
        console.error('Failed to list buckets:', listError.message);
        return;
      }

      const bucketExists = buckets?.some(b => b.name === this.DEFAULT_BUCKET);

      if (!bucketExists) {
        console.log(`📦 Creating bucket '${this.DEFAULT_BUCKET}'...`);
        const { error: createError } = await this.supabase.storage.createBucket(this.DEFAULT_BUCKET, {
          public: true,
          fileSizeLimit: 52428800, // 50MB
          allowedMimeTypes: ['audio/mpeg', 'audio/mp3', 'audio/wav'],
        });

        if (createError) {
          // Ignore if bucket already exists (race condition)
          if (!createError.message.includes('already exists')) {
            console.error('Failed to create bucket:', createError.message);
            return;
          }
        }
        console.log(`✅ Bucket '${this.DEFAULT_BUCKET}' created successfully`);
      } else {
        console.log(`✅ Bucket '${this.DEFAULT_BUCKET}' already exists`);
      }

      this.bucketInitialized = true;
    } catch (error) {
      console.error('Error initializing bucket:', error);
    }
  }

  /**
   * Wait for bucket initialization before upload
   */
  private async waitForInit(): Promise<void> {
    if (this.initPromise) {
      await this.initPromise;
    }
  }

  /**
   * Upload audio segments as single file
   */
  async uploadPodcast(
    audioSegments: AudioSegment[],
    userId: string,
    episodeId?: string,
    options: StorageOptions = {}
  ): Promise<UploadResult> {
    // Concatenate segments
    const buffers = audioSegments.map(segment => segment.buffer);
    const audioBuffer = concatenateBuffers(buffers);

    // Generate filename
    const timestamp = Date.now();
    const filename = episodeId
      ? `${userId}/${episodeId}.mp3`
      : `${userId}/${timestamp}.mp3`;

    return this.uploadFile(audioBuffer, filename, options);
  }

  /**
   * Upload single audio file
   */
  async uploadFile(
    buffer: Buffer,
    path: string,
    options: StorageOptions = {}
  ): Promise<UploadResult> {
    // Wait for bucket to be initialized
    await this.waitForInit();

    const bucket = options.bucket || this.DEFAULT_BUCKET;
    const contentType = options.content_type || this.DEFAULT_CONTENT_TYPE;
    const cacheControl = options.cache_control || this.DEFAULT_CACHE_CONTROL;
    const upsert = options.upsert !== undefined ? options.upsert : true; // Default to upsert

    if (!this.supabase) {
      // Mock mode for development
      return this.mockUpload(buffer, path, bucket);
    }

    try {
      console.log(`📤 Uploading to ${bucket}/${path}...`);

      const { data, error } = await this.supabase.storage
        .from(bucket)
        .upload(path, buffer, {
          contentType,
          cacheControl,
          upsert,
        });

      if (error) {
        console.error(`❌ Upload error: ${error.message}`);
        throw new Error(`Upload failed: ${error.message}`);
      }

      // Get signed URL (for private buckets with PII)
      // Expires in 1 year (31536000 seconds) - podcasts should remain accessible
      const { data: signedData, error: signedError } = await this.supabase.storage
        .from(bucket)
        .createSignedUrl(path, 31536000); // 1 year expiry

      if (signedError) {
        console.error(`❌ Failed to create signed URL: ${signedError.message}`);
        // Fallback to public URL if signed fails
        const { data: urlData } = this.supabase.storage
          .from(bucket)
          .getPublicUrl(path);

        return {
          url: urlData.publicUrl,
          path: data.path,
          size_bytes: buffer.length,
          bucket,
        };
      }

      console.log(`✅ Upload successful with signed URL`);

      return {
        url: signedData.signedUrl,
        path: data.path,
        size_bytes: buffer.length,
        bucket,
      };
    } catch (error) {
      console.error('Storage upload failed:', error);
      throw this.createError('Failed to upload file to storage', error);
    }
  }

  /**
   * Get public URL for existing file
   */
  getPublicUrl(path: string, bucket?: string): string {
    const bucketName = bucket || this.DEFAULT_BUCKET;

    if (!this.supabase) {
      return `https://storage.example.com/${bucketName}/${path}`;
    }

    const { data } = this.supabase.storage
      .from(bucketName)
      .getPublicUrl(path);

    return data.publicUrl;
  }

  /**
   * Get signed URL (for private buckets)
   */
  async getSignedUrl(
    path: string,
    expiresIn: number = 3600,
    bucket?: string
  ): Promise<string> {
    const bucketName = bucket || this.DEFAULT_BUCKET;

    if (!this.supabase) {
      return `https://storage.example.com/${bucketName}/${path}?expires=${expiresIn}`;
    }

    try {
      const { data, error } = await this.supabase.storage
        .from(bucketName)
        .createSignedUrl(path, expiresIn);

      if (error) {
        throw new Error(`Failed to create signed URL: ${error.message}`);
      }

      return data.signedUrl;
    } catch (error) {
      throw this.createError('Failed to create signed URL', error);
    }
  }

  /**
   * Delete file from storage
   */
  async deleteFile(path: string, bucket?: string): Promise<void> {
    const bucketName = bucket || this.DEFAULT_BUCKET;

    if (!this.supabase) {
      console.log(`Mock delete: ${bucketName}/${path}`);
      return;
    }

    try {
      const { error } = await this.supabase.storage
        .from(bucketName)
        .remove([path]);

      if (error) {
        throw new Error(`Delete failed: ${error.message}`);
      }
    } catch (error) {
      throw this.createError('Failed to delete file from storage', error);
    }
  }

  /**
   * Delete multiple files
   */
  async deleteFiles(paths: string[], bucket?: string): Promise<void> {
    const bucketName = bucket || this.DEFAULT_BUCKET;

    if (!this.supabase) {
      console.log(`Mock delete: ${paths.length} files from ${bucketName}`);
      return;
    }

    try {
      const { error } = await this.supabase.storage
        .from(bucketName)
        .remove(paths);

      if (error) {
        throw new Error(`Batch delete failed: ${error.message}`);
      }
    } catch (error) {
      throw this.createError('Failed to delete files from storage', error);
    }
  }

  /**
   * List files in bucket
   */
  async listFiles(
    path: string = '',
    bucket?: string
  ): Promise<Array<{
    name: string;
    id: string;
    size: number;
    created_at: string;
  }>> {
    const bucketName = bucket || this.DEFAULT_BUCKET;

    if (!this.supabase) {
      return [];
    }

    try {
      const { data, error } = await this.supabase.storage
        .from(bucketName)
        .list(path);

      if (error) {
        throw new Error(`List failed: ${error.message}`);
      }

      return data.map(file => ({
        name: file.name,
        id: file.id || file.name,
        size: file.metadata?.size || 0,
        created_at: file.created_at || new Date().toISOString(),
      }));
    } catch (error) {
      throw this.createError('Failed to list files', error);
    }
  }

  /**
   * Get file info
   */
  async getFileInfo(path: string, bucket?: string): Promise<{
    exists: boolean;
    size?: number;
    created_at?: string;
    last_accessed?: string;
  }> {
    const bucketName = bucket || this.DEFAULT_BUCKET;

    if (!this.supabase) {
      return { exists: false };
    }

    try {
      // Try to get public URL (will work if file exists)
      const { data } = this.supabase.storage
        .from(bucketName)
        .getPublicUrl(path);

      // TODO: Check if file actually exists
      // Supabase doesn't have a direct "exists" method, so we'd need to list files
      return {
        exists: true,
        size: undefined,
        created_at: undefined,
        last_accessed: undefined,
      };
    } catch (error) {
      return { exists: false };
    }
  }

  /**
   * Check if storage is configured and available
   */
  isAvailable(): boolean {
    return this.supabase !== null;
  }

  /**
   * Get storage configuration
   */
  getConfig(): {
    configured: boolean;
    default_bucket: string;
    cache_control: string;
  } {
    return {
      configured: this.isAvailable(),
      default_bucket: this.DEFAULT_BUCKET,
      cache_control: this.DEFAULT_CACHE_CONTROL,
    };
  }

  /**
   * Mock upload for development
   */
  private mockUpload(
    buffer: Buffer,
    path: string,
    bucket: string
  ): UploadResult {
    const sizeMB = (buffer.length / 1024 / 1024).toFixed(2);
    console.log(`Mock upload: ${bucket}/${path} (${sizeMB} MB)`);

    return {
      url: `https://storage.example.com/${bucket}/${path}`,
      path,
      size_bytes: buffer.length,
      bucket,
    };
  }

  /**
   * Create bucket if it doesn't exist
   */
  async ensureBucket(bucket: string, isPublic: boolean = true): Promise<void> {
    if (!this.supabase) {
      console.log(`Mock: ensure bucket ${bucket} exists`);
      return;
    }

    try {
      // Try to get bucket info
      const { data: buckets } = await this.supabase.storage.listBuckets();

      const bucketExists = buckets?.some(b => b.name === bucket);

      if (!bucketExists) {
        // Create bucket
        const { error } = await this.supabase.storage.createBucket(bucket, {
          public: isPublic,
        });

        if (error) {
          throw new Error(`Failed to create bucket: ${error.message}`);
        }

        console.log(`Created bucket: ${bucket}`);
      }
    } catch (error) {
      throw this.createError('Failed to ensure bucket exists', error);
    }
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
export const storageService = new StorageService();

// Export class for testing
export default StorageService;
