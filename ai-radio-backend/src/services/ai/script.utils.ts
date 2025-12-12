/**
 * Script Utilities
 * Helper functions for script formatting, validation, and analysis
 */

import type { PodcastScript, ScriptSegment } from '../../types/database';

/**
 * Format script for display/debugging
 */
export function formatScriptForDisplay(script: PodcastScript): string {
  let formatted = '';
  formatted += `=== PODCAST SCRIPT ===\n`;
  formatted += `Generated: ${new Date(script.generated_at).toLocaleString()}\n`;
  formatted += `Duration: ${formatDuration(script.estimated_duration_seconds)}\n`;
  formatted += `Segments: ${script.total_segments}\n`;
  formatted += `Words: ${script.metadata?.total_words || 'N/A'}\n`;
  formatted += `\n`;

  script.segments.forEach((segment, index) => {
    const speaker = segment.speaker === 'host1' ? 'ALEX' : 'JORDAN';
    const type = segment.type.toUpperCase();
    formatted += `[${index + 1}] ${speaker} (${type}):\n`;
    formatted += `${segment.text}\n\n`;
  });

  formatted += `=== END SCRIPT ===\n`;

  return formatted;
}

/**
 * Format script as plain text (for TTS)
 */
export function formatScriptAsText(script: PodcastScript): string {
  return script.segments
    .map(segment => segment.text)
    .join('\n\n');
}

/**
 * Format script as SRT subtitles
 */
export function formatScriptAsSRT(
  script: PodcastScript,
  estimatedWPM: number = 150
): string {
  let srt = '';
  let currentTime = 0;

  script.segments.forEach((segment, index) => {
    const words = segment.text.split(/\s+/).length;
    const duration = (words / estimatedWPM) * 60; // seconds

    const startTime = formatSRTTimestamp(currentTime);
    const endTime = formatSRTTimestamp(currentTime + duration);

    srt += `${index + 1}\n`;
    srt += `${startTime} --> ${endTime}\n`;
    srt += `${segment.text}\n\n`;

    currentTime += duration;
  });

  return srt;
}

/**
 * Format timestamp for SRT (00:00:00,000)
 */
