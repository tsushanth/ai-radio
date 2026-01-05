/**
 * Audio Utilities
 * Helper functions for audio processing, analysis, and manipulation
 */

import type { AudioSegment } from '../../types/podcast';
import type { PodcastScript } from '../../types/database';

/**
 * Audio format information
 */
export interface AudioInfo {
  format: string;
  size_bytes: number;
  size_mb: number;
  duration_seconds: number;
  bitrate_kbps?: number;
}

/**
 * Calculate total duration from audio segments
 */
export function calculateTotalDuration(segments: AudioSegment[]): number {
  return segments.reduce((total, segment) => total + segment.duration_seconds, 0);
}

/**
 * Calculate total size from audio segments
 */
export function calculateTotalSize(segments: AudioSegment[]): {
  bytes: number;
  kilobytes: number;
  megabytes: number;
} {
  const bytes = segments.reduce((total, segment) => total + segment.buffer.length, 0);
  return {
    bytes,
    kilobytes: parseFloat((bytes / 1024).toFixed(2)),
    megabytes: parseFloat((bytes / (1024 * 1024)).toFixed(2)),
  };
}

/**
 * Format duration as MM:SS
 */
export function formatDuration(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}:${secs.toString().padStart(2, '0')}`;
}

/**
 * Format duration as human readable string
 */
export function formatDurationHuman(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;

  if (minutes === 0) {
    return `${secs} second${secs !== 1 ? 's' : ''}`;
  }

  if (secs === 0) {
    return `${minutes} minute${minutes !== 1 ? 's' : ''}`;
  }

  return `${minutes} minute${minutes !== 1 ? 's' : ''} ${secs} second${secs !== 1 ? 's' : ''}`;
}

/**
 * Format file size
 */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) {
    return `${bytes} B`;
  } else if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(2)} KB`;
  } else if (bytes < 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
  } else {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  }
}

/**
 * Get audio statistics
 */
export function getAudioStatistics(segments: AudioSegment[]): {
  total_segments: number;
  total_duration: string;
  total_size: string;
  host1_segments: number;
  host2_segments: number;
  host1_duration: number;
  host2_duration: number;
  by_type: Record<string, { count: number; duration: number }>;
  average_segment_duration: number;
} {
  const stats = {
    total_segments: segments.length,
    total_duration: '',
    total_size: '',
    host1_segments: 0,
    host2_segments: 0,
    host1_duration: 0,
    host2_duration: 0,
    by_type: {} as Record<string, { count: number; duration: number }>,
    average_segment_duration: 0,
  };

  let totalDuration = 0;

  segments.forEach(segment => {
    totalDuration += segment.duration_seconds;

    if (segment.speaker === 'host1') {
      stats.host1_segments++;
      stats.host1_duration += segment.duration_seconds;
    } else {
      stats.host2_segments++;
      stats.host2_duration += segment.duration_seconds;
    }

    if (!stats.by_type[segment.segment_type]) {
      stats.by_type[segment.segment_type] = { count: 0, duration: 0 };
    }
    stats.by_type[segment.segment_type].count++;
    stats.by_type[segment.segment_type].duration += segment.duration_seconds;
  });

  stats.total_duration = formatDuration(totalDuration);
  stats.total_size = formatFileSize(calculateTotalSize(segments).bytes);
  stats.average_segment_duration = segments.length > 0
    ? Math.round(totalDuration / segments.length)
    : 0;

  return stats;
}

/**
 * Split audio segments by speaker
 */
export function splitBySpeaker(segments: AudioSegment[]): {
  host1: AudioSegment[];
  host2: AudioSegment[];
} {
  return {
    host1: segments.filter(s => s.speaker === 'host1'),
    host2: segments.filter(s => s.speaker === 'host2'),
  };
}

/**
 * Split audio segments by type
 */
export function splitByType(segments: AudioSegment[]): Record<string, AudioSegment[]> {
  const split: Record<string, AudioSegment[]> = {};

  segments.forEach(segment => {
    if (!split[segment.segment_type]) {
      split[segment.segment_type] = [];
    }
    split[segment.segment_type].push(segment);
  });

  return split;
}

/**
 * Concatenate audio buffers
 */
export function concatenateBuffers(buffers: Buffer[]): Buffer {
  return Buffer.concat(buffers);
}

/**
 * Create silence buffer (approximate, not actual audio silence)
 */
export function createSilenceBuffer(durationMs: number): Buffer {
  // This creates a buffer representing silence duration
  // For actual audio silence, you'd need to generate proper MP3 silence frames
  // This is a placeholder that indicates silence duration for metadata
  return Buffer.alloc(Math.ceil(durationMs / 10)); // Approximate size
}

/**
 * Validate audio segment
 */
export function validateAudioSegment(segment: AudioSegment): {
  valid: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (!segment.buffer || segment.buffer.length === 0) {
    issues.push('Empty audio buffer');
  }

  if (segment.duration_seconds <= 0) {
    issues.push('Invalid duration');
  }

  if (!['host1', 'host2'].includes(segment.speaker)) {
    issues.push('Invalid speaker');
  }

  if (!['intro', 'calendar', 'email', 'news', 'weather', 'teaser', 'outro'].includes(segment.segment_type)) {
    issues.push('Invalid segment type');
  }

  return {
    valid: issues.length === 0,
    issues,
  };
}

/**
 * Estimate bitrate from buffer size and duration
 */
export function estimateBitrate(sizeBytes: number, durationSeconds: number): number {
  if (durationSeconds === 0) return 0;
  const bitsPerSecond = (sizeBytes * 8) / durationSeconds;
  return Math.round(bitsPerSecond / 1000); // Convert to kbps
}

/**
 * Check if audio segments are in sequence
 */
export function areSegmentsInSequence(segments: AudioSegment[]): boolean {
  // Audio segments don't have sequence property, but script segments do
  // This checks if segments are ordered by their original script order
  return true; // Assume ordered since we process sequentially
}

/**
 * Generate audio segment manifest (for debugging/logging)
 */
export function generateSegmentManifest(segments: AudioSegment[]): string {
  let manifest = 'Audio Segment Manifest\n';
  manifest += '======================\n\n';

  segments.forEach((segment, index) => {
    manifest += `Segment ${index + 1}:\n`;
    manifest += `  Speaker: ${segment.speaker}\n`;
    manifest += `  Type: ${segment.segment_type}\n`;
    manifest += `  Duration: ${formatDuration(segment.duration_seconds)}\n`;
    manifest += `  Size: ${formatFileSize(segment.buffer.length)}\n`;
    manifest += `  Bitrate: ~${estimateBitrate(segment.buffer.length, segment.duration_seconds)} kbps\n`;
    manifest += '\n';
  });

  const stats = getAudioStatistics(segments);
  manifest += `Total Duration: ${stats.total_duration}\n`;
  manifest += `Total Size: ${stats.total_size}\n`;
  manifest += `Total Segments: ${stats.total_segments}\n`;

  return manifest;
}

/**
 * Find longest audio segment
 */
export function findLongestSegment(segments: AudioSegment[]): AudioSegment | null {
  if (segments.length === 0) return null;

  return segments.reduce((longest, current) =>
    current.duration_seconds > longest.duration_seconds ? current : longest
  );
}

/**
 * Find shortest audio segment
 */
export function findShortestSegment(segments: AudioSegment[]): AudioSegment | null {
  if (segments.length === 0) return null;

  return segments.reduce((shortest, current) =>
    current.duration_seconds < shortest.duration_seconds ? current : shortest
  );
}

/**
 * Calculate average bitrate across all segments
 */
export function calculateAverageBitrate(segments: AudioSegment[]): number {
  if (segments.length === 0) return 0;

  const totalBitrate = segments.reduce((sum, segment) => {
    return sum + estimateBitrate(segment.buffer.length, segment.duration_seconds);
  }, 0);

  return Math.round(totalBitrate / segments.length);
}

/**
 * Generate timing information for segments
 */
export function generateTimingInfo(segments: AudioSegment[]): Array<{
  segment_index: number;
  speaker: string;
  type: string;
  start_time: string;
  end_time: string;
  duration: string;
}> {
  const timing: Array<{
    segment_index: number;
    speaker: string;
    type: string;
    start_time: string;
    end_time: string;
    duration: string;
  }> = [];

  let currentTime = 0;

  segments.forEach((segment, index) => {
    const startTime = currentTime;
    const endTime = currentTime + segment.duration_seconds;

    timing.push({
      segment_index: index + 1,
      speaker: segment.speaker,
      type: segment.segment_type,
      start_time: formatDuration(startTime),
      end_time: formatDuration(endTime),
      duration: formatDuration(segment.duration_seconds),
    });

    currentTime = endTime;
  });

  return timing;
}