function formatSRTTimestamp(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 1000);

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(ms).padStart(3, '0')}`;
}

/**
 * Format duration in human-readable format
 */
export function formatDuration(seconds: number): string {
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
 * Get script statistics
 */
export function getScriptStatistics(script: PodcastScript): {
  total_segments: number;
  total_words: number;
  total_characters: number;
  host1_segments: number;
  host2_segments: number;
  by_type: Record<string, number>;
  average_segment_length: number;
  estimated_duration: string;
} {
  const stats = {
    total_segments: script.total_segments,
    total_words: 0,
    total_characters: 0,
    host1_segments: 0,
    host2_segments: 0,
    by_type: {} as Record<string, number>,
    average_segment_length: 0,
    estimated_duration: formatDuration(script.estimated_duration_seconds),
  };

  script.segments.forEach(segment => {
    const words = segment.text.split(/\s+/).length;
    stats.total_words += words;
    stats.total_characters += segment.text.length;

    if (segment.speaker === 'host1') {
      stats.host1_segments++;
    } else {
      stats.host2_segments++;
    }

    stats.by_type[segment.type] = (stats.by_type[segment.type] || 0) + 1;
  });

  stats.average_segment_length = Math.round(stats.total_words / stats.total_segments);

  return stats;
}

/**
 * Split script by segment type
 */
export function splitScriptByType(script: PodcastScript): Record<string, ScriptSegment[]> {
  const split: Record<string, ScriptSegment[]> = {};

  script.segments.forEach(segment => {
    if (!split[segment.type]) {
      split[segment.type] = [];
    }
    split[segment.type].push(segment);
  });

  return split;
}

/**
 * Split script by speaker
 */
export function splitScriptBySpeaker(script: PodcastScript): {
  host1: ScriptSegment[];
  host2: ScriptSegment[];
} {
  return {
    host1: script.segments.filter(s => s.speaker === 'host1'),
    host2: script.segments.filter(s => s.speaker === 'host2'),
  };
}

/**
 * Extract text for specific speaker (for TTS)
 */
export function extractSpeakerText(
  script: PodcastScript,
  speaker: 'host1' | 'host2'
): Array<{ text: string; sequence: number; type: string }> {
  return script.segments
    .filter(s => s.speaker === speaker)
    .map(s => ({
      text: s.text,
      sequence: s.sequence,
      type: s.type,
    }));
}

/**
 * Check if script has balanced speaker distribution
 */
export function hasBalancedSpeakers(script: PodcastScript): {
  balanced: boolean;
  host1_percentage: number;
  host2_percentage: number;
  imbalance_severity: 'none' | 'minor' | 'moderate' | 'severe';
} {
  const host1Count = script.segments.filter(s => s.speaker === 'host1').length;
  const host2Count = script.segments.filter(s => s.speaker === 'host2').length;

  const host1Percentage = (host1Count / script.total_segments) * 100;
  const host2Percentage = (host2Count / script.total_segments) * 100;

  const difference = Math.abs(host1Percentage - host2Percentage);

  let imbalanceSeverity: 'none' | 'minor' | 'moderate' | 'severe' = 'none';
  if (difference > 30) {
    imbalanceSeverity = 'severe';
  } else if (difference > 20) {
    imbalanceSeverity = 'moderate';
  } else if (difference > 10) {
    imbalanceSeverity = 'minor';
  }

  return {
    balanced: difference <= 20, // Allow up to 20% difference
    host1_percentage: parseFloat(host1Percentage.toFixed(1)),
    host2_percentage: parseFloat(host2Percentage.toFixed(1)),
    imbalance_severity: imbalanceSeverity,
  };
}

/**
 * Find longest segment
 */
export function findLongestSegment(script: PodcastScript): {
  segment: ScriptSegment;
  word_count: number;
  character_count: number;
} | null {
  if (script.segments.length === 0) {
    return null;
  }

  let longest = script.segments[0];
  let longestWordCount = longest.text.split(/\s+/).length;

  script.segments.forEach(segment => {
    const wordCount = segment.text.split(/\s+/).length;
    if (wordCount > longestWordCount) {
      longest = segment;
      longestWordCount = wordCount;
    }
  });

  return {
    segment: longest,
    word_count: longestWordCount,
    character_count: longest.text.length,
  };
}

/**
 * Find shortest segment
 */
export function findShortestSegment(script: PodcastScript): {
  segment: ScriptSegment;
  word_count: number;
  character_count: number;
} | null {
  if (script.segments.length === 0) {
    return null;
  }

  let shortest = script.segments[0];
  let shortestWordCount = shortest.text.split(/\s+/).length;

  script.segments.forEach(segment => {
    const wordCount = segment.text.split(/\s+/).length;
    if (wordCount < shortestWordCount) {
      shortest = segment;
      shortestWordCount = wordCount;
    }
  });

  return {
    segment: shortest,
    word_count: shortestWordCount,
    character_count: shortest.text.length,
  };
}

/**
 * Merge consecutive segments from same speaker (for optimization)
 */
export function mergeConsecutiveSpeakerSegments(script: PodcastScript): PodcastScript {
  if (script.segments.length === 0) {
    return script;
  }

  const merged: ScriptSegment[] = [];
  let current = { ...script.segments[0] };

  for (let i = 1; i < script.segments.length; i++) {
    const segment = script.segments[i];

    // Merge if same speaker and same type
    if (segment.speaker === current.speaker && segment.type === current.type) {
      current.text += ' ' + segment.text;
    } else {
      merged.push(current);
      current = { ...segment };
    }
  }

  // Add last segment
  merged.push(current);

  // Renumber sequences
  const renumbered = merged.map((segment, index) => ({
    ...segment,
    sequence: index + 1,
  }));

  return {
    ...script,
    segments: renumbered,
    total_segments: renumbered.length,
  };
}

/**
 * Truncate script to target duration
 */
export function truncateScriptToDuration(
  script: PodcastScript,
  targetDurationSeconds: number,
  wordsPerMinute: number = 150
): PodcastScript {
  const targetWords = (targetDurationSeconds / 60) * wordsPerMinute;
  let currentWords = 0;
  const truncatedSegments: ScriptSegment[] = [];

  // Always include intro
  const introSegments = script.segments.filter(s => s.type === 'intro');
  introSegments.forEach(segment => {
    truncatedSegments.push(segment);
    currentWords += segment.text.split(/\s+/).length;
  });

  // Add content until target reached
  const contentSegments = script.segments.filter(s => s.type !== 'intro' && s.type !== 'outro');
  for (const segment of contentSegments) {
    const segmentWords = segment.text.split(/\s+/).length;
    if (currentWords + segmentWords <= targetWords - 50) { // Reserve 50 words for outro
      truncatedSegments.push(segment);
      currentWords += segmentWords;
    }
  }

  // Always include outro
  const outroSegments = script.segments.filter(s => s.type === 'outro');
  outroSegments.forEach(segment => {
    truncatedSegments.push(segment);
    currentWords += segment.text.split(/\s+/).length;
  });

  // Renumber sequences
  const renumbered = truncatedSegments.map((segment, index) => ({
    ...segment,
    sequence: index + 1,
  }));

  const newDuration = Math.ceil((currentWords / wordsPerMinute) * 60);

  return {
    ...script,
    segments: renumbered,
    total_segments: renumbered.length,
    estimated_duration_seconds: newDuration,
    metadata: {
      ...script.metadata,
      total_words: currentWords,
      truncated: true,
      original_segments: script.total_segments,
    },
  };
}

/**
 * Add pauses between segments (for audio processing)
 */
export function addPauseMarkers(
  script: PodcastScript,
  pauseDurationMs: number = 500
): PodcastScript {
  const segmentsWithPauses: ScriptSegment[] = [];

  script.segments.forEach((segment, index) => {
    segmentsWithPauses.push(segment);

    // Add pause after segment (except last one)
    if (index < script.segments.length - 1) {
      segmentsWithPauses.push({
        speaker: 'host1', // Doesn't matter for pause
        text: `[PAUSE ${pauseDurationMs}ms]`,
        type: 'pause',
        sequence: segment.sequence + 0.5, // Between sequences
      });
    }
  });

  return {
    ...script,
    segments: segmentsWithPauses,
    total_segments: segmentsWithPauses.length,
    metadata: {
      ...script.metadata,
      has_pause_markers: true,
      pause_duration_ms: pauseDurationMs,
    },
  };
}

/**
 * Remove pause markers
 */
export function removePauseMarkers(script: PodcastScript): PodcastScript {
  const withoutPauses = script.segments.filter(s => s.type !== 'pause');

  return {
    ...script,
    segments: withoutPauses,
    total_segments: withoutPauses.length,
    metadata: {
      ...script.metadata,
      has_pause_markers: false,
    },
  };
}

/**
 * Validate script structure
 */
export function validateScriptStructure(script: PodcastScript): {
  valid: boolean;
  errors: string[];
  warnings: string[];
} {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Check for intro
  const hasIntro = script.segments.some(s => s.type === 'intro');
  if (!hasIntro) {
    errors.push('Missing intro section');
  }

  // Check for outro
  const hasOutro = script.segments.some(s => s.type === 'outro');
  if (!hasOutro) {
    errors.push('Missing outro section');
  }

  // Check segment order
  const introIndex = script.segments.findIndex(s => s.type === 'intro');
  const outroIndex = script.segments.findIndex(s => s.type === 'outro');

  if (introIndex > 2) {
    warnings.push('Intro appears late in script');
  }

  if (outroIndex < script.segments.length - 3) {
    warnings.push('Outro appears too early in script');
  }

  // Check for empty segments
  const emptySegments = script.segments.filter(s => !s.text || s.text.trim().length === 0);
  if (emptySegments.length > 0) {
    errors.push(`${emptySegments.length} empty segments found`);
  }

  // Check for duplicate sequences
  const sequences = script.segments.map(s => s.sequence);
  const uniqueSequences = new Set(sequences);
  if (sequences.length !== uniqueSequences.size) {
    errors.push('Duplicate sequence numbers found');
  }

  // Check speaker balance
  const balance = hasBalancedSpeakers(script);
  if (balance.imbalance_severity === 'severe') {
    warnings.push(`Severe speaker imbalance: ${balance.host1_percentage}% vs ${balance.host2_percentage}%`);
  } else if (balance.imbalance_severity === 'moderate') {
    warnings.push(`Moderate speaker imbalance: ${balance.host1_percentage}% vs ${balance.host2_percentage}%`);
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Generate script preview (first 3 segments)
 */
export function generateScriptPreview(script: PodcastScript, maxSegments: number = 3): string {
  const preview = script.segments.slice(0, maxSegments);
  let text = 'Script Preview:\n\n';

  preview.forEach((segment, index) => {
    const speaker = segment.speaker === 'host1' ? 'Alex' : 'Jordan';
    text += `${speaker}: ${segment.text}\n\n`;
  });

  if (script.segments.length > maxSegments) {
    text += `... and ${script.segments.length - maxSegments} more segments`;
  }

  return text;
}

export default {
  formatScriptForDisplay,
  formatScriptAsText,
  formatScriptAsSRT,
  formatDuration,
  getScriptStatistics,
  splitScriptByType,
  splitScriptBySpeaker,
  extractSpeakerText,
  hasBalancedSpeakers,
  findLongestSegment,
  findShortestSegment,
  mergeConsecutiveSpeakerSegments,
  truncateScriptToDuration,
  addPauseMarkers,
  removePauseMarkers,
  validateScriptStructure,
  generateScriptPreview,
};