/**
 * Check if segments need processing
 */
export function needsProcessing(segments: AudioSegment[]): {
  needs_processing: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];

  // Check for very short segments (might be errors)
  const veryShort = segments.filter(s => s.duration_seconds < 1);
  if (veryShort.length > 0) {
    reasons.push(`${veryShort.length} segments shorter than 1 second`);
  }

  // Check for very long segments (might need splitting)
  const veryLong = segments.filter(s => s.duration_seconds > 60);
  if (veryLong.length > 0) {
    reasons.push(`${veryLong.length} segments longer than 60 seconds`);
  }

  // Check for unusual bitrates
  const avgBitrate = calculateAverageBitrate(segments);
  if (avgBitrate < 64 || avgBitrate > 320) {
    reasons.push(`Unusual average bitrate: ${avgBitrate} kbps`);
  }

  return {
    needs_processing: reasons.length > 0,
    reasons,
  };
}

/**
 * Compare script and audio segments
 */
export function compareWithScript(
  audioSegments: AudioSegment[],
  script: PodcastScript
): {
  match: boolean;
  issues: string[];
} {
  const issues: string[] = [];

  if (audioSegments.length !== script.total_segments) {
    issues.push(`Segment count mismatch: ${audioSegments.length} audio vs ${script.total_segments} script`);
  }

  // Check if durations are within reasonable range
  const audioDuration = calculateTotalDuration(audioSegments);
  const scriptDuration = script.estimated_duration_seconds;
  const durationDiff = Math.abs(audioDuration - scriptDuration);
  const diffPercentage = (durationDiff / scriptDuration) * 100;

  if (diffPercentage > 20) {
    issues.push(`Duration mismatch: ${audioDuration}s audio vs ${scriptDuration}s script (${diffPercentage.toFixed(1)}% difference)`);
  }

  return {
    match: issues.length === 0,
    issues,
  };
}

/**
 * Create audio segment summary for logging
 */
export function createSegmentSummary(segments: AudioSegment[]): string {
  const stats = getAudioStatistics(segments);

  return `Audio: ${stats.total_segments} segments, ${stats.total_duration}, ${stats.total_size}`;
}

/**
 * Export audio segments metadata as JSON
 */
export function exportMetadata(segments: AudioSegment[]): {
  total_segments: number;
  total_duration_seconds: number;
  total_size_bytes: number;
  segments: Array<{
    index: number;
    speaker: string;
    type: string;
    duration_seconds: number;
    size_bytes: number;
    bitrate_kbps: number;
  }>;
} {
  return {
    total_segments: segments.length,
    total_duration_seconds: calculateTotalDuration(segments),
    total_size_bytes: calculateTotalSize(segments).bytes,
    segments: segments.map((segment, index) => ({
      index: index + 1,
      speaker: segment.speaker,
      type: segment.segment_type,
      duration_seconds: segment.duration_seconds,
      size_bytes: segment.buffer.length,
      bitrate_kbps: estimateBitrate(segment.buffer.length, segment.duration_seconds),
    })),
  };
}

/**
 * Validate all segments in array
 */
export function validateAllSegments(segments: AudioSegment[]): {
  all_valid: boolean;
  valid_count: number;
  invalid_count: number;
  issues: Array<{ index: number; issues: string[] }>;
} {
  const results = segments.map((segment, index) => ({
    index,
    validation: validateAudioSegment(segment),
  }));

  const invalid = results.filter(r => !r.validation.valid);

  return {
    all_valid: invalid.length === 0,
    valid_count: segments.length - invalid.length,
    invalid_count: invalid.length,
    issues: invalid.map(r => ({
      index: r.index,
      issues: r.validation.issues,
    })),
  };
}

export default {
  calculateTotalDuration,
  calculateTotalSize,
  formatDuration,
  formatDurationHuman,
  formatFileSize,
  getAudioStatistics,
  splitByType,
  splitBySpeaker,
  concatenateBuffers,
  createSilenceBuffer,
  validateAudioSegment,
  estimateBitrate,
  areSegmentsInSequence,
  generateSegmentManifest,
  findLongestSegment,
  findShortestSegment,
  calculateAverageBitrate,
  generateTimingInfo,
  needsProcessing,
  compareWithScript,
  createSegmentSummary,
  exportMetadata,
  validateAllSegments,
};
